"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useMounted } from "@/lib/use-mounted";

/**
 * MARKET MOMENT — the landing's map fragment (rebuild 2026-07-29).
 *
 * The old landing led with a wall-sized static world map that said nothing.
 * This is the owner-specified replacement: a CONTROLLED-HEIGHT, stylised map
 * moment that tells ONE story —
 *
 *   "Vilniuje reikalingi 3 specialistai" → "rasti 8 tinkami žmonės"
 *   → "5 prieinami nurodytu laikotarpiu"
 *
 * HONESTY (§18): a concept illustration with sample numbers, and it says so
 * — the "KONCEPCINIS PAVYZDYS" chip is part of the component. No live data
 * is claimed, no OSM widget chrome, no giant empty ocean. Pure SVG + tokens;
 * zero map-library weight on the landing. Reduced motion → the final state
 * renders statically.
 */

const PHASES = 3;
const PHASE_MS = 2200;

export function MarketMoment() {
  const t = useTranslations("landing.moment");
  const mounted = useMounted();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!mounted || reduced) return;
    const id = window.setInterval(() => setPhase((p) => (p + 1) % (PHASES + 1)), PHASE_MS);
    return () => window.clearInterval(id);
  }, [mounted, reduced]);

  const visible = reduced || !mounted ? PHASES : phase;

  // Stylised city cluster — abstract geography, not a geodetic claim.
  const points: { x: number; y: number; kind: "need" | "match" | "avail" }[] = [
    { x: 150, y: 78, kind: "need" },
    { x: 96, y: 52, kind: "match" },
    { x: 196, y: 44, kind: "match" },
    { x: 220, y: 96, kind: "match" },
    { x: 70, y: 104, kind: "match" },
    { x: 126, y: 128, kind: "avail" },
    { x: 176, y: 120, kind: "avail" },
    { x: 106, y: 30, kind: "avail" },
    { x: 236, y: 60, kind: "avail" },
  ];

  const showMatch = visible >= 2;
  const showAvail = visible >= 3;

  return (
    <section className="mt-24" aria-labelledby="market-moment-title" data-testid="market-moment">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <p className="inline-flex items-center gap-2 rounded-sm border border-ink-500 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary">
            {t("chip")}
          </p>
          <h2
            id="market-moment-title"
            className="mt-4 max-w-xl font-display text-3xl font-bold leading-[1.08] tracking-tightest sm:text-4xl"
          >
            {t("title")}
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-text-secondary sm:text-base">
            {t("body")}
          </p>

          {/* The scenario, told as three ticks that light up in sequence. */}
          <ol className="mt-6 flex flex-col gap-2.5">
            {(["p1", "p2", "p3"] as const).map((key, i) => {
              const on = visible >= i + 1;
              return (
                <li
                  key={key}
                  className={`flex items-center gap-3 text-sm transition-colors ${
                    on ? "text-text-primary" : "text-text-muted"
                  }`}
                >
                  <span
                    className={`flex size-6 flex-none items-center justify-center rounded-full border font-mono text-meta font-semibold ${
                      on
                        ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                        : "border-ink-500"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {t(key)}
                </li>
              );
            })}
          </ol>
        </div>

        {/* Controlled height — a moment, not a wall. */}
        <div className="relative overflow-hidden rounded-2xl border border-ink-500 bg-ink-800/40 p-4">
          <svg viewBox="0 0 300 160" className="h-56 w-full sm:h-64" role="img" aria-label={t("svgLabel")}>
            {/* soft district shapes, token-tinted */}
            <g opacity="0.35">
              <path
                d="M30 110 Q60 60 120 58 T240 44 Q272 52 268 92 T210 138 Q140 152 84 140 T30 110Z"
                fill="rgb(var(--c-brand-blue) / 0.10)"
                stroke="rgb(var(--c-ink-500))"
                strokeWidth="1"
              />
              <path
                d="M96 40 Q140 22 196 30"
                fill="none"
                stroke="rgb(var(--c-ink-500))"
                strokeWidth="1"
                strokeDasharray="3 4"
              />
              <path
                d="M60 120 Q130 100 230 112"
                fill="none"
                stroke="rgb(var(--c-ink-500))"
                strokeWidth="1"
                strokeDasharray="3 4"
              />
            </g>
            {points.map((p, i) => {
              const shown =
                p.kind === "need" ? visible >= 1 : p.kind === "match" ? showMatch : showAvail;
              const fill =
                p.kind === "need"
                  ? "rgb(var(--c-state-amber))"
                  : p.kind === "match"
                    ? "rgb(var(--c-brand-blue))"
                    : "rgb(var(--c-state-success))";
              return (
                <motion.circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={p.kind === "need" ? 7 : 5}
                  fill={fill}
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth="1.5"
                  initial={reduced ? false : { opacity: 0, scale: 0.4 }}
                  animate={shown ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }}
                  transition={{ duration: reduced ? 0 : 0.35 }}
                />
              );
            })}
          </svg>
          {/* Legend — states exactly what each colour claims. */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1">
            {(
              [
                ["need", "bg-state-amber"],
                ["match", "bg-brand-blue"],
                ["avail", "bg-state-success"],
              ] as const
            ).map(([key, dot]) => (
              <span key={key} className="inline-flex items-center gap-1.5 text-meta text-text-muted">
                <span className={`size-2 rounded-full ${dot}`} aria-hidden /> {t(`legend.${key}`)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
