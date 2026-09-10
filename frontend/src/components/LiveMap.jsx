import { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap, AttributionControl, config } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  DELHI_CENTER,
  MAP_STYLE_URL,
  HEAT_POINTS,
  CAMERAS,
} from "../data/delhi";
import DelhiVectorMap from "./DelhiVectorMap";

const STYLE_BRIGHT = "https://tiles.openfreemap.org/styles/bright";

// MapLibre's web worker is bundled by Vite into public/ (see package.json
// `postinstall: copy:maplibre-worker`). Without an explicit URL the map
// resolves the worker relative to the JS chunk and fails to initialize —
// the page then degrades to the SVG fallback below. Never remove this.
config.WORKER_URL = "/maplibre-gl-worker.mjs";

const HEAT_COLOR = [
  "interpolate",
  ["linear"],
  ["heatmap-density"],
  0, "rgba(0, 200, 83, 0)",
  0.3, "rgba(170, 255, 100, 0.55)",
  0.5, "rgba(255, 213, 79, 0.7)",
  0.7, "rgba(255, 140, 0, 0.85)",
  0.9, "rgba(255, 61, 0, 0.95)",
];

function addGridLayers(map, heatData = HEAT_POINTS, camsData = CAMERAS) {
  if (map.getSource("heat")) return;
  map.addSource("heat", { type: "geojson", data: heatData });
  map.addLayer({
    id: "heat",
    type: "heatmap",
    source: "heat",
    paint: {
      "heatmap-weight": ["get", "weight"],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1.1, 10, 1.7],
      "heatmap-color": HEAT_COLOR,
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 16, 10, 48],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.85, 12, 0.5],
    },
  });

  map.addSource("cams", { type: "geojson", data: camsData });
  map.addLayer({
    id: "cams-ok",
    type: "circle",
    source: "cams",
    filter: ["==", ["get", "status"], "ok"],
    paint: {
      "circle-radius": 5.5,
      "circle-color": "#00C853",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.6,
    },
  });
  map.addLayer({
    id: "cams-off",
    type: "circle",
    source: "cams",
    filter: ["==", ["get", "status"], "off"],
    paint: {
      "circle-radius": 5.5,
      "circle-color": "#ef4444",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.6,
    },
  });
}

function ensureRouteLayer(map) {
  if (map.getSource("troute")) return;
  map.addSource("troute", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: "troute-casing",
    type: "line",
    source: "troute",
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 9],
      "line-opacity": 0.9,
    },
  });
  map.addLayer({
    id: "troute-line",
    type: "line",
    source: "troute",
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": "#00C853",
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3, 14, 6],
      "line-opacity": 0.95,
      "line-dasharray": [1.6, 1.1],
    },
  });
  map.addLayer({
    id: "troute-end",
    type: "circle",
    source: "troute",
    filter: ["==", "$type", "Point"],
    paint: {
      "circle-radius": 6.5,
      "circle-color": "#00C853",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
}

function applyRoute(map, route) {
  if (!map || !map.getSource("troute")) return;
  map.getSource("troute").setData({
    type: "FeatureCollection",
    features: route.length
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: route },
          },
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: route[route.length - 1] },
          },
        ]
      : [],
  });
  if (route.length > 1) {
    const b = route.reduce(
      (a, c) => [
        Math.min(a[0], c[0]),
        Math.min(a[1], c[1]),
        Math.max(a[2], c[0]),
        Math.max(a[3], c[1]),
      ],
      [Infinity, Infinity, -Infinity, -Infinity]
    );
    map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: 90, maxZoom: 13.2, duration: 1100 }
    );
  }
}

const TOGGLES = [
  { id: "streets", label: "Streets" },
  { id: "heatmap", label: "Heatmap" },
  { id: "cameras", label: "Cameras" },
];

/**
 * LiveMap — MapLibre GL vector map of Delhi. WebGL heat zones from
 * congestion points, camera markers, floating layer toggles + zoom.
 * Fully interactive (drag / scroll-zoom); overlays never block it.
 */
