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

/** Readiness level → premium brand tokens. Deliberately NOT gold: gold is the
 *  reserved trust-accent (real confirmation) per DESIGN_SOUL §1, and readiness
 *  is a signal count, not a confirmation. The gauge SHAPE matches the landing
 *  OVR ring; the palette stays honest. */
const LEVEL_STROKE: Record<ReadinessLevel, string> = {
  ready: "stroke-brand-cyan",
  building: "stroke-brand-blue",
  start: "stroke-ink-500",
};
const LEVEL_TEXT: Record<ReadinessLevel, string> = {
  ready: "text-brand-cyan",
  building: "text-brand-blue",
  start: "text-text-muted",
};

export function ReadinessRing({
  met,
  total,
  level,
  levelLabel,
  size = "md",
}: {
  met: number;
  total: number;
  level: ReadinessLevel;
  /** Localized level word (e.g. "Pasiruošęs"), resolved by the caller. */
  levelLabel: string;
  size?: keyof typeof SIZES;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { amount: 0.6 });
  const reduce = useReducedMotion();
  const mounted = useMounted();
  const animateIn = mounted && !reduce;

  const px = SIZES[size];
  const stroke = Math.max(4, Math.round(px / 11));
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
        aria-label={`Readiness: ${met} of ${total} signals met`}
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
          className="fill-text-primary font-mono font-bold"
          style={{ fontSize: Math.round(px * 0.3) }}
        >
          {met}/{total}
        </text>
      </svg>
      <span
        className={cn(
          "font-mono text-[10px] font-semibold uppercase tracking-label",
          LEVEL_TEXT[level],
        )}
      >
        {levelLabel}
      </span>
    </div>
  );
}
