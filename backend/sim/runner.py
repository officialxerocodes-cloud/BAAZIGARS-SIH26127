"""SUMO sim runner — libsumo embedded, gate crossings -> stub ANPR / ingest.

ARCHITECTURE.md §3-§4. Tier-0 demand (randomTrips routes), induction-loop
gates, deterministic plates, ground-truth tape.

Usage (dev, local venv):
  PYTHONPATH=/home/pj/MyWork/sih/backend \\
    .venv-sumo/bin/python -m sim.runner --dry-run --duration 120 --rate 1
  Full chain:
    .venv-sumo/bin/python -m sim.runner --duration 300 --rate 10
  Load mode (skip ANPR hop):
    SIM_BYPASS_ANPR=1 .venv-sumo/bin/python -m sim.runner --duration 600 --rate 20
"""
import argparse
import asyncio
import os
import signal
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import asyncpg
import httpx
import libsumo as traci

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sim.plate_gen import plate_for  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
IST = timezone(timedelta(hours=5, minutes=30))
DEDUP_WINDOW_S = 30.0  # same veh+gate re-report suppression (slow vehicles on loops)


@dataclass
class Crossing:
    veh_id: str
    gate: str
    sim_t: float
    speed: float
    plate: str


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--net", default=os.getenv("NET_FILE", str(ROOT / "sim" / "data" / "delhi.net.xml")))
    ap.add_argument("--routes", default=None)
    ap.add_argument("--det", default=None)
    ap.add_argument("--rate", type=float, default=float(os.getenv("SIM_RATE", "10")))
    ap.add_argument("--duration", type=float, default=float(os.getenv("SIM_DURATION", "3600")))
    ap.add_argument("--seed", type=int, default=int(os.getenv("SIM_SEED", "42")))
    ap.add_argument("--dry-run", action="store_true", help="step + gt tape only, no HTTP")
    ap.add_argument("--bypass-anpr", action="store_true",
                    default=os.getenv("SIM_BYPASS_ANPR", "0") == "1")
    ap.add_argument("--posters", type=int, default=8)
    return ap.parse_args()


def sibling(path: str, suffix: str) -> str:
    p = Path(path)
    return str(p.parent / (p.name.replace(".net.xml", suffix)))


async def gt_writer(q: asyncio.Queue, pool: asyncpg.Pool, stats: dict):
    buf = []
    while True:
        try:
            item = await asyncio.wait_for(q.get(), timeout=1.0)
        except asyncio.TimeoutError:
            if buf:  # idle flush — do NOT treat as sentinel
                await flush_gt(pool, buf, stats)
                buf = []
            continue
        if item is None:  # sentinel: flush FIRST, then ack, so join() implies durability
            if buf:
                await flush_gt(pool, buf, stats)
                buf = []
            q.task_done()
            break
        buf.append(item)
        q.task_done()
        if len(buf) >= 500:
            await flush_gt(pool, buf, stats)
            buf = []


async def flush_gt(pool: asyncpg.Pool, buf: list[Crossing], stats: dict):
    rows = [(c.veh_id, c.gate, c.sim_t, c.plate) for c in buf]
    # sim_t stored as epoch seconds offset; convert in SQL via start epoch passed in stats
    async with pool.acquire() as conn:
        try:
            await conn.executemany(
                "INSERT INTO gt_crossings (veh_id, gate, sim_ts, gt_plate) "
                "VALUES ($1, $2, to_timestamp($3::float8 + $5::float8), $4)",
                [(v, g, t, p, stats["epoch"]) for (v, g, t, p) in rows],
            )
        except Exception as e:
            print(f"[sim] gt flush failed ({len(rows)} rows): {e}", flush=True)
            return
    stats["gt_rows"] += len(rows)


def spaced_raw(plate: str) -> str:
    return f"{plate[:4]} {plate[4:]}"


async def poster(q: asyncio.Queue, client: httpx.AsyncClient, anpr_url: str,
                 ingest_url: str, bypass: bool, start: datetime, stats: dict):
    while True:
        c = await q.get()
        if c is None:
            q.task_done()
            break
        try:
            ts_iso = (start + timedelta(seconds=c.sim_t)).isoformat()
            if bypass:
                evt = {"camera_id": c.gate, "ts": ts_iso, "plate_raw": spaced_raw(c.plate),
                       "canonical": c.plate, "confidence": 0.95,
                       "vehicle_class": "private", "ground_truth": c.plate}
            else:
                r = await client.post(f"{anpr_url}/v1/recognize", json={
                    "gt_plate": c.plate, "camera_id": c.gate, "ts": ts_iso}, timeout=10)
                if r.status_code == 204:
                    stats["missed"] += 1
                    continue  # finally: task_done covers this path
                r.raise_for_status()
                rec = r.json()
                evt = {"camera_id": c.gate, "ts": ts_iso,
                       "plate_raw": spaced_raw(rec["plate"]),
                       "canonical": rec["canonical"], "confidence": rec["confidence"],
                       "vehicle_class": "private", "ground_truth": c.plate}
            r2 = await client.post(f"{ingest_url}/ingest/v1/events", json=evt, timeout=10)
            r2.raise_for_status()
            stats["posted"] += 1
        except Exception as e:
            stats["post_err"] += 1
            if stats["post_err"] <= 5:
                # Name the endpoints: a bare DNS/connection error is
                # undebuggable without knowing WHICH hop failed (ANPR vs
                # ingest) — this exact ambiguity cost a full ghost chase.
                print(f"[sim] post error via anpr={anpr_url} ingest={ingest_url}: {e}", flush=True)
        finally:
            q.task_done()


