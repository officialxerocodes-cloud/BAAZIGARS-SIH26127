import { timeAgo } from "../api/adapters";

const STYLES = {
  live: "bg-emerald-100 text-[#16a34a]",
  stale: "bg-amber-100 text-[#b45309]",
  offline: "bg-slate-100 text-slate-500",
};

const DOT = {
  live: "bg-emerald-500",
  stale: "bg-amber-500",
  offline: "bg-slate-400",
};

/**
 * FeedBadge — one honest pill per widget: LIVE (backend fresh), STALE
 * (backend quiet — last poll failed or data aged out), OFFLINE (demo data).
 */
export default function FeedBadge({ feed = "offline", updatedAt = null }) {
  const label =
    feed === "live"
      ? `Live · updated ${timeAgo(updatedAt)}`
      : feed === "stale"
        ? `Stale · ${timeAgo(updatedAt)}`
        : "Offline · demo data";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${STYLES[feed] ?? STYLES.offline}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${DOT[feed] ?? DOT.offline}`} />
      {label}
    </span>
  );
}
