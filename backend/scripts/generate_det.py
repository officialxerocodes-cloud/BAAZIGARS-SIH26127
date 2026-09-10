"""Generate induction-loop detectors for ANPR gates (ARCHITECTURE.md §4).

One E1 loop per incoming lane of each gate node, pos = lane_length - 10.
Loop id encodes gate + edge + lane: <gate>__<edge>__<lane_idx>.
Usage:
  python scripts/generate_det.py --net delhi.net.xml --gates delhi_gates.json --out delhi.det.xml
"""
import argparse
import json
import xml.etree.ElementTree as ET
from pathlib import Path

import sumolib

ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--net", default="delhi.net.xml")
    ap.add_argument("--gates", default="delhi_gates.json")
    ap.add_argument("--out", default="delhi.det.xml")
    ap.add_argument("--offset", type=float, default=10.0,
                    help="loop position = lane length - offset (m)")
    args = ap.parse_args()

    net = sumolib.net.readNet(str(ROOT / "sim" / "data" / args.net))
    gates = json.loads((ROOT / "sim" / "data" / args.gates).read_text())

    root = ET.Element("additional")
    n_loops = 0
    per_gate: dict[str, int] = {}
    for g in gates:
        node = net.getNode(g["node_id"])
        for edge in node.getIncoming():
            if edge.getFunction() == "internal":
                continue
            for lane in edge.getLanes():
                pos = max(0.0, lane.getLength() - args.offset)
                ET.SubElement(root, "inductionLoop", {
                    "id": f"{g['id']}__{edge.getID()}__{lane.getIndex()}",
                    "lane": lane.getID(),
                    "pos": f"{pos:.1f}",
                    "freq": "1",
                    "file": "NUL",  # traci retrieval only; no file output
                })
                n_loops += 1
                per_gate[g["id"]] = per_gate.get(g["id"], 0) + 1

    out = ROOT / "sim" / "data" / args.out
    ET.indent(root)
    ET.ElementTree(root).write(str(out), encoding="unicode", xml_declaration=True)
    zeros = [gid for gid, n in per_gate.items() if n == 0]
    print(f"wrote {n_loops} loops for {len(gates)} gates -> {out}")
    print(f"  loops/gate: min={min(per_gate.values())} max={max(per_gate.values())}")
    if zeros:
        print(f"  WARNING: {len(zeros)} gates with no loops: {zeros[:5]}")


if __name__ == "__main__":
    main()
