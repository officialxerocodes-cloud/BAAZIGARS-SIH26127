import { useMemo, useState } from "react";
import { Line, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  ArcElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
} from "chart.js";
import {
  rangeOptions,
  overviewCards as mockOverviewCards,
  congestionTrend as mockCongestionTrend,
  topCorridors as mockTopCorridors,
  liveFlow,
  odFlow as mockOdFlow,
  vehicleTrend,
  vehicleCategories,
  blacklistAnalysis as mockBlacklistAnalysis,
  cameraNetwork as mockCameraNetwork,
  alertAnalytics as mockAlertAnalytics,
} from "../../data/analyticsData";
import useApi from "../../hooks/useApi";
import { getCameras, getCongestion, getOdStats, getHeatmap, getCameraHealth, getAlerts } from "../../api/client";
import {
  mapCongestionTrend,
  mapTopCorridors,
  mapOdFlow,
  mapCameraNetwork,
  mapBlacklistAnalysis,
  mapAlertAnalytics,
  mapAnalyticsOverview,
  feedState,
} from "../../api/adapters";
import FeedBadge from "../FeedBadge";

ChartJS.register(LineElement, PointElement, ArcElement, LinearScale, CategoryScale, Filler, Tooltip);

/* ---------------------------------------------------------------------- */
/* Shared bits                                                             */
/* ---------------------------------------------------------------------- */

