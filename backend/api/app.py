"""API — REST + WS hub. Day 2: search/trajectory; Day 5: full surface."""
import asyncio
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import asyncpg
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse

from common.config import DATABASE_URL, REDIS_URL
from common.db import get_pool
from common.plate import canonicalize, levenshtein
from common.redis_client import get_redis

app = FastAPI(title="delhi-anpr-api")

# CORS — env-driven. Defaults cover Vite dev (5173), CRA (3000) and the
# API itself; override with CORS_ORIGINS="https://a,https://b" in deploy.
# The Vite dev proxy keeps same-origin calls CORS-free; direct
# VITE_API_BASE_URL calls need the frontend origin listed here.
_DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8002",
    "http://127.0.0.1:8002",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", ",".join(_DEFAULT_ORIGINS)).split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "api"}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "api"}


@app.get("/api/cameras")
async def cameras():
    """Camera registry with geometry — feeds map pins and trajectory joins."""
    pool = await get_pool(DATABASE_URL)
    rows = await pool.fetch(
        """
        SELECT id, name, edge_id, ST_X(geom) AS lng, ST_Y(geom) AS lat,
               heading, zone, type, uri, status
        FROM cameras ORDER BY id ASC LIMIT 2000
        """
    )
    return [dict(r) for r in rows]


@app.get("/api/vehicles/search")
async def search(q: str = Query(...), fuzzy: int = 0, limit: int = 20):
    cq = canonicalize(q)
    pool = await get_pool(DATABASE_URL)
    if fuzzy:
        # fetch candidates by prefix (first 2 chars) then filter by edit<=1
        prefix = cq[:2] if len(cq) >= 2 else cq
        rows = await pool.fetch(
            "SELECT canonical, first_seen, last_seen, read_count FROM vehicles WHERE canonical LIKE $1 ORDER BY last_seen DESC LIMIT 200",
            f"{prefix}%",
        )
        out = []
        for r in rows:
            if levenshtein(cq, r["canonical"]) <= 1:
                out.append(dict(r))
            if len(out) >= limit:
                break
        # fallback: exact if nothing fuzzy matched
        if not out:
            rows2 = await pool.fetch(
                "SELECT canonical, first_seen, last_seen, read_count FROM vehicles WHERE canonical = $1 LIMIT $2",
                cq,
                limit,
            )
            out = [dict(r) for r in rows2]
        return out
    rows = await pool.fetch(
        "SELECT canonical, first_seen, last_seen, read_count FROM vehicles WHERE canonical LIKE $1 ORDER BY last_seen DESC LIMIT $2",
        f"%{cq}%",
        limit,
    )
    return [dict(r) for r in rows]


@app.get("/api/vehicles/{canonical}/trajectory")
async def trajectory(canonical: str, from_ts: Optional[str] = None, to_ts: Optional[str] = None):
    cq = canonicalize(canonical)
    pool = await get_pool(DATABASE_URL)
    q = (
        "SELECT r.read_id, r.camera_id, r.ts, r.raw_plate, r.canonical, r.confidence,"
        " r.crop_path, r.gt_plate, r.vehicle_class,"
        " c.name AS camera_name, ST_X(c.geom) AS lng, ST_Y(c.geom) AS lat,"
        " c.zone AS camera_zone, c.status AS camera_status"
        " FROM reads r LEFT JOIN cameras c ON c.id = r.camera_id"
        " WHERE r.canonical = $1"
    )
    args: list = [cq]
    if from_ts:
        q += f" AND ts >= ${len(args)+1}"
        args.append(datetime.fromisoformat(from_ts.replace('Z', '+00:00')))
    if to_ts:
        q += f" AND ts <= ${len(args)+1}"
        args.append(datetime.fromisoformat(to_ts.replace('Z', '+00:00')))
    q += " ORDER BY ts ASC LIMIT 500"
    rows = await pool.fetch(q, *args)
    # fuzzy fallback: if 0 rows, try edit<=1 within time window
    if not rows:
        prefix = cq[:3] if len(cq) >= 3 else cq
        cand = await pool.fetch(
            "SELECT DISTINCT canonical FROM reads WHERE canonical LIKE $1 LIMIT 100", f"{prefix}%"
        )
        for c in cand:
            if levenshtein(cq, c["canonical"]) <= 1:
                rows = await pool.fetch(
                    "SELECT r.read_id, r.camera_id, r.ts, r.raw_plate, r.canonical, r.confidence,"
                    " r.crop_path, r.gt_plate, r.vehicle_class,"
                    " c.name AS camera_name, ST_X(c.geom) AS lng, ST_Y(c.geom) AS lat,"
                    " c.zone AS camera_zone, c.status AS camera_status"
                    " FROM reads r LEFT JOIN cameras c ON c.id = r.camera_id"
                    " WHERE r.canonical = $1 ORDER BY r.ts ASC LIMIT 500",
                    c["canonical"],
                )
                if rows:
                    break
    out = []
    for r in rows:
        d = dict(r)
        d["crop_url"] = _crop_url(d.get("crop_path"))
        out.append(d)
    return out


