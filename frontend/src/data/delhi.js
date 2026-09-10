// =====================================================================
// DELHI GRID DATA — vector-map layers for the hero control center.
// Heat points (WebGL heatmap) + camera markers, both GeoJSON.
// =====================================================================

export const DELHI_CENTER = { lng: 77.209, lat: 28.6139 };
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const pt = (lng, lat, weight) => ({ lng, lat, weight });

// Congestion clusters weighted 0..1 — real Delhi arterial hotspots.
const HOTSPOTS = [
  pt(77.2167, 28.6315, 0.95), // Connaught Place
  pt(77.2434, 28.6258, 0.82), // ITO crossing
  pt(77.2295, 28.6129, 0.78), // India Gate circle
  pt(77.2093, 28.5696, 0.68), // AIIMS
  pt(77.2517, 28.5486, 0.72), // Nehru Place
  pt(77.2398, 28.5690, 0.66), // Lajpat Nagar
  pt(77.2062, 28.5244, 0.62), // Saket
  pt(77.191, 28.649, 0.71),   // Karol Bagh
  pt(77.0991, 28.625, 0.64),  // Janakpuri
  pt(77.1176, 28.7136, 0.69), // Rohini
  pt(77.2284, 28.6698, 0.6),  // Kashmere Gate
  pt(77.0903, 28.7113, 0.55), // Azadpur
  pt(77.2833, 28.6217, 0.58), // Akshardham
  pt(77.0833, 28.595, 0.5),   // Dwarka Sector 6
  pt(77.31, 28.5708, 0.52),   // Mayur Vihar / Noida edge
  pt(77.1402, 28.5506, 0.47), // R.K. Puram
  pt(77.0257, 28.5588, 0.45), // IGI approach
  pt(77.162, 28.6167, 0.4),   // Moti Nagar
  pt(77.2733, 28.536, 0.38),  // Surajmal Vihar
  pt(77.0683, 28.6833, 0.36), // Paschim Vihar
];

const toFeature = ({ lng, lat, weight }) => ({
  type: "Feature",
  properties: { weight },
  geometry: { type: "Point", coordinates: [lng, lat] },
});

export const HEAT_POINTS = {
  type: "FeatureCollection",
  features: HOTSPOTS.map(toFeature),
};

