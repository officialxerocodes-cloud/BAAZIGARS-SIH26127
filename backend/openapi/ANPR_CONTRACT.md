# ANPR Service Contract (ARCHITECTURE.md §6–§7)

**Status:** implemented by `anpr_stub` (:8001). The real engine (fast-alpr service,
ML-1) MUST implement this exact surface so sim/file sources swap with no
downstream change (`ANPR_URL` env / compose profiles `anpr-stub` ↔ `anpr`).

## Endpoint

`POST /v1/recognize` (alias `POST /predict` accepted)

Request (JSON):
```json
{
  "crop_b64": "<base64 jpeg, optional in sim path>",
  "gt_plate": "DL8CAB1234",
  "camera_id": "CAM_017",
  "ts": "2026-09-06T09:14:32+05:30",
  "image_b64": "<full frame, file-camera path only>"
}
```
- `gt_plate`: sim-only ground truth. The stub uses it to synthesize output;
  the real engine MUST accept-and-ignore it (used for the accuracy rig).
- `crop_b64`: present once the sim crop renderer lands (deferred); absent in
  current Tier-0 runs. The real engine MUST work crop-first, GT-absent.

Response 200 (JSON):
```json
{"plate": "DL8CAB1234", "canonical": "DL8CAB1234", "confidence": 0.93, "box": null}
```
- `canonical`: charset `0-9A-Z`, grammar-corrected (corrector is engine-side).
- `confidence`: calibrated (0.90 ≈ 90% exact-match).

Response **204 No Content**: modeled miss (stub: 8%). Callers MUST treat 204
as "no event" and drop the crossing — never synthesize a plate.

`GET /healthz` → `{"status":"ok"}` (required: compose healthcheck + sim gate).

## Throughput & behavior notes
- One POST per crossing event; internal micro-batching (50 ms / ≤32) is
  engine-side (doc §7). No batch endpoint required from callers.
- Sim posts concurrently (8 tasks); engine MUST tolerate bursty parallel load.
- Expected dev load: ~10–50 req/s; demo load: ~300/s wall clock.
- `/metrics` (plates/sec, p50/p99) expected on the real engine for the
  accuracy/load story; stub omits it.

## Later (not this phase)
- Frame-mode (file cameras): same service, ByteTrack + per-vehicle vote —
  engine-side; backend ships frames, consumes events.
- Accuracy JSON for `GET /api/accuracy/report` comes from `anpr_eval/`, not
  from this endpoint.
