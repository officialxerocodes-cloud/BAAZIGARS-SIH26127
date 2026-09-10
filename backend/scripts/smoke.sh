#!/usr/bin/env bash
set -e
echo "=== smoke: POST -> reads -> trajectory -> analytics (integration gate) ==="
echo "Asserts the exact payload shapes the frontend depends on."
INGEST=${INGEST_URL:-http://localhost:8000}
API=${API_URL:-http://localhost:8002}
PLATE="DL8CTEST9999"
CAM="CAM_001"
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

fail() { echo "FAIL: $1"; exit 1; }

echo "GET $API/api/cameras (registry must be seeded: reads FK -> cameras)"
ncams=$(curl -s "$API/api/cameras" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "cameras count $ncams"
[ "$ncams" -ge 1 ] || fail "cameras empty — seed first: scripts/generate_gates.py --net delhi.net.xml --out delhi_gates.json --n 60 --apply-db"

echo "POST $INGEST/ingest/v1/events plate=$PLATE cam=$CAM"
code=$(curl -s -o /tmp/smoke_post.json -w "%{http_code}" -X POST "$INGEST/ingest/v1/events" -H "Content-Type: application/json" -d "{\"camera_id\":\"$CAM\",\"ts\":\"$TS\",\"plate_raw\":\"$PLATE\",\"canonical\":\"$PLATE\",\"confidence\":0.93,\"vehicle_class\":\"private\",\"ground_truth\":\"$PLATE\"}")
echo "ingest code $code"
cat /tmp/smoke_post.json; echo
[ "$code" = "200" ] || fail "ingest POST failed"
echo "sleep 3 for matcher flush..."
sleep 3

echo "GET $API/api/vehicles/search?q=$PLATE"
curl -s "$API/api/vehicles/search?q=$PLATE&limit=5" | python3 -m json.tool | head -30

echo "GET trajectory (must carry joined lng/lat for the map)"
traj=$(curl -s "$API/api/vehicles/$PLATE/trajectory")
echo "$traj" | python3 -m json.tool | head -40
echo "$traj" | python3 -c "
import sys, json
rows = json.load(sys.stdin)
assert len(rows) >= 1, 'trajectory empty'
r0 = rows[0]
assert r0.get('lng') is not None and r0.get('lat') is not None, 'trajectory missing joined lng/lat (cameras join broken?)'
print(f'trajectory OK: {len(rows)} reads, lng/lat present')
" || fail "trajectory assertion failed"

echo "sleep 8 for analytics 5s flush..."
sleep 8
echo "GET heatmap (rollup for the smoke camera must appear)"
heat=$(curl -s "$API/api/analytics/heatmap")
echo "$heat" | python3 -c "
import sys, json
rows = json.load(sys.stdin)
assert len(rows) >= 1, 'heatmap empty after analytics flush'
cams = {r['camera_id'] for r in rows}
assert '$CAM' in cams, 'heatmap missing $CAM rollup'
print(f'heatmap OK: {len(rows)} buckets, $CAM present')
" || fail "heatmap assertion failed"

echo "GET heatmap?bucket=1h (contract: allowlisted buckets aggregate)"
code=$(curl -s -o /tmp/smoke_bucket.json -w "%{http_code}" "$API/api/analytics/heatmap?bucket=1h")
[ "$code" = "200" ] || fail "heatmap bucket=1h -> $code"
echo "GET heatmap?bucket=9x (contract: unknown bucket is a 400, never silent)"
code=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/analytics/heatmap?bucket=9x")
[ "$code" = "400" ] || fail "heatmap bucket=9x -> $code (expected 400)"

echo "GET congestion (shape the Density panel consumes)"
cong=$(curl -s -o /tmp/smoke_cong.json -w "%{http_code}" "$API/api/analytics/congestion")
[ "$cong" = "200" ] || fail "congestion -> $cong"
python3 -c "
import json
rows = json.load(open('/tmp/smoke_cong.json'))
for r in rows:
    assert 'congestion_ratio' in r and 'level' in r, f'congestion row missing ratio/level: {r}'
print(f'congestion OK: {len(rows)} pairs, ratio+level present')
" || fail "congestion shape assertion failed"

echo "GET health + alerts (200s)"
for ep in api/analytics/cameras/health api/alerts?limit=1 api/accuracy/report; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$API/$ep")
  [ "$code" = "200" ] || fail "$ep -> $code"
  echo "$ep -> 200"
done

echo "=== P1/P2 contracts ==="
echo "blacklist roundtrip: POST -> GET contains -> read -> alert -> ack -> DELETE"
curl -s -X DELETE "$API/api/blacklist/$PLATE" > /dev/null 2>&1 || true
curl -s -X POST "$API/api/blacklist" -H "Content-Type: application/json" -d "{\"plate\":\"$PLATE\",\"reason\":\"smoke\"}" > /dev/null
curl -s "$API/api/blacklist" | python3 -c "
import sys, json
rows = json.load(sys.stdin)
assert any(r['plate'] == '$PLATE' for r in rows), 'blacklist GET missing smoke plate'
print('blacklist GET OK')
" || fail "blacklist GET assertion failed"
echo "POST read for blacklisted plate -> expect blacklist alert"
echo "sleep 12 first: alerts worker refreshes its blacklist cache every 10s,"
echo "and a read consumed before the refresh would never alert."
sleep 12
TS2=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
curl -s -X POST "$INGEST/ingest/v1/events" -H "Content-Type: application/json" -d "{\"camera_id\":\"$CAM\",\"ts\":\"$TS2\",\"plate_raw\":\"$PLATE\",\"canonical\":\"$PLATE\",\"confidence\":0.91,\"vehicle_class\":\"private\",\"ground_truth\":\"$PLATE\"}" > /dev/null
echo "sleep 6 for matcher + alerts..."
sleep 6
AID=$(curl -s "$API/api/alerts?limit=50" | python3 -c "
import sys, json
rows = json.load(sys.stdin)
hits = [r for r in rows if r.get('type') == 'blacklist' and r.get('canonical') == '$PLATE']
print(hits[0]['id'] if hits else '')
")
[ -n "$AID" ] || fail "no blacklist alert for smoke plate"
echo "blacklist alert $AID"
echo "POST /api/alerts/$AID/ack"
curl -s -X POST "$API/api/alerts/$AID/ack" | python3 -c "
import sys, json
r = json.load(sys.stdin)
assert r.get('acknowledged') is True, 'ack did not stick'
print('ack OK')
" || fail "ack assertion failed"
echo "acked alert must leave the default feed (audit kept via include_acknowledged=true)"
curl -s "$API/api/alerts?limit=50" | python3 -c "
import sys, json
ids = {r['id'] for r in json.load(sys.stdin)}
assert '$AID' not in ids, 'acked alert still in default feed'
print('ack-filter OK')
" || fail "ack-filter assertion failed"
curl -s -X DELETE "$API/api/blacklist/$PLATE" | grep -q '"deleted":1' || fail "blacklist DELETE failed"
echo "blacklist roundtrip OK"

echo "GET sweeps (zone + window)"
zcode=$(curl -s -o /tmp/smoke_zone.json -w "%{http_code}" "$API/api/sweeps/zone?lat=28.601611&lng=77.230296&radius_km=1")
[ "$zcode" = "200" ] || fail "sweeps/zone -> $zcode"
python3 -c "
import json
from collections import Counter
d = json.load(open('/tmp/smoke_zone.json'))
assert len(d['cameras']) >= 1 and d['total'] >= 1, 'zone sweep empty around CAM_001'
for r in d['reads']:
    assert r.get('canonical'), 'sweep read missing canonical (grouping key)'
    assert r.get('ts'), 'sweep read missing ts'
plates = Counter(r['canonical'] for r in d['reads'])
print(f\"zone sweep OK: {len(d['cameras'])} cams, {d['total']} reads, {len(plates)} plates\")
print('top plates:', plates.most_common(3))
" || fail "zone sweep assertion failed"
wcode=$(curl -s -o /tmp/smoke_win.json -w "%{http_code}" "$API/api/sweeps/window")
[ "$wcode" = "200" ] || fail "sweeps/window -> $wcode"
python3 -c "
import json
d = json.load(open('/tmp/smoke_win.json'))
assert d['total_reads'] >= 1 and d['vehicles'] >= 1, 'window sweep empty'
print(f\"window sweep OK: {d['total_reads']} reads, {d['vehicles']} vehicles\")
" || fail "window sweep assertion failed"

echo "GET crops missing -> 404; trajectory carries crop_url key"
code=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/crops/nope.jpg")
[ "$code" = "404" ] || fail "crops/nope.jpg -> $code (expected 404)"
curl -s "$API/api/vehicles/$PLATE/trajectory" | python3 -c "
import sys, json
rows = json.load(sys.stdin)
assert rows and 'crop_url' in rows[0], 'trajectory missing crop_url key'
print('crops contract OK')
" || fail "crop_url assertion failed"

echo "GET clones (200, may be empty)"
code=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/vehicles/$PLATE/clones")
[ "$code" = "200" ] || fail "clones -> $code"
echo "=== smoke PASSED ==="
