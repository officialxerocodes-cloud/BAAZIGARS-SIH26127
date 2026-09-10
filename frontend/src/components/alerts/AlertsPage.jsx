import { useMemo, useState } from "react";
import AlertDetailPanel from "./AlertDetailPanel";
import ConfirmDialog from "./ConfirmDialog";
import { resolveAlert, deleteAlert } from "../../api/client";
import {
  CATEGORIES,
  RANGES,
  STATUSES,
  enrichAlert,
  matchesQuery,
  inRange,
  countBy,
} from "../../data/alerts";

const SEVERITIES = ["All", "Critical", "Warning", "Info"];

const SEV_DOT = { Critical: "#dc2626", Warning: "#f59e0b", Info: "#2563eb" };
const SEV_ROW = {
  Critical: "border-l-[#dc2626]",
  Warning: "border-l-[#f59e0b]",
  Info: "border-l-[#2563eb]",
};

function Chip({ active, onClick, children, tone = "slate" }) {
  const tones = {
    slate: active
      ? "bg-navy text-white border-navy shadow-sm"
      : "bg-white text-slate-600 border-slate-200 hover:border-navy/40 hover:text-navy",
    red: active
      ? "bg-[#dc2626] text-white border-[#dc2626] shadow-sm"
      : "bg-white text-slate-600 border-slate-200 hover:border-red-300 hover:text-[#dc2626]",
    amber: active
      ? "bg-amber-500 text-white border-amber-500 shadow-sm"
      : "bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:text-amber-700",
    blue: active
      ? "bg-[#2563eb] text-white border-[#2563eb] shadow-sm"
      : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-[#2563eb]",
    green: active
      ? "bg-signal-dark text-white border-signal-dark shadow-sm"
      : "bg-white text-slate-600 border-slate-200 hover:border-signal hover:text-signal-dark",
  };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function Count({ n }) {
  return (
    <span className="ml-0.5 px-1.5 py-0.5 rounded-md bg-black/10 text-[10px] font-extrabold tabular-nums">
      {n}
    </span>
  );
}

function TotalCard({ icon, label, value, accent, bg }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white border border-slate-100 shadow-panel px-4 py-3">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
        <span className={`material-symbols-outlined text-[22px] ${accent}`}>{icon}</span>
      </span>
      <div className="min-w-0">
        <p className="font-display text-xl font-extrabold text-slate-900 tabular-nums leading-none">
          {value}
        </p>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1 truncate">
          {label}
        </p>
      </div>
    </div>
  );
}

/**
 * AlertsPage — alerts command center.
 * Filters (plate / location / road / date / anomaly type / severity /
 * status / time range) with live counts, headline list, and a right-hand
 * case-file panel with print / download / resolve / delete (confirmed).
 */
export default function AlertsPage({
  alerts = [],
  rawAlerts = [],
  seed = null,
  onTrace = () => {},
}) {
  const [q, setQ] = useState("");
  const [cats, setCats] = useState(seed?.cats ?? []);
  const [sev, setSev] = useState(seed?.sev ?? "All");
  const [status, setStatus] = useState(seed?.status ?? "all");
  const [zone, setZone] = useState("all");
  const [road, setRoad] = useState("all");
  const [date, setDate] = useState("");
  const [range, setRange] = useState("all");
  const [selectedId, setSelectedId] = useState(seed?.selectedId ?? null);
  const [resolvedIds, setResolvedIds] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);
  const [confirm, setConfirm] = useState(null); // { mode, id }
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const notify = (msg) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  };

  const rawById = useMemo(() => {
    const m = {};
    for (const r of rawAlerts || []) {
      const id = r.id || `${r.type}-${r.canonical}`;
      m[id] = r;
    }
    return m;
  }, [rawAlerts]);

  const enriched = useMemo(() => {
    const list = alerts
      .map((a) => enrichAlert(a, rawById[a.id]))
      .filter(Boolean)
      .filter((e) => !deletedIds.includes(e.id));
    return list.sort((a, b) => b.ts - a.ts);
  }, [alerts, rawById, deletedIds]);

  const withStatus = useMemo(
    () =>
      enriched.map((e) => ({
        ...e,
        state: resolvedIds.includes(e.id) || e.acknowledged ? "resolved" : "open",
      })),
    [enriched, resolvedIds]
  );

  // Time context first: date + range drive every count on the page.
  const timeScoped = useMemo(
    () =>
      withStatus.filter(
        (e) =>
          (!date || e.dateKey === date) &&
          inRange(e, range)
      ),
    [withStatus, date, range]
  );

  const catCounts = useMemo(() => countBy(timeScoped, "category"), [timeScoped]);
  const sevCounts = useMemo(() => countBy(timeScoped, "severity"), [timeScoped]);
  const statusCounts = useMemo(() => countBy(timeScoped, "state"), [timeScoped]);
  const rangeCounts = useMemo(() => {
    const dateScoped = withStatus.filter((e) => !date || e.dateKey === date);
    const m = {};
    for (const r of RANGES) m[r.id] = dateScoped.filter((e) => inRange(e, r.id)).length;
    return m;
  }, [withStatus, date]);

  const zones = useMemo(
    () => [...new Set(timeScoped.map((e) => e.zone))].sort(),
    [timeScoped]
  );
  const roads = useMemo(
    () => [...new Set(timeScoped.map((e) => e.road))].sort(),
    [timeScoped]
  );
  const zoneCounts = useMemo(() => countBy(timeScoped, "zone"), [timeScoped]);

  const filtered = useMemo(
    () =>
      timeScoped.filter(
        (e) =>
          matchesQuery(e, q) &&
          (!cats.length || cats.includes(e.category)) &&
          (sev === "All" || e.severity === sev) &&
          (status === "all" || e.state === status) &&
          (zone === "all" || e.zone === zone) &&
          (road === "all" || e.road === road)
      ),
    [timeScoped, q, cats, sev, status, zone, road]
  );

  const selected = filtered.find((e) => e.id === selectedId) || filtered[0] || null;

  const totals = {
    total: timeScoped.length,
    critical: sevCounts.Critical || 0,
    warning: sevCounts.Warning || 0,
    info: sevCounts.Info || 0,
    open: statusCounts.open || 0,
    resolved: statusCounts.resolved || 0,
  };

  const toggleCat = (id) =>
    setCats((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const resetAll = () => {
    setQ(""); setCats([]); setSev("All"); setStatus("all");
    setZone("all"); setRoad("all"); setDate(""); setRange("all");
  };
  const hasFilters =
    q || cats.length || sev !== "All" || status !== "all" ||
    zone !== "all" || road !== "all" || date || range !== "all";

  const doConfirm = async () => {
    if (!confirm) return;
    const { mode, id } = confirm;
    const target = withStatus.find((e) => e.id === id);
    setBusy(true);
    try {
      if (mode === "resolve") {
        try {
          await resolveAlert(id);
          notify("Resolved — acknowledged in the ledger");
        } catch {
          notify("Backend acknowledge unavailable — resolved locally");
        }
        setResolvedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      } else {
        try {
          await deleteAlert(id);
          notify("Deleted from the database");
        } catch {
          notify("Backend delete route unavailable — removed from this session");
        }
        setDeletedIds((prev) => [...prev, id]);
        if (selectedId === id) setSelectedId(null);
      }
    } finally {
      setBusy(false);
      setConfirm(null);
    }
    void target;
  };

  return (
    <section className="w-full px-6 py-4 space-y-4">
      {/* ---- totals ---- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <TotalCard icon="stacked_inbox" label={`Total · ${RANGES.find((r) => r.id === range)?.label}`} value={totals.total} accent="text-navy" bg="bg-navy/5" />
        <TotalCard icon="priority_high" label="Critical" value={totals.critical} accent="text-[#dc2626]" bg="bg-red-50" />
        <TotalCard icon="warning" label="Warning" value={totals.warning} accent="text-amber-600" bg="bg-amber-50" />
        <TotalCard icon="info" label="Info" value={totals.info} accent="text-[#2563eb]" bg="bg-blue-50" />
        <TotalCard icon="fiber_new" label="Open" value={totals.open} accent="text-signal-dark" bg="bg-signal/10" />
        <TotalCard icon="task_alt" label="Resolved" value={totals.resolved} accent="text-emerald-600" bg="bg-emerald-50" />
      </div>

      {/* ---- filter deck ---- */}
      <div className="alerts-no-print rounded-2xl bg-white border border-slate-100 shadow-panel p-4 space-y-3.5">
        {/* search + date + selects */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr] gap-2.5">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 focus-within:border-navy/50 focus-within:bg-white transition-colors">
            <span className="material-symbols-outlined text-[18px] text-slate-400">search</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by plate, camera, road, zone…"
              className="w-full bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-400"
            />
            {q && (
              <button onClick={() => setQ("")} className="text-slate-400 hover:text-slate-700">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
            <span className="material-symbols-outlined text-[18px] text-slate-400">location_on</span>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className="w-full bg-transparent outline-none text-sm font-semibold text-slate-700"
            >
              <option value="all">All locations ({timeScoped.length})</option>
              {zones.map((z) => (
                <option key={z} value={z}>{z} ({zoneCounts[z] || 0})</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
            <span className="material-symbols-outlined text-[18px] text-slate-400">route</span>
            <select
              value={road}
              onChange={(e) => setRoad(e.target.value)}
              className="w-full bg-transparent outline-none text-sm font-semibold text-slate-700"
            >
              <option value="all">All roads</option>
              {roads.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
            <span className="material-symbols-outlined text-[18px] text-slate-400">calendar_month</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-transparent outline-none text-sm font-semibold text-slate-700"
            />
            {date && (
              <button onClick={() => setDate("")} className="text-slate-400 hover:text-slate-700">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </label>
        </div>

        {/* anomaly type chips */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
            Anomaly type
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => {
              const n = catCounts[c.id] || 0;
              if (!n && timeScoped.length > 0) return null;
              return (
                <Chip key={c.id} active={cats.includes(c.id)} onClick={() => toggleCat(c.id)}>
                  <span className="material-symbols-outlined text-[15px]">{c.icon}</span>
                  {c.label}
                  <Count n={n} />
                </Chip>
              );
            })}
            {cats.length > 0 && (
              <button
                onClick={() => setCats([])}
                className="text-[11px] font-bold text-slate-400 hover:text-navy px-1"
              >
                clear
              </button>
            )}
          </div>
        </div>

        {/* severity + status + range */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Severity</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={sev === "All"} onClick={() => setSev("All")}>
                All <Count n={timeScoped.length} />
              </Chip>
              <Chip active={sev === "Critical"} tone="red" onClick={() => setSev(sev === "Critical" ? "All" : "Critical")}>
                Critical <Count n={sevCounts.Critical || 0} />
              </Chip>
              <Chip active={sev === "Warning"} tone="amber" onClick={() => setSev(sev === "Warning" ? "All" : "Warning")}>
                Warning <Count n={sevCounts.Warning || 0} />
              </Chip>
              <Chip active={sev === "Info"} tone="blue" onClick={() => setSev(sev === "Info" ? "All" : "Info")}>
                Info <Count n={sevCounts.Info || 0} />
              </Chip>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {[{ id: "all", label: "All" }, ...STATUSES].map((s) => (
                <Chip
                  key={s.id}
                  tone={s.id === "resolved" ? "green" : "slate"}
                  active={status === s.id}
                  onClick={() => setStatus(s.id)}
                >
                  {s.label}
                  <Count n={s.id === "all" ? timeScoped.length : statusCounts[s.id] || 0} />
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Time range</p>
            <div className="flex flex-wrap gap-1.5">
              {RANGES.map((r) => (
                <Chip
                  key={r.id}
                  tone={range === r.id ? "slate" : "slate"}
                  active={range === r.id}
                  onClick={() => setRange(r.id)}
                >
                  {r.label}
                  <Count n={rangeCounts[r.id] ?? 0} />
                </Chip>
              ))}
            </div>
          </div>
        </div>

        {/* result meta */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            Showing <strong className="text-navy">{filtered.length}</strong> of{" "}
            <strong className="text-slate-800">{timeScoped.length}</strong> alerts
            {date ? ` on ${date}` : ""} · {RANGES.find((r) => r.id === range)?.label}
          </p>
          {hasFilters && (
            <button
              onClick={resetAll}
              className="ml-auto text-[11px] font-bold text-navy hover:text-navy-dark inline-flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>
              Reset all filters
            </button>
          )}
        </div>
      </div>

      {/* ---- headlines + detail ---- */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,460px)_1fr] gap-4 items-start">
        {/* headlines */}
        <div className="alerts-no-print rounded-2xl bg-white border border-slate-100 shadow-panel overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
            <span className="material-symbols-outlined text-[17px] text-navy">feed</span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Alert headlines
            </span>
            <span className="ml-auto px-2 py-0.5 rounded-full bg-navy/5 text-navy text-[11px] font-extrabold tabular-nums">
              {filtered.length}
            </span>
          </div>
          <div className="max-h-[720px] overflow-y-auto divide-y divide-slate-50">
            {filtered.length === 0 && (
              <div className="p-8 text-center">
                <span className="material-symbols-outlined text-[40px] text-slate-200">search_off</span>
                <p className="mt-2 font-display font-extrabold text-slate-700">No alerts match</p>
                <p className="text-xs text-slate-400 mt-1">Loosen a filter or two — the grid rarely stays quiet.</p>
                <button
                  onClick={resetAll}
                  className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold bg-navy text-white hover:bg-navy-dark"
                >
                  Reset filters
                </button>
              </div>
            )}
            {filtered.map((e) => {
              const active = selected?.id === e.id;
              return (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  className={`w-full text-left px-4 py-3 border-l-4 transition-colors group ${
                    SEV_ROW[e.severity]
                  } ${active ? "bg-navy/[0.05]" : "hover:bg-slate-50 bg-white"}`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className="mt-1.5 w-2 h-2 rounded-full shrink-0 animate-pulse"
                      style={{ backgroundColor: SEV_DOT[e.severity] }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-white font-display font-bold tracking-wider text-slate-900 shadow-sm border border-slate-200 text-[13px]">
                          {e.plate}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${e.tagClass}`}>
                          {e.tag}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-600 inline-flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">{e.categoryIcon}</span>
                          {e.categoryLabel}
                        </span>
                        {e.live && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-signal/10 text-signal-dark">
                            Live
                          </span>
                        )}
                        {e.state === "resolved" && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-100 text-emerald-700">
                            Resolved
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] text-slate-800 font-semibold truncate mt-1">
                        {e.description}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {e.cam} · {e.road} · {e.dateLabel} · {e.timeLabel}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-[10px] text-slate-400 font-semibold whitespace-nowrap">
                        {e.time}
                      </span>
                      <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        {e.state !== "resolved" && (
                          <span
                            role="button"
                            tabIndex={0}
                            title="Mark resolved"
                            onClick={(ev) => { ev.stopPropagation(); setConfirm({ mode: "resolve", id: e.id }); }}
                            onKeyDown={(ev) => { if (ev.key === "Enter") setConfirm({ mode: "resolve", id: e.id }); }}
                            className="p-1.5 rounded-lg bg-signal/10 text-signal-dark hover:bg-signal/25"
                          >
                            <span className="material-symbols-outlined text-[15px]">task_alt</span>
                          </span>
                        )}
                        <span
                          role="button"
                          tabIndex={0}
                          title="Delete alert"
                          onClick={(ev) => { ev.stopPropagation(); setConfirm({ mode: "delete", id: e.id }); }}
                          onKeyDown={(ev) => { if (ev.key === "Enter") setConfirm({ mode: "delete", id: e.id }); }}
                          className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"
                        >
                          <span className="material-symbols-outlined text-[15px]">delete</span>
                        </span>
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* detail */}
        <div className="xl:sticky xl:top-20 min-w-0">
          <AlertDetailPanel
            alert={selected}
            status={selected?.state || "open"}
            notify={notify}
            onTrace={onTrace}
            onResolve={() => selected && setConfirm({ mode: "resolve", id: selected.id })}
            onDelete={() => selected && setConfirm({ mode: "delete", id: selected.id })}
          />
        </div>
      </div>

      {/* confirm */}
      <ConfirmDialog
        open={!!confirm}
        mode={confirm?.mode || "delete"}
        busy={busy}
        onCancel={() => !busy && setConfirm(null)}
        onConfirm={doConfirm}
        title={
          confirm?.mode === "delete"
            ? "Delete this alert from the database?"
            : "Mark this alert as resolved?"
        }
        message={
          confirm?.mode === "delete"
            ? "The alert row will be permanently removed from the database ledger. The ANPR reads stay untouched — only this alert entry is deleted. This cannot be undone."
            : "The alert will be acknowledged in the ledger and moved to the resolved queue. You can still find it under the Resolved filter."
        }
        confirmLabel={confirm?.mode === "delete" ? "Yes, delete permanently" : "Yes, resolve it"}
      />

      {/* toast */}
      {toast && (
        <div className="alerts-no-print fixed bottom-5 right-5 z-[80] flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-deep text-white text-sm font-semibold shadow-panel">
          <span className="material-symbols-outlined text-[18px] text-signal-bright">check_circle</span>
          {toast}
        </div>
      )}
    </section>
  );
}
