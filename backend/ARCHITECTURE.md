# City-Wide ANPR Trajectory Tracking & Urban Traffic Analytics — Complete Architecture
> Delhi CP–South Ex (10×10 km) · SUMO on Real OSM · Event-Centric · 10-Day Build · 5-Person Team (2 ML/arch, 1 BE, 2 FE)

---

## Table of Contents
1. [Overview & Governing Principles](#1-overview--governing-principles)
2. [System Context Diagram](#2-system-context-diagram)
3. [Map & Road Network — Real OSM](#3-map--road-network--real-osm)
4. [Traffic Simulation — SUMO (Does / Does-Not)](#4-traffic-simulation--sumo-does--does-not)
5. [Demand Generation — Layer 2 (Synthetic, Calibrated)](#5-demand-generation--layer-2-synthetic-calibrated)
6. [Camera Source Abstraction — The Swap Layer](#6-camera-source-abstraction--the-swap-layer)
7. [ANPR Service — ML Pipeline (The Core)](#7-anpr-service--ml-pipeline-the-core)
8. [Ingestion, Streaming & Workers](#8-ingestion-streaming--workers)
9. [Storage — Postgres + PostGIS + TimescaleDB](#9-storage--postgres--postgis--timescaledb)
10. [API & Real-Time Fan-Out](#10-api--real-time-fan-out)
11. [Frontend Dashboard](#11-frontend-dashboard)
12. [Training Flywheel & Accuracy Rig](#12-training-flywheel--accuracy-rig)
13. [Data Sourcing Catalog](#13-data-sourcing-catalog)
14. [Scale, Performance & Load Testing](#14-scale-performance--load-testing)
15. [Deployment — docker-compose Topology](#15-deployment--docker-compose-topology)
16. [Alternative Engines: ultimateALPR vs fast-alpr](#16-alternative-engines-ultimatealpr-vs-fast-alpr)
17. [Team Ownership & 10-Day Timeline](#17-team-ownership--10-day-timeline)
18. [Risks & Fallbacks](#18-risks--fallbacks)
19. [Demo Script (5 Minutes)](#19-demo-script-5-minutes)

---

## 1. Overview & Governing Principles

**Problem:** City authorities have thousands of ANPR/CCTV cameras but process feeds in silos. No cross-camera trajectory, no macro analytics, no real-time alerts. The brief asks for four deliverables on one platform: (a) >90% OCR across degraded conditions, (b) plate → full city trajectory on GIS, (c) traffic analytics (heatmap, OD, congestion), (d) blacklist + anomaly alerts.

**The three principles that drive every decision:**

1. **Events, not video.** Real deployments run ANPR at the edge (camera/NVR) and centralize *events* `{plate, conf, cam, ts}`. Centralizing video is 3 Gbps/1000 cams; centralizing events is ~2 MB/s. The entire backend is built for events.
2. **The contract is the swap.** Every camera — simulated, file, RTSP, future edge box — speaks one contract `POST /ingest/v1/events`. Switching fake→real = one `cameras` table row (`type=file, uri=...`).
3. **One `reads` table drives everything.** Trajectory, OD, congestion, alerts are all aggregations of `reads`. Workers maintain rollups; dashboards never scan raw events live.

---

## 2. System Context Diagram

```
                    ┌── Camera Registry (DB: cameras) ──┐
                    │ id, geo, heading, zone, type, uri  │
                    └──────────────┬─────────────────────┘
                                   │ spawn per camera
┌──────────────────────────────────┴──────────────────────────────────┐
│  Camera Sources                                                     │
│   SimulatedSource  SUMO gates → degraded plate crops                │
│   FileSource       curated Indian clips → ffmpeg → frame-mode ANPR  │
│   RTSPSource       RTSP pull → frame-mode ANPR (dev adapter)        │
│   EdgeSource       remote box POSTs events itself (prod)            │
│   ── ALL speak ──► POST /ingest/v1/events ───────────────────────► │
└───────────────────────────────────────────────────────────────────┘
                                   │
                          ANPR Service (FastAPI, GPU)
                     YOLO11n-pose → rectify → PP-OCRv4 → corrector
                                   │
                          Ingest API (validate, auth, stamp)
                                   │
                          Redis Streams `events:{0..7}`  sharded by hash(camera_id)
                          ┌──────────┼──────────┐
                     Matcher×N  Analytics  Alert
                     (fuzzy,    (rollups,  (blacklist,
                      COPY)     graph, OD) impossible, health)
                          └──────────┼──────────┘
                          Postgres + PostGIS + Timescale
                                   │  Redis pub/sub `ws:broadcast`
                                   ▼
                          API (REST + WS hub)
                                   │
                          React + MapLibre + deck.gl + Tailwind
```

---

## 3. Map & Road Network — Real OSM

**Purpose:** The single source of truth for both simulation physics and dashboard display. Trajectories land exactly on roads because both derive from the same geometry.

**Acquisition (0.5 day including cleaning):**
- **Used (Delhi 10×10):** Overpass `/api/map?bbox=77.17,28.57,77.27,28.66` via curl (mirrors: mail.ru → overpass-api.de), saved as `sim/data/delhi_bbox.osm.xml` (~70 MB). Proved more robust than osmnx chunked fetch on flaky links. `scripts/fetch_city_osm.py --city/--bbox` re-runs it for any city.
- **Option B:** Geofabrik `india-latest.osm.pbf` + `osmium extract -b 77.17,28.57,77.27,28.66` → `netconvert --osm-files delhi.osm -o delhi.net.xml`.

**What `netconvert` produces (`delhi.net.xml`):** Lanes per road, junctions, traffic lights, one-ways, turn restrictions, speed limits, right-of-way. Cleaning: `--geometry.remove --junctions.join --tls.guess-signals --keep-edges.by-vclass passenger --remove-edges.isolated`. Result: 11,955 nodes / 30,510 edges / 75 signals over ~13×12 km.

**Free bonuses from the same extract:**
- Signalized junctions + arterial entries → ~60 virtual ANPR gates with real lat/lng → `cameras` table (`scripts/generate_gates.py --net/--out/--n`).
- POIs/landuse → trip-generation weights (see §5).
- OSM vector/raster tiles → MapLibre/Leaflet backdrop.

**Why Delhi CP–South Ex:** National-capital recognition with judges, iconic corridor (Connaught Place, Janpath, India Gate, Lodi Road, South Ex), dense believable 10×10 km zone, excellent OSM quality, and the real-footage dataset (Delhi NCR day/night/rain) becomes native instead of borrowed.

---

## 4. Traffic Simulation — SUMO (Does / Does-Not)

SUMO is a **traffic physics engine, nothing more** — the "game engine" that moves vehicles. Everything camera/plate/event-shaped is ours.

**How it runs:** Embedded via `libsumo` (headless Python library, no GUI) inside the `sim` service. Loads `delhi.net.xml` (`NET_FILE` env) + route files, steps at 1s sim-time, runs 30–60× wall clock, deterministic by seed (rehearsed demos). Each step:

```python
traci.simulationStep()                  # advance sim clock 1s @60×
for veh in gates.new_crossings():       # vehicles crossing a gate this step
    emit CrossingEvent(veh_id, gate, sim_time, speed)
fcd.record()                            # ground-truth tape (all positions)
```

**Fallback:** Pre-generate FCD once (`--fcd-output`) and replay as the event feed — downstream can't tell.

| SUMO DOES | SUMO DOES NOT (we build) |
|---|---|
| Import OSM → routable net | Render any image |
| Car-following (Krauss), lane-change, junction, signals → congestion *emerges* | Assign plates (`plate=hash(veh_id)` deterministic, same at every cam) |
| Route vehicles (duarouter) | Know what an ANPR camera is (we define induction-loop gates + listeners) |
| Run clock, support 30-60× headless | Create realistic city demand (we generate POI-weighted routes, see §5) |
| Report FCD + gate triggers, deterministic | Model weather/night (degradation engine), emit events, do analytics/matching |

---

## 5. Demand Generation — Layer 2 (Synthetic, Calibrated)

No Indian city publishes OD matrices — that's the silo problem the brief attacks. We synthesize demand with structure, then calibrate it.

- **POI-weighted OD:** From OSM POIs (offices CP/Barakhamba, colleges Hindu/Miranda/Hansraj, hospitals AIIMS/Safdarjung, malls Select Citywalk/DLF Avenue, residential South Ex/Lajpat Nagar, transit hubs New Delhi Railway Station/Rajiv Chowk Metro). Each class has a generation/attraction weight → sample origin/dest edges → routes via `duarouter`.
- **Diurnal curve:** Departures sampled from: AM 8:30–11 sharp peak, flat midday, PM 17:00–21:30 peak, quiet night. This is what makes heatmap/congestion breathe; rush hour *emerges* from data.
- **Indian vehicle mix:** ~50–55% 2W, 25–30% car, ~10% auto, ~4% bus, rest taxi/goods. Plate color (white private / yellow commercial / green EV) per class.
- **Scenarios:** `am_peak`, `midday`, `pm_peak`, `night`, `demo_accelerated`. Dirunal scaling factors seeded from Uber Movement Delhi archive (see §13).
- **Tier-0 fallback:** `randomTrips.py --fringe-factor` weighted by lane count — moving traffic in 30 min, upgrade to POI-weighted later.

---

## 6. Camera Source Abstraction — The Swap Layer

**Registry `cameras(id, geo, heading, zone, type, uri, edge_token, status)`:**
```python
class CameraSource(ABC):
    async def events(self) -> AsyncIterator[EdgeEvent]: ...

class SimulatedSource(CameraSource):  # SUMO gates
class FileSource(CameraSource):       # curated clips via ffmpeg
class RTSPSource(CameraSource):       # RTSP pull → frame-mode ANPR
class EdgeSource(CameraSource):       # remote box POSTs itself
```

**Unified contract (all four speak this):**
```json
{
  "camera_id": "CAM_017",
  "ts": "2026-08-26T09:14:32+05:30",
  "plate_raw": "DL 8C AB 1234",
  "canonical": "DL8CAB1234",
  "confidence": 0.93,
  "vehicle_class": "private",
  "crop_b64": "...",
  "ground_truth": "DL8CAB1234"
}
```

**Type 1 — Event cameras (~30, owns trajectories/analytics/alerts):**
Gate crossing → degraded plate **crop** (Pillow: motion blur ∝ speed, tilt ±30° homography, scale 20–80px, night gamma+glare, rain streaks, grime, JPEG q40–70) pasted on varied car-rear background → real OCR → event. ~15–18% injected misses force genuine reconstruction. Deterministic plate per `veh_id`.

**Type 2 — Real-footage cameras (3–6, owns real-video proof + hero MJPEG tiles):**
Curated Indian clips (see §13) → `ffmpeg` decode → frame-mode ANPR (YOLO multi-plate → ByteTrack → per-char majority vote → one event/vehicle). Pre-process once at GPU speed, cache events+annotated frames, replay events on sim clock, serve loop at `/streams/CAM_50.mjpeg` (5–8 fps). Registered at city-boundary/mobile-patrol positions (pass-through realism: single-read vehicles = outside traffic). Future `RTSP` = same path; only pixel source changes.

---

## 7. ANPR Service — ML Pipeline (The Core)

```
input image (car-rear frame or crop, 320-640px)
  → [0] Pre (resize/denoise)
  → [1] DETECT  YOLO11n-pose (box + 4 corners, fine-tuned)
  → [2] RECTIFY  warp via corners → 128×32 flat crop
  → [3] READ  PP-OCRv4 recognizer (SVTR, charset 0-9A-Z, fine-tuned)
  → [4] CORRECT  grammar + confusable fix + calibrated conf
  → {plate, confidence, box, corners}
```

**[1] Detection — YOLO11n-pose:** Single pass 640px, outputs box + 4 corner keypoints for rectification. Fine-tuned on ~5–10k: synthetic car-rear frames + real Indian_LPR 16k (4-corner labels) + Roboflow sets. Plate color → `vehicle_class` free. ~2–5 ms batched.

**[2] Rectification:** `cv2.getPerspectiveTransform(corners)` → frontal crop. The accuracy multiplier for angled shots; fallback to axis-aligned bbox if low-confidence corners.

**[3] Recognition — PP-OCRv4 rec, fine-tuned:** CTC-decoded, charset pruned to `0-9A-Z`. Trained on 50–100k synthetic degraded plates (same renderer as §6) stratified across conditions. Per-char confidence. Fallback: `fast-plate-ocr` (`ankandrew/fast-plate-ocr`) or HyperLPR3.

**[4] Corrector — Indian plate brain (code, no model):**
- Grammar: ` [A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}` / BH `22BH0001AA`.
- Position-aware confusables (only when char conf low): `0↔O, 1↔I, 8↔B, 2↔Z, 5↔S` gated by position (state letters vs digits).
- Sequence conf = product floored at min char; temperature-scaled so 0.90 ≈ 90% correct.

**Frame-mode (real video):** YOLO → ByteTrack (IoU) → per-track best-N crops → char-majority vote → one event when track ends. Per-frame 60–80% but per-vehicle 95%+.

**Serving:** FastAPI, async bounded queue (2048), micro-batcher 50ms / batch≤32. YOLO batch ~100–150ms, OCR batch ~80–120ms → **300–500 plates/sec/GPU**. ONNX export optional Day 7. `/metrics` (plates/sec, p50/p99, batch-fill, live acc vs GT). Backpressure 503 + oldest-drop.

---

## 8. Ingestion, Streaming & Workers

```
Edge/Sim/File → POST /ingest/v1/events → Ingest API ──► Redis Streams `events:raw:{0..7}`
              (validate, auth edge_token, stamp)          (sharded by hash(camera_id))
                                                    ┌────┼────┐
                                              Matcher×N Analytics Alert
```

- **Ingest API:** Stateless, behind nginx, horizontal (`--scale ingest=2`). Bounded stream `XTRIM`.
- **Matcher worker (×1–4, Redis consumer groups):** Canonicalize (strip spaces/dots), fuzzy edit≤1 vs plates seen ≤10min (Redis keyed by prefix), enrich geo, blacklist pre-check, **batched COPY 500–1000 → `reads`**. Preserves per-cam order per shard.
- **Analytics worker:** 1-min camera rollups, travel-time graph `camera_pairs` (per pair Welford/exponential medians), OD matrix (`first_cam→last_cam` per vehicle per window), congestion = live median vs baseline (quiet-hours), flush 2–5s. Rollups are the only thing dashboards read.
- **Alert worker:** Blacklist exact+fuzzy, impossible travel `Δt < road_dist/v_max` (road dist from precomputed `camera_pairs.dist`), clone split, camera health (read-rate vs rolling baseline), route anomaly (Markov transition prob). Publishes to `ws:broadcast`.
- **Two rules:** (1) One `reads` hypertable is source of truth; all features are rollups. (2) Hot stats in worker memory, flushed periodically.

---

## 9. Storage — Postgres + PostGIS + TimescaleDB

Image `timescale/timescaledb-ha` (PG16 + PostGIS + Timescale).

| Table | Purpose | Key |
|---|---|---|
| `cameras(id, name, edge_id, geom, heading, zone, type, uri)` | Registry + PostGIS geo | PK id |
| `reads(read_id, camera_id, ts, raw_plate, canonical, conf, crop_path, gt_plate, vehicle_class)` | Hypertable, hourly chunks, BRIN(ts), btree(canonical,ts), btree(camera_id,ts) | Batched COPY |
| `vehicles(canonical, first_seen, last_seen, read_count, flags)` | Fuzzy-merged identity (majority vote) | |
| `blacklist(plate, reason, added_at)` | CRUD via API | |
| `alerts(id, type, canonical, payload, created_at, ack)` | All alert kinds | |
| `camera_pairs(from_cam, to_cam, road_dist_m, samples, median_tt, p90_tt)` | Travel-time graph (small, hot) | Updated in-mem |
| `od_stats(window_start, from_cam, to_cam, count)` | OD arcs | |
| `health_stats(camera_id, window_start, expected, observed, status)` | Camera health | |
| `gt_crossings(crossing_id, veh_id, gate, sim_ts, gt_plate)` | Sim truth → metrics: trajectory recall, accuracy | Sim-only |

Road distances precomputed at startup via `networkx` on OSM or `traci.simulation.findRoute`.

---

## 10. API & Real-Time Fan-Out

**REST (all hit rollups/indexed reads):**
```
GET  /api/vehicles/search?q=DL8C&fuzzy=1
GET  /api/vehicles/{canonical}/trajectory?from=&to=  → ordered reads + gaps + speeds
GET  /api/vehicles/{canonical}/clones               → split tracks (if clone)
GET  /api/analytics/heatmap?bucket=5m
GET  /api/analytics/congestion
GET  /api/analytics/od?window=30m
GET  /api/analytics/cameras/health
POST /api/blacklist {plate, reason}
GET  /api/accuracy/report
GET  /streams/{cam}.mjpeg
```

**WS `/live` — server-aggregated, viewport-scoped, bounded:**
```json
// client → server
{"sub": {"viewport": [bbox], "layers": ["cams","ticker","alerts"], "camera": "CAM_017"}}
// server → client
{"t":"tick","cams":[{"id":"CAM_017","n":23,"status":"ok"}]} // 2s, viewport-only
{"t":"ev","cam":"CAM_017","plate":"DL8CAB1234","conf":0.93,"crop":"/crops/x.jpg"} // ≤5/s sampled, label "2% of live traffic"
{"t":"alert","kind":"clone|blacklist|impossible|health|anomaly", ...} // always full fidelity
```
Broadcast via Redis pub/sub `ws:broadcast`; API instances fan out to sockets (multiple API replicas safe).

**Latency budget:** crossing→ingest <50ms, ingest→persisted <500ms, alert on screen <2s p99.

---

## 11. Frontend Dashboard

**Stack:** React + Vite + TypeScript + Tailwind + MapLibre GL + deck.gl + Recharts. Nginx serves build; WS for live.

**Screens:**
1. **Live Ops:** Map heatmap (Leaflet.heat / deck.gl HeatmapLayer) + camera pins (ScatterLayer, 1000+ fine) + congestion edges (colored by `camera_pairs`) + OD arcs (deck.gl ArcLayer) + alert toasts + sampled event ticker.
2. **Investigate:** Fuzzy search → trajectory replay (animated polyline on road network, play/pause/scrub/speed, inferred dashed gaps) + crop gallery + per-hop speed + **Clone Split View** (side-by-side tracks).
3. **Alerts Inbox:** Filter by type, ack, jump-to-vehicle.
4. **Network/Analytics:** OD matrix heatmap grid, corridor ranking, peak-hour curves, camera health table.
5. **Accuracy Report:** Per-condition confusion matrix + real-holdout (static JSON from rig).
6. **Admin:** Blacklist management.

**At scale:** Zero per-point DOM nodes; WebGL handles 10k+ points; ticker sampled with authenticity label; alert channel never sampled; all heavy queries pre-aggregated.

---

## 12. Training Flywheel & Accuracy Rig

```
renderer (Pillow, see §6 crop path) → 80k train / 10k val (stratified by condition)
real images (Indian_LPR, Roboflow, Kaggle 30k) → 3k mix-in + 500 HELD-OUT REAL (never trained)
        ↓
  fine-tune recognizer (charset pruned, CTC) [+ detector fine-tune if needed]
        ↓
  EVAL RIG (nightly, automated):
    per-condition exact-match (full-plate = correct) ← the >90% claim, averaged
    per-char accuracy + confusion matrix
    held-out real-image accuracy ← credibility number
    throughput/latency bench
        ↓
  JSON → dashboard Accuracy page + judge slide
```

**Metric:** Exact-match is harshest/honest (one char wrong = wrong). Report alongside per-char. Example slide: clean 97%, blur 93%, night 88%, rain+grime 86%, angled 92% → avg 91.2% + real-holdout 90.5%.

The renderer + GT table also yields: **"Recovered 94% of ground-truth trajectories despite 18% missed reads."**

---

## 13. Data Sourcing Catalog

| Need | Source (all verified downloadable today) | Use |
|---|---|---|
| **Map + gates** | OSM via `osmnx`/Geofabrik → `netconvert` | Sim net + camera lat/lngs + dashboard tiles |
| **Demand realism** | POI weights + diurnal curve + Indian mix; calib: Uber Movement Delhi archive (hourly factors), TomTom Delhi index, Delhi open-data portal, Google 5-corridor spot-check (Ring Road, Aurobindo Marg, Lodhi Rd, Barakhamba, Janpath) | Rush-hour emergence |
| **ANPR training** | Indian_LPR `sanchit2843` (16,192 imgs, 21,683 plates, 4-corner) + Roboflow `license-plates-f8vsn` (CC-BY) + Kaggle 30k (filenames=labels) + synthetic 18k | Detector+recognizer fine-tune + holdout |
| **Real-footage cameras (3-6)** | `mansayy/indian-road-dataset` Atal Setu 4 videos (~1GB) — highway; `abhishek11kr/test-dashcam-video` Odisha 1.22GB AVI — patrol; IEEE DataPort DASHCAM DATA 4.43GB MOV — all-weather; Zeerak Khan GDrive test_video — test cam; **HF `thirdeyelabs/indian-road-dataset` Delhi NCR 646K frames day/night/rain** — night/rain accuracy frames | Boundary/mobile cameras + night/rain validation |

**License slide:** Pexels/Pixabay free commercial, datasets research use, YouTube/GDrive demo-only.

---

## 14. Scale, Performance & Load Testing

| Concern | Capacity |
|---|---|
| Sim gates | 1000+ induction loops ~free; cost scales with vehicles, not gates |
| Crop rendering | Pillow pool 4 procs → 500–1000/sec; cache pools for load mode |
| OCR | GPU micro-batch → 300–500/sec/GPU; demo 300/sec wall clock headroom |
| Ingest | Stateless FastAPI, sharded Redis Streams → 10k+ msgs/sec |
| DB | Batched COPY 500–1000 → few statements/sec, Timescale hourly chunks |
| WS | Aggregated ≤50 msgs/sec/client |

**Two modes (explicit):**
- **Demo:** 40 cams, full fidelity, 60× → ~300 events/sec wall clock, full pipeline.
- **Load:** 1000+ gates at 5× + **replay-gun** (CLI re-emits recorded events at 10–50×) → deliverable chart: sustained events/sec, p99 latency, worker count.

**Horizontal proof:** `docker compose up --scale matcher=4 --scale ingest=2` (consumer groups) + `docker stats` on screen.

---

## 15. Deployment — docker-compose Topology

| Service | Replicas | Notes |
|---|---|---|
| `sim` | 1 | libsumo + gates + plate-crop renderer |
| `anpr` | 1 | GPU `gpus: all`, micro-batcher, `/metrics` |
| `ingest` | 1–2 | stateless, nginx |
| `matcher` / `analytics` / `alerts` | 1–4 | consumer groups |
| `redis` | 1 | streams + pub/sub + matcher state |
| `timescale` | 1 | `timescale/timescaledb-ha` PG16+PostGIS |
| `api` | 1 | REST + WS hub |
| `frontend` | 1 | nginx React build |
| `replay-gun` | CLI | load testing |

Network `anpr-net`. Volumes: `pgdata`, `redisdata`, `crops`. GPU runtime: NVIDIA Container Toolkit; verify Day 1.

---

## 16. Alternative Engines: ultimateALPR vs fast-alpr

**`ultimateALPR-SDK` (Doubango, 742★) — REJECTED as core:**
- Fast (237 fps Xeon CPU, 315 fps V100) but LICENSE is `For non commercial use only ©2011-2021` — conflicts with enterprise pitch.
- Closed binary blobs (no fine-tune → cannot own >90% Indian claim), dormant (tested on Python 3.6/3.7, build via C++ extension), US/EU plate bias (IEEE dataset paper notes standard pipelines fail on hand-painted Indian plates). Trial-mode without token (unspecified limits).
- **Use at most as baseline row in rig** (0.5-day spike, abort if build >3h).

**`fast-alpr` (ankandrew, 788★, MIT, 121 commits, active CI) — RECOMMENDED as core engine:**
- `pip install fast-alpr[onnx]` / `[onnx-gpu]`/`[onnx-openvino]`; 5-line API:
  ```python
  from fast_alpr import ALPR
  alpr = ALPR(detector_model="yolo-v9-t-384-license-plate-end2end", ocr_model="cct-xs-v2-global-model")
  alpr.predict("image.jpg")        # or .draw_predictions(frame)
  ```
- Defaults: YOLOv9 detector via `open-image-models` + OCR via `fast-plate-ocr` (same author), both ONNX, swappable via `BaseOCR` (Tesseract example in README). HuggingFace Space demo exists.
- MIT, active 2025-26, modern Python tooling (uv/ruff/mypy) — no C++ build.
- The "reuse, don't rebuild" instinct made safe: open ONNX weights → fine-tune/replace path stays open for Indian plates; accuracy rig owns the >90% claim. Adopt as ANPR engine Day 1, fallback to fine-tuned PaddleOCR behind same interface if needed.

---

## 17. Team Ownership & 10-Day Timeline

| Person | Owns | Key Deliverables |
|---|---|---|
| **ML-1** | ANPR engine | fast-alpr integration (or YOLO+PaddleOCR), Indian fine-tune, corrector, eval rig + accuracy page data |
| **ML-2** | Sim + intelligence | SUMO Delhi net, gates, crop renderer, travel-time graph, impossible-travel/clone forensics |
| **BE** | Platform spine | PG/PostGIS schema, Redis streams, ingest/matcher/analytics workers, FastAPI REST+WS, compose, load test, MJPEG endpoints |
| **FE-1** | Live Ops map | Heatmap, camera pins+detail, congestion edges, OD arcs, toasts, ticker |
| **FE-2** | Investigate+evidence | Search, animated replay (play/pause/scrub), crop gallery, clone split, alerts inbox, accuracy page, blacklist admin |

| Days | Milestone |
|---|---|
| **1** | Repo+compose skeleton, Delhi OSM → `delhi.net.xml` → vehicles moving, DB schema v1, GPU-in-docker verified, footage download started + Day-1 acceptance test (`run YOLO over clips, count reads/min`) |
| **2** | 60 gates emitting, crop renderer v1 + full degradation set, ANPR baseline reads clean crops end-to-end (fast-alpr) |
| **3** | Redis pipeline live, OCR fine-tune data 80k generated overnight, footage cut to 2-3 min segments per camera |
| **4** | Fuzzy matcher + trajectory API + travel-time graph; map with live pins |
| **5** | Trajectory replay UI + heatmap + blacklist alerts |
| **6** | Impossible-travel + clone split view + congestion edges + OD arcs |
| **7** | Analytics page + camera health + accuracy rig final numbers + all real-footage cameras ingested |
| **8** | Demo seeds (clone pair same plate opposite routes, blacklist target), 10× load test, MJPEG polish, time-travel scrub if time |
| **9** | Dry-run demo script + recorded fallback video + pitch deck |
| **10** | Buffer |

**Day-1 contracts (so 5 work in parallel):** Event JSON (§6) + API surface (`/vehicles/search`, `/vehicles/{p}/trajectory`, `/vehicles/{p}/clones`, `/analytics/{heatmap,congestion,od,health}`, `/blacklist`, `WS /live`, `/accuracy/report`) + DB tables (§9).

---

## 18. Risks & Fallbacks

| Risk | Fallback |
|---|---|
| SUMO/OSM import messy (Delhi) | Shrink bbox; worst case FCD replay as live feed (downstream can't tell) |
| PaddleOCR/fast-plate-ocr fine-tune fight | HyperLPR3 drop-in; fine-tune is upside not dependency |
| WS flakiness | 2s polling fallback |
| Footage sourcing thin on night/rain tiles | Night/rain story lives in accuracy rig (real frames), not tiles; tiles prove pipeline |
| GPU in Docker | Verify Day 1; CPU fallback (YOLO11n + small OCR) still viable at lower throughput |
| SIH judge license question | MIT stack (fast-alpr) keeps commercial story clean |

---

## 19. Demo Script (5 Minutes)

1. **Live city breathing (30s):** Delhi heatmap (CP–South Ex) + congestion edges pulsing as sim runs at 60×.
2. **Trajectory replay (60s):** Type any plate → animated polyline + timestamps + crops + inter-cam speed.
3. **Blacklist live (45s):** Add plate on stage → 30s later alert fires (pre-seeded vehicle).
4. **Clone forensics (60s):** Impossible-travel alert → split view of same plate on opposite routes.
5. **Macro analytics (30s):** OD arcs + peak-hour curve + corridor ranking.
6. **Measured accuracy (45s):** Per-condition matrix + real Delhi NCR night/rain holdout (>90% avg).
7. **Scale (30s):** Replay-gun chart + architecture diagram + MJPEG hero tiles with annotated real footage.

---

*Generated for SIH 2026 — Team of 5 — Delhi city instance (CP–South Ex 10×10 km; 25×25 full-city via filtered highway query as stretch). Event contract is the enterprise swap point: when the city plugs real ANPR feeds, nothing downstream changes.*
