import { useEffect, useRef } from "react";
import { gsap, prefersReducedMotion } from "../lib/gsap";
import { splashContent } from "../data/mockData";

/**
 * SplashScreen — full-screen TRINETRA intro shown before the dashboard.
 * Timeline: kicker -> letter-by-letter wordmark -> signal line -> tagline ->
 * trust row -> slide-up wipe revealing the app. Click anywhere to skip.
 */
export default function SplashScreen({ content = splashContent, onComplete }) {
  const root = useRef(null);
  const done = useRef(false);

  useEffect(() => {
    const el = root.current;
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set("[data-splash-stage]", { autoAlpha: 1 });
        const t = setTimeout(onComplete, 900);
        return () => clearTimeout(t);
      }

      const letters = el.querySelectorAll("[data-splash-letter]");
      gsap.set(el, { autoAlpha: 1 });

      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: () => finish(),
      });

      tl.fromTo(
        "[data-splash-kicker]",
        { autoAlpha: 0, letterSpacing: "0.6em" },
        { autoAlpha: 1, letterSpacing: "0.28em", duration: 0.9 }
      )
        .fromTo(
          letters,
          { yPercent: 120, autoAlpha: 0 },
          { yPercent: 0, autoAlpha: 1, duration: 0.7, stagger: 0.055, ease: "power4.out" },
          "-=0.3"
        )
        .fromTo(
          "[data-splash-line]",
          { scaleX: 0 },
          { scaleX: 1, duration: 0.9, ease: "power4.inOut" },
          "-=0.4"
        )
        .fromTo(
          "[data-splash-tagline]",
          { y: 18, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.7 },
          "-=0.5"
        )
        .fromTo(
          "[data-splash-subline]",
          { y: 14, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.6 },
          "-=0.4"
        )
        .fromTo(
          "[data-splash-trust] > *",
          { y: 12, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.12 },
          "-=0.3"
        )
        .to({}, { duration: 1.1 });
    }, root);

    const finish = () => {
      if (done.current) return;
      done.current = true;
      if (prefersReducedMotion()) {
        onComplete?.();
        return;
      }
      gsap.to(el, {
        yPercent: -100,
        duration: 1.15,
        ease: "power4.inOut",
        onComplete: () => onComplete?.(),
      });
    };

    const onSkip = () => {
      if (!done.current) {
        finish();
      }
    };
    el.addEventListener("click", onSkip);
    el.addEventListener("keydown", onSkip);

    return () => {
      el.removeEventListener("click", onSkip);
      el.removeEventListener("keydown", onSkip);
      ctx.revert();
    };
  }, [onComplete]);

  const letters = content.brand.split("");

  return (
    <div
      ref={root}
      data-splash-stage
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[radial-gradient(120%_140%_at_50%_0%,#12396e_0%,#00245e_45%,#001a3f_100%)] text-white cursor-pointer select-none"
      role="dialog"
      aria-label="TRINETRA intro"
    >
      <div className="relative flex flex-col items-center px-6 text-center">
        <p
          data-splash-kicker
          className="text-[10px] sm:text-xs font-semibold text-signal-bright tracking-[0.28em] uppercase opacity-0"
        >
          {content.kicker}
        </p>

        <h1 className="reveal-mask font-display text-6xl sm:text-8xl font-extrabold tracking-tight mt-4">
          {letters.map((ch, i) => (
            <span key={`${ch}-${i}`} data-splash-letter className="trinetra-ch">
              {ch === " " ? "\u00A0" : ch}
            </span>
          ))}
        </h1>

        <span
          data-splash-line
          className="block h-1 w-52 sm:w-72 mt-5 rounded-full bg-gradient-to-r from-signal-bright via-signal to-signal-dark origin-left opacity-0"
        />

        <p
          data-splash-tagline
          className="mt-5 text-lg sm:text-2xl font-semibold text-white/95 opacity-0"
        >
          {content.tagline}
        </p>
        <p
          data-splash-subline
          className="mt-3 max-w-xl text-sm sm:text-base text-white/60 leading-relaxed opacity-0"
        >
          {content.subline}
        </p>

        <div
          data-splash-trust
          className="mt-9 flex flex-wrap items-center justify-center gap-3 opacity-0"
        >
          {content.trustRow.map((t) => (
            <span
              key={t}
              className="px-3 py-1.5 rounded-full border border-white/15 bg-white/5 text-[10px] sm:text-[11px] font-semibold tracking-[0.18em] text-white/70"
            >
              {t}
            </span>
          ))}
        </div>

        <p className="absolute bottom-6 text-[10px] tracking-[0.2em] text-white/35 uppercase">
          National Security Infrastructure · Authorized Access Only
        </p>
      </div>
    </div>
  );
}