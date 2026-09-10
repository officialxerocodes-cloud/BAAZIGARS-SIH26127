# Delhi ANPR — City-Wide Trajectory Tracking & Traffic Analytics

> Full architecture: [`ARCHITECTURE.md`](./ARCHITECTURE.md)

## Quick Start
```bash
cp .env.example .env
# verify GPU: docker run --rm --gpus all nvidia/cuda:12.2-base nvidia-smi
docker compose up -d redis timescale
docker compose up -d anpr ingest matcher analytics alerts api frontend
# with simulation (headless, 60×):
docker compose --profile sim up -d sim

# scale workers (live demo)
docker compose up -d --scale matcher=4 --scale ingest=2
```

## Sim (Tier-0, Delhi 10×10)
```bash
# demand is prebuilt: sim/data/delhi_dense.rou.xml (14.4k trips, period 0.25s)
# dry-run (stepping + gt tape only, no HTTP):
PYTHONPATH=. .venv-sumo/bin/python -m sim.runner --dry-run --duration 600 --rate 20
# full chain (crossings → anpr-stub → ingest → workers → DB):
PYTHONPATH=. .venv-sumo/bin/python -m sim.runner --duration 600 --rate 10
# load mode (skip ANPR hop, straight to ingest):
SIM_BYPASS_ANPR=1 PYTHONPATH=. .venv-sumo/bin/python -m sim.runner --duration 600 --rate 20
# sim clock defaults to wall-clock now (dashboard windows stay live);
# fixed AM-peak demo clock: SIM_START_HOUR=9
# regen demand: randomTrips.py -p <period> → duarouter (see sim/data/)
# regen gates: scripts/generate_gates.py --net delhi.net.xml --out delhi_gates.json --n 60 --apply-db
```

## Repo Layout (cwd = `backend/`)
```
ARCHITECTURE.md          # complete architecture — start here
docker-compose.yml       # full stack
.env.example
sql/init.sql             # PG+PostGIS+Timescale schema (cameras, reads hypertable, etc.)
anpr/                    # FastAPI GPU service — YOLO11/fast-alpr + PP-OCR, micro-batch 50ms/32
  Dockerfile
  requirements.txt
sim/                     # libsumo + gates + plate-crop renderer
  data/delhi.net.xml     # netconvert output (generated Day 1)
ingest/                  # POST /ingest/v1/events → Redis Streams
workers/                 # matcher / analytics / alerts (consumer groups, COPY, rollups)
api/                     # REST + WS hub, Redis pub/sub fan-out
frontend/                # React + Vite + MapLibre + deck.gl
sql/
```

## Day-1 Contracts
**Event JSON** (every camera type):
```json
{"camera_id":"CAM_017","ts":"2026-08-26T09:14:32+05:30","plate_raw":"DL 8C AB 1234","canonical":"DL8CAB1234","confidence":0.93,"vehicle_class":"private","crop_b64":"..."}
```
**API:** `GET /vehicles/search`, `GET /vehicles/{p}/trajectory`, `GET /vehicles/{p}/clones`, `GET /analytics/{heatmap,congestion,od,health}`, `POST /blacklist`, `WS /live`, `GET /accuracy/report`.

## Verified Data Sources
- Map: OSM via Overpass `map?bbox` → `netconvert` (Delhi CP–South Ex 10×10km)
- Demand: POI-weighted OD + diurnal curve + Indian mix (calib: Uber Movement Bangalore, TomTom)
- ANPR training: Indian_LPR 16k (4-corner), Roboflow CC-BY, Kaggle 30k
- Real footage: HF `thirdeyelabs/indian-road-dataset` (Delhi NCR night/rain), Kaggle Atal Setu/Odisha dashcam, IEEE DASHCAM DATA, Zeerak GDrive test video

## Engine Decision
- **Primary:** `fast-alpr` (ankandrew, MIT, ONNX, `pip install fast-alpr[onnx-gpu]`) — detector `yolo-v9-t-384-license-plate-end2end`, OCR `cct-xs-v2-global-model`, swappable.
- **Baseline only:** `ultimateALPR-SDK` — fast but non-commercial license + closed blobs, rejected as core.

See `ARCHITECTURE.md` §16 for full analysis and §17 for the 10-day timeline.
