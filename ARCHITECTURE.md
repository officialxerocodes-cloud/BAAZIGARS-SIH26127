# TRINETRA — System Architecture (BAAZIGARS · SIH26127)

> Companion to `README.md`. Plain-words guide to how the system is put together.
> Code and demo screenshots will be added to this repository next.

---

## 1. The big picture

```
 Real / simulated cameras
 (Delhi CP–South Ex, ~60 gates)
        │   tiny text events: { plate, camera, time, confidence }
        │   (no video ever leaves the camera)
        ▼
 ┌──────────────┐   ┌────────────────────────────────────────┐
 │ ANPR service │──▶│ Ingest API  →  Redis Streams (8 shards) │
 │ reads plates │   └──────────────┬─────────────────────────┘
 └──────────────┘                  │ fan-out to 3 workers
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
         Matcher              Analytics              Alerts
    (who is this car?)  (how is traffic?)    (anything wrong?)
              └────────────────────┼────────────────────┘
                                   ▼
                  Postgres + PostGIS + TimescaleDB
                  (one `reads` table drives everything)
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
             REST + WebSocket API        React dashboard
             (search, trajectory,        (live map, ticker,
              analytics, alerts)          investigate, admin)
```

## 2. Three principles behind every decision

1. **Events, not video.** A thousand cameras streaming video is gigabits per second;
   a thousand cameras sending text sightings is megabytes. The whole backend is built
   for events.
2. **One contract, any camera.** Simulated gates, video files, RTSP feeds, real edge
   boxes — all speak the same `POST /ingest/v1/events`. Swapping fake traffic for a
   real city feed changes one configuration row, nothing downstream.
3. **One table drives everything.** Every sighting lands in `reads`. Trajectories,
   heatmaps, congestion, OD flows and alerts are all aggregations of it — dashboards
   read pre-computed rollups, never raw events.

## 3. Components (what each part does)

| Part | Job, in one line |
|---|---|
| Traffic simulation (SUMO) | A practice copy of Delhi on real road-map data; moves thousands of virtual cars through signals and rush hours so we can test without closing real roads |
| ANPR service | Reads the number plate from each sighting (deterministic stub today; trained OCR engine plugs into the same contract later) |
| Ingest API | Validates, timestamps and queues every event; first step of the <2 s camera-to-screen budget |
| Matcher worker | Merges misread plates into one vehicle identity (fuzzy matching); writes the `reads` table |
| Analytics worker | Counts everything up every few seconds: per-camera volumes, travel times, OD flows, camera health |
| Alerts worker | Wanted-plate hits and impossible-travel/clone detection (same plate, two far cameras, too fast = physics says fake) |
| API | Search, trajectory, analytics, blacklist and alert endpoints (REST) + live push channel (WebSocket) |
| Dashboard | Live map with pins and heat, alert ticker and inbox, plate/zone/time investigation, analytics page, blacklist admin |

## 4. A plate's journey (example)

1. Car `DL51AB1234` crosses the Lodi Road gate at 9:14 AM → camera sends
   `{plate, camera CAM_017, time, 93% sure}`.
2. Ingest queues it; matcher files it under that vehicle's identity
   (a later smudged read of the same plate merges automatically).
3. Analytics adds +1 to the camera's minute count and the corridor's travel-time stats.
4. The plate is on the wanted list → a Critical alert reaches the dashboard inbox
   within seconds; acknowledging it clears the feed.
5. An operator types the plate → its full route draws on the map with per-hop times.

## 5. Data & storage (short version)

- `reads` — every sighting, time-ordered (the source of truth).
- `vehicles` — one row per real vehicle (fuzzy-merged identity).
- Rollups (`camera_rollups`, `camera_pairs`, `od_stats`, `health_stats`) — what dashboards read.
- `blacklist`, `alerts`, `gt_crossings` — wanted list, all alert kinds, simulation ground truth for scoring.

## 6. Tech stack

See `README.md` §5 — React + MapLibre frontend; Python microservices; Redis Streams;
PostgreSQL/TimescaleDB/PostGIS; SUMO on OpenStreetMap data; Podman Compose deployment.

## 7. Repository layout (as code lands)

```
backend/    event pipeline, workers, simulation, schema, compose stack
frontend/   React dashboard (works fully offline on demo data via VITE_DEMO_MODE)
screenshots/ demo captures (added next)
```

*Team BAAZIGARS · SIH 2026 · Delhi CP–South Ex city instance.*
