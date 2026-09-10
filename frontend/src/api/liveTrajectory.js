// =====================================================================
// LIVE TRAJECTORY BUILDER
// Maps backend API rows -> the TrajectoryPage result shape (same shape as
// the mock engine in data/trajectory.js) so VehicleCard, DetectionTimeline,
// VehicleAlerts, KeyInsights and LiveMap render unchanged.
//
// Source honesty: everything here is derived from real reads + the camera
// registry. Fields the backend does not provide (speed, heading, owner,
// make) are rendered as "—", never synthesized.
// =====================================================================

import { fmtTime, fmtDate } from "../data/trajectory";
import { normCamId } from "./adapters";

const STATE_LABELS = {
  DL: "Delhi (NCT)",
  HR: "Haryana",
  UP: "Uttar Pradesh",
  KA: "Karnataka",
  MH: "Maharashtra",
  TN: "Tamil Nadu",
  WB: "West Bengal",
  GJ: "Gujarat",
  RJ: "Rajasthan",
  PB: "Punjab",
};

function camIndex(cameras) {
  const idx = new Map();
  for (const c of cameras || []) {
    if (c && c.id != null) idx.set(normCamId(c.id), c);
  }
  return idx;
}

function minutesAgo(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

// Same equirectangular approximation as the mock engine (degrees -> km).
function routeKm(route) {
  let acc = 0;
  for (let i = 1; i < route.length; i++) {
    const dLng = (route[i][0] - route[i - 1][0]) * 97.5;
    const dLat = (route[i][1] - route[i - 1][1]) * 111;
    acc += Math.hypot(dLng, dLat);
  }
  return Math.round(acc);
}

/**
 * Build a TrajectoryPage result from live backend rows.
 * @param {string} canonical  canonical plate (alnum, uppercase)
 * @param {Array} reads       /api/vehicles/{p}/trajectory rows (time-asc);
 *                            rows may carry joined lng/lat/camera_name
 * @param {Array} cameras     /api/cameras rows
 * @param {Array} clones      /api/vehicles/{p}/clones rows
 * @returns {object|null} result in mock-engine shape, or null when no reads
 */
export function buildLiveResult(canonical, reads, cameras, clones) {
  const rows = [...(reads || [])].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );
  if (!rows.length) return null;

  const idx = camIndex(cameras);
  const detections = rows.map((r, i) => {
    const cam = idx.get(normCamId(r.camera_id));
    const lng = r.lng ?? cam?.lng ?? null;
    const lat = r.lat ?? cam?.lat ?? null;
    const gantry = r.camera_name || cam?.name || r.camera_id || "Unknown gantry";
    return {
      id: `live-${r.read_id || i}`,
      cam: r.camera_id || "—",
      gantry,
      location: r.camera_zone || cam?.zone || gantry,
      lng,
      lat,
      time: r.ts,
      timeLabel: fmtTime(r.ts),
      dateLabel: fmtDate(r.ts),
      minutesAgo: minutesAgo(r.ts),
      speed: "—",
      confidence:
        r.confidence != null ? Math.round(Number(r.confidence) * 100) : null,
      heading: "—",
      cropUrl: r.crop_url ?? null,
    };
  });

  const route = detections
    .filter((d) => d.lng != null && d.lat != null)
    .map((d) => [Number(d.lng), Number(d.lat)]);

  const first = rows[0];
  const last = rows[rows.length - 1];
  const confs = rows
    .map((r) => Number(r.confidence))
    .filter((c) => Number.isFinite(c));
  const ocrConfidence = confs.length
    ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100)
    : null;
  const durationMin = Math.max(
    0,
    Math.round((new Date(last.ts) - new Date(first.ts)) / 60000)
  );
  const gantries = new Set(rows.map((r) => normCamId(r.camera_id))).size;

  const regState = String(canonical).slice(0, 2);
  const vehicle = {
    plate: canonical,
    category: last.vehicle_class || first.vehicle_class || "ANPR record",
    make: "—",
    color: "—",
    regState,
    regLabel: STATE_LABELS[regState] || "—",
    owner: "Live ANPR trace",
  };

  const alerts = (clones || []).slice(0, 6).map((c) => {
    const p = c.payload && typeof c.payload === "object" ? c.payload : {};
    const isClone = c.type === "clone";
    return {
      severity: isClone ? "Critical" : "Warning",
      color: isClone ? "#dc2626" : "#f59e0b",
      title: isClone
        ? "CLONE SUSPECT — SAME PLATE, SPLIT TRACKS"
        : `IMPOSSIBLE TRAVEL · ${p.from_cam || "?"} → ${p.to_cam || "?"}`,
      body:
        (p.delta_s != null
          ? `${p.delta_s}s between ${p.from_cam || "?"} and ${p.to_cam || "?"}. `
          : "") +
        `Flagged ${c.created_at ? fmtTime(c.created_at) : "recently"} on the ANPR grid.`,
    };
  });
  if (!alerts.length) {
    alerts.push({
      severity: "Info",
      color: "#16a34a",
      title: "NO CLONE / IMPOSSIBLE-TRAVEL FLAGS",
      body: `No split-track or impossible-travel alerts on record for ${canonical}.`,
    });
  }

  const insights = [
    {
      icon: "replay",
      title: `${rows.length} gantry read${rows.length === 1 ? "" : "s"}`,
      body: `Observed at ${gantries} ANPR point${gantries === 1 ? "" : "s"} from ${fmtTime(first.ts)} to ${fmtTime(last.ts)}.`,
    },
    {
      icon: "target",
      title:
        ocrConfidence != null
          ? `Mean OCR confidence ${ocrConfidence}%`
          : "OCR confidence unavailable",
      body:
        route.length > 1
          ? `Reconstructed path spans ~${routeKm(route)} km across the camera grid.`
          : "Single-camera sighting — no path reconstructed yet.",
    },
  ];
  if (durationMin > 0) {
    insights.push({
      icon: "hourglass_bottom",
      title: `Observed span ${durationMin} min`,
      body: "First-to-last read interval on the grid.",
    });
  }

  return {
    modeLabel: "plate",
    plate: canonical,
    vehicle,
    route,
    routeKey: `live:${canonical}:${rows.length}:${last.ts}`,
    detections,
    stats: {
      reads: rows.length,
      firstRead: first.ts,
      lastRead: last.ts,
      firstLabel: `${fmtTime(first.ts)} · ${fmtDate(first.ts)}`,
      lastLabel: `${fmtTime(last.ts)} · ${fmtDate(last.ts)}`,
      avgSpeed: "—",
      maxSpeed: "—",
      distanceKm: routeKm(route),
      durationMin,
      ocrConfidence: ocrConfidence ?? "—",
      gantries,
    },
    alerts,
    insights,
    statusTag: "Live ANPR trace",
    source: "live",
    query: { mode: "plate", plate: canonical },
  };
}

