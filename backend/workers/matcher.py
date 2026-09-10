"""Matcher worker — Redis Streams consumer group → reads (+ fuzzy identity).

- Canonicalize + persist crop.
- Fuzzy identity: OCR variants within edit<=1 inside a 10-min window merge
  to one vehicle identity (first-seen variant wins; every variant is counted
  in vehicles.flags). The candidate set is in-memory recents UNION a DB
  refresh every 30s, so parallel matcher replicas merge consistently.
- Idempotent: staging COPY + INSERT...ON CONFLICT DO NOTHING RETURNING, and
  vehicles counters advance ONLY for actually-inserted rows. Redelivery after
  a crash can persist 0 new reads and increments nothing — read_count can no
  longer inflate.
- Blacklist fuzzy-catch: when a read merges into a blacklisted identity via
  a *different* variant (cases the alerts worker's exact stream check
  misses), the alert is emitted here. Exact hits stay with alerts worker.
"""
import asyncio
import base64
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import asyncpg

from common.config import (
    DATABASE_URL,
    REDIS_URL,
    all_stream_keys,
    REDIS_GROUP_MATCHER,
    MATCHER_FUZZY_WINDOW_S,
    MATCHER_FUZZY_MAX_DIST,
)
from common.plate import canonicalize, levenshtein
from common.redis_client import get_redis

BATCH_SIZE = int(os.getenv("MATCHER_BATCH", "500"))
BLOCK_MS = int(os.getenv("MATCHER_BLOCK_MS", "1000"))
CROP_DIR = Path(os.getenv("CROP_DIR", "/data/crops"))
REFRESH_S = 30

CONSUMER_NAME = f"matcher-{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------- pure API
def prune_window(seen: dict[str, float], now_ts: float, window_s: float) -> None:
    """Drop identities not seen within the window (in place, bounded memory)."""
    cutoff = now_ts - window_s
    for k in [k for k, t in seen.items() if t < cutoff]:
        del seen[k]


def resolve_identity(canonical: str, candidates: set[str], max_dist: int = 1) -> str | None:
    """Best identity for a canonical within the window.

    Exact match always wins; otherwise the min-edit candidate (deterministic
    tie-break by identity string). Returns None when nothing is close enough,
    meaning the canonical founds a new identity.
    """
    if not canonical:
        return None
    if canonical in candidates:
        return canonical
    best, best_d = None, max_dist + 1
    for c in candidates:
        if abs(len(c) - len(canonical)) > max_dist:
            continue
        d = levenshtein(canonical, c)
        if (d, c) < (best_d, best if best is not None else "\U0010ffff"):
            best, best_d = c, d
    return best if best_d <= max_dist else None


# ---------------------------------------------------------------- worker ----
class MatcherState:
    def __init__(self):
        self.recent: dict[str, float] = {}  # identity -> last seen epoch
        self.blacklist: set[str] = set()
        self.last_refresh = 0.0


async def ensure_groups(r):
    for key in all_stream_keys():
        try:
            await r.xgroup_create(key, REDIS_GROUP_MATCHER, id="0", mkstream=True)
        except Exception as e:
            if "BUSYGROUP" not in str(e):
                print(f"[matcher] xgroup_create {key}: {e}")


def _parse_ts(ts_str: str) -> datetime:
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.now(timezone.utc)


async def _persist_crop(crop_b64: str, read_id: str) -> str | None:
    if not crop_b64:
        return None
    try:
        CROP_DIR.mkdir(parents=True, exist_ok=True)
        data = base64.b64decode(crop_b64)
        path = CROP_DIR / f"{read_id}.jpg"
        path.write_bytes(data)
        return str(path)
    except Exception as e:
        print(f"[matcher] crop persist failed: {e}")
        return None


async def refresh_state(pool: asyncpg.Pool, state: MatcherState):
    """Refresh identity candidates from the DB window + blacklist cache."""
    now = time.monotonic()
    if now - state.last_refresh < REFRESH_S:
        return
    state.last_refresh = now
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT DISTINCT canonical FROM reads WHERE ts > now() - make_interval(secs => $1) LIMIT 2000",
                float(MATCHER_FUZZY_WINDOW_S),
            )
            now_ts = time.time()
            for r in rows:
                if r["canonical"]:
                    state.recent.setdefault(r["canonical"], now_ts)
            bl = await conn.fetch("SELECT plate FROM blacklist")
            state.blacklist = {row["plate"] for row in bl}
    except Exception as e:
        print(f"[matcher] refresh failed: {e}")


