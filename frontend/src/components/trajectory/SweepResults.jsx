import { timeAgo } from "../../api/adapters";

/**
 * SweepResults — ranked plate list for area/time sweeps.
 * The sweep endpoints already return EVERY read in scope; this panel shows
 * the per-plate ranking (top 8) so plates beyond the most-observed one are
 * visible and one click away from a full trace. Clicking a row retraces
 * that plate from the already-fetched reads (no refetch).
 */
export default function SweepResults({
  ranking = [],
  selected = null,
  scope = "",
  onSelect = () => {},
  loading = false,
}) {
  if (!ranking.length) return null;
  const max = Math.max(1, ...ranking.map((r) => r.count || 0));

  return (
    <div
      data-tp
      className="rounded-2xl border border-slate-200/80 bg-white shadow-panel p-4 space-y-3"
    >
      <div>
        <h2 className="font-display text-base font-extrabold text-navy">
          Plates in Scope
        </h2>
        <p className="text-[11px] text-slate-500">
          {ranking.length} vehicle{ranking.length === 1 ? "" : "s"}
          {scope ? ` · ${scope}` : ""} — select to trace
        </p>
      </div>

      <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
        {ranking.map((r, i) => {
          const active = r.canonical === selected;
          return (
            <li key={r.canonical}>
              <button
                type="button"
                disabled={loading}
                onClick={() => onSelect(r.canonical)}
                className={`w-full text-left px-3 py-2 rounded-xl border transition-colors disabled:opacity-60 ${
                  active
                    ? "border-navy bg-navy/5"
                    : "border-slate-100 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className={`text-[10px] font-extrabold tabular-nums w-5 shrink-0 ${
                        active ? "text-navy" : "text-slate-400"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-mono font-bold text-sm text-slate-900 truncate">
                      {r.canonical}
                    </span>
                  </span>
                  <span className="text-[11px] font-bold text-slate-700 tabular-nums shrink-0">
                    {r.count} read{r.count === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5 ml-7">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${active ? "bg-navy" : "bg-signal"}`}
                      style={{ width: `${Math.max(8, Math.round(((r.count || 0) / max) * 100))}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {r.lastSeen ? timeAgo(r.lastSeen) : "—"}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
