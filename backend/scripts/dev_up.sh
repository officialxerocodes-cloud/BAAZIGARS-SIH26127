#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
# infra via docker (podman volumes kept as backup; do NOT run podman compose — port clash)
echo "up infra (redis+timescale)..."
docker compose up -d redis timescale
echo "wait for healthy..."
sleep 8
docker ps --format "{{.Names}} {{.Status}}" | grep pune
# NOTE: cameras now come from generate_gates.py --apply-db (net-derived gates).
# Do NOT run seed_cameras.py — it would overwrite gates with jittered points.
# local python services (no GPU needed)
echo "start ingest/anpr-stub/api/workers (local python)..."
PYTHONPATH=. nohup python3 -u -m uvicorn ingest.app:app --host 0.0.0.0 --port 8000 > /tmp/ingest.log 2>&1 &
PYTHONPATH=. nohup python3 -u -m uvicorn anpr_stub.app:app --host 0.0.0.0 --port 8001 > /tmp/anpr_stub.log 2>&1 &
PYTHONPATH=. nohup python3 -u -m uvicorn api.app:app --host 0.0.0.0 --port 8002 > /tmp/api.log 2>&1 &
PYTHONPATH=. nohup python3 -u -m workers.matcher > /tmp/matcher.log 2>&1 &
PYTHONPATH=. nohup python3 -u -m workers.analytics > /tmp/analytics.log 2>&1 &
PYTHONPATH=. nohup python3 -u -m workers.alerts > /tmp/alerts.log 2>&1 &
sleep 3
curl -s http://localhost:8000/healthz && echo " ingest ok"
curl -s http://localhost:8001/healthz && echo " anpr-stub ok"
curl -s http://localhost:8002/healthz && echo " api ok"
echo "dev up done. smoke:"
bash scripts/smoke.sh
