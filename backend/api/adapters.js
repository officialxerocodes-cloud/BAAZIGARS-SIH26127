// =====================================================================
// ADAPTERS
// Maps backend API payloads -> component props (mock-data shape) so the
// dashboard reuses the existing components unchanged. Every mapper falls
// back to the mock value when the backend has nothing useful to say.
// =====================================================================

// ---- Camera-ID normalization -------------------------------------------
// Backend registry uses compact IDs ("CAM_001"); older frontend fixtures
// use spaced IDs ("CAM 001"). Normalize before any join so map lookups
// never silently miss.
export function normCamId(id) {
  if (id == null) return "";
  return String(id).replace(/\s+/g, "").toUpperCase();
}

// Canonicalize a plate for search: uppercase, alnum-only.
export function canonicalPlate(raw) {
  if (raw == null) return "";
  return String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function timeAgo(input) {
  if (!input) return "—";
  const ts = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(ts.getTime())) return "—";
  const s = Math.max(0, Math.round((Date.now() - ts.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// ---- Alerts ----------------------------------------------------------
const SEVERITY_STYLE = {
  Critical: {
    dot: "#dc2626",
    tag: "bg-red-100 text-[#dc2626]",
    action: {
      label: "Dispatch Intercept",
      icon: "local_police",
      className: "bg-[#dc2626] hover:bg-[#b91c1c] text-white",
    },
    row: "bg-red-50/60 hover:bg-red-50 border-l-[#dc2626]",
  },
  Warning: {
    dot: "#f59e0b",
    tag: "bg-amber-100 text-[#b45309]",
    action: {
      label: "Details",
      icon: "info",
      className: "bg-slate-100 hover:bg-slate-200 text-slate-800",
    },
    row: "bg-amber-50/50 hover:bg-amber-50 border-l-[#f59e0b]",
  },
  Info: {
    dot: "#2563eb",
    tag: "bg-blue-100 text-[#2563eb]",
    action: {
      label: "View",
      icon: "info",
      className: "bg-slate-100 hover:bg-slate-200 text-slate-800",
    },
    row: "bg-blue-50/50 hover:bg-blue-50 border-l-[#2563eb]",
  },
};

const SEVERITY_BY_TYPE = {
  blacklist: "Critical",
  impossible: "Warning",
  clone: "Warning",
  health: "Warning",
  anomaly: "Info",
};

// Backend row: { id, type, canonical, payload, created_at, acknowledged }
export function mapBackendAlert(a) {
  if (!a || !a.canonical) return null;
  const severity = SEVERITY_BY_TYPE[a.type] || "Info";
  const style = SEVERITY_STYLE[severity];
  const payload =
    a.payload && typeof a.payload === "object" ? a.payload : {};
  // possible location shapes: {camera_id} (blacklist), {from_cam,to_cam}
  // (impossible/clone), {message/reason} only.
  const location = payload.camera_id
    ? `Camera ${payload.camera_id}`
    : payload.from_cam || payload.to_cam
      ? `Camera ${payload.from_cam || "?"} → ${payload.to_cam || "?"}`
      : "Camera on ANPR grid";
  return {
    id: a.id || `${a.type}-${a.canonical}`,
    severity,
    dotColor: style.dot,
    plate: a.canonical,
    tag: String(a.type || "ALERT").toUpperCase(),
    tagClass: style.tag,
    description:
      payload.reason ||
      payload.message ||
      (payload.from_cam || payload.to_cam
        ? `Impossible travel: ${payload.from_cam || "?"} → ${payload.to_cam || "?"} in ${payload.delta_s != null ? `${payload.delta_s}s` : "short window"}`
        : `${String(a.type || "alert").toUpperCase()} detected on ANPR grid`),
    location,
    speed: payload.speed != null ? String(payload.speed) : null,
    time: timeAgo(a.created_at),
    action: style.action,
    rowClass: style.row,
  };
}

// ---- Vehicle search -> Trajectory table rows -------------------------
// Backend search row: { canonical, first_seen, last_seen, read_count }
export function mapSearchRows(rows) {
  if (!rows) return [];
  return rows.map((r, i) => ({
    id: `s-${r.canonical}-${i}`,
    plate: r.canonical,
    model: "ANPR record",
    location: r.last_seen ? `Last seen ${timeAgo(r.last_seen)}` : "No sightings",
    speed: "—",
    direction: "—",
    time: r.last_seen ? timeAgo(r.last_seen) : "—",
    status: `${r.read_count} reads tracked`,
    statusClass: "bg-emerald-100 text-[#16a34a]",
    read: r,
  }));
}

// Backend trajectory row: { read_id, camera_id, ts, raw_plate, canonical,
//                           confidence, crop_path, gt_plate, vehicle_class }
export function mapTrajectoryRows(rows) {
  if (!rows) return [];
  return rows.map((r, i) => ({
    id: `t-${r.read_id || r.camera_id}-${i}`,
    plate: r.canonical || r.raw_plate || "—",
    model: r.vehicle_class ? r.vehicle_class : "ANPR sighting",
    location: r.camera_id ? `Camera ${r.camera_id}` : "Unknown camera",
    speed: r.confidence != null ? `${Math.round(r.confidence * 100)}%` : "—",
    direction: "—",
    time: timeAgo(r.ts),
    status: r.gt_plate ? "Verified" : "Sighting",
    statusClass: r.gt_plate
      ? "bg-emerald-100 text-[#16a34a]"
      : "bg-slate-100 text-slate-600",
  }));
}

// ---- Analytics -> KPI cards ------------------------------------------
function cameraHealthSummary(healthRows) {
  if (!Array.isArray(healthRows) || healthRows.length === 0) return null;
  const byCam = {};
  for (const r of healthRows) {
    const cur = byCam[r.camera_id];
    if (!cur || new Date(r.window_start) > new Date(cur.window_start)) {
      byCam[r.camera_id] = r;
    }
  }
  const cams = Object.values(byCam);
  const online = cams.filter((c) => c.status === "ok").length;
  return { online, total: cams.length };
}

export function buildKpiCards(base, { health, alerts, accuracy } = {}) {
  const cards = base.map((c) => ({ ...c }));
  const liveAlerts = Array.isArray(alerts) ? alerts : [];

  const blacklistedIdx = cards.findIndex((c) => c.id === "blacklisted");
  if (blacklistedIdx >= 0 && liveAlerts.length) {
    const count = liveAlerts.filter((a) => a.type === "blacklist").length;
    if (count > 0) {
      cards[blacklistedIdx] = {
        ...cards[blacklistedIdx],
        metric: String(count),
        subtitle: "Live hotlist hits active",
        trend: {
          label: `▲ ${count} in feed`,
          className: "bg-red-50 text-[#DC2626]",
        },
      };
    }
  }

  const accuracyIdx = cards.findIndex((c) => c.id === "ocr-accuracy");
  if (accuracyIdx >= 0 && accuracy && accuracy.accuracy != null) {
    cards[accuracyIdx] = {
      ...cards[accuracyIdx],
      metric: `${(accuracy.accuracy * 100).toFixed(1)}%`,
    };
  }

  const camIdx = cards.findIndex((c) => c.id === "cameras-online");
  const summary = cameraHealthSummary(health);
  if (camIdx >= 0 && summary) {
    const pct = Math.round((summary.online / summary.total) * 1000) / 10;
    cards[camIdx] = {
      ...cards[camIdx],
      metric: `${summary.online}/${summary.total}`,
      progress: pct,
      subtitle: `${pct}% uptime`,
    };
  }

  return cards;
}

// ---- Analytics -> Hero stat chips ------------------------------------
export function buildStatChips(base, { health, accuracy } = {}) {
  const chips = base.map((c) => ({ ...c }));
  const summary = cameraHealthSummary(health);

  const cameras = chips.find((c) => c.id === "cameras");
  if (cameras && summary) {
    cameras.value = `${summary.online}/${summary.total}`;
  }

  const ocr = chips.find((c) => c.id === "accuracy");
  if (ocr && accuracy && accuracy.accuracy != null) {
    ocr.value = `${(accuracy.accuracy * 100).toFixed(1)}%`;
  }

  return chips;
}

// ---- Analytics -> Density panel --------------------------------------
function hourKey(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}h`;
}

export function buildDensityProps(
  basePoints,
  baseHours,
  baseChart,
  { congestion, heatmap } = {}
) {
  const out = {
    points: basePoints,
    hours: baseHours,
    chart: baseChart,
  };

  if (Array.isArray(congestion) && congestion.length) {
    const maxDist = Math.max(...congestion.map((c) => c.road_dist_m || 0));
    const points = congestion
      .slice(0, 4)
      .map((c, i) => {
        const pct = maxDist ? Math.round((c.road_dist_m / maxDist) * 100) : 50;
        const level =
          pct >= 80 ? "Critical" : pct >= 60 ? "High" : pct >= 40 ? "Moderate" : "Normal";
        const color =
          pct >= 80 ? "#dc2626" : pct >= 60 ? "#ea580c" : pct >= 40 ? "#f59e0b" : "#16a34a";
        return {
          id: `c-${c.from_cam}-${c.to_cam}-${i}`,
          name: `${c.from_cam} → ${c.to_cam}`,
          pct,
          level,
          speed: c.median_tt != null ? `${c.median_tt}s` : "—",
          color,
        };
      });
    out.points = points;
  }

  if (Array.isArray(heatmap) && heatmap.length) {
    const buckets = {};
    for (const r of heatmap) {
      const hk = hourKey(r.window_start);
      buckets[hk] = (buckets[hk] || 0) + (r.count || 0);
    }
    const hours = Object.keys(buckets)
      .sort()
      .map((hk) => ({ hour: hk, value: buckets[hk] }));
    if (hours.length) out.hours = hours;

    const labels = hours.map((h) => h.hour);
    const data = hours.map((h) => h.value);
    const peak = hours.reduce((m, h) => (h.value > (m ? m.value : -1) ? h : m), null);
    out.chart = {
      labels: labels.length ? labels : baseChart.labels,
      data: data.length ? data : baseChart.data,
      totalDaily: `${(data.reduce((a, b) => a + b, 0) || 0).toLocaleString()} Vehicles`,
      peakLabel: peak ? `Peak: ${peak.hour} IST` : baseChart.peakLabel,
      peakTooltip: peak
        ? `Peak: ${peak.value.toLocaleString()} veh/hr (${peak.hour})`
        : baseChart.peakTooltip,
      congestionThreshold: baseChart.congestionThreshold,
    };
  }

  return out;
}

// =====================================================================
// ANALYTICS PAGE ADAPTERS
// Every function below takes the raw backend rows + the mock fallback and
// returns data shaped exactly like data/analyticsData.js, so AnalyticsPage
// components never need to know whether they're looking at live or mock
// data. If the backend rows are empty/missing, the mock is returned as-is.
// =====================================================================

function camNameOf(camerasById, id) {
  const c = camerasById?.[id];
  return c?.name || c?.zone || id || "Unknown";
}

// ---- Congestion: hourly trend from camera_rollups (heatmap) ----------
export function mapCongestionTrend(heatmapRows, mock) {
  if (!Array.isArray(heatmapRows) || !heatmapRows.length) return mock;
  const buckets = {};
  for (const r of heatmapRows) {
    const hk = hourKey(r.window_start);
    buckets[hk] = (buckets[hk] || 0) + (r.count || 0);
  }
  const labels = Object.keys(buckets).sort();
  if (!labels.length) return mock;
  const raw = labels.map((l) => buckets[l]);
  const max = Math.max(...raw, 1);
  // scale volume to a 0-100 "index" for now (proxy — backend has no single
  // city-wide congestion index endpoint yet, this is total-detections/max)
  const values = raw.map((v) => Math.round((v / max) * 100));
  const peakIdx = values.reduce((mi, v, i) => (v > values[mi] ? i : mi), 0);
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return {
    labels: labels.slice(-6),
    values,
    current: values[values.length - 1],
    peak: values[peakIdx],
    peakTime: labels[peakIdx],
    avg24h: avg,
  };
}

// ---- Congestion: top corridors from camera_pairs (/analytics/congestion) --
export function mapTopCorridors(congestionRows, camerasById, mock) {
  if (!Array.isArray(congestionRows) || !congestionRows.length) return mock;
  const withRatio = congestionRows.filter((r) => r.congestion_ratio != null);
  if (!withRatio.length) return mock;
  const maxRatio = Math.max(...withRatio.map((r) => r.congestion_ratio), 1);
  return withRatio
    .slice()
    .sort((a, b) => b.congestion_ratio - a.congestion_ratio)
    .slice(0, 5)
    .map((r, i) => ({
      rank: String(i + 1).padStart(2, "0"),
      name: `${camNameOf(camerasById, r.from_cam)} → ${camNameOf(camerasById, r.to_cam)}`,
      index: Math.min(100, Math.round((r.congestion_ratio / maxRatio) * 100)),
    }));
}

// ---- Origin -> Destination from od_stats (/analytics/od) -------------
const OD_COLORS = ["#0B3D91", "#F59E0B", "#EF4444", "#A855F7", "#94A3B8", "#00C853"];

export function mapOdFlow(odRows, camerasById, mock) {
  if (!Array.isArray(odRows) || !odRows.length) return mock;

  const originTotals = {};
  const destTotals = {};
  for (const r of odRows) {
    originTotals[r.from_cam] = (originTotals[r.from_cam] || 0) + r.vehicle_count;
    destTotals[r.to_cam] = (destTotals[r.to_cam] || 0) + r.vehicle_count;
  }
  const topOrigins = Object.entries(originTotals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
  const topDests = Object.entries(destTotals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
  if (!topOrigins.length || !topDests.length) return mock;

  const grandTotal = Object.values(destTotals).reduce((a, b) => a + b, 0) || 1;
  const destinations = topDests.map((id, i) => ({
    name: camNameOf(camerasById, id),
    pct: Math.round((destTotals[id] / grandTotal) * 100),
    color: OD_COLORS[i % OD_COLORS.length],
  }));
  const origins = topOrigins.map((id) => camNameOf(camerasById, id));

  const links = topOrigins.map((oId) =>
    topDests.map((dId) => {
      const match = odRows.find((r) => r.from_cam === oId && r.to_cam === dId);
      return match ? Math.max(1, Math.round(match.vehicle_count / 2)) : 0.5;
    })
  );

  return { origins, destinations, links };
}

// ---- Camera network health (/analytics/cameras/health + /cameras) ----
export function mapCameraNetwork(healthRows, camerasById, mock) {
  if (!Array.isArray(healthRows) || !healthRows.length) return mock;

  // latest status per camera (rows are ORDER BY window_start DESC already)
  const latestByCam = {};
  for (const r of healthRows) {
    if (!latestByCam[r.camera_id]) latestByCam[r.camera_id] = r.status;
  }
  const statuses = Object.values(latestByCam);
  if (!statuses.length) return mock;

  const online = statuses.filter((s) => s === "ok").length;
  const degraded = statuses.filter((s) => s === "degraded").length;
  const offline = statuses.filter((s) => s === "down").length;
  const total = statuses.length;
  const onlinePct = Math.round((online / total) * 1000) / 10;

  const STATUS_LEVEL = { ok: "high", degraded: "moderate", down: "low" };
  const coords = Object.entries(latestByCam)
    .map(([id, status]) => ({ status, ...camerasById?.[id] }))
    .filter((c) => c.lng != null && c.lat != null);

  let dots = mock.dots;
  if (coords.length) {
    const lngs = coords.map((c) => c.lng);
    const lats = coords.map((c) => c.lat);
    const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
    const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
    const spanLng = maxLng - minLng || 1;
    const spanLat = maxLat - minLat || 1;
    dots = coords.slice(0, 60).map((c) => [
      Math.round(((c.lng - minLng) / spanLng) * 100),
      Math.round((1 - (c.lat - minLat) / spanLat) * 100), // flip: north = top
      STATUS_LEVEL[c.status] || "moderate",
    ]);
  }

  const covCounts = { high: online, moderate: degraded, low: offline };
  const coverage = mock.coverage.map((c) => {
    const key = c.label === "High" ? "high" : c.label === "Moderate" ? "moderate" : "low";
    return { ...c, pct: Math.round(((covCounts[key] || 0) / total) * 100) };
  });

  return { onlinePct, online, degraded, offline, coverage, dots };
}

// ---- Blacklist analysis from /api/alerts ------------------------------
export function mapBlacklistAnalysis(alertRows, camerasById, mock) {
  if (!Array.isArray(alertRows) || !alertRows.length) return mock;
  const hits = alertRows.filter((a) => a.type === "blacklist");
  if (!hits.length) return mock;

  const locCounts = {};
  const plateCounts = {};
  const plateLastSeen = {};
  for (const a of hits) {
    const camId = a.payload?.camera_id;
    if (camId) locCounts[camId] = (locCounts[camId] || 0) + 1;
    plateCounts[a.canonical] = (plateCounts[a.canonical] || 0) + 1;
    const t = a.created_at;
    if (!plateLastSeen[a.canonical] || new Date(t) > new Date(plateLastSeen[a.canonical])) {
      plateLastSeen[a.canonical] = t;
    }
  }

  const topLocations = Object.entries(locCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ name: camNameOf(camerasById, id), count }));

  const repeatDetections = Object.entries(plateCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([plate, count]) => ({
      plate,
      count,
      lastSeen: new Date(plateLastSeen[plate]).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    }));

  return {
    count: hits.length,
    trend: mock.trend,
    topLocations: topLocations.length ? topLocations : mock.topLocations,
    repeatDetections: repeatDetections.length ? repeatDetections : mock.repeatDetections,
  };
}

// ---- Alert analytics from /api/alerts ---------------------------------
const ALERT_TYPE_LABEL = { blacklist: "Blacklist", impossible: "Impossible Travel", health: "Camera Failure" };
const ALERT_TYPE_COLOR = { blacklist: "#EF4444", impossible: "#F59E0B", health: "#94A3B8" };

export function mapAlertAnalytics(alertRows, camerasById, mock) {
  if (!Array.isArray(alertRows) || !alertRows.length) return mock;

  const typeCounts = {};
  const locCounts = {};
  for (const a of alertRows) {
    typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
    const loc = a.payload?.camera_id || a.payload?.to_cam;
    if (loc) locCounts[loc] = (locCounts[loc] || 0) + 1;
  }
  const byType = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      label: ALERT_TYPE_LABEL[type] || "Others",
      count,
      color: ALERT_TYPE_COLOR[type] || "#0B3D91",
    }));

  const topLocations = Object.entries(locCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => camNameOf(camerasById, id));

  // sparkline: bucket alerts into 12 equal trailing time slices
  const times = alertRows.map((a) => new Date(a.created_at).getTime()).filter((t) => !Number.isNaN(t));
  let sparkline = mock.sparkline;
  if (times.length) {
    const min = Math.min(...times), max = Math.max(...times);
    const span = Math.max(max - min, 1);
    const buckets = new Array(12).fill(0);
    for (const t of times) {
      const idx = Math.min(11, Math.floor(((t - min) / span) * 12));
      buckets[idx] += 1;
    }
    sparkline = buckets;
  }

  return {
    today: alertRows.length,
    trend: mock.trend,
    sparkline,
    byType: byType.length ? byType : mock.byType,
    topLocations: topLocations.length ? topLocations : mock.topLocations,
    dots: mock.dots, // no per-alert geo endpoint yet — keep illustrative
  };
}

// ---- Overview KPI band (partial — see AnalyticsPage for which cards) --
export function mapAnalyticsOverview(base, { alerts, cameraNetwork } = {}) {
  const cards = base.map((c) => ({ ...c }));
  if (Array.isArray(alerts) && alerts.length) {
    const idx = cards.findIndex((c) => c.id === "alerts");
    if (idx >= 0) {
      const critical = alerts.filter((a) => a.type === "blacklist" || a.type === "impossible").length;
      cards[idx] = { ...cards[idx], metric: String(alerts.length), sub: `${critical} Critical · ${alerts.length - critical} Warning` };
    }
    const blIdx = cards.findIndex((c) => c.id === "blacklist");
    if (blIdx >= 0) {
      const count = alerts.filter((a) => a.type === "blacklist").length;
      cards[blIdx] = { ...cards[blIdx], metric: String(count) };
    }
  }
  return cards;
}