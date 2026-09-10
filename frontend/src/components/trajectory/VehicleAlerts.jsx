const SEV_CLS = {
  Critical: "bg-red-50 border-l-[#dc2626]",
  Warning: "bg-amber-50/60 border-l-[#f59e0b]",
  Info: "bg-white border-l-[#2563eb]",
};

const SEV_ICON = {
  Critical: "report",
  Warning: "warning",
  Info: "info",
};

/**
 * VehicleAlerts — alerts locking onto this vehicle on the grid.
 */
export default function VehicleAlerts({ alerts = [] }) {
  if (!alerts.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-extrabold text-navy">
          Vehicle Alerts
        </h3>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {alerts.length} on record
        </span>
      </div>

      <div className="space-y-2">
        {alerts.map((a, i) => (
          <div
            key={i}
            className={`rounded-xl border border-slate-100 border-l-4 px-3.5 py-3 ${SEV_CLS[a.severity] ?? SEV_CLS.Info}`}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]" style={{ color: a.color }}>
                {SEV_ICON[a.severity] ?? "info"}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: a.color }}>
                {a.severity}
              </span>
              <span className="text-sm font-bold text-slate-900 ml-1">{a.title}</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mt-1.5">{a.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}