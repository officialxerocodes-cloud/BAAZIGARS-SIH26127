import { useEffect, useRef, useState } from "react";
import { gsap, prefersReducedMotion } from "../../lib/gsap";
import LiveMap from "../LiveMap";
import SearchPanel from "./SearchPanel";
import SearchLogs from "./SearchLogs";
import SweepResults from "./SweepResults";
import VehicleCard from "./VehicleCard";
import DetectionTimeline from "./DetectionTimeline";
import VehicleAlerts from "./VehicleAlerts";
import KeyInsights from "./KeyInsights";
import {
  searchTrajectory,
  INITIAL_HISTORY,
  queryFromHistory,
  ZONES,
  TIME_WINDOWS,
} from "../../data/trajectory";
import useApi from "../../hooks/useApi";
import {
  getCameras,
  searchVehicles,
  getTrajectory,
  getClones,
  getZoneSweep,
  getWindowSweep,
  DEMO_MODE,
} from "../../api/client";
import { canonicalPlate } from "../../api/adapters";
import {
  buildLiveResult,
  buildCamerasGeo,
} from "../../api/liveTrajectory";

const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z.name]));
const ZONE_CAM_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z.cam]));
const TZ_BY_ID = Object.fromEntries(TIME_WINDOWS.map((t) => [t.id, t.label]));
// Sweep lookback minutes per Time Window id (matches backend default 6h).
const WINDOW_MINUTES = { "15m": 15, "1h": 60, "6h": 360, "24h": 1440, "7d": 10080 };

function logLabel(query) {
  if (query.mode === "plate") return query.plate || "Plate trace";
  if (query.mode === "area") return ZONE_BY_ID[query.zone] ?? "Zone sweep";
  return TZ_BY_ID[query.timeWindow] ?? "Time window";
}

function logTag(query) {
  if (query.mode === "plate") return { tag: "Plate trace", tagClass: "bg-navy/5 text-navy" };
  if (query.mode === "area") return { tag: "Area sweep", tagClass: "bg-blue-100 text-[#2563eb]" };
  return { tag: "Time window", tagClass: "bg-slate-100 text-slate-600" };
}

/**
 * TrajectoryPage — vehicle / trajectory search command surface.
 * Left: query builder + logs. Right: live map with route flight-path,
 * identity card, ANPR sequence, alerts and AI insights.
 */
