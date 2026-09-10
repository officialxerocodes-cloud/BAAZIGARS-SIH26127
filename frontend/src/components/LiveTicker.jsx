import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "../lib/gsap";
import { liveAlerts } from "../data/mockData";
import FeedBadge from "./FeedBadge";

function TickerItem({ alert }) {
  return (
    <span className="inline-flex items-center gap-2.5 px-6 shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full ${alert.dotColor ? "" : "bg-signal"}`}
        style={alert.dotColor ? { backgroundColor: alert.dotColor } : undefined}
      />
      <span className="font-bold text-white/95">{alert.plate}</span>
      <span className="text-signal-bright text-[11px] font-bold uppercase tracking-wider">
        {alert.tag}
      </span>
      <span className="text-white/55 text-sm whitespace-nowrap">{alert.description}</span>
      <span className="text-white/35 text-xs whitespace-nowrap">{alert.location}</span>
    </span>
  );
}

/**
 * LiveTicker — infinite GSAP marquee of latest alerts under the hero.
 * Doubles the list for a seamless loop; pauses on hover.
 *
 * feed: 'live' | 'stale' | 'offline' (from feedState). Only 'offline' shows
 * fixture rows; a reachable backend with zero alerts shows an honest quiet
 * message instead of mock traffic.
 */
export default function LiveTicker({ alerts = [], feed = "offline", updatedAt = null, realtime = false, label = null }) {
  const root = useRef(null);
  const track = useRef(null);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const tween = gsap.to(track.current, {
      xPercent: -50,
      duration: 40,
      ease: "none",
      repeat: -1,
    });
    const el = root.current;
    const pause = () => tween.pause();
    const resume = () => tween.resume();
    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resume);
    return () => {
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", resume);
      tween.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = feed === "offline" ? liveAlerts : alerts;
  const resolvedLabel = label ?? (feed === "offline" ? "DEMO FEED" : "LIVE GRID FEED");

  const renderItem = (a, i) => <TickerItem key={`${a.id}-${i}`} alert={a} />;

  return (
    <div
      ref={root}
      className="relative overflow-hidden rounded-xl bg-navy-deep text-white shadow-panel border border-navy/20"
    >
      <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center gap-2 px-4 bg-navy-deep">
        <span className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] uppercase text-signal-bright">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-signal" />
          </span>
          {resolvedLabel}
        </span>
        <FeedBadge feed={feed} updatedAt={updatedAt} />
        {realtime && feed !== "offline" && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            WS
          </span>
        )}
      </div>
      <div className="ml-[14rem] overflow-hidden">
        <div ref={track} className="flex w-max items-center py-3 whitespace-nowrap">
          {items.length ? (
            items.concat(items).map(renderItem)
          ) : (
            <span className="px-6 text-sm text-white/50">
              Grid quiet — no alerts in the live feed. Run the sim traffic to generate some.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}