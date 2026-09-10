import { useState, useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
} from "chart.js";
import { chokePoints, peakHours, volumeChart } from "../data/mockData";
import FeedBadge from "./FeedBadge";

ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip
);

const TIME_RANGES = ["1h", "6h", "24h"];

function ChokePointRow({ point }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-slate-900">{point.name}</span>
        <span className="font-bold" style={{ color: point.color }}>
          {point.pct}% {point.level} (Avg {point.speed})
        </span>
      </div>
      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${point.pct}%`, backgroundColor: point.color }}
        />
      </div>
    </div>
  );
}

function PeakHoursBars({ hours }) {
  const max = Math.max(...hours.map((h) => h.value));
  return (
    <div className="pt-3 bg-slate-50 p-3 rounded-lg">
      <div className="flex items-center justify-between pb-2">
        <span className="text-[11px] text-slate-500 font-bold uppercase">
          Peak Choke Hours
        </span>
        <span className="text-[11px] text-navy">Today's Pattern</span>
      </div>
      <div className="flex items-end justify-between gap-2 h-14 pt-2">
        {hours.map((h) => {
          const heightPct = Math.max((h.value / max) * 100, 8);
          const isPeak = h.value === max;
          return (
            <div key={h.hour} className="flex flex-col items-center flex-1 gap-1">
              <div
                className={`w-full rounded-t ${
                  isPeak ? "bg-red-600" : "bg-blue-300"
                }`}
                style={{ height: `${heightPct}%` }}
              />
              <span
                className={`text-[10px] ${
                  isPeak ? "text-red-600 font-bold" : "text-slate-500"
                }`}
              >
                {h.hour}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VolumeChart({ chart }) {
  const data = useMemo(
    () => ({
      labels: chart.labels,
      datasets: [
        {
          label: "Vehicles / hr",
          data: chart.data,
          borderColor: "#0B3D91",
          backgroundColor: "rgba(11,61,145,0.15)",
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: "#0B3D91",
        },
      ],
    }),
    [chart]
  );

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.parsed.y.toLocaleString()} vehicles/hr`,
        },
      },
    },
    scales: {
      y: {
        grid: { color: "#e2e8f0" },
        ticks: {
          callback: (v) => `${v / 1000}k`,
        },
      },
      x: {
        grid: { display: false },
      },
    },
  };

  return (
    <div className="relative w-full h-52 mt-4">
      <div className="absolute top-2 right-2 z-10 px-2.5 py-1 rounded bg-slate-900 text-white shadow-md text-xs flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-red-300" />
        {chart.peakTooltip}
      </div>
      <Line data={data} options={options} />
    </div>
  );
}

/**
 * Density
 * Two-column "Analytics Preview": choke-point breakdown + peak hours (left),
 * and a Chart.js volume line chart (right). Time-range tabs are wired with
 * state so you can later swap `points`/`chart` data per range.
 *
 * Controlled mode: pass `range` + `onRangeChange` and the parent refetches
 * per range (live). Uncontrolled: internal state, props render as-is (demo).
 *
 * feed: 'live' | 'stale' | 'offline'. Only 'offline' renders fixture rows;
 * a reachable backend with empty tables renders honest empty states.
 */
export default function Density({
  points = chokePoints,
  hours = peakHours,
  chart = volumeChart,
  range: controlledRange,
  onRangeChange,
  feed = "offline",
  updatedAt = null,
  flows = [],
}) {
  const [innerRange, setInnerRange] = useState(TIME_RANGES[0]);
  const range = controlledRange ?? innerRange;
  const setRange = onRangeChange ?? setInnerRange;
  const liveFlows = feed === "offline" ? null : (flows || []);
  const topFlows = (liveFlows ?? []).slice(0, 6);
  const maxFlow = Math.max(1, ...topFlows.map((f) => f.vehicle_count || 0));

  return (
    <>
    <section
      id="analytics-summary"
      className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch"
    >
      {/* Density & hotspot card */}
      <div className="bg-white rounded-xl p-6 shadow-sm flex flex-col justify-between space-y-4 border border-slate-100">
        <div>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Traffic Density &amp; Hotspot Analysis
              </h3>
              <p className="text-xs text-slate-500">
                Real-time congestion severity across major corridors
              </p>
              <div className="mt-1.5">
                <FeedBadge feed={feed} updatedAt={updatedAt} />
              </div>
            </div>
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg">
              {TIME_RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                    range === r
                      ? "bg-white text-navy shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 mt-4">
            {points.length ? (
              points.map((point) => (
                <ChokePointRow key={point.id} point={point} />
              ))
            ) : (
              <p className="text-sm text-slate-400 py-2">
                No corridor data in this window — run the sim feed to populate congestion pairs.
              </p>
            )}
          </div>
        </div>

        {hours.length ? (
          <PeakHoursBars hours={hours} />
        ) : (
          <div className="pt-3 bg-slate-50 p-3 rounded-lg">
            <p className="text-sm text-slate-400">
              No hourly buckets in this window — run the sim feed to populate the heatmap.
            </p>
          </div>
        )}
      </div>

      {/* Volume chart card */}
      <div className="bg-white rounded-xl p-6 shadow-sm flex flex-col justify-between space-y-4 border border-slate-100">
        <div>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Traffic Volume — Last 24 Hours
              </h3>
              <p className="text-xs text-slate-500">
                Total Daily Volume:{" "}
                <strong className="text-slate-900">{chart.totalDaily}</strong>
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-slate-50 text-xs text-slate-500 font-semibold">
              {chart.peakLabel}
            </span>
          </div>

          {chart.empty ? (
            <div className="relative w-full h-52 mt-4 flex items-center justify-center bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-400 px-6 text-center">
                No volume data in this window — run the sim feed.
              </p>
            </div>
          ) : (
            <VolumeChart chart={chart} />
          )}
        </div>

        <div className="pt-2 flex items-center justify-between text-slate-500 text-sm border-t border-slate-100">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-navy" />
            Integrated Sensor Telemetry
          </span>
          <span className="text-slate-900 font-semibold">
            99.1% Confidence Bounds
          </span>
        </div>
      </div>
    </section>

    {/* OD flows card — live only; fixtures carry no OD matrix */}
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            Origin → Destination Flows
          </h3>
          <p className="text-xs text-slate-500">
            Top camera-to-camera vehicle movements in the selected window ({range})
          </p>
        </div>
        <FeedBadge feed={feed} updatedAt={updatedAt} />
      </div>
      <div className="space-y-2.5 mt-4">
        {liveFlows == null ? (
          <p className="text-sm text-slate-400 py-2">
            Demo snapshot has no OD matrix — connect the backend to see live flows.
          </p>
        ) : topFlows.length ? (
          topFlows.map((f) => (
            <div key={`${f.from_cam}-${f.to_cam}`} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-900">
                  {f.from_cam} → {f.to_cam}
                </span>
                <span className="font-bold text-navy">{f.vehicle_count} vehicles</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-navy"
                  style={{ width: `${Math.max(6, Math.round(((f.vehicle_count || 0) / maxFlow) * 100))}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-400 py-2">
            No OD cells in this window — run the sim feed to populate movements.
          </p>
        )}
      </div>
    </div>
    </>
  );
}
