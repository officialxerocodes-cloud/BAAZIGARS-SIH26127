// =====================================================================
// API CLIENT
// Thin fetch wrapper around the backend REST API (FastAPI, :8002).
//
// Base URL resolution:
//   * Default "" -> requests go to /api on the SAME origin, handled by the
//     Vite dev proxy (see vite.config.js) which forwards to localhost:8002.
//   * Set VITE_API_BASE_URL to a full URL (e.g. http://localhost:8002/api)
//     to talk cross-origin directly (backend CORS must allow the origin).
// =====================================================================

function normalizeBaseUrl(raw) {
  let base = (raw ?? "").trim().replace(/\/+$/, "");
  // Guard the old documented mistake (VITE_API_BASE_URL=.../api): endpoint
  // paths below already start with /api, so a suffixed base would double to
  // /api/api/... and 404 on every call.
  if (/\/api$/i.test(base)) {
    if (typeof console !== "undefined" && import.meta.env?.DEV) {
      console.warn(
        `[api] VITE_API_BASE_URL should be a bare origin (no /api suffix); stripping it from ${JSON.stringify(raw)}`
      );
    }
    base = base.replace(/\/api$/i, "");
  }
  return base;
}

export const API_BASE_URL = normalizeBaseUrl(import.meta.env?.VITE_API_BASE_URL);

// Demo-data mode (frontend-only deploys, no backend):
// VITE_DEMO_MODE=true makes every API call fail fast with a clear error so
// all widgets render their mock fixtures with honest "Offline · demo data"
// badges — instead of hitting a missing backend and mis-parsing HTML 404s
// as data. Baked at build time like VITE_API_BASE_URL.
export const DEMO_MODE =
  String(import.meta.env?.VITE_DEMO_MODE ?? "").toLowerCase() === "true";

export async function api(path, options = {}) {
  if (DEMO_MODE) {
    throw new Error(`Demo mode: backend disabled (no request sent to ${path})`);
  }
  // Bound every call: a hung backend (e.g. mid-redeploy) must surface as an
  // error — and then as a STALE badge — instead of spinning forever.
  const timeoutMs = options.timeoutMs ?? 20000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: "application/json", ...(options.headers || {}) },
      signal: ctrl.signal,
      ...options,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Request ${path} failed (${res.status}): ${detail}`);
    }
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`Request ${path} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Read endpoints ----
export const getCameras = () => api("/api/cameras");
export const getAlerts = (limit = 50) => api(`/api/alerts?limit=${limit}`);
export const searchVehicles = (q, { fuzzy = 0, limit = 20 } = {}) =>
  api(
    `/api/vehicles/search?q=${encodeURIComponent(q)}&fuzzy=${fuzzy}&limit=${limit}`
  );
export const getTrajectory = (plate, { from, to } = {}) => {
  const params = new URLSearchParams();
  if (from) params.set("from_ts", from);
  if (to) params.set("to_ts", to);
  const qs = params.toString();
  return api(
    `/api/vehicles/${encodeURIComponent(plate)}/trajectory${qs ? `?${qs}` : ""}`
  );
};
export const getClones = (plate) =>
  api(`/api/vehicles/${encodeURIComponent(plate)}/clones`);
// ---- Sweep endpoints (P2: Area / Time panels are live, no longer mock) ----
export const getZoneSweep = ({ lat, lng, radiusKm = 1, from, to, limit = 200 } = {}) => {
  const params = new URLSearchParams();
  params.set("lat", lat);
  params.set("lng", lng);
  params.set("radius_km", radiusKm);
  if (from) params.set("from_ts", from);
  if (to) params.set("to_ts", to);
  params.set("limit", limit);
  return api(`/api/sweeps/zone?${params.toString()}`);
};
export const getWindowSweep = ({ from, to, limit = 50 } = {}) => {
  const params = new URLSearchParams();
  if (from) params.set("from_ts", from);
  if (to) params.set("to_ts", to);
  params.set("limit", limit);
  return api(`/api/sweeps/window?${params.toString()}`);
};
export const getHeatmap = (from, to, bucket) => {
  const params = new URLSearchParams();
  if (from) params.set("from_ts", from);
  if (to) params.set("to_ts", to);
  // Re-bin stride for the 1-min rollups; backend allowlist:
  // 1m/5m/15m/1h/6h/24h (anything else is a 400). Omit to use the default.
  if (bucket) params.set("bucket", bucket);
  const qs = params.toString();
  return api(`/api/analytics/heatmap${qs ? `?${qs}` : ""}`);
};
export const getCongestion = () => api("/api/analytics/congestion");
export const getOdStats = (window) =>
  api(window ? `/api/analytics/od?window=${encodeURIComponent(window)}` : "/api/analytics/od");
export const getCameraHealth = () => api("/api/analytics/cameras/health");
export const getAccuracyReport = () => api("/api/accuracy/report");

// ---- Write endpoints ----
export const postBlacklist = (plate, reason = "") =>
  api("/api/blacklist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plate, reason }),
  });
export const getBlacklist = () => api("/api/blacklist");
export const deleteBlacklist = (plate) =>
  api(`/api/blacklist/${encodeURIComponent(plate)}`, { method: "DELETE" });
export const ackAlert = (id) =>
  api(`/api/alerts/${encodeURIComponent(id)}/ack`, { method: "POST" });

// ---- WebSocket live feed ----
export function connectLive({ onMessage, onStatus } = {}) {
  if (DEMO_MODE) {
    // No backend to dial: report closed once so callers settle, no retries.
    queueMicrotask(() => onStatus?.("closed", null));
    return { close() {}, send() {} };
  }
  let wsHost = window.location.host;
  let wsProto = window.location.protocol === "https:" ? "wss" : "ws";
  if (API_BASE_URL.startsWith("http")) {
    const url = new URL(API_BASE_URL);
    wsHost = url.host;
    wsProto = url.protocol === "https:" ? "wss" : "ws";
  }

  const ws = new WebSocket(`${wsProto}://${wsHost}/live`);
  ws.onopen = () => onStatus?.("open", ws);
  ws.onclose = (e) => onStatus?.("closed", e);
  ws.onerror = (e) => onStatus?.("error", e);
  ws.onmessage = (e) => {
    try {
      onMessage?.(JSON.parse(e.data), e);
    } catch {
      onMessage?.(e.data, e);
    }
  };
  return ws;
}