export default function TrajectoryPage({ onNavigate = () => {} }) {
  const root = useRef(null);
  const booted = useRef(false);
  // Last sweep context (query + scope + ranked reads incl. per-plate reads)
  // so ranking-list clicks can retrace without refetching.
  const sweepCtxRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState(INITIAL_HISTORY);
  // Ranked sweep outcome: [{ canonical, count, lastSeen }] (top 8) + the
  // scope line. Set for area/time searches, cleared for plate searches.
  const [sweepRanking, setSweepRanking] = useState([]);
  const [sweepScope, setSweepScope] = useState("");
  const resultKey = result?.routeKey ?? "";

  // Camera registry (once) — positions live reads on the map. Null while
  // the backend is unreachable; the builder then uses read-embedded coords.
  const camerasApi = useApi(() => getCameras(), null);

  const pushLog = (res) => {
    const meta = logTag(res.query);
    setLogs((prev) => [
      {
        id: `h${Date.now()}`,
        timeLabel: res.source === "live" ? "live trace" : "just now",
        mode: res.query.mode,
        queryLabel: logLabel(res.query),
        tag: res.source === "live" ? "Live trace" : meta.tag,
        tagClass:
          res.source === "live"
            ? "bg-emerald-100 text-[#16a34a]"
            : meta.tagClass,
        plate: res.plate,
      },
      ...prev,
    ].slice(0, 6));
  };

  const runMock = (query) => {
    const res = searchTrajectory(query);
    setResult({ ...res, source: "demo" });
    setSweepRanking([]);
    setSweepScope("");
    sweepCtxRef.current = null;
    pushLog({ ...res, source: "demo" });
  };

  // Trace one plate from a sweep's reads and publish it as the active
  // result. Shared by the initial auto-trace and ranking-list clicks, so
  // every plate in scope renders through the same live builder.
  const tracePlate = async (target, targetReads, { query, scopeLabel, ranked, totalReads }) => {
    const clones = await getClones(target).catch(() => []);
    const live = buildLiveResult(target, targetReads, camerasApi.data, clones);
    if (!live) throw new Error("no-reads");
    live.modeLabel = query.mode;
    live.query = { ...query, plate: target };
    live.insights = [
      {
        icon: "radar",
        title: "Sweep scope",
        body: `${scopeLabel} — tracing ${target} (${targetReads.length} of ${totalReads} reads).`,
      },
      ...(live.insights || []),
    ];
    sweepCtxRef.current = { query, scopeLabel, ranked, totalReads };
    setSweepRanking(ranked.map(({ reads: _drop, ...row }) => row));
    setSweepScope(scopeLabel);
    setResult(live);
    pushLog(live);
  };

  // Retrace a different plate from the current sweep ranking (no refetch:
  // the sweep already returned every read in scope).
  const selectSweepPlate = async (canonical) => {
    const ctx = sweepCtxRef.current;
    if (!ctx) return;
    const entry = ctx.ranked.find((r) => r.canonical === canonical);
    if (!entry) return;
    setLoading(true);
    setError("");
    try {
      await tracePlate(canonical, entry.reads, ctx);
    } catch (e) {
      setError("Could not trace that plate — its reads are no longer available. Re-run the sweep.");
    } finally {
      setLoading(false);
    }
  };

  const runSearch = async (query, { fallbackMock = false } = {}) => {
    setLoading(true);
    setError("");
    // Demo-data mode (no backend): every mode runs the deterministic mock
    // engine and renders labeled "Demo preview" results.
    if (DEMO_MODE) {
      setTimeout(() => {
        runMock(query);
        setLoading(false);
      }, 400);
      return;
    }
    try {
      // Plate mode traces one plate straight from the vehicle registry.
      if (query.mode === "plate" && query.plate) {
        const canonical = canonicalPlate(query.plate);
        if (canonical.length < 4) {
          setError("Enter a valid registration number (min 4 chars).");
          setLoading(false);
          return;
        }
        try {
          const hits = await searchVehicles(canonical, { fuzzy: 1, limit: 5 });
          const exact = (hits || []).find((h) => h.canonical === canonical);
          const target = exact?.canonical || hits?.[0]?.canonical;
          if (!target) throw new Error("no-hits");
          const [reads, clones] = await Promise.all([
            getTrajectory(target),
            getClones(target).catch(() => []),
          ]);
          const live = buildLiveResult(target, reads, camerasApi.data, clones);
          if (!live) throw new Error("no-reads");
          setSweepRanking([]);
          setSweepScope("");
          sweepCtxRef.current = null;
          setResult(live);
          pushLog(live);
          return;
        } catch (e) {
          if (fallbackMock) {
            runMock(query);
            return;
          }
          setResult(null);
          setError(
            `No live sightings for ${canonical} yet — check the plate or run the sim grid feed.`
          );
          return;
        } finally {
          setLoading(false);
        }
      }
      // Area / Time modes are live since P2 (sweep endpoints). They resolve
      // to the most-observed plate in the selection and reuse the live
      // trajectory builder, so the map/timeline/cards render real reads.
      if (query.mode === "area" || query.mode === "time") {
        try {
          const mins = WINDOW_MINUTES[query.timeWindow] ?? 360;
          const from = new Date(Date.now() - mins * 60_000).toISOString();
          let reads = [];
          let scopeLabel = "";
          if (query.mode === "area") {
            const anchorId = ZONE_CAM_BY_ID[query.zone];
            const anchor = (camerasApi.data || []).find(
              (c) => String(c.id).toUpperCase() === String(anchorId).toUpperCase()
            );
            if (anchor?.lat == null || anchor?.lng == null) {
              throw new Error("zone anchor not in camera registry yet");
            }
            const sweep = await getZoneSweep({
              lat: anchor.lat,
              lng: anchor.lng,
              radiusKm: query.radius || 1,
              from,
            });
            reads = sweep.reads || [];
            scopeLabel = `${reads.length} reads near ${ZONE_BY_ID[query.zone] ?? query.zone}`;
          } else {
            const sweep = await getWindowSweep({ from });
            const top = (sweep.top_plates || [])[0];
            if (!top) throw new Error("no-reads");
            const full = await getTrajectory(top.canonical);
            reads = full || [];
            scopeLabel = `${sweep.total_reads} reads · ${sweep.vehicles} vehicles in window`;
          }
          // Group sweep reads by plate and keep the FULL ranking (top 8):
          // the list panel shows every plate in scope, the map traces one.
          const byPlate = new Map();
          for (const r of reads) {
            if (!r.canonical) continue;
            if (!byPlate.has(r.canonical)) byPlate.set(r.canonical, []);
            byPlate.get(r.canonical).push(r);
          }
          const ranked = [...byPlate.entries()]
            .map(([canonical, plateReads]) => ({
              canonical,
              count: plateReads.length,
              lastSeen: plateReads
                .map((r) => r.ts)
                .filter(Boolean)
                .sort()
                .at(-1),
              reads: plateReads,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
          if (!ranked.length) throw new Error("no-reads");
          const top = ranked[0];
          await tracePlate(top.canonical, top.reads, {
            query,
            scopeLabel,
            ranked,
            totalReads: reads.length,
          });
          return;
        } catch (e) {
          setResult(null);
          setSweepRanking([]);
          setSweepScope("");
          sweepCtxRef.current = null;
          setError(
            query.mode === "area"
              ? "No live reads in that zone/window yet — try a wider radius or run the sim feed."
              : "No live reads in that time window yet — run the sim feed."
          );
          return;
        } finally {
          setLoading(false);
        }
      }
    } catch (e) {
      setError("Search failed — backend unreachable and no demo fallback.");
      setLoading(false);
    }
  };

  const runHistory = (row) => runSearch(queryFromHistory(row));

  // auto-run a demo trace once on first mount
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    // First paint tries the live grid, falling back to the demo engine so
    // the page is never empty while the backend is down or empty.
    const t = setTimeout(
      () => runSearch({ mode: "plate", plate: "DL 01 AB 1234" }, { fallbackMock: true }),
      650
    );
    return () => {
      clearTimeout(t);
      booted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // page-level GSAP entrance
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set("[data-tp]", { opacity: 1, y: 0 });
        return;
      }
      gsap.fromTo(
        "[data-tp]",
        { y: 20, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.09, ease: "power3.out", delay: 0.1 }
      );
    }, root);
    return () => ctx.revert();
  }, []);

  // animate the details block when a new trace lands
  useEffect(() => {
    if (!resultKey) return undefined;
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set("[data-tp-fade]", { opacity: 1, y: 0 });
        return;
      }
      gsap.fromTo(
        "[data-tp-fade]",
        { y: 18, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.45, stagger: 0.06, ease: "power3.out" }
      );
    }, root);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);

  return (
    <section ref={root} className="w-full px-6 py-4 space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr] gap-4 items-start">
        {/* LEFT — builder + sweep ranking + logs */}
        <div data-tp className="space-y-4">
          <SearchPanel onSearch={runSearch} loading={loading} />
          <SweepResults
            ranking={sweepRanking}
            selected={result?.plate ?? null}
            scope={sweepScope}
            onSelect={selectSweepPlate}
            loading={loading}
          />
          <SearchLogs logs={logs} onRun={runHistory} />
        </div>

        {/* RIGHT — map + details */}
        <div className="space-y-4 min-w-0">
          <div data-tp className="rounded-2xl border border-slate-200/80 bg-white shadow-panel overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <span className="material-symbols-outlined text-[16px] text-navy">map</span>
                Live Reconstruction Map
              </div>
              {result ? (
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      result.source === "live"
                        ? "text-emerald-700 bg-emerald-100"
                        : "text-navy bg-navy/5"
                    }`}
                  >
                    {result.source === "live" ? "Live trace" : "Demo preview"}
                  </span>
                  <span className="text-[10px] font-bold text-navy bg-navy/5 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {result.query.mode} trace
                  </span>
                  <span className="text-[11px] font-extrabold text-slate-900">{result.plate}</span>
                </div>
              ) : (
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  awaiting query
                </span>
              )}
            </div>
            <div className="relative h-[420px]">
              <LiveMap
                route={result?.route ?? []}
                routeKey={resultKey}
                trackingLabel={result ? `TRACKING ${result.plate}` : null}
                camerasGeo={
                  camerasApi.data ? buildCamerasGeo(camerasApi.data) : null
                }
              />
            </div>
          </div>

          {error && !result && (
            <div data-tp className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {error}
            </div>
          )}

          {result ? (
            <div key={resultKey} className="space-y-4">
              <div data-tp-fade>
                <VehicleCard result={result} />
              </div>

              <div data-tp-fade>
                <DetectionTimeline detections={result.detections} />
              </div>

              <div data-tp-fade className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <VehicleAlerts alerts={result.alerts} />
                <KeyInsights insights={result.insights} />
              </div>
            </div>
          ) : (
            <div data-tp className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
              <span className="material-symbols-outlined text-[40px] text-slate-300">route</span>
              <p className="mt-2 font-display font-extrabold text-navy">No Active Trace</p>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Run a plate, area or time-window search to reconstruct a journey —
                the flight-path, ANPR sequence, alerts and insights will render here.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}