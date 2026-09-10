import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "../lib/gsap";
import { heroContent } from "../data/mockData";
import LiveMap from "./LiveMap";
import useApi from "../hooks/useApi";
import { getCameras, getHeatmap } from "../api/client";
import { buildCamerasGeo, buildHeatGeo } from "../api/liveTrajectory";

/**
 * Hero — full-bleed vector map of Delhi (MapLibre GL, WebGL heat zones).
 * TRINETRA · DELHI wordmark and action copy sit directly on the live grid;
 * scrims are localized so the map stays clearly visible and interactive.
 */
export default function Hero({ content = heroContent, play = true, onNavigate = () => {} }) {
  const root = useRef(null);

  // Live grid layers for the hero map: registry pins + heat blobs. Null/[]
  // while the backend is unreachable keeps the bundled fixtures (LiveMap
  // swaps in live data without remounting once it arrives).
  const camerasApi = useApi(() => getCameras(), null);
  const heatApi = useApi(() => getHeatmap(), [], { pollMs: 30000 });
  const camerasGeo = buildCamerasGeo(camerasApi.data);
  const heatGeo = buildHeatGeo(heatApi.data, camerasApi.data);

  useEffect(() => {
    gsap.set("[data-hero-fade]", { autoAlpha: 0, y: 20 });
  }, []);

  useEffect(() => {
    if (!play) return undefined;
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set("[data-hero-fade]", { opacity: 1, y: 0 });
        return;
      }
      gsap.fromTo(
        "[data-hero-fade]",
        { y: 20, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.65, stagger: 0.09, ease: "power3.out", delay: 0.05 }
      );
    }, root);
    return () => ctx.revert();
  }, [play]);

  return (
    <section
      ref={root}
      className="relative w-full overflow-hidden rounded-2xl shadow-panel border border-slate-200/70 h-[min(80vh,700px)] min-h-[600px]"
    >
      {/* vector map */}
      <LiveMap camerasGeo={camerasGeo} heatGeo={heatGeo} />

      {/* localized scrims — map stays visible through the fade */}
      <div className="absolute inset-y-0 left-0 w-full sm:w-3/4 bg-gradient-to-r from-navy-deep/85 via-navy-deep/40 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#F8F9FA] to-transparent pointer-events-none" />

      {/* Brand content */}
      <div className="absolute inset-0 z-20 flex flex-col justify-center px-6 sm:px-10 pointer-events-none">
        <div className="max-w-xl space-y-4">
          <span
            data-hero-fade
            className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white text-[10px] font-bold tracking-[0.18em] uppercase pointer-events-auto"
          >
            <span className="relative flex h-4 w-4">
              <span className="material-symbols-outlined text-[16px] text-signal-bright">
                radar
              </span>
              <span className="radar-sweep absolute inset-0 border border-signal/60 rounded-full" />
            </span>
            {content.badge}
          </span>

          <div data-hero-fade>
            <h1 className="font-display text-5xl sm:text-6xl xl:text-7xl font-extrabold text-white tracking-tight leading-[1.02]">
              TRINETRA
              <span className="mx-2.5 text-signal-bright font-bold align-middle">·</span>
              <span className="text-signal-bright">DELHI</span>
            </h1>
            <p className="mt-2.5 text-lg sm:text-xl font-semibold text-white/90">
              {content.tagline}
            </p>
            <p className="mt-2.5 max-w-xl text-sm sm:text-[15px] text-white/65 leading-relaxed">
              {content.description}
            </p>
          </div>

          <div
            data-hero-fade
            className="flex flex-wrap items-center gap-3 pt-1"
          >
            <a
              href={content.primaryCta.to?.startsWith("#") ? content.primaryCta.to : undefined}
              onClick={
                content.primaryCta.to && !content.primaryCta.to.startsWith("#")
                  ? (e) => {
                      e.preventDefault();
                      onNavigate(content.primaryCta.to);
                    }
                  : undefined
              }
              className="inline-flex pointer-events-auto items-center justify-center gap-2 px-5 py-3 rounded-xl bg-signal hover:bg-signal-dark text-navy-deep font-bold transition-all shadow-lg shadow-signal/25 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">
                {content.primaryCta.icon}
              </span>
              {content.primaryCta.label}
            </a>
            <a
              href={content.secondaryCta.to?.startsWith("#") ? content.secondaryCta.to : undefined}
              onClick={
                content.secondaryCta.to && !content.secondaryCta.to.startsWith("#")
                  ? (e) => {
                      e.preventDefault();
                      onNavigate(content.secondaryCta.to);
                    }
                  : undefined
              }
              className="inline-flex pointer-events-auto items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/10 backdrop-blur-md border border-white/25 hover:bg-white/20 text-white font-semibold transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">
                {content.secondaryCta.icon}
              </span>
              {content.secondaryCta.label}
            </a>
            <p className="text-[10px] text-white/45 font-semibold tracking-[0.14em] uppercase ml-1">
              Authorized Surveillance Infrastructure
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}