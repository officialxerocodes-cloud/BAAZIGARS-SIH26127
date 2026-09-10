function Spec({ icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
      <span className="mt-0.5 w-7 h-7 rounded-lg bg-navy/5 text-navy flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[16px]">{icon}</span>
      </span>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="text-sm font-extrabold text-slate-900 leading-tight">{value}</p>
      </div>
    </div>
  );
}

/**
 * VehicleCard — identity + telemetry summary for the traced vehicle.
 */
export default function VehicleCard({ result }) {
  const { vehicle, stats, routeKey } = result;
  const status = result.statusTag ?? "Trajectory Reconstructed";

  return (
    <div
      className="rounded-2xl border border-slate-200/80 bg-white shadow-panel overflow-hidden"
      style={{ borderTop: "3px solid #00C853" }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* identity */}
        <div className="relative bg-navy text-white p-5 flex flex-col justify-between gap-4">
          <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
            style={{ backgroundImage: "radial-gradient(circle at 20% 0%, #00C853 0, transparent 45%), radial-gradient(circle at 90% 100%, #00C853 0, transparent 40%)" }}
          />
          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-signal-bright">
              Vehicle Identity · {status}
            </p>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl font-extrabold tracking-tight">
              {vehicle.plate}
            </h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-bold uppercase tracking-wider">
                {vehicle.category}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-bold uppercase tracking-wider">
                {vehicle.regState} · {vehicle.regLabel}
              </span>
            </div>
          </div>
          <div className="relative space-y-1">
            <p className="text-sm text-white/90 font-semibold">
              {vehicle.make} <span className="text-white/45">·</span> {vehicle.color}
            </p>
            <p className="text-[11px] text-white/50">{vehicle.owner}</p>
          </div>
        </div>

        {/* telemetry grid */}
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-2.5 content-start">
          <Spec icon="edit_location_alt" label="Last Noticed" value={stats.lastLabel} />
          <Spec icon="speed" label="Est. Speed" value={`${stats.avgSpeed} km/h`} />
          <Spec icon="calendar_month" label="Date" value={stats.firstLabel.split("·")[1]?.trim() ?? "Today"} />
          <Spec icon="schedule" label="First Seen" value={stats.firstLabel} />
          <Spec icon="route" label="Distance" value={`${stats.distanceKm} km`} />
          <Spec icon="hourglass_bottom" label="Duration" value={`${stats.durationMin} min`} />
          <Spec icon="target" label="OCR Confidence" value={`${stats.ocrConfidence}%`} />
          <Spec icon="radar" label="Gantry Reads" value={routeKey ? `${stats.reads}` : "—"} />
        </div>
      </div>
    </div>
  );
}