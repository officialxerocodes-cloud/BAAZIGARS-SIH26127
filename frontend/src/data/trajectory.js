// =====================================================================
// TRAJECTORY SEARCH — deterministic mock engine.
// Same plate -> same result. Swap for real /api/vehicles later.
// =====================================================================
import { CAMERAS } from "./delhi";

export const SEARCH_MODES = [
  { id: "plate", icon: "pin_drop", label: "Plate Lookup", hint: "Reconstruct the journey of one plate" },
  { id: "area", icon: "radar", label: "Area Sweep", hint: "Scan a zone for recent plates" },
  { id: "time", icon: "history", label: "Time Window", hint: "Historical sweep by time range" },
];

export const ZONES = [
  // cam = nearest backend gate to the named landmark (registry: GET /api/cameras)
  { id: "cp", name: "Connaught Place Core", cam: "CAM_030" },
  { id: "ito", name: "ITO Crossing · Ring Rd", cam: "CAM_020" },
  { id: "ig", name: "India Gate Circle", cam: "CAM_049" },
  { id: "aiims", name: "AIIMS Junction", cam: "CAM_056" },
  { id: "karol", name: "Karol Bagh", cam: "CAM_055" },
  { id: "dwarka", name: "Dwarka Sector 6", cam: "CAM_048" },
  { id: "rohini", name: "Rohini Sector 18", cam: "CAM_048" },
  { id: "kashmere", name: "Kashmere Gate", cam: "CAM_019" },
  { id: "noida", name: "Noida Edge Toll", cam: "CAM_046" },
];

export const TIME_WINDOWS = [
  { id: "15m", label: "Last 15 minutes" },
  { id: "1h", label: "Last 1 hour" },
  { id: "6h", label: "Last 6 hours" },
  { id: "24h", label: "Last 24 hours" },
  { id: "7d", label: "Last 7 days" },
];

export const VEHICLE_TYPES = ["All", "Private Car", "Commercial SUV", "Commercial Truck", "Electric Auto", "Two Wheeler"];

const VEHICLE_POOL = [
  { plate: "DL 01 AB 1234", category: "Private Car", make: "Maruti Suzuki Dzire", color: "White", regState: "DL", regLabel: "Delhi (NCT)", owner: "PRIV ••• (ID 884)" },
  { plate: "HR 26 DQ 8821", category: "Commercial SUV", make: "Hyundai Creta", color: "Silver", regState: "HR", regLabel: "Haryana", owner: "FLEET ••• (ID 221)" },
  { plate: "UP 16 Z 9002", category: "Private Car", make: "Maruti Suzuki Swift", color: "Black", regState: "UP", regLabel: "Uttar Pradesh", owner: "PRIV ••• (ID 907)" },
  { plate: "KA 05 MN 9920", category: "Commercial Truck", make: "Tata 407", color: "White / Blue", regState: "KA", regLabel: "Karnataka", owner: "LOGIS ••• (ID 331)" },
  { plate: "DL 04 EF 7731", category: "Private SUV", make: "Mahindra XUV700", color: "Grey", regState: "DL", regLabel: "Delhi (NCT)", owner: "PRIV ••• (ID 602)" },
  { plate: "DL 3C BC 5541", category: "Electric Auto", make: "Mahindra Treo", color: "Green", regState: "DL", regLabel: "Delhi (NCT)", owner: "MUNI ••• (ID 118)" },
];

const ZONE_GANTRY = Object.fromEntries(ZONES.map((z) => [z.cam, z.name]));

const BBOX = { minLng: 77.02, minLat: 28.42, maxLng: 77.37, maxLat: 28.75 };

