// =====================================================================
// SINGLE SOURCE OF TRUTH FOR THE DASHBOARD
// Edit any value here and every component that uses it updates.
// Later you can swap these for real API calls (see comments below).
// =====================================================================

export const siteInfo = {
  brand: "TRINETRA",
  tagline: "National Vehicle Intelligence & Surveillance",
  officer: "Insp. R. Sharma",
  station: "National Control Room · New Delhi",
  logoUrl:
    "https://lh3.googleusercontent.com/aida/AEtjO1V1EeEthq5QjytdWjndbtynLXNzePR68U1zu-vYN9P2NeEIbcHnLSByzqNb-b2eWlN07VQc5WdrPzwDGZKg8oNyYRR8nnbKcBDl47gPwOv4k8RsUfoP4BvRq_NVWDf9nLdP2wrj6FRC9pw5lQ8WfV4ESXyHIbZBgWo6BZJaG1Zhy4kVQf_QVnITNS4nXJgSdJfw6rojw8XeiMJFoxKLoijhmBgOXYQGE3QfTfI71qEI6ip8p54m5X7IfTNd",
  avatarUrl:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuC-o1fJHc44EiwpbwPXQgMjDRTpUZvRR06uyFedMrHatByXluY67vgAI9dIChA311IIOKqe8ew9Cc_PTO4bVo9FX1C6wCGpAw3SddbZHznxB26wpie_V8a3BeE-g315JuaqrsFFL_GbbkcP5GaAah8XilGaCNf636k5tqYi2R0Pet3qq6UNe67y1fJ784qLYVEfW85i0A9hsI_uea82YhwjyUDjgQeiyUqHH_1v3ycvRzrndQbNrFfxvQ",
};

// Full-screen intro shown on first load.
export const splashContent = {
  brand: "TRINETRA",
  kicker: "NATIONAL SMART TRAFFIC SURVEILLANCE GRID",
  tagline: "One eye for every road. Watch. Track. Protect.",
  subline:
    "An automated vehicle intelligence network trusted by law enforcement across India — reading plates, reconstructing journeys, and guarding every junction on the national grid.",
  trustRow: ["MINISTRY OF HOME AFFAIRS", "SMART INDIA HACKATHON 2026", "NATIONAL SURVEILLANCE GRID"],
};

export const navLinks = [
  { label: "Dashboard", path: "dashboard", active: true },
  { label: "Trajectory Search", path: "trajectory-search" },
  { label: "Analytics", path: "analytics" },
  { label: "Alerts", path: "alerts" },
  { label: "Reports", path: "reports" },
];

export const heroContent = {
  badge: "NATIONAL SMART TRAFFIC SURVEILLANCE GRID",
  heading: "One Eye for Every Road",
  tagline: "AI-Powered National Vehicle Intelligence & Surveillance",
  description:
    "A trusted, high-throughput ANPR and trajectory-reconstruction network for law enforcement — reading every plate, reconstructing every journey, and guarding every junction, round the clock.",
  primaryCta: { label: "Trace a Vehicle", icon: "travel_explore", to: "trajectory" },
  secondaryCta: { label: "Dashboard Overview", icon: "monitoring", to: "#dashboard-stats" },
};

// Stat chips shown under the hero description
export const statChips = [
  { id: "cameras", icon: "videocam", label: "Cameras Online", value: "342/350", dotColor: "#16a34a" },
  { id: "plates", icon: "directions_car", label: "Plates Scanned Today", value: "1.2M", valueColor: "text-blue-700" },
  { id: "accuracy", icon: "target", label: "OCR Accuracy", value: "94.3%", valueColor: "text-emerald-700" },
];

// Replace this with a real map/tile image or your own screenshot any time.
export const mapConfig = {
  imageUrl:
    "https://staticmap.openstreetmap.de/staticmap.php?center=28.6139,77.2090&zoom=11&size=1400x800&maptype=mapnik",
  liveFeedLabel: "LIVE MAP FEED • LATENCY 42ms",
  layers: ["Streets", "Heatmap"],
  legend: [
    { color: "#00C853", label: "Active ANPR (342)" },
    { color: "#ba1a1a", label: "Camera Offline (8)" },
  ],
};

