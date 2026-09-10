"""Analytics worker — 1-min rollups, travel-time graph, OD, health.

Consumes the analytics consumer group, keeps hot stats in worker memory,
flushes to Postgres every FLUSH_EVERY_S (ARCHITECTURE.md §8, two rules:
reads is source of truth; hot stats in memory, flushed periodically).

Tables written:
  camera_rollups — per-camera 1-min counts (heatmap reads ONLY this)
  camera_pairs   — per-pair travel-time median/p90 + samples (congestion)
  od_stats       — per-5-min (from_cam, to_cam) vehicle counts (OD arcs)
  health_stats   — per-camera per-5-min observed vs expected rate + status

Approximations (documented, not hidden):
  road_dist_m is haversine distance from the camera registry, NOT routed
  road distance. It unblocks congestion ratios and impossible-travel until
  the networkx/traCI precompute lands.
  Health "expected" rate is the trailing mean of the previous windows in
  worker memory (cold start: expected = observed, status ok).
"""
import asyncio
import math
import time
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone, timedelta
from statistics import median, quantiles

import asyncpg

from common.config import DATABASE_URL, REDIS_URL, all_stream_keys, REDIS_GROUP_ANALYTICS
from common.redis_client import get_redis
import uuid

CONSUMER = f"analytics-{uuid.uuid4().hex[:6]}"
FLUSH_EVERY_S = 5
OD_BUCKET_S = 300      # 5-min OD/health windows (limits row growth)
PAIR_DEQUE_MAX = 200   # recent travel-time samples kept per pair
HEALTH_BASELINE_N = 12  # trailing windows for expected-rate baseline

# in-memory rollup buffers
rollup_buf: Counter[tuple[str, datetime]] = Counter()
od_buf: Counter[tuple[datetime, str, str]] = Counter()
health_buf: Counter[tuple[str, datetime]] = Counter()
pair_samples: dict[tuple[str, str], deque] = defaultdict(lambda: deque(maxlen=PAIR_DEQUE_MAX))
health_baseline: dict[str, deque] = defaultdict(lambda: deque(maxlen=HEALTH_BASELINE_N))

# camera registry cache: id -> (lng, lat)
cam_coords: dict[str, tuple[float, float]] = {}
last_cam_refresh = 0.0


def _window_start(ts: datetime) -> datetime:
    return ts.replace(second=0, microsecond=0)


def _bucket_start(ts: datetime, bucket_s: int = OD_BUCKET_S) -> datetime:
    epoch = int(ts.timestamp()) // bucket_s * bucket_s
    return datetime.fromtimestamp(epoch, tz=timezone.utc)


def _parse_ts(s: str) -> datetime:
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.now(timezone.utc)


def _haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlon, dlat = lon2 - lon1, lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


async def refresh_cameras(pool: asyncpg.Pool):
    """Reload camera coordinates (cheap, runs ~1/min)."""
    global last_cam_refresh
    if time.monotonic() - last_cam_refresh < 60 and cam_coords:
        return
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, ST_X(geom) AS lng, ST_Y(geom) AS lat FROM cameras"
            )
            cam_coords.clear()
            for r in rows:
                if r["lng"] is not None and r["lat"] is not None:
                    cam_coords[r["id"]] = (float(r["lng"]), float(r["lat"]))
        last_cam_refresh = time.monotonic()
    except Exception as e:
        print(f"[analytics] camera refresh failed: {e}")


async def ensure_groups(r):
    for k in all_stream_keys():
        try:
            await r.xgroup_create(k, REDIS_GROUP_ANALYTICS, id="0", mkstream=True)
        except Exception as e:
            if "BUSYGROUP" not in str(e):
                print(f"[analytics] xgroup {k}: {e}")


def _pair_stats(samples: deque) -> tuple[float, float]:
    vals = sorted(samples)
    med = median(vals)
    try:
        p90 = quantiles(vals, n=10)[8] if len(vals) >= 10 else vals[-1]
    except Exception:
        p90 = vals[-1]
    return float(med), float(p90)