@app.get("/api/vehicles/{canonical}/clones")
async def clones(canonical: str):
    cq = canonicalize(canonical)
    pool = await get_pool(DATABASE_URL)
    rows = await pool.fetch("SELECT * FROM alerts WHERE canonical = $1 AND type IN ('impossible','clone') ORDER BY created_at DESC LIMIT 20", cq)
    return [_decode_row(r) for r in rows]


# Re-bin strides for the 1-min camera_rollups. Allowlist only: an unknown
# bucket is a 400, never a silent ignore (frontend/contract agreement).
# Values are timedeltas so asyncpg encodes them as interval natively.
_BUCKET_STRIDE = {
    "1m": timedelta(minutes=1),
    "5m": timedelta(minutes=5),
    "15m": timedelta(minutes=15),
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "24h": timedelta(hours=24),
}


@app.get("/api/analytics/heatmap")
async def heatmap(bucket: str = "5m", from_ts: Optional[str] = None, to_ts: Optional[str] = None):
    pool = await get_pool(DATABASE_URL)
    # heatmap reads camera_rollups (principle: never scan reads live).
    # bucket re-bins the 1-min rollups: allowlist only, else 400 so the
    # frontend and the OpenAPI contract can never silently disagree.
    stride = _BUCKET_STRIDE.get((bucket or "5m").strip().lower())
    if stride is None:
        raise HTTPException(
            400, f"invalid bucket {bucket!r}; expected one of {sorted(_BUCKET_STRIDE)}"
        )
    rows = await pool.fetch(
        """
        SELECT camera_id,
               date_bin($3, window_start, TIMESTAMPTZ 'epoch') AS window_start,
               SUM(count)::int AS count
        FROM camera_rollups
        WHERE ($1::timestamptz IS NULL OR window_start >= $1)
          AND ($2::timestamptz IS NULL OR window_start <= $2)
        GROUP BY camera_id, date_bin($3, window_start, TIMESTAMPTZ 'epoch')
        ORDER BY window_start DESC LIMIT 500
        """,
        datetime.fromisoformat(from_ts.replace('Z', '+00:00')) if from_ts else None,
        datetime.fromisoformat(to_ts.replace('Z', '+00:00')) if to_ts else None,
        stride,
    )
    return [dict(r) for r in rows]


@app.get("/api/analytics/congestion")
async def congestion():
    pool = await get_pool(DATABASE_URL)
    rows = await pool.fetch("SELECT * FROM camera_pairs ORDER BY samples DESC LIMIT 100")
    # congestion_ratio = observed median travel time vs free-flow estimate
    # (road_dist at 50 km/h ≈ 13.9 m/s). road_dist_m is haversine distance
    # from the registry until the routed precompute lands — ratio > 1.5
    # marks congested, 1.2-1.5 heavy, below that flowing.
    out = []
    for r in rows:
        d = dict(r)
        med, dist = d.get("median_tt"), d.get("road_dist_m")
        ratio = (med / (dist / 13.9)) if med and dist else None
        d["congestion_ratio"] = round(ratio, 2) if ratio else None
        d["level"] = "congested" if ratio and ratio > 1.5 else ("heavy" if ratio and ratio > 1.2 else "flowing")
        out.append(d)
    return out


@app.get("/api/analytics/od")
async def od(window: str = "30m"):
    import re
    pool = await get_pool(DATABASE_URL)
    # window like "30m"/"1h"/"6h" — aggregate cells newer than the cutoff
    m = re.match(r"^(\d+)([mh])$", (window or "30m").strip())
    mins = int(m.group(1)) * (60 if m.group(2) == "h" else 1) if m else 30
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=mins)
    rows = await pool.fetch(
        """
        SELECT from_cam, to_cam, SUM(vehicle_count)::int AS vehicle_count,
               MIN(window_start) AS window_start
        FROM od_stats WHERE window_start >= $1
        GROUP BY from_cam, to_cam ORDER BY vehicle_count DESC LIMIT 100
        """,
        cutoff,
    )
    return [dict(r) for r in rows]


@app.get("/api/analytics/cameras/health")
async def health_cams():
    pool = await get_pool(DATABASE_URL)
    rows = await pool.fetch("SELECT * FROM health_stats ORDER BY window_start DESC LIMIT 100")
    return [dict(r) for r in rows]


