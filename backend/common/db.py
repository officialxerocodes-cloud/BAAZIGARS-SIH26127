import asyncpg

_pool: asyncpg.Pool | None = None

async def get_pool(dsn: str) -> asyncpg.Pool:
    global _pool
    if _pool is None:
        # Fail fast: without a timeout a half-open DB hangs every worker
        # silently forever at startup (no log line, no crash, no consume).
        _pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10, timeout=10)
    return _pool

async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
