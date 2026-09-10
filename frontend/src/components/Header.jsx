import { useState } from "react";
import useLiveClock from "../hooks/useLiveClock";
import { siteInfo, navLinks } from "../data/mockData";

const PAGE_TO_PATH = { home: "dashboard", trajectory: "trajectory-search", analytics: "analytics" };
const BUILT = new Set(["dashboard", "trajectory-search", "analytics"]);

/**
 * Header — glassy command-bar. Brand + live IST clock + LIVE badge + profile.
 */
export default function Header({
  brand = siteInfo,
  links = navLinks,
  alertCount = 0,
  activePage = "home",
  onNavigate = () => {},
}) {
  const { formatted } = useLiveClock();
  const activePath = PAGE_TO_PATH[activePage] ?? links[0]?.path;
  const [fallback, setFallback] = useState(activePath);
  const current = activePath ?? fallback;

  const go = (path) => {
    if (path === "dashboard") { onNavigate("home"); return; }
    if (path === "trajectory-search") { onNavigate("trajectory"); return; }
    if (path === "analytics") { onNavigate("analytics"); return; }
    setFallback(path); // placeholder pages: highlight, no route
  };

  return (
    <header className="fixed top-0 w-full z-40 bg-white/85 backdrop-blur-md border-b border-slate-200/70 shadow-[0_1px_4px_rgba(11,28,48,0.06)]">
      <div className="h-16 w-full px-6 flex items-center justify-between gap-4">
        {/* Brand */}
        <button
          onClick={() => onNavigate("home")}
          className="flex items-center gap-3 shrink-0 group"
        >
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-navy text-white shadow-md">
            <span className="material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform">
              radar
            </span>
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-signal border-2 border-white" />
          </span>
          <div className="flex flex-col">
            <span className="font-display text-base font-extrabold text-navy tracking-tight leading-none">
              {brand.brand}
            </span>
            <span className="text-[10px] text-slate-500 font-medium tracking-normal mt-1">
              National Vehicle Intelligence &amp; Surveillance
            </span>
          </div>
        </button>

        {/* Nav */}
        <nav className="hidden lg:flex items-center h-16 gap-5 shrink-0">
          {links.map((link) => {
            const built = BUILT.has(link.path);
            const active = current === link.path;
            return (
              <button
                key={link.path}
                disabled={!built}
                onClick={() => go(link.path)}
                title={built ? link.label : "Coming soon"}
                className={`h-full relative flex items-center text-sm font-semibold transition-colors ${
                  active
                    ? "text-navy"
                    : built
                      ? "text-slate-400 hover:text-slate-900 cursor-pointer"
                      : "text-slate-300 cursor-not-allowed"
                }`}
              >
                {link.label}
                {!built && <span className="ml-1 text-[8px] uppercase tracking-wider text-slate-300">soon</span>}
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-signal" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right cluster */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden xl:flex flex-col items-end pr-4">
            <span className="text-sm font-bold text-slate-900 tabular-nums">{formatted} IST</span>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
              Grid Operational
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 border border-red-100">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
            <span className="text-[11px] font-bold text-red-600 tracking-wide">
              {alertCount} CRITICAL
            </span>
          </div>

          <div className="relative flex items-center justify-center">
            <button
              type="button"
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <span className="material-symbols-outlined text-[22px]">notifications</span>
            </button>
            {alertCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-navy text-white text-[10px] font-bold">
                {alertCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 pl-4 border-l border-slate-200">
            <span className="w-9 h-9 rounded-full bg-gradient-to-br from-navy to-navy-deep text-white flex items-center justify-center text-sm font-bold shadow-sm">
              {brand.officer.replace(/^(\w)/, (m) => m.toUpperCase()).charAt(0)}
            </span>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-sm text-slate-900 font-semibold leading-tight">{brand.officer}</span>
              <span className="text-[10px] text-slate-500 leading-tight">{brand.station}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}