def _parse_window(from_ts: Optional[str], to_ts: Optional[str], default_hours: float = 6):
    """Resolve an optional ISO window to (start, end) datetimes."""
    end = (
        datetime.fromisoformat(to_ts.replace('Z', '+00:00'))
        if to_ts
        else datetime.now(timezone.utc)
    )
    start = (
        datetime.fromisoformat(from_ts.replace('Z', '+00:00'))
        if from_ts
        else end - timedelta(hours=default_hours)
    )
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    return start, end


@app.get("/api/sweeps/zone")
async def sweep_zone(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_km: float = Query(1.0, gt=0, le=20),
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    limit: int = Query(200, gt=0, le=1000),
):
    """Area sweep: recent reads from cameras within radius_km of (lat, lng).
    Powers the Area Sweep panel (P2: was mock-only). Rows share the
    trajectory shape (+crop_url) so the frontend reuses its live builder."""
    start, end = _parse_window(from_ts, to_ts)
    pool = await get_pool(DATABASE_URL)
    cams = await pool.fetch(
        """
        SELECT id, name, ST_X(geom) AS lng, ST_Y(geom) AS lat, zone, status
        FROM cameras
        WHERE ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3 * 1000.0
        )
        ORDER BY id ASC
        """,
        lng, lat, radius_km,
    )
    cam_ids = [c["id"] for c in cams]
    reads: list = []
    if cam_ids:
        rows = await pool.fetch(
            """
            SELECT r.read_id, r.camera_id, r.ts, r.raw_plate, r.canonical, r.confidence,
                   r.crop_path, r.gt_plate, r.vehicle_class,
                   c.name AS camera_name, ST_X(c.geom) AS lng, ST_Y(c.geom) AS lat,
                   c.zone AS camera_zone, c.status AS camera_status
            FROM reads r LEFT JOIN cameras c ON c.id = r.camera_id
            WHERE r.camera_id = ANY($1) AND r.ts >= $2 AND r.ts <= $3
            ORDER BY r.ts DESC LIMIT $4
            """,
            cam_ids, start, end, limit,
        )
        for r in rows:
            d = dict(r)
            d["crop_url"] = _crop_url(d.get("crop_path"))
            reads.append(d)
    return {
        "cameras": [dict(c) for c in cams],
        "reads": reads,
        "total": len(reads),
        "window": {"from": start.isoformat(), "to": end.isoformat()},
    }


@app.get("/api/sweeps/window")
async def sweep_window(
    from_ts: Optional[str] = None,
    to_ts: Optional[str] = None,
    limit: int = Query(50, gt=0, le=500),
):
    """Time-window sweep: grid-wide summary + top plates for the window.
    Powers the Time Window panel (P2: was mock-only)."""
    start, end = _parse_window(from_ts, to_ts)
    pool = await get_pool(DATABASE_URL)
    total = await pool.fetchval(
        "SELECT COUNT(*) FROM reads WHERE ts >= $1 AND ts <= $2", start, end
    )
    vehicles = await pool.fetchval(
        "SELECT COUNT(DISTINCT canonical) FROM reads WHERE ts >= $1 AND ts <= $2",
        start, end,
    )
    top = await pool.fetch(
        """
        SELECT canonical, COUNT(*)::int AS n, MAX(ts) AS last_seen
        FROM reads WHERE ts >= $1 AND ts <= $2
        GROUP BY canonical ORDER BY n DESC LIMIT $3
        """,
        start, end, limit,
    )
    per_cam = await pool.fetch(
        """
        SELECT camera_id, COUNT(*)::int AS n
        FROM reads WHERE ts >= $1 AND ts <= $2
        GROUP BY camera_id ORDER BY n DESC LIMIT 60
        """,
        start, end,
    )
    return {
        "total_reads": total or 0,
        "vehicles": vehicles or 0,
        "top_plates": [dict(r) for r in top],
        "per_camera": [dict(r) for r in per_cam],
        "window": {"from": start.isoformat(), "to": end.isoformat()},
    }


@app.get("/api/alerts")
async def alerts(limit: int = 50, include_acknowledged: bool = False):
    pool = await get_pool(DATABASE_URL)
    # Acked alerts stay in the table for audit but leave the live feed by
    # default, or the inbox Ack button would be a visual no-op.
    if include_acknowledged:
        rows = await pool.fetch("SELECT * FROM alerts ORDER BY created_at DESC LIMIT $1", limit)
    else:
        rows = await pool.fetch(
            "SELECT * FROM alerts WHERE acknowledged = FALSE ORDER BY created_at DESC LIMIT $1",
            limit,
        )
    return [_decode_row(r) for r in rows]


