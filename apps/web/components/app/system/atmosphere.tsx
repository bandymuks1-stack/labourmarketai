"use client";

import { useEffect, useRef } from "react";

/**
 * THE ATMOSPHERE — one dark gradient and one slow field of dust behind EVERY
 * screen. It is the continuity device: the impact areas and the working areas
 * sit in the same air, so moving between them never feels like leaving one
 * site for another. Quiet by design: 46 points, under 6% opacity, drifting
 * slower than reading speed; static under prefers-reduced-motion.
 */
export function Atmosphere() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, raf = 0;
    const pts = Array.from({ length: 46 }, (_, i) => ({ x: ((i * 97) % 100) / 100, y: ((i * 53) % 100) / 100, r: 0.6 + ((i * 7) % 10) / 9, s: 0.4 + ((i * 13) % 10) / 12 }));
    const size = () => {
      const d = Math.min(2, window.devicePixelRatio || 1);
      W = c.clientWidth; H = c.clientHeight;
      c.width = W * d; c.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        const y = (((p.y - (t * 0.000004 * p.s)) % 1) + 1) % 1;
        const x = p.x + Math.sin(t * 0.00006 * p.s + p.y * 9) * 0.01;
        ctx.fillStyle = `rgba(235,200,95,${0.05 + 0.04 * Math.sin(t * 0.0004 + p.x * 20)})`;
        ctx.beginPath(); ctx.arc(x * W, y * H, p.r, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    size(); draw(0);
    const ro = new ResizeObserver(() => { size(); if (reduce) draw(0); });
    ro.observe(c);
    if (!reduce) raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_12%_0%,rgba(212,175,55,0.085),transparent_70%),radial-gradient(55%_55%_at_100%_100%,rgba(70,90,120,0.10),transparent_70%)]" />
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
