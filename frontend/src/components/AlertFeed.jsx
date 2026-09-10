import { useEffect, useMemo, useState } from "react";
import { liveAlerts, alertSeverities } from "../data/mockData";

function AlertRow({ alert }) {
  return (
    <div
      className={`flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-lg border-l-4 transition-colors ${alert.rowClass}`}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-1 w-2.5 h-2.5 rounded-full shrink-0 animate-pulse"
          style={{ backgroundColor: alert.dotColor }}
        />
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-white font-bold tracking-wider text-slate-900 shadow-sm border border-slate-200 text-sm">
              {alert.plate}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${alert.tagClass}`}
            >
              {alert.tag}
            </span>
            {alert.speed && (
              <span className="text-xs text-slate-500">
                Speed: <strong className="text-slate-900">{alert.speed}</strong>
              </span>
            )}
          </div>
          <p className="text-sm text-slate-900 font-medium">
            {alert.description}
          </p>
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <span className="material-symbols-outlined text-[15px]">
              videocam
            </span>
            {alert.location}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0 self-end md:self-center">
        <span className="text-xs text-slate-500 whitespace-nowrap">
          {alert.time}
        </span>
        <button
          type="button"
          className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors shadow-sm inline-flex items-center gap-1 ${alert.action.className}`}
        >
          <span className="material-symbols-outlined text-[16px]">
            {alert.action.icon}
          </span>
          {alert.action.label}
        </button>
      </div>
    </div>
  );
}

/**
 * AlertFeed
 * `alerts` comes from the backend live feed (App polls /api/alerts) and
 * falls back to mockData when the API is unreachable.
 */
export default function AlertFeed({
  alerts: initialAlerts = liveAlerts,
  severities = alertSeverities,
  pollIntervalMs = null, // set e.g. 15000 to auto-poll a real endpoint
}) {
  const [alerts, setAlerts] = useState(initialAlerts);

  // Keep local state in sync when the parent swaps in fresh data.
  useEffect(() => {
    setAlerts(initialAlerts);
  }, [initialAlerts]);

  const [severityFilter, setSeverityFilter] = useState("All");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Optional self-contained polling for a real live feed.
  useEffect(() => {
    if (!pollIntervalMs) return;
    const id = setInterval(() => {
      // Example: fetch("/api/alerts").then(res => res.json()).then(setAlerts)
    }, pollIntervalMs);
    return () => clearInterval(id);
  }, [pollIntervalMs]);

  const filteredAlerts = useMemo(() => {
    if (severityFilter === "All") return alerts;
    return alerts.filter((a) => a.severity === severityFilter);
  }, [alerts, severityFilter]);

  const newCount = alerts.length;

  return (
    <section className="bg-white rounded-xl p-6 shadow-sm space-y-4 border border-slate-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-slate-900">Live Alert Feed</h2>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
            LIVE ({newCount} New)
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg text-sm text-slate-600 border border-slate-200 hover:bg-slate-100"
            >
              <span className="material-symbols-outlined text-[16px]">
                filter_list
              </span>
              Filter: <strong>{severityFilter}</strong>
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-10 overflow-hidden">
                {severities.map((sev) => (
                  <button
                    key={sev}
                    onClick={() => {
                      setSeverityFilter(sev);
                      setDropdownOpen(false);
                    }}
                    className={`block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                      sev === severityFilter
                        ? "text-navy font-semibold"
                        : "text-slate-600"
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="text-navy hover:text-navy-dark text-sm font-semibold transition-colors">
            View All Alerts →
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {filteredAlerts.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            No alerts match this filter.
          </p>
        ) : (
          filteredAlerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))
        )}
      </div>
    </section>
  );
}
