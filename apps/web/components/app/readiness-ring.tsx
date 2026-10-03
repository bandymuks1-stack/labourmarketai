"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";
import type { ReadinessLevel } from "@/lib/player-card/readiness";

/**
 * ReadinessRing — the Player Card's status ring. It reuses the EXACT premium
 * scouting visual language of the landing OVRRing (same SVG gauge, same
 * tier color tokens, same scroll-in arc), but it is an HONEST readiness gauge:
 * the arc fills by `met / total` REAL signals and the centre shows the met
 * count, never a fabricated 0–99 rating.
 */

const SIZES = { sm: 56, md: 80, lg: 120 } as const;

/** Readiness level → brand tokens. Gold here is the brand progress accent,
 *  NOT a confirmation: confirmation is the verification green (owner-ratified
 *  2026-09-22) and never appears on this ring. Readiness is a count of real
 *  steps done. The arc is thin and calm; the figure is display type. */
const LEVEL_STROKE: Record<ReadinessLevel, string> = {
  ready: "stroke-brand-blue",
  building: "stroke-text-secondary",
  start: "stroke-ink-500",
};
const LEVEL_TEXT: Record<ReadinessLevel, string> = {
  ready: "text-brand-blue",
  building: "text-text-secondary",
  start: "text-text-muted",
};

export function ReadinessRing({
  met,
  total,
  level,
  caption,
  ariaLabel,
  size = "md",
}: {
  met: number;
  total: number;
  level: ReadinessLevel;
  /** What the count counts, in words ("Profile steps"). A bare "6/6" with a
   *  judgement word ("Ready") beside it was an unexplained score; the caption
   *  names the thing counted and the caller lists the steps beside it. */
  caption: string;
  /** Full accessible name: "Profile steps: 6 of 6 done". */
  ariaLabel: string;
  size?: keyof typeof SIZES;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { amount: 0.6 });
  const reduce = useReducedMotion();
  const mounted = useMounted();
  const animateIn = mounted && !reduce;

  const px = SIZES[size];
  const stroke = Math.max(3, Math.round(px / 16));
  const r = (px - stroke) / 2;
  const cx = px / 2;
  const C = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, met / total)) : 0;
  const filled = C * (1 - frac);

  return (
    <div className="flex flex-col items-center gap-1" data-testid="readiness-ring">
      <svg
        ref={ref}
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        role="img"
        aria-label={ariaLabel}
      >
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-ink-600"
        />
        <motion.circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={LEVEL_STROKE[level]}
          transform={`rotate(-90 ${cx} ${cx})`}
          strokeDasharray={C}
          initial={false}
          animate={{ strokeDashoffset: !animateIn || inView ? filled : C }}
          transition={{ duration: animateIn && inView ? 0.8 : 0, ease: "easeOut" }}
        />
        <text
          x={cx}
          y={cx}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-text-primary font-display font-bold tabular-nums"
          style={{ fontSize: Math.round(px * 0.3) }}
        >
          {met}/{total}
        </text>
      </svg>
      <span
        className={cn(
          "text-support font-semibold",
          LEVEL_TEXT[level],
        )}
      >
        {caption}
      </span>
    </div>
  );
}
