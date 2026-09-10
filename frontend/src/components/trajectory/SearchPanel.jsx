import { useState } from "react";
import {
  SEARCH_MODES,
  ZONES,
  TIME_WINDOWS,
  VEHICLE_TYPES,
} from "../../data/trajectory";

const RADIUS = [0.5, 1, 2, 5];

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">
        {label}
      </span>
      {children}
      {hint && <span className="text-[10px] text-slate-400 mt-1 block">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-navy/30 focus:border-navy transition-shadow";

/**
 * SearchPanel — mode-driven query builder. Selecting a mode re-shapes the
 * parameter fields (Plate / Area / Time). Runs a mock trajectory search.
 */
export default function SearchPanel({ onSearch, loading = false }) {
  const [mode, setMode] = useState("plate");
  const [plate, setPlate] = useState("DL 01 AB 1234");
  const [type, setType] = useState(VEHICLE_TYPES[0]);
  const [zone, setZone] = useState("ito");
  const [radius, setRadius] = useState("1");
  const [timeWindow, setTimeWindow] = useState("6h");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (mode === "plate" && plate.replace(/\s/g, "").length < 4) {
      setError("Enter a valid registration number (min 4 chars).");
      return;
    }
    setError("");
    onSearch({
      mode,
      plate: mode === "plate" ? plate.trim().toUpperCase() : plate.trim().toUpperCase() || "",
      type,
      zone,
      radius: Number(radius),
      timeWindow,
      date,
      time,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-slate-200/80 bg-white shadow-panel p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-extrabold text-navy">
            Trajectory Search
          </h2>
          <p className="text-[11px] text-slate-500">
            Reconstruct journeys from the ANPR grid
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-signal-dark">
          <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
          Grid Live
        </span>
      </div>

      {/* mode selector */}
      <div className="grid grid-cols-3 gap-1.5">
        {SEARCH_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-[11px] font-bold transition-all ${
              mode === m.id
                ? "bg-navy text-white shadow-md"
                : "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 -mt-1">
        {SEARCH_MODES.find((m) => m.id === mode)?.hint}
      </p>

      {/* mode-specific fields */}
      {mode === "plate" && (
        <div className="space-y-3">
          <Field label="Vehicle Registration Number">
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="e.g. DL 01 AB 1234"
              className={`${inputCls} uppercase font-mono tracking-wide`}
              spellCheck="false"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vehicle Class">
              <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                {VEHICLE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Sighting Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From Time (IST)">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Recency">
              <select value={timeWindow} onChange={(e) => setTimeWindow(e.target.value)} className={inputCls}>
                {TIME_WINDOWS.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      )}

      {mode === "area" && (
        <div className="space-y-3">
          <Field label="Surveillance Zone">
            <select value={zone} onChange={(e) => setZone(e.target.value)} className={inputCls}>
              {ZONES.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sweep Radius">
              <select value={radius} onChange={(e) => setRadius(e.target.value)} className={inputCls}>
                {RADIUS.map((r) => (
                  <option key={r} value={r}>{r} km</option>
                ))}
              </select>
            </Field>
            <Field label="Window">
              <select value={timeWindow} onChange={(e) => setTimeWindow(e.target.value)} className={inputCls}>
                {TIME_WINDOWS.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Optional Plate Filter">
            <input
              value={plate.startsWith("DL 01 AB") ? "" : plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="Any plate in zone"
              className={`${inputCls} uppercase font-mono tracking-wide`}
              spellCheck="false"
            />
          </Field>
        </div>
      )}

      {mode === "time" && (
        <div className="space-y-3">
          <Field label="Time Window">
            <select value={timeWindow} onChange={(e) => setTimeWindow(e.target.value)} className={inputCls}>
              {TIME_WINDOWS.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Flow Direction">
              <select className={inputCls}>
                <option>Any</option>
                <option>Inbound (into city)</option>
                <option>Outbound</option>
              </select>
            </Field>
            <Field label="Vehicle Class">
              <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                {VEHICLE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Optional Plate">
            <input
              value={plate.startsWith("DL 01 AB") ? "" : plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="Any plate in window"
              className={`${inputCls} uppercase font-mono tracking-wide`}
              spellCheck="false"
            />
          </Field>
        </div>
      )}

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-signal hover:bg-signal-dark text-navy-deep font-bold transition-all shadow-lg shadow-signal/25 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 rounded-full border-2 border-navy-deep/30 border-t-navy-deep animate-spin" />
            Querying ANPR grid…
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-[18px]">radar</span>
            Run Trajectory Search
          </>
        )}
      </button>
    </form>
  );
}