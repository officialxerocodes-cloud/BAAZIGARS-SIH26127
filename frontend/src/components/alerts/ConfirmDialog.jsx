import { useEffect } from "react";

/**
 * ConfirmDialog — blocking confirmation for destructive / state-changing
 * alert actions (resolve + delete). Backdrop click + Escape dismiss.
 */
export default function ConfirmDialog({
  open = false,
  mode = "delete", // "delete" | "resolve"
  title,
  message,
  confirmLabel,
  busy = false,
  onConfirm = () => {},
  onCancel = () => {},
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onCancel]);

  if (!open) return null;

  const danger = mode === "delete";
  const fallbackTitle = danger ? "Delete this alert?" : "Mark as resolved?";
  const fallbackMsg = danger
    ? "This permanently removes the alert from the database ledger. This action cannot be undone."
    : "This marks the alert as acknowledged and moves it to the resolved queue.";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        aria-label="Dismiss"
        onClick={onCancel}
        className="absolute inset-0 bg-navy-deep/50 backdrop-blur-[2px]"
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-panel border border-slate-100 overflow-hidden">
        <div
          className={`h-1.5 w-full ${danger ? "bg-gradient-to-r from-red-500 to-red-700" : "bg-gradient-to-r from-signal to-signal-dark"}`}
        />
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                danger ? "bg-red-50 text-red-600" : "bg-signal/10 text-signal-dark"
              }`}
            >
              <span className="material-symbols-outlined text-[24px]">
                {danger ? "delete_forever" : "task_alt"}
              </span>
            </span>
            <div>
              <h3 className="font-display text-lg font-extrabold text-slate-900">
                {title || fallbackTitle}
              </h3>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                {message || fallbackMsg}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onCancel}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              className={`px-4 py-2 rounded-lg text-sm font-bold text-white shadow-sm transition-colors disabled:opacity-60 inline-flex items-center gap-1.5 ${
                danger
                  ? "bg-[#dc2626] hover:bg-[#b91c1c]"
                  : "bg-signal-dark hover:bg-signal"
              }`}
            >
              {busy && (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              )}
              {confirmLabel || (danger ? "Yes, delete it" : "Yes, resolve it")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