export default function LiveMap({
  route = null,
  routeKey = "",
  trackingLabel = null,
  // Live overrides for the static grid layers. Null keeps the bundled
  // Delhi fixtures (offline/demo mode).
  camerasGeo = null,
  heatGeo = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const routeRef = useRef(route);
  const layersRef = useRef({
    heat: heatGeo?.features?.length ? heatGeo : HEAT_POINTS,
    cams: camerasGeo?.features?.length ? camerasGeo : CAMERAS,
  });
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [svgZoom, setSvgZoom] = useState(1);
  const [active, setActive] = useState({
    streets: true,
    heatmap: true,
    cameras: true,
  });

  useEffect(() => {
    const loadedRef = { current: false };
    let map = null;
    let failTimer = null;
    let attempts = 0;

    const boot = () => {
      attempts += 1;
      try {
        map = new MaplibreMap({
          container: containerRef.current,
          style: MAP_STYLE_URL,
          center: [DELHI_CENTER.lng, DELHI_CENTER.lat],
          zoom: 10.4,
          attributionControl: false,
          maxZoom: 17,
        });
      } catch (err) {
        console.error(`[LiveMap] constructor failed (attempt ${attempts}):`, err);
        return fail();
      }
      mapRef.current = map;
      map.addControl(new AttributionControl({ compact: true }), "bottom-right");
      map.on("error", (e) => console.error("[LiveMap] map error:", e?.error || e));

      clearTimeout(failTimer);
      failTimer = setTimeout(() => fail(), 20000);

      map.on("load", () => {
        loadedRef.current = true;
        clearTimeout(failTimer);
        addGridLayers(map, layersRef.current.heat, layersRef.current.cams);
        ensureRouteLayer(map);
        applyRoute(map, routeRef.current || []);
        setStatus("ready");
        setTimeout(() => map.resize(), 60);
      });
      map.on("style.load", () => {
        if (loadedRef.current) {
          addGridLayers(map, layersRef.current.heat, layersRef.current.cams);
          ensureRouteLayer(map);
          applyRoute(map, routeRef.current || []);
        }
      });
    };

    const fail = () => {
      if (loadedRef.current) return;
      // One retry: tile/style fetches flake on slow networks.
      if (attempts < 2) {
        console.warn(`[LiveMap] load timeout (attempt ${attempts}), retrying…`);
        try {
          map?.remove();
        } catch {
          // ignore
        }
        mapRef.current = null;
        boot();
        return;
      }
      try {
        map?.remove();
      } catch {
        // ignore
      }
      mapRef.current = null;
      setStatus("error");
    };

    boot();

    return () => {
      clearTimeout(failTimer);
      try {
        map?.remove();
      } catch {
        // ignore
      }
      mapRef.current = null;
    };
  }, []);

  // Apply toggle visibility from state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const setVis = (layerId, on) => {
      if (!map.getLayer(layerId)) return;
      map.setLayoutProperty(layerId, "visibility", on ? "visible" : "none");
    };
    setVis("heat", active.heatmap);
    setVis("cams-ok", active.cameras);
    setVis("cams-off", active.cameras);
  }, [active]);

  // Keep latest route for the async-loaded map; redraw on changes.
  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  // Swap in live grid layers when the registry/heatmap arrive. The bundled
  // fixtures stay until live data is present, so the map never goes blank.
  useEffect(() => {
    if (heatGeo?.features?.length) layersRef.current.heat = heatGeo;
    if (camerasGeo?.features?.length) layersRef.current.cams = camerasGeo;
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    try {
      if (heatGeo && map.getSource("heat")) map.getSource("heat").setData(heatGeo);
      if (camerasGeo && map.getSource("cams")) map.getSource("cams").setData(camerasGeo);
    } catch {
      // layer not ready yet; the load handler applies latest on ready
    }
  }, [heatGeo, camerasGeo, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && status === "ready") applyRoute(map, route || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  const toggle = (id) => {
    const next = { ...active, [id]: !active[id] };
    setActive(next);

    // Streets swaps the vector styling between two basemaps.
    if (id === "streets") {
      const map = mapRef.current;
      if (!map) return;
      const brightness = !next.streets; // streets off -> brighter base
      if (map.isStyleLoaded()) {
        map.setStyle(brightness ? STYLE_BRIGHT : MAP_STYLE_URL);
      }
    }
  };

  const zoom = (dir) => {
    if (status === "error") {
      setSvgZoom((z) =>
        Math.min(Math.max(Number((z * (dir > 0 ? 1.4 : 1 / 1.4)).toFixed(3)), 1), 8)
      );
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    dir > 0 ? map.zoomIn() : map.zoomOut();
  };

  return (
    <>
      {status === "error" ? (
        <DelhiVectorMap
          showHeat={active.heatmap}
          showCams={active.cameras}
          zoom={svgZoom}
          route={route}
        />
      ) : (
        <div ref={containerRef} className="absolute inset-0" />
      )}

      {status !== "error" && trackingLabel && (
        <div className="absolute top-5 left-5 z-20 flex items-center gap-2 bg-navy-deep/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow pointer-events-none">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-signal" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white">
            {trackingLabel}
          </span>
        </div>
      )}

      {status === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none bg-[radial-gradient(circle_at_50%_50%,#e8eef7,#dbe6f2)]">
          <span className="px-4 py-2 rounded-full bg-white/80 backdrop-blur text-navy text-xs font-semibold tracking-wide shadow">
            Loading national grid…
          </span>
        </div>
      )}
      {status === "error" && (
        <div className="absolute top-5 left-5 z-20 flex items-center gap-2 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
            Offline preview
          </span>
        </div>
      )}

      {/* Layer toggles */}
      <div className="absolute top-5 right-5 z-30 flex items-center gap-1.5 bg-white/90 backdrop-blur-md p-1 rounded-xl shadow-lg pointer-events-auto">
        {TOGGLES.map((t) => {
          const disabled = t.id === "streets" && status === "error";
          return (
            <button
              key={t.id}
              onClick={() => toggle(t.id)}
              disabled={disabled}
              title={disabled ? "Vector basemap offline" : t.label}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                active[t.id] && !disabled
                  ? "bg-navy text-white shadow-sm"
                  : disabled
                    ? "text-slate-300 cursor-not-allowed"
                    : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          );
        })}
        <div className="h-4 w-px bg-slate-200 mx-0.5" />
        <button
          onClick={() => zoom(1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
          aria-label="Zoom in"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
        </button>
        <button
          onClick={() => zoom(-1)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
          aria-label="Zoom out"
        >
          <span className="material-symbols-outlined text-[18px]">remove</span>
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-5 left-5 z-30 hidden md:flex items-center gap-3 bg-white/90 backdrop-blur-md px-3 py-2 rounded-xl shadow-lg pointer-events-none">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#00C853]" />
          <span className="text-[11px] font-semibold text-slate-800">Active</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
          <span className="text-[11px] font-semibold text-slate-800">Offline</span>
        </div>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500">Congestion</span>
          <div className="w-20 h-1.5 rounded-full bg-gradient-to-r from-[#00C853] via-amber-400 to-red-500" />
        </div>
      </div>
    </>
  );
}