// KPI cards row
export const kpiCards = [
  {
    id: "blacklisted",
    title: "Blacklisted Vehicles Detected",
    metric: "7",
    icon: "warning",
    accent: "#DC2626",
    iconBg: "bg-red-100",
    iconColor: "text-[#DC2626]",
    trend: { label: "▲ +2 today", className: "bg-red-50 text-[#DC2626]" },
    subtitle: "Hotlist hits active",
  },
  {
    id: "plates-scanned",
    title: "Total Plates Scanned",
    metric: "1,204,532",
    icon: "directions_car",
    accent: "#2563EB",
    iconBg: "bg-blue-100",
    iconColor: "text-[#2563EB]",
    subtitle: "Today (since 00:00 IST)",
  },
  {
    id: "ocr-accuracy",
    title: "OCR Accuracy Rate",
    metric: "94.3%",
    icon: "target",
    accent: "#16A34A",
    iconBg: "bg-emerald-100",
    iconColor: "text-[#16A34A]",
    sparkline: [4, 6, 5, 8, 7, 9, 10, 9, 11, 12],
  },
  {
    id: "congestion-zones",
    title: "Active Congestion Zones",
    metric: "5",
    icon: "traffic",
    accent: "#F59E0B",
    iconBg: "bg-amber-100",
    iconColor: "text-[#D97706]",
    subtitle: "Avg delay +14 mins",
  },
  {
    id: "avg-speed",
    title: "Avg City-Wide Speed",
    metric: "38 km/h",
    icon: "speed",
    accent: "#0B3D91",
    iconBg: "bg-indigo-100",
    iconColor: "text-[#0B3D91]",
    subtitle: "Normal flow (+3 km/h vs avg)",
  },
  {
    id: "cameras-online",
    title: "Cameras Online",
    metric: "342/350",
    icon: "videocam",
    accent: "#64748B",
    iconBg: "bg-slate-100",
    iconColor: "text-[#64748B]",
    progress: 97.7,
    subtitle: "97.7% uptime",
  },
];

// Live alert feed rows
export const alertSeverities = ["All", "Critical", "Warning", "Info"];

export const liveAlerts = [
  {
    id: "a1",
    severity: "Critical",
    dotColor: "#dc2626",
    plate: "DL 01 AB 1234",
    tag: "HOTLIST FIR #492/2026",
    tagClass: "bg-red-100 text-[#dc2626]",
    description: "Stolen Vehicle Flagged — Intercept Authorized",
    location: "Camera #023 • Ring Road Sector 7 Northbound",
    speed: "64 km/h",
    time: "2 min ago",
    action: { label: "Dispatch Intercept", icon: "local_police", className: "bg-[#dc2626] hover:bg-[#b91c1c] text-white" },
    rowClass: "bg-red-50/60 hover:bg-red-50 border-l-[#dc2626]",
  },
  {
    id: "a2",
    severity: "Warning",
    dotColor: "#f59e0b",
    plate: "HR 26 DQ 8821",
    tag: "OVER-SPEEDING",
    tagClass: "bg-amber-100 text-[#b45309]",
    description: "Unregistered Commercial Transit — Automated Speed Trap Breach",
    location: "Camera #114 • Expressway Toll Plaza Gate 4",
    speed: "92 km/h in 60 zone",
    time: "6 min ago",
    action: { label: "Issue E-Challan", icon: "receipt_long", className: "bg-slate-100 hover:bg-slate-200 text-[#0B3D91]" },
    rowClass: "bg-amber-50/50 hover:bg-amber-50 border-l-[#f59e0b]",
  },
  {
    id: "a3",
    severity: "Critical",
    dotColor: "#dc2626",
    plate: "UP 16 Z 9002",
    tag: "COURT WARRANT MATCH",
    tagClass: "bg-red-100 text-[#dc2626]",
    description: "Suspended License / Active Non-Bailable Court Summons",
    location: "Camera #087 • Connaught Circle Outer Gate",
    speed: "32 km/h",
    time: "14 min ago",
    action: { label: "View Trajectory", icon: "route", className: "bg-slate-100 hover:bg-slate-200 text-slate-800" },
    rowClass: "bg-white hover:bg-slate-50 border-l-[#dc2626]",
  },
  {
    id: "a4",
    severity: "Info",
    dotColor: "#2563eb",
    plate: "MH 02 CK 4410",
    tag: "GREEN CORRIDOR",
    tagClass: "bg-blue-100 text-[#2563eb]",
    description: "VIP / Emergency Green Corridor Detected (Ambulance Unit 12)",
    location: "Camera #045 • Metro Corridor Flyover",
    speed: null,
    time: "21 min ago",
    action: { label: "Prioritize Signal", icon: "priority_high", className: "bg-slate-100 hover:bg-slate-200 text-slate-800" },
    rowClass: "bg-blue-50/50 hover:bg-blue-50 border-l-[#2563eb]",
  },
  {
    id: "a5",
    severity: "Warning",
    dotColor: "#f59e0b",
    plate: "DL 04 EF 7731",
    tag: "FITNESS LAPSED",
    tagClass: "bg-amber-100 text-[#b45309]",
    description: "Expired Fitness Certificate & Heavy Diesel Restriction Zone",
    location: "Camera #201 • Industrial Area Checkpost",
    speed: null,
    time: "35 min ago",
    action: { label: "Details", icon: "info", className: "bg-slate-100 hover:bg-slate-200 text-slate-800" },
    rowClass: "bg-white hover:bg-slate-50 border-l-[#f59e0b]",
  },
];