function hashStr(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function nearestCam(lng, lat) {
  let best = null;
  let bd = Infinity;
  for (const f of CAMERAS.features) {
    const [cl, ca] = f.geometry.coordinates;
    const d = (cl - lng) ** 2 + (ca - lat) ** 2;
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

function genRoute(seed, n) {
  const rnd = mulberry32(hashStr(`route:${seed}`));
  const pts = [];
  let lng = 77.06 + rnd() * 0.26;
  let lat = 28.47 + rnd() * 0.24;
  let dlng = (rnd() - 0.5) * 0.02;
  let dlat = (rnd() - 0.5) * 0.02;
  for (let i = 0; i < n; i++) {
    pts.push([lng, lat]);
    dlng = dlng * 0.7 + (rnd() - 0.5) * 0.035;
    dlat = dlat * 0.7 + (rnd() - 0.5) * 0.035;
    lng = clamp(lng + dlng, BBOX.minLng, BBOX.maxLng);
    lat = clamp(lat + dlat, BBOX.minLat, BBOX.maxLat);
  }
  return pts;
}

function nowISO(deltaMin = 0) {
  return new Date(Date.now() - deltaMin * 60_000).toISOString();
}

export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
export const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

function buildResult(plate, seed, modeLabel) {
  const rnd = mulberry32(seed);
  const vehicle = VEHICLE_POOL[hashStr(seed) % VEHICLE_POOL.length] ?? VEHICLE_POOL[0];
  const n = 9 + Math.floor(rnd() * 5);
  const route = genRoute(seed, n);
  const interval = 2 + rnd() * 3;

  const detections = route.map(([lng, lat], i) => {
    const cam = nearestCam(lng, lat) ?? CAMERAS.features[0];
    const gantry = ZONE_GANTRY[cam.properties.id] ?? `Zone · ${cam.properties.id}`;
    const iso = nowISO((n - i) * interval);
    const speed = Math.round(clamp(26 + rnd() * 58, 10, 92));
    return {
      id: `d${i}`,
      cam: cam.properties.id,
      gantry,
      location: `${gantry.split(" · ").pop()}`,
      lng: cam.geometry.coordinates[0],
      lat: cam.geometry.coordinates[1],
      time: iso,
      timeLabel: fmtTime(iso),
      dateLabel: fmtDate(iso),
      minutesAgo: Math.round((n - i) * interval),
      speed,
      confidence: Math.round(90 + rnd() * 9),
      heading: ["NE", "NW", "SE", "SW", "N", "S", "E", "W"][Math.floor(rnd() * 8)],
    };
  });

  const dist = route.reduce((acc, [lng, lat], i) => {
    if (!i) return acc;
    const [al, au] = route[i - 1];
    const dLng = (lng - al) * 97.5;
    const dLat = (lat - au) * 111;
    return acc + Math.hypot(dLng, dLat);
  }, 0);

  const avgSpeed = Math.round(detections.reduce((a, d) => a + d.speed, 0) / detections.length);
  const maxSpeed = Math.max(...detections.map((d) => d.speed));
  const first = detections[0];
  const last = detections[detections.length - 1];
  const durationMin = Math.round((new Date(last.time) - new Date(first.time)) / 60_000);

  const alerts = [];
  if (hashStr(seed) % 3 === 0) {
    alerts.push({
      severity: "Critical",
      color: "#dc2626",
      title: "HOTLIST MATCH — FIR #492/2026",
      body: "Plate matches an active stolen-vehicle notice from North District. Intercept authorized.",
    });
  }
  if (maxSpeed >= 70) {
    alerts.push({
      severity: "Warning",
      color: "#f59e0b",
      title: `OVER-SPEEDING · ${maxSpeed} km/h`,
      body: `Peak velocity at ${last.gantry} against a ${Math.max(50, maxSpeed - 38)} km/h limit. E-challan window open.`,
    });
  }
  if (first.cam === last.cam) {
    alerts.push({
      severity: "Info",
      color: "#2563eb",
      title: "LOOP PATTERN — SAME GATE",
      body: "First and last read share one gantry; possible u-turn or towed parking behaviour.",
    });
  }
  if (!alerts.length) {
    alerts.push({
      severity: "Info",
      color: "#16a34a",
      title: "TRAJECTORY NORMAL",
      body: `No anomalies logged across ${detections.length} gantry reads. Routine corridor movement.`,
    });
  }

  const insights = [
    {
      icon: "replay",
      title: `${detections.length} gantry reads`,
      body: `Reconstructed ${Math.round(dist)} km across ${new Set(detections.map((d) => d.cam)).size} ANPR points with ${Math.round(rnd() * 9 + 91)}% sequence confidence.`,
    },
    {
      icon: "speed",
      title: `Avg ${avgSpeed} km/h · peak ${maxSpeed}`,
      body: `${fmtTime(first.time)} – ${fmtTime(last.time)} IST. Cruise holds steady, hard brake at ${maxSpeed >= 70 ? last.gantry : "no"}-segment.`,
    },
    {
      icon: "dynamic_feed",
      title: "Corridor affinity",
      body: `Trajectory aligns with the ${first.gantry.split(" ")[0] || "Ring Rd"} corridor pattern — ${Math.round(78 + rnd() * 20)}% match to historical flow.`,
    },
    {
      icon: "hourglass_bottom",
      title: `Dwell anomaly ${durationMin} min`,
      body: "One 6-minute stall between reads suggests a stop at a fueling / logistics node (RED-FLAG zone watch recommended).",
    },
  ];

  return {
    modeLabel,
    plate: vehicle.plate,
    vehicle,
    route,
    routeKey: seed,
    detections,
    stats: {
      reads: detections.length,
      firstRead: first.time,
      lastRead: last.time,
      firstLabel: `${fmtTime(first.time)} · ${fmtDate(first.time)}`,
      lastLabel: `${fmtTime(last.time)} · ${fmtDate(last.time)}`,
      avgSpeed,
      maxSpeed,
      distanceKm: Math.round(dist),
      durationMin,
      ocrConfidence: Math.round(detections.reduce((a, d) => a + d.confidence, 0) / detections.length),
      gantries: new Set(detections.map((d) => d.cam)).size,
    },
    alerts,
    insights,
  };
}

export function searchTrajectory(query) {
  const mode = query?.mode ?? "plate";
  const plateRaw = (query?.plate || "DL 01 AB 1234").toUpperCase().replace(/\s+/g, " ").trim();
  const seed = `${plateRaw}|${mode}|${query?.timeWindow || ""}|${query?.zone || ""}`;
  const result = buildResult(plateRaw, seed, mode);
  return { ...result, query: { ...query, mode, plate: plateRaw } };
}

export const INITIAL_HISTORY = [
  { id: "h1", timeLabel: "4 min ago", mode: "plate", queryLabel: "DL 01 AB 1234", tag: "Hotlist trace", tagClass: "bg-red-100 text-[#dc2626]", plate: "DL 01 AB 1234" },
  { id: "h2", timeLabel: "18 min ago", mode: "area", queryLabel: "India Gate Circle", tag: "Area sweep", tagClass: "bg-blue-100 text-[#2563eb]", zone: "ig" },
  { id: "h3", timeLabel: "42 min ago", mode: "time", queryLabel: "Last 6 hours · all plates", tag: "Time window", tagClass: "bg-slate-100 text-slate-600", timeWindow: "6h" },
  { id: "h4", timeLabel: "1 hr ago", mode: "plate", queryLabel: "UP 16 Z 9002", tag: "Warrant match", tagClass: "bg-red-100 text-[#dc2626]", plate: "UP 16 Z 9002" },
  { id: "h5", timeLabel: "2 hrs ago", mode: "plate", queryLabel: "KA 05 MN 9920", tag: "Clear / verified", tagClass: "bg-emerald-100 text-[#16a34a]", plate: "KA 05 MN 9920" },
];

export function queryFromHistory(row) {
  if (row.mode === "plate") return { mode: "plate", plate: row.plate };
  if (row.mode === "area") return { mode: "area", zone: row.zone || "ito", timeWindow: "6h" };
  return { mode: "time", timeWindow: row.timeWindow || "24h", plate: row.plate };
}