async def amain():
    args = parse_args()
    routes = args.routes or sibling(args.net, ".rou.xml")
    det = args.det or sibling(args.net, ".det.xml")
    anpr_url = os.getenv("ANPR_URL", "http://localhost:8001").rstrip("/")
    ingest_url = os.getenv("INGEST_URL", "http://localhost:8000").rstrip("/")
    db_url = os.getenv("DATABASE_URL", "postgresql://anpr:anpr@localhost:5432/anpr")

    # Sim clock defaults to wall-clock now so dashboard windows
    # (heatmap/OD/alerts) show live data. Set SIM_START_HOUR=9 for a fixed
    # AM-peak demo clock instead.
    _start_hour = os.getenv("SIM_START_HOUR")
    _now = datetime.now(IST)
    if _start_hour:
        start = _now.replace(hour=int(_start_hour), minute=0, second=0, microsecond=0)
    else:
        start = _now.replace(second=0, microsecond=0)
    stats = {"epoch": start.timestamp(), "crossings": 0, "gt_rows": 0,
             "posted": 0, "missed": 0, "post_err": 0, "steps": 0, "loop_err": 0}

    import xml.etree.ElementTree as ET
    loops = [lp.get("id") for lp in ET.parse(det).getroot().findall("inductionLoop")]
    gate_of = {lp: lp.split("__")[0] for lp in loops}
    print(f"[sim] net={args.net} loops={len(loops)} rate={args.rate}x "
          f"duration={args.duration}s dry_run={args.dry_run} bypass={args.bypass_anpr}", flush=True)

    traci.start(["sumo", "-n", args.net, "-r", routes, "-a", det,
                 "--no-step-log", "true", "--no-warnings", "true",
                 "--seed", str(args.seed)])
    pool = await asyncpg.create_pool(db_url, min_size=1, max_size=3)
    q_gt: asyncio.Queue = asyncio.Queue(maxsize=20000)
    q_post: asyncio.Queue = asyncio.Queue(maxsize=20000)
    gt_task = asyncio.create_task(gt_writer(q_gt, pool, stats))

    client = httpx.AsyncClient()
    posters = []
    if not args.dry_run:
        posters = [asyncio.create_task(
            poster(q_post, client, anpr_url, ingest_url, args.bypass_anpr, start, stats))
            for _ in range(args.posters)]

    stop = False

    def _sig(*_a):
        nonlocal stop
        stop = True
    signal.signal(signal.SIGINT, _sig)
    signal.signal(signal.SIGTERM, _sig)

    last_seen: dict[tuple[str, str], float] = {}
    wall0 = time.monotonic()
    sim_t = 0.0
    last_log = wall0
    try:
        while not stop and sim_t < args.duration:
            step0 = time.monotonic()
            traci.simulationStep()
            sim_t = traci.simulation.getTime()
            stats["steps"] += 1
            for lp in loops:
                # cheap gate first: most loops are empty most steps
                try:
                    if traci.inductionloop.getLastStepVehicleNumber(lp) == 0:
                        continue
                    data = traci.inductionloop.getVehicleData(lp)
                except Exception as e:
                    stats["loop_err"] += 1
                    if stats["loop_err"] <= 5:
                        print(f"[sim] loop {lp}: {e}", flush=True)
                    continue
                if not data:
                    continue
                gate = gate_of[lp]
                for entry in data:
                    # getVehicleData -> (veh_id, length, entry_t, leave_t, type)
                    veh = entry[0]
                    key = (veh, gate)
                    if sim_t - last_seen.get(key, -1e9) < DEDUP_WINDOW_S:
                        continue
                    last_seen[key] = sim_t
                    try:
                        speed = float(traci.vehicle.getSpeed(veh))
                    except Exception:
                        speed = 0.0
                    c = Crossing(veh, gate, sim_t, speed, plate_for(veh))
                    stats["crossings"] += 1
                    await q_gt.put(c)
                    if posters:
                        await q_post.put(c)
            if len(last_seen) > 200000:
                cutoff = sim_t - DEDUP_WINDOW_S - 60
                for k in [k for k, t in last_seen.items() if t < cutoff]:
                    del last_seen[k]
            # wall pacing: 1 sim-second per 1/rate wall-seconds
            wait = (sim_t / args.rate) - (time.monotonic() - wall0) \
                if args.rate > 0 else 0
            if wait > 0:
                await asyncio.sleep(wait)
            now = time.monotonic()
            if now - last_log > 10:
                print(f"[sim] t={sim_t:.0f}s veh={traci.vehicle.getIDCount()} "
                      f"cross={stats['crossings']} gt={stats['gt_rows']} "
                      f"posted={stats['posted']} miss={stats['missed']} "
                      f"err={stats['post_err']} q={q_post.qsize()}", flush=True)
                last_log = now
            if traci.simulation.getMinExpectedNumber() == 0 and sim_t > 60:
                print("[sim] no more vehicles expected, draining", flush=True)
                break
    finally:
        if posters:
            for _ in posters:
                await q_post.put(None)
            await q_post.join()
            for p in posters:
                p.cancel()
        await q_gt.put(None)
        await q_gt.join()
        gt_task.cancel()
        await client.aclose()
        await pool.close()
        traci.close()
    wall = time.monotonic() - wall0
    print(f"[sim] DONE sim_t={sim_t:.0f}s wall={wall:.0f}s "
          f"crossings={stats['crossings']} gt_rows={stats['gt_rows']} "
          f"posted={stats['posted']} missed={stats['missed']} errors={stats['post_err']}", flush=True)


if __name__ == "__main__":
    asyncio.run(amain())
