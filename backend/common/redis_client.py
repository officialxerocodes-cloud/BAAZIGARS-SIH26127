import redis.asyncio as redis

_client: redis.Redis | None = None

def get_redis(url: str) -> redis.Redis:
    global _client
    if _client is None:
        # Timeouts so a dead Redis fails loudly instead of hanging workers.
        _client = redis.from_url(
            url, decode_responses=True, socket_connect_timeout=5, socket_timeout=5
        )
    return _client

async def close_redis():
    global _client
    if _client:
        await _client.aclose()
        _client = None
