"""Generate ANPR gates from a SUMO net (ARCHITECTURE.md §3).
TLS junctions first, then top-degree arterial junctions up to --n gates.
Writes sim/data/<city>_gates.json and (with --apply-db) replaces cameras in DB.
Usage:
  python scripts/generate_gates.py --net delhi.net.xml --out delhi_gates.json --n 60 --apply-db
"""
import argparse
import json
import asyncio
from pathlib import Path

import sumolib

ROOT = Path(__file__).resolve().parent.parent
DATABASE_URL = "postgresql://anpr:anpr@localhost:5432/anpr"


def pick_gates(net_path: Path, n: int):
    net = sumolib.net.readNet(str(net_path))
    nodes = net.getNodes()
    tls_ids = {t.getID() for t in net.getTrafficLights()}

    def degree(node):
        return len(node.getOutgoing()) + len(node.getIncoming())

    tls_nodes = [v for v in nodes if v.getID() in tls_ids]
    others = sorted((v for v in nodes if v.getID() not in tls_ids), key=degree, reverse=True)

    chosen = tls_nodes + others
    chosen = chosen[:n]
    gates = []
    for i, node in enumerate(chosen, 1):
        x, y = node.getCoord()
        lon, lat = net.convertXY2LonLat(x, y)
        gates.append({
            "id": f"CAM_{i:03d}",
            "node_id": node.getID(),
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "tls": node.getID() in tls_ids,
            "degree": degree(node),
        })
    return gates


async def apply_db(gates):
    import asyncpg
    pool = await asyncpg.create_pool(DATABASE_URL)
    async with pool.acquire() as conn:
        # throwaway vertical-slice rows; FK forces reads/vehicles/rollups/alerts to go first
        for tbl in ["reads", "vehicles", "camera_rollups", "alerts", "camera_pairs", "od_stats", "health_stats"]:
            await conn.execute(f"DELETE FROM {tbl}")
        await conn.execute("DELETE FROM cameras")
        for g in gates:
            await conn.execute(
                """INSERT INTO cameras (id, name, geom, heading, zone, type)
                   VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326), 0, $5, 'sim')""",
                g["id"], f"Gate {g['id'][-3:]} ({'tls' if g['tls'] else 'arterial'})",
                g["lon"], g["lat"],
                "signal" if g["tls"] else "arterial",
            )
    await pool.close()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--net", default="delhi.net.xml", help="net file under sim/data/")
    ap.add_argument("--out", default="delhi_gates.json", help="output JSON under sim/data/")
    ap.add_argument("--n", type=int, default=35)
    ap.add_argument("--apply-db", action="store_true")
    args = ap.parse_args()

    net_path = ROOT / "sim" / "data" / args.net
    out_path = ROOT / "sim" / "data" / args.out
    gates = pick_gates(net_path, args.n)
    out_path.write_text(json.dumps(gates, indent=2))
    print(f"wrote {len(gates)} gates -> {out_path}")
    print(f"  tls gates: {sum(1 for g in gates if g['tls'])}, arterial: {sum(1 for g in gates if not g['tls'])}")
    print("  sample:", [(g['id'], g['lat'], g['lon'], g['tls']) for g in gates[:3]])

    if args.apply_db:
        await apply_db(gates)
        print(f"DB cameras replaced with {len(gates)} net-derived gates")


if __name__ == "__main__":
    asyncio.run(main())
