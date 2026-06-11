"use client";

import { useEffect, useState } from "react";

/**
 * Quiet score count-up (DESIGN_SOUL: Augimo testas — a confirmed number grows
 * into view; Ramybės testas — once, briefly, never looping).
 *
 * Honest by construction: the REAL value is server-rendered as the initial
 * state (no-JS users and crawlers always see the true number); after mount the
 * digits replay 0 → value once. Timing comes from the motion tokens
 * (--motion-slow) so there is no raw ms here; disabled entirely under
 * prefers-reduced-motion.
 */
export function CountUp({
  text,
  className,
}: {
  /** The already-formatted REAL value (e.g. String(card.skillsDeclared)). */
  text: string;
  className?: string;
}) {
  const target = Number(text);
  const animatable = Number.isFinite(target) && target > 0;
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (!animatable) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const raw = getComputedStyle(document.documentElement).getPropertyValue(
      "--motion-slow",
    );
    const duration = Number.parseFloat(raw);
    if (!Number.isFinite(duration) || duration <= 0) return;

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // decelerate (mirrors --motion-ease-out)
      setDisplay(String(Math.round(eased * target)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animatable, target]);

  return <span className={className}>{animatable ? display : text}</span>;
}
