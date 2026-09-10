# WS /live — protocol (ARCHITECTURE.md §10)

**Endpoint:** `ws://localhost:8002/live` (or `ws://api:8002/live` inside compose)

**Client → server (first message, optional, JSON):**
```json
{"sub": {"viewport": [77.17, 28.57, 77.27, 28.66], "layers": ["cams","ticker","alerts"], "camera": "CAM_017"}}
```
- `viewport`: [minLon, minLat, maxLon, maxLat] — server filters ticks to viewport
- `layers`: which streams you want
- `camera`: if set, only events for that camera

If no sub message is sent, server sends all.

**Server → client:**

Tick (2s, viewport-filtered):
```json
{"t":"tick","cams":[{"id":"CAM_017","n":23,"status":"ok"}]}
```

Event (sampled ≤5/s, labeled "2% of live traffic" in UI):
```json
{"t":"ev","cam":"CAM_017","plate":"DL8CAB1234","conf":0.93,"ts":"2026-09-06T09:12:00+05:30"}
```

Alert (never sampled, full fidelity):
```json
{"t":"alert","kind":"blacklist|impossible|clone|health|anomaly","plate":"DL8CAB1234","cam":"CAM_017","payload":{}}
```

Transport: Redis pub/sub `ws:broadcast` — API replicas fan out to WS clients (compose `api` scales safely).

Polling fallback: if WS fails, `GET /api/analytics/heatmap` + `GET /api/alerts` every 2s.
