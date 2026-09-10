import { useEffect, useRef } from "react";
import { setupReveals } from "../lib/gsap";

function CriticalRow({ alert, canAck, onAck }) {
  return (
    <div
      className={`flex flex-col md:flex-row md:items-center justify-between gap-2.5 p-3.5 rounded-xl border-l-4 ${alert.rowClass}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-1.5 w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: alert.dotColor }} />
        <div className="space-y-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-white font-display font-bold tracking-wider text-slate-900 shadow-sm border border-slate-200 text-sm">
              {alert.plate}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${alert.tagClass}`}>
              {alert.tag}
            </span>
            {alert.speed && (
              <span className="text-xs text-slate-500">
                Speed: <strong className="text-slate-900">{alert.speed}</strong>
              </span>
            )}
          </div>
          <p className="text-sm text-slate-900 font-medium truncate">{alert.description}</p>
          <p className="text-xs text-slate-500 truncate">
            <span className="material-symbols-outlined text-[14px] mr-1 align-middle">videocam</span>
            {alert.location}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
        <span className="text-xs text-slate-500 whitespace-nowrap">{alert.time}</span>
        <button
          type="button"
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm inline-flex items-center gap-1 ${alert.action.className}`}
        >
          <span className="material-symbols-outlined text-[15px]">{alert.action.icon}</span>
          {alert.action.label}
        </button>
        {canAck && (
          <button
            type="button"
            onClick={() => onAck?.(alert)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Ack
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * CriticalAlerts — compact "critical only" panel for the lean home page.
 * Receives the same alert objects as AlertFeed (backend or mock fallback).
 * onAck fires for live rows only (mock rows have no backend id to ack).
 */
export default function CriticalAlerts({ alerts = [], limit = 4, feed = "offline", onAck = null }) {
  const root = useRef(null);

  useEffect(() => setupReveals(root), []);

  const critical = alerts.filter((a) => a.severity === "Critical").slice(0, limit);
  const muted = alerts.length > critical.length ? alerts.length - critical.length : 0;

  return (
    <section
      id="critical-alerts"
      ref={root}
      data-reveal-group
      className="bg-white rounded-2xl p-6 shadow-panel space-y-4 border border-slate-100"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[20px]">notifications_active</span>
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Critical Alerts</h2>
            <p className="text-xs text-slate-500">
              Priority incidents requiring immediate attention
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-600 text-[11px] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
            {critical.length} ACTIVE
          </span>
          <button className="text-navy hover:text-navy-dark text-sm font-semibold">
            View All →
          </button>
        </div>
      </div>

      {critical.length ? (
        <div className="space-y-2">
          {critical.map((a) => (
            <CriticalRow key={a.id} alert={a} canAck={feed !== "offline" && !!onAck} onAck={onAck} />
          ))}
          {muted > 0 && (
            <p className="text-xs text-slate-400 text-center pt-1">
              +{muted} more alerts in the full feed
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 py-6 rounded-xl bg-signal/5 border border-signal/20 px-4">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-signal" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">No critical incidents</p>
            <p className="text-xs text-slate-500">
              The grid is clear. All priority hotlists are quiet right now.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}