"""Ingest API — validates, enriches, shards to Redis Streams."""
import base64
import hashlib
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from common.config import REDIS_URL, stream_key
from common.plate import canonicalize
from common.redis_client import get_redis
from common.schemas import EdgeEventIn

app = FastAPI(title="ingest")

# optional: write crops to shared volume if configured
CROP_DIR = Path(os.getenv("CROP_DIR", "/data/crops"))
# bounded stream length per shard
STREAM_MAXLEN = int(os.getenv("STREAM_MAXLEN", "10000"))


def _get_stream(camera_id: str) -> str:
    return stream_key(camera_id)


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "ingest"}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ingest"}


@app.post("/ingest/v1/events")
async def ingest_event(evt: EdgeEventIn, request: Request, authorization: str | None = Header(default=None)):
    # edge_token check: if camera has edge_token in DB, verify (lazy — skip if no DB yet)
    # For now, accept all; workers will enforce blacklist etc.
    canonical = evt.normalized_canonical()
    if not canonical:
        raise HTTPException(status_code=400, detail="plate_raw/canonical empty after canonicalize")

    # ts normalization: ensure tz-aware
    ts = evt.ts
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    ts_iso = ts.isoformat()

    # optionally persist crop to volume (matcher also does it; ingest does it early for API crop serving)
    crop_path = None
    if evt.crop_b64:
        try:
            # validate b64
            base64.b64decode(evt.crop_b64[:64] + "==" if len(evt.crop_b64) % 4 else evt.crop_b64[:64])
            # don't write full file here if too large; matcher will do canonical write
            # we just keep b64 in stream for matcher to persist
            crop_path = ""  # placeholder; matcher fills real path
        except Exception:
            pass

    stream = _get_stream(evt.camera_id)
    r = get_redis(REDIS_URL)
    fields = {
        "camera_id": evt.camera_id,
        "ts": ts_iso,
        "raw_plate": evt.plate_raw or "",
        "canonical": canonical,
        "confidence": str(evt.confidence),
        "vehicle_class": evt.vehicle_class or "private",
        "crop_b64": evt.crop_b64 or "",
        "ground_truth": evt.ground_truth or "",
        "read_id": str(uuid.uuid4()),
    }
    # XADD with MAXLEN ~ to bound memory
    seq = await r.xadd(stream, fields, maxlen=STREAM_MAXLEN, approximate=True)
    # publish to ws:broadcast for live fan-out (api WS hub subscribes)
    # keep payload small: sampled ticker path reads stream directly; here we just pub a lightweight notice
    try:
        import json
        await r.publish(
            "ws:broadcast",
            json.dumps({"t": "ev", "cam": evt.camera_id, "plate": canonical, "conf": evt.confidence, "ts": ts_iso}),
        )
    except Exception:
        pass
    return {"status": "ok", "canonical": canonical, "stream": stream, "seq": seq}


@app.post("/ingest/v1/batch")
async def ingest_batch(events: list[EdgeEventIn]):
    """Batch ingest for replay-gun / sim bulk."""
    results = []
    for evt in events:
        try:
            res = await ingest_event(evt, None)  # type: ignore
            results.append(res)
        except HTTPException as e:
            results.append({"status": "error", "detail": e.detail})
    return {"ingested": len([r for r in results if r.get("status") == "ok"]), "results": results}
