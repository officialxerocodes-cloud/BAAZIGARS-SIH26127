"""Alerts worker — blacklist, impossible travel (physics + heuristic), health."""
import asyncio
import json
import os
import time
import uuid
from datetime import datetime, timezone

import asyncpg

from common.config import DATABASE_URL, REDIS_URL, all_stream_keys, REDIS_GROUP_ALERTS
from common.redis_client import get_redis

# Max plausible road speed for the physics check (m/s). A hop faster than
# road_dist / V_MAX cannot be one vehicle — flag it.
V_MAX_MS = float(os.getenv("ALERT_V_MAX_MS", "30"))
PAIR_REFRESH_S = 30

async def ensure_groups(r):
    for k in all_stream_keys():
        try:
            await r.xgroup_create(k, REDIS_GROUP_ALERTS, id="0", mkstream=True)
        except Exception as e:
            if "BUSYGROUP" not in str(e):
                print(f"[alerts] xgroup {k}: {e}")

def _parse_ts(s: str) -> datetime:
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.now(timezone.utc)

async def process_one(r, pool, skey, msg_id, fields, blacklist: set, last_seen: dict,
                      pair_dist: dict):
    canonical = fields.get("canonical", "")
    cam = fields.get("camera_id", "")
    ts = _parse_ts(fields.get("ts", ""))
    # blacklist exact
    if canonical and canonical in blacklist:
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO alerts (type, canonical, payload) VALUES ('blacklist', $1, $2)",
                canonical,
                json.dumps({"camera_id": cam, "ts": ts.isoformat()}),
            )
        await r.publish("ws:broadcast", f'{{"t":"alert","kind":"blacklist","plate":"{canonical}","cam":"{cam}"}}')
    # impossible travel: same plate at two cameras faster than physics.
    # Known pair -> delta < road_dist / V_MAX. Unknown pair -> legacy 30s
    # heuristic (labeled), so fresh grids still flag while pairs accumulate.
    if canonical:
        prev = last_seen.get(canonical)
        if prev:
            prev_cam, prev_ts = prev
            if prev_cam != cam:
                delta = (ts - prev_ts).total_seconds()
                dist = pair_dist.get((prev_cam, cam))
                if dist:
                    min_time = dist / V_MAX_MS
                    if 0 < delta < min_time:
                        await _impossible(r, pool, canonical, prev_cam, cam, delta,
                                          {"road_dist_m": dist, "min_time_s": round(min_time, 1),
                                           "basis": "physics"})
                elif 0 < delta < 30:
                    await _impossible(r, pool, canonical, prev_cam, cam, delta,
                                      {"basis": "heuristic"})
        last_seen[canonical] = (cam, ts)
    await r.xack(skey, REDIS_GROUP_ALERTS, msg_id)


async def _impossible(r, pool, canonical, prev_cam, cam, delta, extra):
    payload = {"from_cam": prev_cam, "to_cam": cam, "delta_s": delta}
    payload.update(extra)
    # Physics basis (known road distance) is strong enough to call it what it
    # is: a cloned plate on two tracks. Heuristic (<30s, unknown pair) stays
    # 'impossible'. GET .../clones reads both types, so forensics keeps working.
    kind = "clone" if extra.get("basis") == "physics" else "impossible"
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO alerts (type, canonical, payload) VALUES ($1, $2, $3)",
            kind,
            canonical,
            json.dumps(payload),
        )
    await r.publish("ws:broadcast", json.dumps(
        {"t": "alert", "kind": kind, "plate": canonical,
         "from": prev_cam, "to": cam, "delta": delta}))


async def run():
    r = get_redis(REDIS_URL)
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=3)
    await ensure_groups(r)
    CONSUMER = f"alerts-{uuid.uuid4().hex[:6]}"
    print(f"[alerts] consumer={CONSUMER}")
    # cache blacklist in memory, refresh every 10s
    blacklist: set[str] = set()
    last_bl_refresh = 0
    # travel-time graph for the physics check, refreshed every 30s
    pair_dist: dict[tuple[str, str], float] = {}
    last_pair_refresh = 0
    last_seen: dict[str, tuple[str, datetime]] = {}
    last_reclaim = time.monotonic()
    while True:
        try:
            # reclaim stale pending (dead consumers / crashed batches) every 15s
            if time.monotonic() - last_reclaim > 15:
                last_reclaim = time.monotonic()
                for k in all_stream_keys():
                    try:
                        claimed = await r.xautoclaim(k, REDIS_GROUP_ALERTS, CONSUMER, min_idle_time=30000, start_id="0-0", count=100)
                        if len(claimed) >= 2 and claimed[1]:
                            for msg_id, fields in claimed[1]:
                                await process_one(r, pool, k, msg_id, fields, blacklist, last_seen, pair_dist)
                    except Exception as e:
                        print(f"[alerts] reclaim {k}: {e}")
            if time.monotonic() - last_bl_refresh > 10:
                async with pool.acquire() as conn:
                    rows = await conn.fetch("SELECT plate FROM blacklist")
                    blacklist = {row["plate"] for row in rows}
                last_bl_refresh = time.monotonic()
            if time.monotonic() - last_pair_refresh > PAIR_REFRESH_S:
                try:
                    async with pool.acquire() as conn:
                        prows = await conn.fetch("SELECT from_cam, to_cam, road_dist_m FROM camera_pairs")
                        pair_dist = {(p["from_cam"], p["to_cam"]): float(p["road_dist_m"]) for p in prows}
                    last_pair_refresh = time.monotonic()
                except Exception as e:
                    print(f"[alerts] pair refresh failed: {e}")
            streams = {k: ">" for k in all_stream_keys()}
            resp = await r.xreadgroup(REDIS_GROUP_ALERTS, CONSUMER, streams, count=200, block=1000)
            if not resp:
                continue
            for skey, msgs in resp:
                for msg_id, fields in msgs:
                    try:
                        await process_one(r, pool, skey, msg_id, fields, blacklist, last_seen, pair_dist)
                    except Exception as e:
                        print(f"[alerts] msg {msg_id} failed: {e}")
                        # ack anyway to avoid poison-message stall (alert loss acceptable, pipeline stall is not)
                        await r.xack(skey, REDIS_GROUP_ALERTS, msg_id)
            if len(last_seen) > 50000:
                for k in list(last_seen.keys())[:10000]:
                    del last_seen[k]
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[alerts] error: {e}")
            await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(run())
