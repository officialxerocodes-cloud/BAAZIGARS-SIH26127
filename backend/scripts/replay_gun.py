"""Replay-gun — re-emit recorded events at Nx speed for load testing."""
import argparse, asyncio, json, time
import httpx

async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ingest", default="http://localhost:8000")
    ap.add_argument("--file", required=True, help="jsonl with EdgeEvent JSON per line")
    ap.add_argument("--speed", type=float, default=10.0)
    args = ap.parse_args()
    lines = open(args.file).read().strip().splitlines()
    events = [json.loads(l) for l in lines if l.strip()]
    print(f"loaded {len(events)} events, replay at {args.speed}x -> {args.ingest}")
    async with httpx.AsyncClient(timeout=5) as client:
        start = time.monotonic()
        for evt in events:
            await client.post(f"{args.ingest}/ingest/v1/events", json=evt)
        elapsed = time.monotonic() - start
        print(f"done {len(events)} events in {elapsed:.1f}s ({len(events)/max(elapsed,0.01):.1f}/s)")

if __name__ == "__main__":
    asyncio.run(main())
