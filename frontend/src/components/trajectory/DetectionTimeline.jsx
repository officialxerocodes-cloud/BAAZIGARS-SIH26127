import { fmtTime, fmtDate } from "../../data/trajectory";
import { API_BASE_URL } from "../../api/client";

function ConfidenceBar({ value }) {
  const color = value >= 97 ? "#16a34a" : value >= 94 ? "#0B3D91" : "#f59e0b";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="w-14 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-[11px] font-bold text-slate-700 tabular-nums">{value}%</span>
    </div>
  );
}

/**
 * DetectionTimeline — chronological ANPR sequence of the trajectory.
 */
export default function DetectionTimeline({ detections = [] }) {
  if (!detections.length) return null;
  const total = detections.length;
  const highConf = detections.filter((d) => d.confidence >= 97).length;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-panel overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div>
          <h3 className="font-display text-sm font-extrabold text-navy">
            ANPR Detection Sequence
          </h3>
          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
            {total} gantry hits · {highConf} at 97%+ confidence · chronological
          </p>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-navy bg-navy/5 px-2.5 py-1 rounded-full">
          {detections[0].dateLabel}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          {/* header row */}
          <div className="grid grid-cols-[38px_1.1fr_1fr_90px_110px_64px] gap-2 px-4 py-2 text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/70">
            <span>#</span>
            <span>Gantry Read</span>
            <span>Timestamp IST</span>
            <span>Speed</span>
            <span>OCR Conf.</span>
            <span>Crop</span>
          </div>

          {detections.map((d, i) => {
            const first = i === 0;
            const last = i === total - 1;
            return (
              <div
                key={d.id}
                className="relative grid grid-cols-[38px_1.1fr_1fr_90px_110px_64px] gap-2 items-center px-4 py-2.5 border-t border-slate-50 hover:bg-slate-50/60 transition-colors"
              >
                <div className="flex items-center">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      first
                        ? "bg-navy text-white"
                        : last
                          ? "bg-signal text-navy-deep"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {i + 1}
                  </span>
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {d.cam}
                    {first && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-navy bg-navy/5 px-1.5 py-0.5 rounded">first</span>}
                    {last && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-signal-dark bg-signal/10 px-1.5 py-0.5 rounded">last</span>}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">{d.gantry}</p>
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 tabular-nums">{d.timeLabel}</p>
                  <p className="text-[10px] text-slate-400">
                    {d.dateLabel} · {d.minutesAgo} min ago · {d.heading}
                  </p>
                </div>

                <div>
                  <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-800">
                    {d.speed}
                    <span className="text-[9px] text-slate-400 font-semibold">km/h</span>
                  </span>
                </div>

                <div>
                  <ConfidenceBar value={d.confidence} />
                </div>

                <div>
                  {d.cropUrl ? (
                    <img
                      src={`${API_BASE_URL}${d.cropUrl}`}
                      alt={`Plate crop ${d.cam}`}
                      loading="lazy"
                      className="w-14 h-10 rounded-md object-cover border border-slate-200 bg-slate-50"
                    />
                  ) : (
                    <span className="text-[11px] text-slate-300 font-semibold">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}