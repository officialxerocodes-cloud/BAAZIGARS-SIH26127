import { HEAT_POINTS, CAMERAS } from "../data/delhi";

// ---------------------------------------------------------------------
// Offshore-friendly vector fallback: a stylized SVG of Delhi NCR.
// Geographic projection of real coordinates, so it lines up with the
// MapLibre version once tile access is back. Arbitrary pins/heats/cams.
// ---------------------------------------------------------------------

const W = 1000;
const H = 820;

const BBOX = {
  minLng: 77.02,
  minLat: 28.42,
  maxLng: 77.37,
  maxLat: 28.75,
};
const spanLng = BBOX.maxLng - BBOX.minLng;
const spanLat = BBOX.maxLat - BBOX.minLat;
// preserve aspect so Delhi doesn't look squashed
const scale = Math.min(W / spanLng, H / spanLat);
const cx = (BBOX.minLng + BBOX.maxLng) / 2;
const cy = (BBOX.minLat + BBOX.maxLat) / 2;

const proj = (lng, lat) => [
  W / 2 + (lng - cx) * scale,
  H / 2 - (lat - cy) * scale,
];

const toPath = (pts) =>
  pts.map((p, i) => `${i === 0 ? "M" : "L"}${proj(p[0], p[1]).map((n) => n.toFixed(1)).join(" ")}`).join(" ");

// ---- road network (approx arterial alignments, real coordinates) ----
const ROADS = {
  outerRing: [
    [77.13, 28.7], [77.19, 28.72], [77.25, 28.69], [77.28, 28.66],
    [77.29, 28.6], [77.26, 28.52], [77.19, 28.49], [77.13, 28.5],
    [77.09, 28.53], [77.05, 28.58], [77.05, 28.63], [77.08, 28.68],
  ],
  innerRing: [
    [77.16, 28.65], [77.22, 28.657], [77.26, 28.63], [77.265, 28.6],
    [77.24, 28.55], [77.17, 28.545], [77.135, 28.59], [77.14, 28.63],
  ],
  nS: [[77.2167, 28.6315], [77.212, 28.60], [77.2093, 28.5696], [77.2062, 28.5244]],
  karnal: [[77.224, 28.73], [77.219, 28.68], [77.2167, 28.6315]],
  gurgaon: [[77.2093, 28.5696], [77.19, 28.54], [77.15, 28.51], [77.08, 28.49]],
  noida: [[77.2167, 28.6315], [77.24, 28.625], [77.27, 28.61], [77.31, 28.60]],
  akshardham: [[77.2284, 28.6698], [77.25, 28.65], [77.2833, 28.6217]],
  outerOuter: [
    [77.11, 28.74], [77.3, 28.72], [77.32, 28.66], [77.3, 28.59],
    [77.3, 28.51], [77.17, 28.46], [77.03, 28.48], [77.02, 28.5],
  ],
};

const HIGHWAYS = [
  ROADS.outerRing,
  ROADS.outerOuter,
  ROADS.innerRing,
];

const ARTERIALS = [
  ROADS.nS,
  ROADS.karnal,
  ROADS.gurgaon,
  ROADS.noida,
  ROADS.akshardham,
];

// ---- Yamuna (east edge, flowing south along the border) ----
const YAMUNA = [
  [77.24, 28.735], [77.26, 28.7], [77.27, 28.66], [77.28, 28.62],
  [77.275, 28.58], [77.27, 28.54], [77.26, 28.5],
];

const RIVER = [
  [77.255, 28.74], [77.275, 28.7], [77.285, 28.66], [77.295, 28.62],
  [77.29, 28.58], [77.28, 28.54], [77.27, 28.5], [77.26, 28.455],
];

// ---- labels ----
const LABELS = [
  { name: "ROHINI", lng: 77.12, lat: 28.713, dx: -34, dy: 16 },
  { name: "KAROL BAGH", lng: 77.18, lat: 28.647, dx: -26, dy: 22 },
  { name: "CONNAUGHT PLACE", lng: 77.2167, lat: 28.6315, dx: 10, dy: -18 },
  { name: "INDIA GATE", lng: 77.2295, lat: 28.6129, dx: 8, dy: 24 },
  { name: "AIIMS", lng: 77.2093, lat: 28.5696, dx: -64, dy: 4 },
  { name: "NEHRU PLACE", lng: 77.2517, lat: 28.5486, dx: 12, dy: -6 },
  { name: "SAKET", lng: 77.2062, lat: 28.5244, dx: 12, dy: -20 },
  { name: "DWARKA SEC-6", lng: 77.0833, lat: 28.595, dx: -44, dy: -4 },
  { name: "IGI AIRPORT", lng: 77.0257, lat: 28.5588, dx: 16, dy: -16 },
  { name: "NOIDA EDGE", lng: 77.31, lat: 28.5708, dx: 4, dy: 16 },
];

