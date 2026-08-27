"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ROUND 2 — the story driver.
 *
 * Scroll does not move the page here, it moves the STORY. A concept declares
 * its beats as fractions of one continuous 0..1 timeline; this hook turns
 * scroll position into that timeline, exposes it as a REF for the render loop
 * (no React work per frame) and as smoothed STATE for the typography layer.
 *
 * The smoothing is deliberate: raw scroll produces a mechanical 1:1 coupling
 * that reads as a slider. An eased follower makes the world feel like it has
 * mass, which is most of the difference between "scroll-linked animation" and
 * "camera choreography".
 */
export type Story = {
  /** raw 0..1 scroll position through the story */
  readonly raw: { current: number };
  /** eased follower, what scenes should actually read */
  readonly t: { current: number };
  /** velocity of the follower, for motion-reactive effects */
  readonly vel: { current: number };
  /** coarse beat index, for DOM copy */
  readonly beat: number;
  /** smoothed 0..1 for DOM (throttled) */
  readonly progress: number;
};

export function useStory(beats: number): Story {
  const raw = useRef(0);
  const t = useRef(0);
  const vel = useRef(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    let alive = true;

    const readScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      raw.current = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };

    const tick = () => {
      if (!alive) return;
      frame = requestAnimationFrame(tick);
      const prev = t.current;
      // critically damped follower; deliberately slow so the world lags the
      // finger a little and therefore reads as physical
      t.current += (raw.current - t.current) * 0.075;
      vel.current = t.current - prev;
      const rounded = Math.round(t.current * 200) / 200;
      setProgress((p) => (Math.abs(p - rounded) > 0.004 ? rounded : p));
    };

    readScroll();
    t.current = raw.current;
    frame = requestAnimationFrame(tick);
    window.addEventListener("scroll", readScroll, { passive: true });
    window.addEventListener("resize", readScroll);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", readScroll);
      window.removeEventListener("resize", readScroll);
    };
  }, []);

  return {
    raw,
    t,
    vel,
    beat: Math.min(beats - 1, Math.floor(progress * beats)),
    progress,
  };
}

/** 0..1 ramp between two story positions. */
export function span(t: number, from: number, to: number): number {
  if (to <= from) return t >= to ? 1 : 0;
  return Math.min(1, Math.max(0, (t - from) / (to - from)));
}

/** 1 inside a window, 0 outside, with soft shoulders. */
export function window01(
  t: number,
  from: number,
  to: number,
  fade = 0.06,
): number {
  return Math.min(span(t, from - fade, from), 1 - span(t, to, to + fade));
}

export const easeInOut = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeOutBack = (x: number) => {
  const c1 = 1.3;
  return 1 + (c1 + 1) * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
