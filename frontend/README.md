# TRINETRA — National Vehicle Intelligence & Surveillance (frontend)

React + Vite + Tailwind + GSAP command-center dashboard for the smart-city
ANPR / trajectory-surveillance system. Talks to the FastAPI backend (the
`backend` branch of this repo).

## Brand & experience

- Light-theme "daylight command center" (navy + signal green) — no generic
  dark AI look.
- Full-screen **TRINETRA splash intro** on first load (GSAP timeline,
  click to skip).
- Animated live-map hero: OSM tile + SVG route network with vehicles flowing
  along roads, pulsing camera markers, and a heatmap layer.
- GSAP ScrollTrigger reveals throughout; KPI numbers count up on scroll.
- Live alert marquee + critical-alert panel driven by the backend.

## Running frontend + backend together

The backend API runs on `http://localhost:8002` (FastAPI service in
`docker-compose.yml`, or `uvicorn api.app:app --port 8002`).

```bash
npm install
npm run dev          # Vite on http://localhost:5173
```

The Vite dev server proxies `/api` and `/live` (WebSocket) to
`localhost:8002`, so the dashboard is same-origin and no CORS config is
needed in dev.

### Direct / cross-origin mode

If the frontend is served from elsewhere (e.g. a static build or another
port), point it at the API directly; the backend then permits the origin:

```bash
# frontend/.env
VITE_API_BASE_URL=http://localhost:8002
```

Backend CORS defaults (see `api/app.py`): `http://localhost:5173`,
`http://localhost:3000`, `http://localhost:8002` + `127.0.0.1` equivalents.
Override with `CORS_ORIGINS` on the API service.

## Home page (current)

| Panel            | Backend endpoint                                  |
| ---------------- | ------------------------------------------------- |
| Splash intro     | —                                                 |
| Hero stat chips  | `GET /api/analytics/cameras/health`, `GET /api/accuracy/report` |
| KPI cards        | `GET /api/alerts`, health, accuracy report (+ `FeedBadge` live/stale/offline) |
| Live ticker      | `GET /api/alerts` (polled every 15s) + WS `/live` alert push (narrow scope, polling stays authoritative) |
| Critical alerts  | `GET /api/alerts` (Critical severity only) + `POST /api/alerts/{id}/ack` |
| Density + OD     | `GET /api/analytics/heatmap`, `/congestion`, `/analytics/od?window=` (window follows range tabs) |
| Blacklist admin  | `GET/POST /api/blacklist`, `DELETE /api/blacklist/{plate}` |

Every panel falls back to `src/data/mockData.js` when the API is
unreachable, so the UI still renders during local backend outages.
`feedState()` (`src/api/adapters.js`) gates every fallback: a reachable
backend with empty tables renders honest empty states — fixtures appear
only with an "Offline · demo data" badge.

## Trajectory page (live)

All three modes query the backend and render live traces:

| Step | Backend endpoint |
| ---- | ---------------- |
| Resolve plate | `GET /api/vehicles/search?q=&fuzzy=1` |
| Reads | `GET /api/vehicles/{plate}/trajectory` (joined with camera geometry, incl. `crop_url`) |
| Clone flags | `GET /api/vehicles/{plate}/clones` (`clone` = physics-proven, `impossible` = heuristic) |
| Camera pins | `GET /api/cameras` |
| Area sweep | `GET /api/sweeps/zone?lat=&lng=&radius_km=` (zone anchor from registry, most-observed plate traced) |
| Time sweep | `GET /api/sweeps/window` (grid summary, top mover traced) |
| Sweep ranking | client-side grouping (top 8, "Plates in Scope" panel, click-to-trace with no refetch) |

Live results are labeled "Live trace" with a sweep-scope insight card.
Camera IDs are normalized (`CAM 001` ↔ `CAM_001`) in `src/api/adapters.js`
before joins. The deterministic mock engine (`src/data/trajectory.js`) is
now only the boot fallback when the backend is unreachable.

> Note: Trajectory Search and the board Alerts pages are
> next — the `Track`, `Trajectory`, and `AlertFeed` components
> remain in the repo for those pages.