def _decode_row(r) -> dict:
    """asyncpg returns JSONB columns as str — decode so clients get objects."""
    d = dict(r)
    for k, v in d.items():
        if isinstance(v, str) and v[:1] in ("{", "["):
            try:
                d[k] = json.loads(v)
            except Exception:
                pass
    return d


@app.post("/api/blacklist")
async def add_blacklist(body: dict):
    plate = canonicalize(body.get("plate", ""))
    reason = body.get("reason", "")
    if not plate:
        raise HTTPException(400, "plate required")
    pool = await get_pool(DATABASE_URL)
    await pool.execute("INSERT INTO blacklist (plate, reason) VALUES ($1,$2) ON CONFLICT (plate) DO UPDATE SET reason=EXCLUDED.reason", plate, reason)
    return {"status": "ok", "plate": plate}


CROP_DIR = os.getenv("CROP_DIR", "/data/crops")


def _crop_url(crop_path: Optional[str]) -> Optional[str]:
    """Map a stored crop path to its public API URL (basename only)."""
    if not crop_path:
        return None
    name = os.path.basename(str(crop_path))
    if not name.lower().endswith((".jpg", ".jpeg")):
        return None
    return f"/api/crops/{name}"


@app.get("/api/crops/{name}")
async def get_crop(name: str):
    """Serve a persisted plate crop. Empty until a source posts crop_b64
    (the sim sends none today) — the gallery renders empty, never faked."""
    base = os.path.basename(name)
    if base != name or not base.lower().endswith((".jpg", ".jpeg")):
        raise HTTPException(400, "invalid crop name")
    path = os.path.join(CROP_DIR, base)
    if not os.path.isfile(path):
        raise HTTPException(404, "crop not found")
    return FileResponse(path, media_type="image/jpeg")


@app.get("/api/blacklist")
async def list_blacklist():
    """Wanted-plate registry — feeds the admin panel (P1: was POST-only)."""
    pool = await get_pool(DATABASE_URL)
    rows = await pool.fetch("SELECT plate, reason, added_at FROM blacklist ORDER BY added_at DESC LIMIT 500")
    return [dict(r) for r in rows]


@app.delete("/api/blacklist/{plate}")
async def remove_blacklist(plate: str):
    pool = await get_pool(DATABASE_URL)
    res = await pool.execute("DELETE FROM blacklist WHERE plate = $1", canonicalize(plate))
    deleted = int(res.split()[-1]) if res.split()[-1].isdigit() else 0
    return {"status": "ok", "deleted": deleted}


@app.post("/api/alerts/{alert_id}/ack")
async def ack_alert(alert_id: str):
    """Acknowledge an alert — drives the inbox ack button (P1: column existed, unwired)."""
    pool = await get_pool(DATABASE_URL)
    try:
        uid = uuid.UUID(str(alert_id))
    except ValueError:
        raise HTTPException(400, "invalid alert id")
    row = await pool.fetchrow(
        "UPDATE alerts SET acknowledged = TRUE WHERE id = $1 RETURNING *", uid
    )
    if not row:
        raise HTTPException(404, "alert not found")
    return _decode_row(row)


@app.get("/api/accuracy/report")
async def accuracy_report():
    # static JSON from rig if present, else stub
    import pathlib, json as _json
    p = pathlib.Path("/app/anpr_eval/results/baseline_v0.md")
    if p.exists():
        return {"source": "anpr_eval", "note": "see anpr_eval/results/baseline_v0.md", "path": str(p)}
    return {"source": "stub", "accuracy": None}


# ---- WS hub ----
@app.websocket("/live")
async def live(ws: WebSocket):
    await ws.accept()
    r = get_redis(REDIS_URL)
    pubsub = r.pubsub()
    await pubsub.subscribe("ws:broadcast")
    # optional: read initial sub message from client
    try:
        # give client 1s to send sub viewport msg, ignore if not
        try:
            raw = await asyncio.wait_for(ws.receive_text(), timeout=1.0)
            # store sub for filtering (not enforced yet)
            _sub = json.loads(raw)
        except asyncio.TimeoutError:
            pass
        except Exception:
            pass
        # pump pubsub → ws
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg and msg.get("data"):
                try:
                    data = msg["data"]
                    if isinstance(data, bytes):
                        data = data.decode()
                    await ws.send_text(data)
                except Exception:
                    break
            # also handle client pings
            try:
                # non-blocking check for client close
                await asyncio.wait_for(ws.receive_text(), timeout=0.05)
            except asyncio.TimeoutError:
                pass
            except WebSocketDisconnect:
                break
    finally:
        try:
            await pubsub.unsubscribe("ws:broadcast")
            await pubsub.close()
        except Exception:
            pass
        try:
            await ws.close()
        except Exception:
            pass
