/**
 * KeyInsights — AI-generated observations from the reconstructed journey.
 */
export default function KeyInsights({ insights = [] }) {
  if (!insights.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-extrabold text-navy">
          Key Insights
        </h3>
        <span className="text-[10px] font-bold uppercase tracking-wider text-signal-dark bg-signal/10 px-2 py-0.5 rounded-full">
          AI analyzed
        </span>
      </div>

      <div className="space-y-2">
        {insights.map((ins, i) => (
          <div
            key={i}
            className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3"
          >
            <span className="w-8 h-8 rounded-lg bg-navy/5 text-navy flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[17px]">{ins.icon}</span>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">{ins.title}</p>
              <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{ins.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}