// Camera registry — snapped to the backend gates table (2026-09-09).
// Source of truth is GET /api/cameras; live layers override these fixtures.
const CAM_SITES = [
  { id: "CAM_001", lng: 77.230296, lat: 28.601611, status: "ok" },
  { id: "CAM_002", lng: 77.174272, lat: 28.633177, status: "ok" },
  { id: "CAM_003", lng: 77.216254, lat: 28.649986, status: "ok" },
  { id: "CAM_004", lng: 77.207992, lat: 28.6396, status: "ok" },
  { id: "CAM_005", lng: 77.223186, lat: 28.637629, status: "ok" },
  { id: "CAM_006", lng: 77.185672, lat: 28.635455, status: "ok" },
  { id: "CAM_007", lng: 77.187448, lat: 28.60606, status: "ok" },
  { id: "CAM_008", lng: 77.208568, lat: 28.633543, status: "ok" },
  { id: "CAM_009", lng: 77.168516, lat: 28.575097, status: "ok" },
  { id: "CAM_010", lng: 77.218455, lat: 28.641875, status: "ok" },
  { id: "CAM_011", lng: 77.225759, lat: 28.640981, status: "ok" },
  { id: "CAM_012", lng: 77.195127, lat: 28.579573, status: "ok" },
  { id: "CAM_013", lng: 77.240168, lat: 28.607256, status: "ok" },
  { id: "CAM_014", lng: 77.219883, lat: 28.635719, status: "ok" },
  { id: "CAM_015", lng: 77.209655, lat: 28.645795, status: "ok" },
  { id: "CAM_016", lng: 77.17273, lat: 28.609314, status: "ok" },
  { id: "CAM_017", lng: 77.215363, lat: 28.626963, status: "ok" },
  { id: "CAM_018", lng: 77.242852, lat: 28.639877, status: "ok" },
  { id: "CAM_019", lng: 77.236771, lat: 28.655992, status: "ok" },
  { id: "CAM_020", lng: 77.2403, lat: 28.625121, status: "ok" },
  { id: "CAM_021", lng: 77.171761, lat: 28.576645, status: "ok" },
  { id: "CAM_022", lng: 77.235675, lat: 28.604855, status: "ok" },
  { id: "CAM_023", lng: 77.22832, lat: 28.600409, status: "ok" },
  { id: "CAM_024", lng: 77.239874, lat: 28.609306, status: "ok" },
  { id: "CAM_025", lng: 77.212742, lat: 28.591639, status: "ok" },
  { id: "CAM_026", lng: 77.240184, lat: 28.612783, status: "ok" },
  { id: "CAM_027", lng: 77.180673, lat: 28.601931, status: "ok" },
  { id: "CAM_028", lng: 77.222434, lat: 28.631252, status: "ok" },
  { id: "CAM_029", lng: 77.219625, lat: 28.629888, status: "ok" },
  { id: "CAM_030", lng: 77.216742, lat: 28.631429, status: "ok" },
  { id: "CAM_031", lng: 77.180753, lat: 28.623721, status: "ok" },
  { id: "CAM_032", lng: 77.211898, lat: 28.579605, status: "ok" },
  { id: "CAM_033", lng: 77.219075, lat: 28.598152, status: "ok" },
  { id: "CAM_034", lng: 77.212901, lat: 28.58947, status: "ok" },
  { id: "CAM_035", lng: 77.218006, lat: 28.635257, status: "ok" },
  { id: "CAM_036", lng: 77.180723, lat: 28.650799, status: "ok" },
  { id: "CAM_037", lng: 77.241272, lat: 28.583479, status: "ok" },
  { id: "CAM_038", lng: 77.220778, lat: 28.574895, status: "ok" },
  { id: "CAM_039", lng: 77.171076, lat: 28.578669, status: "ok" },
  { id: "CAM_040", lng: 77.192919, lat: 28.645316, status: "ok" },
  { id: "CAM_041", lng: 77.206922, lat: 28.643647, status: "ok" },
  { id: "CAM_042", lng: 77.222897, lat: 28.599316, status: "ok" },
  { id: "CAM_043", lng: 77.224964, lat: 28.598825, status: "ok" },
  { id: "CAM_044", lng: 77.177098, lat: 28.645556, status: "ok" },
  { id: "CAM_045", lng: 77.179424, lat: 28.636288, status: "ok" },
  { id: "CAM_046", lng: 77.25262, lat: 28.580601, status: "ok" },
  { id: "CAM_047", lng: 77.215391, lat: 28.654588, status: "ok" },
  { id: "CAM_048", lng: 77.170254, lat: 28.643475, status: "ok" },
  { id: "CAM_049", lng: 77.229158, lat: 28.6031, status: "ok" },
  { id: "CAM_050", lng: 77.176582, lat: 28.575484, status: "ok" },
  { id: "CAM_051", lng: 77.189969, lat: 28.644789, status: "ok" },
  { id: "CAM_052", lng: 77.235621, lat: 28.627139, status: "ok" },
  { id: "CAM_053", lng: 77.180001, lat: 28.574166, status: "ok" },
  { id: "CAM_054", lng: 77.22449, lat: 28.570271, status: "ok" },
  { id: "CAM_055", lng: 77.187017, lat: 28.647978, status: "ok" },
  { id: "CAM_056", lng: 77.206748, lat: 28.571676, status: "ok" },
  { id: "CAM_057", lng: 77.205154, lat: 28.650661, status: "ok" },
  { id: "CAM_058", lng: 77.22026, lat: 28.651641, status: "ok" },
  { id: "CAM_059", lng: 77.240317, lat: 28.580383, status: "ok" },
  { id: "CAM_060", lng: 77.243664, lat: 28.646097, status: "ok" },
];

export const CAMERAS = {
  type: "FeatureCollection",
  features: CAM_SITES.map((c) => ({
    type: "Feature",
    properties: { id: c.id, status: c.status },
    geometry: { type: "Point", coordinates: [c.lng, c.lat] },
  })),
};