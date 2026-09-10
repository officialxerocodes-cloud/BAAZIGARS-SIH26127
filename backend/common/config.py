import os

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://anpr:anpr@localhost:5432/anpr")
ANPR_URL = os.getenv("ANPR_URL", "http://localhost:8001")
SIM_RATE = int(os.getenv("SIM_RATE", "60"))
SIM_SEED = int(os.getenv("SIM_SEED", "42"))

REDIS_STREAM_SHARDS = 8
REDIS_STREAM_PREFIX = "events:raw"
REDIS_GROUP_MATCHER = "matcher"
REDIS_GROUP_ANALYTICS = "analytics"
REDIS_GROUP_ALERTS = "alerts"

# matcher fuzzy window (seconds)
MATCHER_FUZZY_WINDOW_S = 600  # 10 min per ARCHITECTURE.md
MATCHER_FUZZY_MAX_DIST = 1

# analytics rollup
ROLLUP_BUCKET_S = 60

def stream_key(camera_id: str) -> str:
    import hashlib
    h = int(hashlib.md5(camera_id.encode()).hexdigest(), 16)
    shard = h % REDIS_STREAM_SHARDS
    return f"{REDIS_STREAM_PREFIX}:{shard}"

def all_stream_keys() -> list[str]:
    return [f"{REDIS_STREAM_PREFIX}:{i}" for i in range(REDIS_STREAM_SHARDS)]