const PARKS = [
  [77.1916, 28.5963, 13], // Lodhi Garden
  [77.2295, 28.6129, 15], // India Gate lawns
  [77.228, 28.628, 8],    // CP central park
  [77.25, 28.551, 7],     // Nehru Place green
  [77.05, 28.63, 10],     // outer veg patch
  [77.33, 28.62, 11],     // Akshardham greens
];

export default function DelhiVectorMap({
  showHeat = true,
  showCams = true,
  zoom = 1,
  route = null,
}) {
  const z = Math.min(Math.max(zoom, 1), 8);
  const t = `translate(${W / 2} ${H / 2}) scale(${z}) translate(${-W / 2} ${-H / 2})`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 w-full h-full"
      role="img"
      aria-label="Vector map of Delhi National Capital Territory"
    >
      <defs>
        <radialGradient id="delhi-bg" cx="50%" cy="42%" r="75%">
          <stop offset="0%" stopColor="#eef3fc" />
          <stop offset="70%" stopColor="#dce7f7" />
          <stop offset="100%" stopColor="#c9d9f0" />
        </radialGradient>
        <radialGradient id="heat-red">
          <stop offset="0%" stopColor="rgba(255,61,0,0.60)" stopOpacity="1" />
          <stop offset="100%" stopColor="rgba(255,61,0,0)" />
        </radialGradient>
        <radialGradient id="heat-green">
          <stop offset="0%" stopColor="rgba(0,200,83,0.55)" />
          <stop offset="100%" stopColor="rgba(0,200,83,0)" />
        </radialGradient>
        <radialGradient id="heat-amber">
          <stop offset="0%" stopColor="rgba(255,179,0,0.6)" />
          <stop offset="100%" stopColor="rgba(255,179,0,0)" />
        </radialGradient>
      </defs>

      <rect width={W} height={H} fill="url(#delhi-bg)" />

      {/* NCT border */}
      <rect
        x={proj(BBOX.minLng, BBOX.maxLat)[0]}
        y={proj(BBOX.minLng, BBOX.maxLat)[1]}
        width={proj(BBOX.maxLng, BBOX.minLat)[0] - proj(BBOX.minLng, BBOX.maxLat)[0]}
        height={proj(BBOX.maxLng, BBOX.minLat)[1] - proj(BBOX.minLng, BBOX.maxLat)[1]}
        fill="none"
        stroke="#0B3D91"
        strokeOpacity="0.18"
        strokeDasharray="7 7"
      />

      <g transform={t}>
        {/* faint graticule */}
        {Array.from({ length: 6 }).map((_, i) => {
          const lng = BBOX.minLng + (spanLng * (i + 1)) / 7;
          const [x0] = proj(lng, BBOX.minLat);
          const [x1] = proj(lng, BBOX.maxLat);
          return <line key={`gl${i}`} x1={x0} y1={proj(lng, BBOX.minLat)[1]} x2={x1} y2={proj(lng, BBOX.maxLat)[1]} stroke="#0B3D91" strokeOpacity="0.06" />;
        })}
        {Array.from({ length: 6 }).map((_, i) => {
          const lat = BBOX.minLat + (spanLat * (i + 1)) / 7;
          const [x0, y0] = proj(BBOX.minLng, lat);
          const [x1, y1] = proj(BBOX.maxLng, lat);
          return <line key={`glt${i}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#0B3D91" strokeOpacity="0.06" />;
        })}

        {/* Yamuna */}
        <path d={toPath(YAMUNA)} fill="#89CFF0" stroke="#5FB0DD" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
        <path d={toPath(RIVER)} fill="none" stroke="#1E6FB8" strokeOpacity="0.25" strokeWidth="1.2" strokeDasharray="4 6" />

        {/* parks */}
        {PARKS.map(([lng, lat, r], i) => {
          const [x, y] = proj(lng, lat);
          return <circle key={`pk${i}`} cx={x} cy={y} r={r} fill="#BDF0C6" stroke="#7BD292" strokeWidth="1.2" opacity="0.85" />;
        })}

        {/* roads */}
        {HIGHWAYS.map((road, i) => (
          <path key={`hw${i}`} d={toPath(road)} fill="none" stroke="#6B84B4" strokeWidth="5.5" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {HIGHWAYS.map((road, i) => (
          <path key={`hwl${i}`} d={toPath(road)} fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="10 7" opacity="0.8" />
        ))}
        {ARTERIALS.map((road, i) => (
          <path key={`ar${i}`} d={toPath(road)} fill="none" stroke="#8FA6D0" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {ARTERIALS.map((road, i) => (
          <path key={`arl${i}`} d={toPath(road)} fill="none" stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6 5" opacity="0.75" />
        ))}

        {/* heat zones */}
        {showHeat &&
          HEAT_POINTS.features.map((f, i) => {
            const [lng, lat] = f.geometry.coordinates;
            const weight = f.properties.weight;
            const [x, y] = proj(lng, lat);
            const grad =
              weight >= 0.7 ? "url(#heat-red)" : weight >= 0.5 ? "url(#heat-amber)" : "url(#heat-green)";
            const r = 16 + weight * 30;
            return (
              <circle
                key={`h${i}`}
                cx={x}
                cy={y}
                r={r}
                fill={grad}
                opacity={0.35 + weight * 0.55}
              />
            );
          })}

        {/* cameras */}
        {showCams &&
          CAMERAS.features.map((f, i) => {
            const [x, y] = proj(f.geometry.coordinates[0], f.geometry.coordinates[1]);
            const ok = f.properties.status === "ok";
            const color = ok ? "#00C853" : "#ef4444";
            return (
              <g key={`c${i}`}>
                <circle cx={x} cy={y} r="11" fill={color} opacity="0.18" />
                {ok && i % 4 === 0 && <circle className="cam-ping" cx={x} cy={y} r="7" fill={color} opacity="0.6" />}
                <circle cx={x} cy={y} r="4.5" fill={color} stroke="#ffffff" strokeWidth="1.6" />
                <title>{f.properties.id}</title>
              </g>
            );
          })}

        {/* trajectory route */}
        {route && route.length > 1 && (
          <g>
            <path
              d={toPath(route)}
              fill="none"
              stroke="#ffffff"
              strokeWidth="6"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity="0.85"
            />
            <path
              d={toPath(route)}
              fill="none"
              stroke="#00C853"
              strokeWidth="3"
              strokeDasharray="7 6"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {route[0] && (() => {
              const [x, y] = proj(route[0][0], route[0][1]);
              return <circle cx={x} cy={y} r="5" fill="#0B3D91" stroke="#ffffff" strokeWidth="2" />;
            })()}
            {route[route.length - 1] && (() => {
              const [x, y] = proj(route[route.length - 1][0], route[route.length - 1][1]);
              return (
                <g>
                  <circle className="cam-ping" cx={x} cy={y} r="9" fill="#00C853" opacity="0.5" />
                  <circle cx={x} cy={y} r="5.5" fill="#00C853" stroke="#ffffff" strokeWidth="2" />
                </g>
              );
            })()}
          </g>
        )}

        {/* labels */}
        {LABELS.map((l, i) => {
          const [x, y] = proj(l.lng, l.lat);
          return (
            <g key={`lb${i}`}>
              <circle cx={x} cy={y} r="2" fill="#0B3D91" opacity="0.7" />
              <text
                x={x + l.dx}
                y={y + l.dy + 3}
                fontFamily="Inter, system-ui, sans-serif"
                fontSize="10"
                fontWeight="800"
                letterSpacing="1.5"
                fill="#0B3D91"
                opacity="0.55"
              >
                {l.name}
              </text>
            </g>
          );
        })}
      </g>

      {/* static chrome — north arrow, NCR tag */}
      <g opacity="0.7">
        <g transform={`translate(${W - 62} ${40})`}>
          <path d="M0 6 L7 -6 L14 6 Z" fill="#0B3D91" />
          <text x="7" y="24" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="800" fill="#0B3D91" letterSpacing="1">
            N
          </text>
        </g>
        <text x="26" y="34" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="800" letterSpacing="3" fill="#0B3D91">
          DELHI NCR · 28.61°N 77.21°E
        </text>
      </g>
    </svg>
  );
}