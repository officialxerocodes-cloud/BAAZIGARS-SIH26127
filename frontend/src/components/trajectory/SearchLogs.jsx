import { INITIAL_HISTORY } from "../../data/trajectory";

/**
 * SearchLogs — previous trajectory searches. Clicking a log re-runs it.
 */
export default function SearchLogs({ logs = INITIAL_HISTORY, onRun = () => {} }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-extrabold text-navy">
          Previous Searches
        </h3>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {logs.length} logged
        </span>
      </div>

      <div className="space-y-2">
        {logs.map((log) => (
          <button
            key={log.id}
            onClick={() => onRun(log)}
            className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-100/80 hover:border-slate-200 transition-colors px-3 py-2.5 text-left"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">
                {log.queryLabel}
              </p>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                {log.timeLabel} · {log.mode}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${log.tagClass}`}>
                {log.tag}
              </span>
              <span className="material-symbols-outlined text-[16px] text-navy">chevron_right</span>
            </div>
          </button>
        ))}

        {!logs.length && (
          <p className="text-xs text-slate-400 py-3 text-center">
            No searches yet — run your first trajectory query.
          </p>
        )}
      </div>
    </div>
  );
}