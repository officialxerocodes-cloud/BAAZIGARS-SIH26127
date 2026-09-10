import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

export { gsap, ScrollTrigger };

/**
 * Sets up scroll-driven reveals inside `scope`:
 *  - standalone `[data-reveal]`       -> fade/slide in once
 *  - `[data-reveal-group]` containers -> stagger all `[data-reveal-item]` children
 * Returns a cleanup function.
 */
export function setupReveals(scope) {
  const container =
    scope && scope.current ? scope.current : scope;
  if (!container) return () => {};

  const anims = [];

  container.querySelectorAll("[data-reveal-group]").forEach((group) => {
    const items = group.querySelectorAll("[data-reveal-item]");
    if (!items.length) return;
    const stagger = Number(group.dataset.stagger || 0.08);
    anims.push(
      gsap.fromTo(
        items,
        { y: 26, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.7,
          ease: "power3.out",
          stagger,
          scrollTrigger: {
            trigger: group,
            start: "top 86%",
            once: true,
          },
        }
      )
    );
  });

  container.querySelectorAll("[data-reveal]").forEach((el) => {
    // skip elements already handled inside a group
    if (el.closest("[data-reveal-group]")) return;
    anims.push(
      gsap.fromTo(
        el,
        { y: 26, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start: "top 88%",
            once: true,
          },
        }
      )
    );
  });

  return () => anims.forEach((a) => a.scrollTrigger?.kill());
}