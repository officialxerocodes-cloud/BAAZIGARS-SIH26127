"""Fetch a city drive-network bbox as OSM XML for netconvert (ARCHITECTURE.md §3).

Uses Overpass /api/map directly (proven more robust than osmnx chunked fetch
on flaky links). Tries mirrors in order, validates </osm> tail.
Usage:
  python scripts/fetch_city_osm.py --city delhi --west 77.17 --south 28.57 --east 77.27 --north 28.66
"""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIRRORS = [
    "https://maps.mail.ru/osm/tools/overpass/api/map",
    "https://overpass-api.de/api/map",
]


def download(url: str, out: Path, timeout_s: int = 900) -> bool:
    r = subprocess.run(
        ["curl", "-sS", "-m", str(timeout_s), url, "-o", str(out)],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        print(f"  curl failed ({r.returncode}): {r.stderr.strip()[:200]}", flush=True)
        return False
    return True


def valid_osm(path: Path) -> bool:
    try:
        if path.stat().st_size < 10_000:
            return False
        with open(path, "rb") as f:
            f.seek(-64, 2)
            return b"</osm>" in f.read()
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", required=True)
    ap.add_argument("--west", type=float, required=True)
    ap.add_argument("--south", type=float, required=True)
    ap.add_argument("--east", type=float, required=True)
    ap.add_argument("--north", type=float, required=True)
    args = ap.parse_args()

    out = ROOT / "sim" / "data" / f"{args.city}_bbox.osm.xml"
    out.parent.mkdir(parents=True, exist_ok=True)
    bbox = f"{args.west},{args.south},{args.east},{args.north}"
    print(f"downloading {args.city} bbox {bbox} -> {out}", flush=True)
    for mirror in MIRRORS:
        print(f"trying {mirror} ...", flush=True)
        if download(f"{mirror}?bbox={bbox}", out) and valid_osm(out):
            print(f"saved {out} ({out.stat().st_size/1e6:.1f} MB, valid </osm>)", flush=True)
            return
        print("  invalid or failed, next mirror", flush=True)
    print("ALL MIRRORS FAILED", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
