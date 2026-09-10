import { useState } from "react";
import useApi from "../hooks/useApi";
import { getBlacklist, postBlacklist, deleteBlacklist } from "../api/client";
import { canonicalPlate, timeAgo } from "../api/adapters";
import FeedBadge from "./FeedBadge";

/**
 * BlacklistManager — wanted-plate admin panel (P1: registry is now
 * GET/POST/DELETE capable). Self-contained: loads the registry, adds and
 * removes entries. Renders an offline notice when the backend is down
 * instead of a fake editable list.
 */
export default function BlacklistManager() {
  const registry = useApi(() => getBlacklist(), null);
  const [plate, setPlate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const feed = registry.updatedAt != null ? "live" : "offline";

  const refresh = async () => {
    try {
      registry.setData(await getBlacklist());
    } catch (e) {
      setError(`Refresh failed: ${e.message}`);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    const canonical = canonicalPlate(plate);
    if (canonical.length < 4) {
      setError("Enter a valid registration number (min 4 chars).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await postBlacklist(canonical, reason.trim());
      setPlate("");
      setReason("");
      await refresh();
    } catch (err) {
      setError(`Add failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p) => {
    setBusy(true);
    setError("");
    try {
      await deleteBlacklist(p);
      await refresh();
    } catch (err) {
      setError(`Remove failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const rows = Array.isArray(registry.data) ? registry.data : [];

  return (
    <section className="bg-white rounded-2xl p-6 shadow-panel space-y-4 border border-slate-100">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-navy/5 text-navy flex items-center justify-center">
            <span className="material-symbols-outlined text-[20px]">shield</span>
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Blacklist Admin</h2>
            <p className="text-xs text-slate-500">
              Wanted plates — hits raise Critical alerts on the grid
            </p>
          </div>
        </div>
        <FeedBadge feed={feed} updatedAt={registry.updatedAt} />
      </div>

      {feed === "offline" ? (
        <p className="text-sm text-slate-400 py-2">
          Registry unavailable — backend offline. Blacklist edits are disabled.
        </p>
      ) : (
        <>
          <form onSubmit={add} className="flex flex-col sm:flex-row gap-2">
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="Plate e.g. DL01AB1234"
              spellCheck="false"
              className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono uppercase placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-navy/30"
            />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-navy/30"
            />
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-navy text-white text-sm font-bold hover:bg-navy-dark disabled:opacity-60"
            >
              {busy ? "Working…" : "Add plate"}
            </button>
          </form>
          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          <div className="space-y-2">
            {rows.length ? (
              rows.map((r) => (
                <div
                  key={r.plate}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100"
                >
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-sm text-slate-900">{r.plate}</span>
                    <span className="text-xs text-slate-500 ml-2 truncate">
                      {r.reason || "no reason"} · {timeAgo(r.added_at)}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(r.plate)}
                    className="text-xs font-bold text-red-600 hover:text-red-800 disabled:opacity-60 shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400 py-2">
                Registry empty — add a plate to arm the watchman.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
