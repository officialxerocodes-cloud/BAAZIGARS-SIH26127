"""Generate static FE fixtures (ARCHITECTURE.md Day-2 handoff).
Plates/cams should match the current city instance (Delhi DL plates, CAM_001..060).
Usage: python scripts/gen_fixtures.py
"""
import datetime
import json
import random
from pathlib import Path

random.seed(42)
ROOT = Path(__file__).resolve().parent.parent
FIX = ROOT / "fixtures"
FIX.mkdir(exist_ok=True)

PLATES = ["DL8CAB1234", "DL1CCD5678", "DL10EF9999"]
CAMS = [f"CAM_{i:03d}" for i in range(1, 11)]
BASE = datetime.datetime(2026, 9, 6, 9, 0, 0, tzinfo=datetime.timezone.utc)

events = []
for i in range(30):
    cam = random.choice(CAMS)
    plate = random.choice(PLATES)
    ts = BASE + datetime.timedelta(minutes=i * 2)
    events.append({
        "camera_id": cam, "ts": ts.isoformat(),
        "plate_raw": plate, "canonical": plate,
        "confidence": round(random.uniform(0.85, 0.97), 3),
        "vehicle_class": "private", "ground_truth": plate,
    })
(FIX / "events.jsonl").write_text("\n".join(json.dumps(e) for e in events))

traj = [e for e in events if e["canonical"] == PLATES[0]]
(FIX / "trajectory_DL8CAB1234.json").write_text(json.dumps(traj, indent=2))

from collections import Counter
cnt = Counter((e["camera_id"], e["ts"][:16]) for e in events)
heatmap = [{"camera_id": k[0], "window_start": k[1], "count": v} for k, v in cnt.items()]
(FIX / "heatmap.json").write_text(json.dumps(heatmap, indent=2))

(FIX / "search_DL8C.json").write_text(json.dumps(
    [{"canonical": PLATES[0], "first_seen": traj[0]["ts"],
      "last_seen": traj[-1]["ts"], "read_count": len(traj)}], indent=2))

# drop superseded Pune-era fixtures
for stale in ["search_MH12.json", "trajectory_MH12AB1234.json"]:
    p = FIX / stale
    if p.exists():
        p.unlink()
        print(f"removed stale {stale}")

print(f"fixtures written: {len(events)} events, {len(traj)} in trajectory, {len(heatmap)} heatmap buckets")