async def flush_all(pool: asyncpg.Pool):
    global rollup_buf, od_buf, health_buf
    # --- 1-min camera rollups (heatmap) ---
    if rollup_buf:
        rows = [(cam, ws, cnt) for (cam, ws), cnt in rollup_buf.items()]
        rollup_buf = Counter()
        async with pool.acquire() as conn:
            await conn.executemany(
                """
                INSERT INTO camera_rollups (camera_id, window_start, count)
                VALUES ($1, $2, $3)
                ON CONFLICT (camera_id, window_start) DO UPDATE SET count = camera_rollups.count + EXCLUDED.count
                """,
                rows,
            )
        print(f"[analytics] flushed {len(rows)} rollup buckets")

    # --- travel-time graph (congestion) ---
    if pair_samples:
        prow = []
        for (frm, to), samples in pair_samples.items():
            if len(samples) < 1:
                continue
            a, b = cam_coords.get(frm), cam_coords.get(to)
            if a is None or b is None:
                continue  # unknown camera: skip (road_dist_m is NOT NULL)
            med, p90 = _pair_stats(samples)
            prow.append((frm, to, _haversine_m(a, b), len(samples), med, p90))
        if prow:
            async with pool.acquire() as conn:
                await conn.executemany(
                    """
                    INSERT INTO camera_pairs (from_cam, to_cam, road_dist_m, samples, median_tt, p90_tt, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, now())
                    ON CONFLICT (from_cam, to_cam) DO UPDATE SET
                      road_dist_m = EXCLUDED.road_dist_m,
                      samples = camera_pairs.samples + EXCLUDED.samples,
                      median_tt = EXCLUDED.median_tt,
                      p90_tt = EXCLUDED.p90_tt,
                      updated_at = now()
                    """,
                    prow,
                )
            print(f"[analytics] flushed {len(prow)} camera pairs")

    # --- OD matrix (5-min windows) ---
    if od_buf:
        orows = [(ws, frm, to, cnt) for (ws, frm, to), cnt in od_buf.items()]
        od_buf = Counter()
        async with pool.acquire() as conn:
            await conn.executemany(
                """
                INSERT INTO od_stats (window_start, from_cam, to_cam, vehicle_count)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (window_start, from_cam, to_cam) DO UPDATE SET
                  vehicle_count = od_stats.vehicle_count + EXCLUDED.vehicle_count
                """,
                orows,
            )
        print(f"[analytics] flushed {len(orows)} OD cells")

    # --- camera health (5-min windows, trailing baseline) ---
    if health_buf:
        hrows = []
        for (cam, ws), observed in health_buf.items():
            base = health_baseline[cam]
            expected = sum(base) / len(base) if base else float(observed)
            if observed == 0 and expected > 2:
                status = "down"
            elif expected > 0 and observed < 0.3 * expected:
                status = "degraded"
            else:
                status = "ok"
            hrows.append((cam, ws, expected, float(observed), status))
            base.append(float(observed))
        health_buf = Counter()
        async with pool.acquire() as conn:
            await conn.executemany(
                """
                INSERT INTO health_stats (camera_id, window_start, expected_rate, observed_rate, status)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (camera_id, window_start) DO UPDATE SET
                  expected_rate = EXCLUDED.expected_rate,
                  observed_rate = EXCLUDED.observed_rate,
                  status = EXCLUDED.status
                """,
                hrows,
            )
        print(f"[analytics] flushed {len(hrows)} health rows")


async def run():
    r = get_redis(REDIS_URL)
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=3)
    await ensure_groups(r)
    await refresh_cameras(pool)
    print(f"[analytics] consumer={CONSUMER}")
    last_flush = time.monotonic()
    # track last seen per canonical for OD/pair deltas (small in-mem)
    last_seen: dict[str, tuple[str, datetime]] = {}
    while True:
        try:
            await refresh_cameras(pool)
            streams = {k: ">" for k in all_stream_keys()}
            resp = await r.xreadgroup(REDIS_GROUP_ANALYTICS, CONSUMER, streams, count=500, block=1000)
            if resp:
                for skey, msgs in resp:
                    for msg_id, fields in msgs:
                        cam = fields.get("camera_id", "")
                        ts = _parse_ts(fields.get("ts", ""))
                        rollup_buf[(cam, _window_start(ts))] += 1
                        health_buf[(cam, _bucket_start(ts))] += 1
                        canonical = fields.get("canonical", "")
                        if canonical:
                            prev = last_seen.get(canonical)
                            if prev:
                                prev_cam, prev_ts = prev
                                if prev_cam != cam:
                                    delta = (ts - prev_ts).total_seconds()
                                    if 0 < delta < 3600:
                                        pair_samples[(prev_cam, cam)].append(delta)
                                        od_buf[(_bucket_start(ts), prev_cam, cam)] += 1
                            last_seen[canonical] = (cam, ts)
                        await r.xack(skey, REDIS_GROUP_ANALYTICS, msg_id)
                # cap memory
                if len(last_seen) > 50000:
                    # drop oldest 10k (rough)
                    for k in list(last_seen.keys())[:10000]:
                        del last_seen[k]
            if time.monotonic() - last_flush > FLUSH_EVERY_S:
                await flush_all(pool)
                last_flush = time.monotonic()
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[analytics] error: {e}")
            await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(run())