// Density / hotspot analysis
export const chokePoints = [
  { id: "c1", name: "Sector 18 Flyover Choke", pct: 88, level: "Critical", speed: "12 km/h", color: "#dc2626" },
  { id: "c2", name: "South Ext Ring Road Incline", pct: 74, level: "High", speed: "19 km/h", color: "#ea580c" },
  { id: "c3", name: "Expressway Toll Gate Plaza", pct: 62, level: "Moderate", speed: "28 km/h", color: "#f59e0b" },
  { id: "c4", name: "Metro Junction Pillar 124", pct: 45, level: "Normal", speed: "42 km/h", color: "#16a34a" },
];

export const peakHours = [
  { hour: "06h", value: 20 },
  { hour: "09h", value: 90 },
  { hour: "12h", value: 45 },
  { hour: "15h", value: 40 },
  { hour: "18h", value: 100 },
  { hour: "21h", value: 30 },
];

// 24h traffic volume chart (Chart.js line data)
export const volumeChart = {
  labels: ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "23:59"],
  data: [8000, 6000, 62000, 40000, 45000, 84200, 30000],
  totalDaily: "1.48M Vehicles",
  peakLabel: "Peak: 09:30 & 18:15 IST",
  peakTooltip: "Peak: 84,200 veh/hr (18:30)",
  congestionThreshold: 75000,
};

// Vehicle search panel
export const searchPanel = {
  heading: "Track a Vehicle",
  subtitle:
    "Instant AI trajectory reconstruction, camera sequence matching, and historical journey replay",
  placeholder: "Enter license plate number (e.g. DL01AB1234, HR26DQ8821, UP16Z9002)...",
  tabs: ["By Plate Number", "By Time Range", "By Camera Zone"],
  helperText:
    "Supported formats: All Indian High Security Registration Plates (HSRP), Diplomatic, and Commercial series.",
  recentLookups: ["HR 26 DQ 8821", "UP 16 Z 9002"],
};

// Recent trajectory searches table
export const recentSearches = [
  {
    id: "r1",
    plate: "DL 01 AB 1234",
    model: "White Sedan (Maruti Dzire)",
    location: "Camera #023, Sector 7 Junction",
    speed: "64 km/h",
    direction: "North",
    time: "2 mins ago",
    status: "Blacklisted (FIR Active)",
    statusClass: "bg-red-100 text-[#dc2626]",
  },
  {
    id: "r2",
    plate: "KA 05 MN 9920",
    model: "Commercial Truck (Tata 407)",
    location: "Camera #302, Toll Gate North",
    speed: "48 km/h",
    direction: "Outbound",
    time: "18 mins ago",
    status: "Clear / Verified",
    statusClass: "bg-emerald-100 text-[#16a34a]",
  },
  {
    id: "r3",
    plate: "HR 26 DQ 8821",
    model: "Silver SUV (Hyundai Creta)",
    location: "Camera #114, Express Flyover",
    speed: "92 km/h",
    direction: "South",
    time: "42 mins ago",
    status: "Speed Violation",
    statusClass: "bg-amber-100 text-[#b45309]",
  },
  {
    id: "r4",
    plate: "UP 16 Z 9002",
    model: "Black Hatchback (Swift)",
    location: "Camera #087, Connaught Circle",
    speed: "32 km/h",
    direction: "East",
    time: "1 hr ago",
    status: "Warrant Active",
    statusClass: "bg-red-100 text-[#dc2626]",
  },
  {
    id: "r5",
    plate: "DL 3C BC 5541",
    model: "Electric Auto (Mahindra Treo)",
    location: "Camera #012, Railway Checkpost",
    speed: "22 km/h",
    direction: "West",
    time: "2 hrs ago",
    status: "Clear / Verified",
    statusClass: "bg-emerald-100 text-[#16a34a]",
  },
];

export const footerInfo = {
  project: "TRINETRA | Smart India Hackathon 2026 — Traffic Law Enforcement & Telemetry Wing",
  stack: ["React 19", "Chart.js", "ANPR Engine", "FastAPI Edge"],
  helpline: "Toll-Free 1800-11-TRINETRA",
  version: "v3.0.0",
};