async def flush_batch(pool: asyncpg.Pool, r, batch: list[dict], state: MatcherState):
    if not batch:
        return
    await refresh_state(pool, state)
    now_ts = time.time()
    prune_window(state.recent, now_ts, MATCHER_FUZZY_WINDOW_S)
    candidates = set(state.recent)

    staged = []  # (read_id, camera_id, ts, raw, variant, identity, conf, crop_path, gt, vclass)
    for item in batch:
        fields = item["fields"]
        variant = canonicalize(fields.get("canonical") or fields.get("raw_plate") or "")
        if not variant:
            continue
        identity = resolve_identity(variant, candidates, MATCHER_FUZZY_MAX_DIST) or variant
        candidates.add(identity)
        state.recent[identity] = now_ts
        raw_plate = fields.get("raw_plate") or ""
        camera_id = fields.get("camera_id") or ""
        confidence = float(fields.get("confidence") or 0.9)
        ts = _parse_ts(fields.get("ts") or "")
        gt_plate = canonicalize(fields.get("ground_truth") or "") or None
        vehicle_class = fields.get("vehicle_class") or "private"
        read_id = fields.get("read_id") or str(uuid.uuid4())
        crop_b64 = fields.get("crop_b64") or ""
        crop_path = await _persist_crop(crop_b64, read_id) if crop_b64 else None
        staged.append((read_id, camera_id, ts, raw_plate, variant, identity,
                       confidence, crop_path, gt_plate, vehicle_class))

    if not staged:
        return

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """CREATE TEMP TABLE mstage (
                     read_id UUID, camera_id TEXT, ts TIMESTAMPTZ, raw_plate TEXT,
                     variant TEXT, canonical TEXT, confidence REAL, crop_path TEXT,
                     gt_plate TEXT, vehicle_class TEXT
                   ) ON COMMIT DROP"""
            )
            await conn.copy_records_to_table(
                "mstage",
                records=[(s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], s[9]) for s in staged],
            )
            inserted = await conn.fetch(
                """INSERT INTO reads (read_id, camera_id, ts, raw_plate, canonical,
                                      confidence, crop_path, gt_plate, vehicle_class)
                   SELECT read_id, camera_id, ts, raw_plate, canonical,
                          confidence, crop_path, gt_plate, vehicle_class FROM mstage
                   ON CONFLICT (read_id, ts) DO NOTHING
                   RETURNING read_id, canonical, ts"""
            )
            # str(): asyncpg returns UUID objects, staged ids are strings —
            # without this every comparison misses and vehicles never update
            inserted_ids = {str(row["read_id"]) for row in inserted}

            # vehicles counters advance ONLY for inserted rows (idempotent)
            by_ident: dict[str, list] = {}
            variant_counts: dict[str, dict[str, int]] = {}
            for s in staged:
                if s[0] not in inserted_ids:
                    continue
                by_ident.setdefault(s[5], []).append(s)
                vc = variant_counts.setdefault(s[5], {})
                vc[s[4]] = vc.get(s[4], 0) + 1
            for identity, group in by_ident.items():
                first_ts = min(g[2] for g in group)
                last_ts = max(g[2] for g in group)
                await conn.execute(
                    """
                    INSERT INTO vehicles (canonical, first_seen, last_seen, read_count)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (canonical) DO UPDATE SET
                      first_seen = LEAST(vehicles.first_seen, EXCLUDED.first_seen),
                      last_seen  = GREATEST(vehicles.last_seen, EXCLUDED.last_seen),
                      read_count = vehicles.read_count + EXCLUDED.read_count
                    """,
                    identity, first_ts, last_ts, len(group),
                )
                # atomic per-variant increments (each UPDATE takes the row lock).
                # jsonb_set (not jsonb_insert: that one cannot replace object
                # keys). Inner call ensures the container without clobbering it.
                for variant, n in variant_counts[identity].items():
                    await conn.execute(
                        """UPDATE vehicles SET flags = jsonb_set(
                             jsonb_set(COALESCE(flags, '{}'), '{variants}',
                                       COALESCE(flags->'variants', '{}'), true),
                             array['variants', $2],
                             to_jsonb(COALESCE((flags->'variants'->>$2)::int, 0) + $3),
                             true)
                           WHERE canonical = $1""",
                        identity, variant, n,
                    )

            # blacklist fuzzy-catch: merged via a different variant into a
            # blacklisted identity (exact hits stay with the alerts worker)
            for s in staged:
                if s[0] not in inserted_ids:
                    continue
                variant, identity = s[4], s[5]
                if variant != identity and identity in state.blacklist:
                    cam = s[1]
                    await conn.execute(
                        "INSERT INTO alerts (type, canonical, payload) VALUES ('blacklist', $1, $2)",
                        identity,
                        json.dumps({"camera_id": cam, "via_variant": variant,
                                    "basis": "fuzzy-merge"}),
                    )
                    try:
                        await r.publish(
                            "ws:broadcast",
                            json.dumps({"t": "alert", "kind": "blacklist",
                                        "plate": identity, "cam": cam,
                                        "via": variant}),
                        )
                    except Exception:
                        pass
    print(f"[matcher] flushed {len(inserted)}/{len(staged)} reads "
          f"({len(staged) - len(inserted)} dupes skipped)")


