"""Fake camera — posts synthetic events straight to ingest. Day 2 vertical slice + FE fixtures."""
import argparse
import asyncio
import random
import time
from datetime import datetime, timezone, timedelta

import httpx

PLATES = ["DL8CAB1234", "DL1CCD5678", "DL10EF9999", "DL8CAF1234", "HR26DK4321"]
CAMERAS = [f"CAM_{i:03d}" for i in range(1, 11)]

async def post_once(client: httpx.AsyncClient, ingest_url: str, cam: str, plate: str):
    evt = {
        "camera_id": cam,
        "ts": datetime.now(timezone.utc).isoformat(),
        "plate_raw": plate,
        "canonical": plate,
        "confidence": round(random.uniform(0.85, 0.97), 3),
        "vehicle_class": "private",
        "ground_truth": plate,
    }
    r = await client.post(f"{ingest_url}/ingest/v1/events", json=evt)
    return r.status_code, r.text[:200]

async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ingest", default="http://localhost:8000")
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--delay", type=float, default=0.1)
    args = ap.parse_args()
    async with httpx.AsyncClient(timeout=5) as client:
        for i in range(args.n):
            cam = random.choice(CAMERAS)
            plate = random.choice(PLATES)
            code, body = await post_once(client, args.ingest, cam, plate)
            print(f"{i+1}/{args.n} {cam} {plate} -> {code}")
            await asyncio.sleep(args.delay)
    print("done")

if __name__ == "__main__":
    asyncio.run(main())