// ---- Map layers from live backend rows --------------------------------

/** /api/cameras rows -> GeoJSON for the LiveMap camera layer. */
export function buildCamerasGeo(cameras) {
  return {
    type: "FeatureCollection",
    features: (cameras || [])
      .filter((c) => c.lng != null && c.lat != null)
      .map((c) => ({
        type: "Feature",
        properties: { id: c.id, status: c.status === "ok" ? "ok" : "off" },
        geometry: { type: "Point", coordinates: [Number(c.lng), Number(c.lat)] },
      })),
  };
}

/**
 * camera_rollups rows -> GeoJSON heat points, positioned via the camera
 * registry. Weights are normalized 0..1 against the hottest camera.
 */
export function buildHeatGeo(heatmapRows, cameras) {
  const idx = camIndex(cameras);
  const totals = new Map();
  for (const r of heatmapRows || []) {
    const key = normCamId(r.camera_id);
    totals.set(key, (totals.get(key) || 0) + (r.count || 0));
  }
  const peak = Math.max(0.0001, ...totals.values());
  const features = [];
  for (const [key, count] of totals) {
    const cam = idx.get(key);
    if (!cam || cam.lng == null || cam.lat == null) continue;
    features.push({
      type: "Feature",
      properties: { weight: Math.min(1, count / peak) },
      geometry: { type: "Point", coordinates: [Number(cam.lng), Number(cam.lat)] },
    });
  }
  return { type: "FeatureCollection", features };
}