async def run():
    r = get_redis(REDIS_URL)
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=5)
    await ensure_groups(r)
    state = MatcherState()
    print(f"[matcher] consumer={CONSUMER_NAME} shards={len(all_stream_keys())} batch={BATCH_SIZE}")
    batch: list[dict] = []
    last_flush = time.monotonic()
    last_reclaim = time.monotonic()
    flush_fail_streak = 0
    while True:
        try:
            # XREADGROUP across all shards
            streams = {k: ">" for k in all_stream_keys()}
            resp = await r.xreadgroup(REDIS_GROUP_MATCHER, CONSUMER_NAME, streams, count=BATCH_SIZE, block=BLOCK_MS)
            if resp:
                for stream_key, messages in resp:
                    for msg_id, fields in messages:
                        batch.append({"stream": stream_key, "msg_id": msg_id, "fields": fields})
                        # ack immediately after batching (at-least-once; DB is idempotent via read_id PK)
                        # we ack after flush to allow reclaim on crash
            # flush conditions: batch size or time
            now = time.monotonic()
            if batch and (len(batch) >= BATCH_SIZE or (now - last_flush) > 2.0):
                try:
                    await flush_batch(pool, r, batch, state)
                    flush_fail_streak = 0
                except Exception as e:
                    flush_fail_streak += 1
                    print(f"[matcher] flush failed ({flush_fail_streak}x): {e}")
                    if flush_fail_streak >= 5:
                        # poison batch: ack-and-drop rather than stall the
                        # pipeline forever (same policy as alerts worker)
                        print(f"[matcher] DROPPING poison batch of {len(batch)} msgs after 5 failures")
                        flush_fail_streak = 0
                    else:
                        raise
                # ack
                # group acks per stream
                from collections import defaultdict
                by_stream: dict[str, list[str]] = defaultdict(list)
                for item in batch:
                    by_stream[item["stream"]].append(item["msg_id"])
                for skey, ids in by_stream.items():
                    try:
                        await r.xack(skey, REDIS_GROUP_MATCHER, *ids)
                    except Exception as e:
                        print(f"[matcher] xack {skey}: {e}")
                batch.clear()
                last_flush = now
            # also reclaim pending idle >30s (XAUTOCLAIM)
            if (now - last_reclaim) > 10:
                last_reclaim = now
                for skey in all_stream_keys():
                    try:
                        claimed = await r.xautoclaim(skey, REDIS_GROUP_MATCHER, CONSUMER_NAME, min_idle_time=30000, start_id="0-0", count=100)
                        # redis-py returns [cursor, messages, ...] — len 3, not 2
                        if claimed and len(claimed) >= 2 and claimed[1]:
                            for msg_id, fields in claimed[1]:
                                batch.append({"stream": skey, "msg_id": msg_id, "fields": fields})
                    except Exception as e:
                        print(f"[matcher] reclaim {skey}: {e}")
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[matcher] loop error: {e}")
            await asyncio.sleep(1)


if __name__ == "__main__":
    asyncio.run(run())
