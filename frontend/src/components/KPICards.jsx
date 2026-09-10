import { useEffect, useMemo, useRef } from "react";
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
import { kpiCards } from "../data/mockData";
import { gsap, prefersReducedMotion, setupReveals } from "../lib/gsap";
import FeedBadge from "./FeedBadge";

ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip
);

function Sparkline({ data, color }) {
  const chartData = {
    labels: data.map((_, i) => i),
    datasets: [
      {
        data,
        borderColor: color,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
        fill: true,
        backgroundColor: `${color}22`,
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: { x: { display: false }, y: { display: false } },
  };
  return (
    <div className="h-8 w-20">
      <Line data={chartData} options={options} />
    </div>
  );
}

const METRIC_RE = /^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/;

function AnimatedMetric({ value }) {
  const ref = useRef(null);
  const parsed = useMemo(() => {
    const m = String(value ?? "").match(METRIC_RE);
    if (!m) return null;
    return { lead: m[1], target: parseFloat(m[2].replace(/,/g, "")), tail: m[3] };
  }, [value]);

  useEffect(() => {
    if (!ref.current || !parsed) return undefined;
    const el = ref.current;
    const { target } = parsed;
    const isInt = Number.isInteger(target);
    const fmt = (n) =>
      isInt ? Math.round(n).toLocaleString("en-IN") : n.toFixed(1);

    if (prefersReducedMotion()) {
      el.textContent = fmt(target);
      return undefined;
    }
    el.textContent = fmt(0);
    const obj = { v: 0 };
    const tween = gsap.to(obj, {
      v: target,
      duration: 1.5,
      ease: "power2.out",
      scrollTrigger: { trigger: el, start: "top 94%", once: true },
      onUpdate: () => {
        el.textContent = fmt(obj.v);
      },
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [parsed]);

  if (!parsed) return <span className="tabular-nums">{value}</span>;
  return (
    <span className="tabular-nums">
      {parsed.lead}
      <span ref={ref}>0</span>
      {parsed.tail}
    </span>
  );
}

function KPICard({ card }) {
  return (
    <div
      data-reveal-item
      className="relative bg-white rounded-2xl p-4 shadow-panel border border-slate-100 overflow-hidden transition-transform duration-300 hover:-translate-y-0.5"
    >
      <span
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: card.accent }}
      />
      <div className="flex items-center justify-between pl-2">
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
          {card.title}
        </span>
        <span
          className={`w-8 h-8 rounded-full flex items-center justify-center ${card.iconBg} ${card.iconColor}`}
        >
          <span className="material-symbols-outlined text-[17px]">{card.icon}</span>
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2 pl-2">
        <span className="font-display text-2xl font-extrabold text-slate-900">
          <AnimatedMetric value={card.metric} />
        </span>
        {card.trend && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${card.trend.className}`}>
            {card.trend.label}
          </span>
        )}
        {card.sparkline && <Sparkline data={card.sparkline} color={card.accent} />}
      </div>

      {card.subtitle && (
        <span className="text-xs text-slate-500 block pl-2 mt-1">{card.subtitle}</span>
      )}

      {typeof card.progress === "number" && (
        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-2">
          <div
            className="h-full rounded-full"
            style={{ width: `${card.progress}%`, backgroundColor: card.accent }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * KPICards — budget-style KPI band. Live metrics count up when scrolled
 * into view; falls back to mockData values via App props.
 *
 * feed: 'live' | 'stale' | 'offline' — pills the band so mock numbers are
 * never mistaken for live telemetry.
 */
export default function KPICards({ cards = kpiCards, feed = "offline", updatedAt = null }) {
  const root = useRef(null);

  useEffect(() => setupReveals(root), []);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FeedBadge feed={feed} updatedAt={updatedAt} />
      </div>
      <section ref={root} id="dashboard-stats" data-reveal-group className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map((card) => (
          <KPICard key={card.id} card={card} />
        ))}
      </section>
    </div>
  );
}