function Panel({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-100 shadow-panel p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <h3 className="font-display text-base font-bold text-slate-900">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function TrendPill({ trend }) {
  if (!trend) return null;
  const tone =
    trend.tone === "danger"
      ? "bg-red-50 text-red-600"
      : trend.tone === "warn"
        ? "bg-orange-50 text-orange-600"
        : trend.up
          ? "bg-emerald-50 text-emerald-600"
          : "bg-slate-100 text-slate-500";
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${tone}`}>
      <span className="material-symbols-outlined text-[12px]">{trend.up ? "arrow_upward" : "arrow_downward"}</span>
      {trend.label}
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* 1. Overview KPI band                                                    */
/* ---------------------------------------------------------------------- */

function OverviewCards({ cards }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((c) => (
        <div key={c.id} className="bg-white rounded-2xl p-4 shadow-panel border border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{c.title}</span>
            <span className={`w-8 h-8 rounded-full flex items-center justify-center ${c.iconBg} ${c.iconColor}`}>
              <span className="material-symbols-outlined text-[17px]">{c.icon}</span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="font-display text-2xl font-extrabold text-slate-900">{c.metric}</span>
            {c.metricSuffix && <span className="text-xs font-semibold text-slate-400">{c.metricSuffix}</span>}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <TrendPill trend={c.trend} />
            {c.sub && <span className="text-[11px] text-slate-500">{c.sub}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* 2. Congestion Analysis                                                  */
/* ---------------------------------------------------------------------- */

function CongestionAnalysis({ trend, corridors }) {
  const { labels, values, current, peak, peakTime, avg24h } = trend;
  const chartData = {
    labels: values.map((_, i) => i),
    datasets: [
      {
        data: values,
        borderColor: "#EF4444",
        backgroundColor: "rgba(239,68,68,0.12)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.35,
        fill: true,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false },
      y: { display: true, min: 0, max: 100, ticks: { color: "#94A3B8", font: { size: 10 } }, grid: { color: "#F1F5F9" } },
    },
  };

  return (
    <Panel title="Congestion Analysis" subtitle="Trend and top congested corridors in the city." className="lg:col-span-2">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <span className="text-xs font-semibold text-slate-500">Congestion Trend</span>
          <div className="h-40 mt-2">
            <Line data={chartData} options={options} />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 px-1 -mt-1">
            {labels.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 mt-4 text-center">
            {[
              ["Current", current],
              ["Peak", peak],
              ["Peak Time", peakTime],
              ["Avg (24h)", avg24h],
            ].map(([label, val]) => (
              <div key={label}>
                <div className="text-sm font-extrabold text-slate-900">{val}</div>
                <div className="text-[10px] text-slate-400">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Top Congested Corridors</span>
            <span>Index</span>
          </div>
          <ul className="space-y-2.5">
            {corridors.map((c) => (
              <li key={c.rank}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">{c.rank}</span>
                  <span className="font-semibold text-slate-800">{c.name}</span>
                  <span className="font-bold text-slate-900">{c.index}/100</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-orange-500"
                    style={{ width: `${c.index}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <button className="mt-4 text-xs font-bold text-navy hover:underline">View All Corridors →</button>
        </div>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------------- */
/* 3. Live Traffic Flow                                                    */
/* ---------------------------------------------------------------------- */

function LiveTrafficFlow() {
  return (
    <Panel title="Live Traffic Flow" subtitle="Movement pattern across major directions.">
      <ul className="space-y-4">
        {liveFlow.map((f) => (
          <li key={f.label} className="flex items-center gap-3">
            <span className="material-symbols-outlined text-slate-400 text-[18px]">trending_flat</span>
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-slate-700">{f.label}</span>
                <span className="font-bold text-slate-900">{f.pct}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${f.pct}%`, backgroundColor: f.color }} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ---------------------------------------------------------------------- */
/* 4. Origin → Destination flow (lightweight SVG sankey-style links)       */
/* ---------------------------------------------------------------------- */

function OriginDestination({ flow }) {
  const { origins, destinations, links } = flow;
  const H = 220;
  const oY = (i) => 20 + (i * (H - 40)) / (origins.length - 1);
  const dY = (i) => 20 + (i * (H - 40)) / (destinations.length - 1);

  return (
    <Panel title="Origin → Destination" subtitle="Major travel patterns across Delhi.">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch" style={{ height: H }}>
        <div className="flex flex-col justify-between py-1">
          {origins.map((o) => (
            <div key={o} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <span className="w-2 h-2 rounded-full border-2 border-slate-300" />
              {o}
            </div>
          ))}
        </div>

        <svg width="140" height={H} className="overflow-visible">
          {links.map((row, oi) =>
            row.map((w, di) => (
              <path
                key={`${oi}-${di}`}
                d={`M0,${oY(oi)} C70,${oY(oi)} 70,${dY(di)} 140,${dY(di)}`}
                stroke={destinations[di].color}
                strokeOpacity={0.35}
                strokeWidth={Math.max(1, w / 2)}
                fill="none"
              />
            ))
          )}
        </svg>

        <div className="flex flex-col justify-between py-1 text-right">
          {destinations.map((d) => (
            <div key={d.name} className="flex items-center justify-end gap-2 text-xs font-semibold text-slate-700">
              {d.name}
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-slate-400 font-normal w-8">{d.pct}%</span>
            </div>
          ))}
        </div>
      </div>
      <button className="mt-4 text-xs font-bold text-navy hover:underline">View Detailed OD Report →</button>
    </Panel>
  );
}

/* ---------------------------------------------------------------------- */
/* 5. Vehicle Intelligence                                                 */
/* ---------------------------------------------------------------------- */

function VehicleIntelligence() {
  const [tab, setTab] = useState("trend");
  const chartData = {
    labels: vehicleTrend.values.map((_, i) => i),
    datasets: [
      {
        data: vehicleTrend.values,
        borderColor: "#0B3D91",
        backgroundColor: "rgba(11,61,145,0.10)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.35,
        fill: true,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false },
      y: { display: true, ticks: { color: "#94A3B8", font: { size: 10 }, callback: (v) => `${v / 1000}K` }, grid: { color: "#F1F5F9" } },
    },
  };

  return (
    <Panel
      title="Vehicle Intelligence"
      subtitle="Detection trends and vehicle categories."
      action={
        <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
          {[
            ["trend", "Detection Trend"],
            ["types", "Vehicle Types"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors ${
                tab === key ? "bg-white text-navy shadow-sm" : "text-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      }
      className="lg:col-span-2"
    >
      <div className="grid md:grid-cols-[1fr_180px] gap-6">
        <div className="h-40 relative">
          <Line data={chartData} options={options} />
        </div>
        <ul className="space-y-3">
          {vehicleCategories.map((v) => (
            <li key={v.label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <span className="material-symbols-outlined text-[16px] text-navy">{v.icon}</span>
                {v.label}
              </span>
              <span className="text-xs font-bold text-slate-900">{v.pct}%</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------------- */
/* 6. Blacklist Analysis                                                   */
/* ---------------------------------------------------------------------- */

function BlacklistAnalysisPanel({ data }) {
  const b = data;
  return (
    <Panel title="Blacklist Analysis" subtitle="Suspicious and blacklisted vehicle activity.">
      <div className="grid sm:grid-cols-[auto_1fr_1fr] gap-6 items-start">
        <div className="flex flex-col items-center sm:items-start gap-1">
          <span className="w-11 h-11 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[20px]">directions_car</span>
          </span>
          <span className="font-display text-2xl font-extrabold text-slate-900">{b.count}</span>
          <span className="text-[10px] text-slate-400">Detections Today</span>
          <TrendPill trend={b.trend} />
        </div>

        <div>
          <span className="text-xs font-semibold text-slate-500 block mb-2">Top Active Locations</span>
          <ol className="space-y-1.5 text-xs">
            {b.topLocations.map((l, i) => (
              <li key={l.name} className="flex justify-between text-slate-700">
                <span>{i + 1}. {l.name}</span>
                <span className="font-bold text-slate-900">{l.count}</span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <div className="flex justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Repeat Detections</span>
          </div>
          <ul className="space-y-1.5 text-xs">
            {b.repeatDetections.map((r) => (
              <li key={r.plate} className="flex justify-between text-slate-700">
                <span className="font-mono">{r.plate}</span>
                <span className="text-slate-400">{r.count} · {r.lastSeen}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <button className="mt-4 text-xs font-bold text-navy hover:underline">View Full Analysis →</button>
    </Panel>
  );
}

/* ---------------------------------------------------------------------- */
/* 7. Camera Network (donut + illustrative coverage scatter)               */
/* ---------------------------------------------------------------------- */

const DOT_COLOR = { high: "#00C853", moderate: "#F59E0B", low: "#EF4444" };

function DotScatter({ dots, height = 110 }) {
  return (
    <div className="relative w-full rounded-xl bg-slate-50 border border-slate-100 overflow-hidden" style={{ height }}>
      {dots.map(([x, y, level], i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: level === "high" ? 8 : 6,
            height: level === "high" ? 8 : 6,
            backgroundColor: DOT_COLOR[level],
            opacity: 0.85,
            boxShadow: `0 0 0 6px ${DOT_COLOR[level]}22`,
          }}
        />
      ))}
    </div>
  );
}

function CameraNetworkPanel({ data }) {
  const c = data;
  const donutData = {
    labels: ["Online", "Degraded", "Offline"],
    datasets: [
      {
        data: [c.online, c.degraded, c.offline],
        backgroundColor: ["#00C853", "#F59E0B", "#EF4444"],
        borderWidth: 0,
        cutout: "72%",
      },
    ],
  };

  return (
    <Panel title="Camera Network" subtitle="Live health and coverage.">
      <div className="flex items-center gap-6">
        <div className="relative w-28 h-28 shrink-0">
          <Doughnut data={donutData} options={{ plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: false }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-lg font-extrabold text-slate-900">{c.onlinePct}%</span>
            <span className="text-[9px] text-slate-400">Online</span>
          </div>
        </div>
        <ul className="space-y-1.5 text-xs">
          <li className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-signal" />Online <span className="ml-auto font-bold text-slate-900">{c.online.toLocaleString("en-IN")}</span></li>
          <li className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500" />Degraded <span className="ml-auto font-bold text-slate-900">{c.degraded}</span></li>
          <li className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500" />Offline <span className="ml-auto font-bold text-slate-900">{c.offline}</span></li>
        </ul>
      </div>

      <div className="mt-4">
        <span className="text-xs font-semibold text-slate-500 block mb-2">Camera Coverage</span>
        <DotScatter dots={c.dots} />
        <div className="flex gap-4 mt-2 text-[11px] text-slate-500">
          {c.coverage.map((cv) => (
            <span key={cv.label} className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cv.color }} />
              {cv.label} {cv.pct}%
            </span>
          ))}
        </div>
      </div>
      <button className="mt-4 text-xs font-bold text-navy hover:underline">View Camera Network →</button>
    </Panel>
  );
}

/* ---------------------------------------------------------------------- */
/* 8. Alert Analytics                                                      */
/* ---------------------------------------------------------------------- */

function AlertAnalyticsPanel({ data }) {
  const a = data;
  const chartData = {
    labels: a.sparkline.map((_, i) => i),
    datasets: [
      {
        data: a.sparkline,
        borderColor: "#EF4444",
        backgroundColor: "rgba(239,68,68,0.1)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
        fill: true,
      },
    ],
  };
  const maxCount = Math.max(...a.byType.map((t) => t.count));

  return (
    <Panel title="Alert Analytics" subtitle="Patterns and hotspots of system alerts." className="lg:col-span-2">
      <div className="grid md:grid-cols-[auto_1fr_1fr_1fr] gap-6">
        <div>
          <span className="text-xs font-semibold text-slate-500">Alerts Today</span>
          <div className="font-display text-2xl font-extrabold text-slate-900 mt-1">{a.today}</div>
          <div className="h-10 w-24 mt-1">
            <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }} />
          </div>
          <TrendPill trend={a.trend} />
        </div>

        <div>
          <span className="text-xs font-semibold text-slate-500 block mb-2">Alerts by Type</span>
          <ul className="space-y-2">
            {a.byType.map((t) => (
              <li key={t.label}>
                <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                  <span>{t.label}</span>
                  <span className="font-bold text-slate-900">{t.count}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(t.count / maxCount) * 100}%`, backgroundColor: t.color }} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <span className="text-xs font-semibold text-slate-500 block mb-2">Top Alert Locations</span>
          <ol className="space-y-1.5 text-xs text-slate-700">
            {a.topLocations.map((l, i) => (
              <li key={l}>{i + 1}. {l}</li>
            ))}
          </ol>
        </div>

        <div>
          <DotScatter dots={a.dots} height={100} />
          <button className="mt-3 text-xs font-bold text-navy hover:underline block">View All Alerts →</button>
        </div>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------------- */
/* Page                                                                     */
/* ---------------------------------------------------------------------- */

export default function AnalyticsPage() {
  const [range, setRange] = useState("6H");

  // ---- Live backend data (each falls back to its mock while API/data is empty) ----
  const cameras = useApi(() => getCameras(), []);
  const congestionRaw = useApi(() => getCongestion(), []);
  const odRaw = useApi(() => getOdStats(), []);
  const heatmapRaw = useApi(() => getHeatmap(), []);
  const healthRaw = useApi(() => getCameraHealth(), []);
  const alertsRaw = useApi(() => getAlerts(200), [], { pollMs: 15000 });

  const camerasById = useMemo(() => {
    const map = {};
    for (const c of cameras.data) map[c.id] = c;
    return map;
  }, [cameras.data]);

  const congestionTrend = useMemo(
    () => mapCongestionTrend(heatmapRaw.data, mockCongestionTrend),
    [heatmapRaw.data]
  );
  const topCorridors = useMemo(
    () => mapTopCorridors(congestionRaw.data, camerasById, mockTopCorridors),
    [congestionRaw.data, camerasById]
  );
  const odFlow = useMemo(
    () => mapOdFlow(odRaw.data, camerasById, mockOdFlow),
    [odRaw.data, camerasById]
  );
  const cameraNetwork = useMemo(
    () => mapCameraNetwork(healthRaw.data, camerasById, mockCameraNetwork),
    [healthRaw.data, camerasById]
  );
  const blacklistAnalysis = useMemo(
    () => mapBlacklistAnalysis(alertsRaw.data, camerasById, mockBlacklistAnalysis),
    [alertsRaw.data, camerasById]
  );
  const alertAnalytics = useMemo(
    () => mapAlertAnalytics(alertsRaw.data, camerasById, mockAlertAnalytics),
    [alertsRaw.data, camerasById]
  );
  const overviewCards = useMemo(
    () => mapAnalyticsOverview(mockOverviewCards, { alerts: alertsRaw.data, cameraNetwork }),
    [alertsRaw.data, cameraNetwork]
  );

  // Page-level liveness: fixtures render only with an offline/demo badge.
  const pageFeed = feedState({
    updatedAt: Math.max(
      cameras.updatedAt ?? 0,
      congestionRaw.updatedAt ?? 0,
      odRaw.updatedAt ?? 0,
      heatmapRaw.updatedAt ?? 0,
      healthRaw.updatedAt ?? 0,
      alertsRaw.updatedAt ?? 0
    ) || null,
    error:
      cameras.error ??
      congestionRaw.error ??
      odRaw.error ??
      heatmapRaw.error ??
      healthRaw.error ??
      alertsRaw.error,
    pollMs: 15000,
  });
  const pageUpdatedAt = alertsRaw.updatedAt ?? cameras.updatedAt ?? null;

  return (
    <div className="w-full px-6 py-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Delhi Metropolitan Traffic Intelligence</p>
          <div className="mt-1.5">
            <FeedBadge feed={pageFeed} updatedAt={pageUpdatedAt} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-white border border-slate-200 rounded-lg p-0.5 shadow-sm">
            {rangeOptions.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                  range === r ? "bg-navy text-white" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm text-xs font-bold text-slate-700 hover:bg-slate-50">
            <span className="material-symbols-outlined text-[16px]">download</span>
            Export Report
          </button>
        </div>
      </div>

      <OverviewCards cards={overviewCards} />

      <div className="grid lg:grid-cols-3 gap-4">
        <CongestionAnalysis trend={congestionTrend} corridors={topCorridors} />
        <LiveTrafficFlow />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <OriginDestination flow={odFlow} />
        <VehicleIntelligence />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <BlacklistAnalysisPanel data={blacklistAnalysis} />
        <CameraNetworkPanel data={cameraNetwork} />
      </div>

      <AlertAnalyticsPanel data={alertAnalytics} />
    </div>
  );
}
