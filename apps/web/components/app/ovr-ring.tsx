"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import type { PlayerTier } from "@/content/placeholders";
import { cn } from "@/lib/utils";

const SIZES = { sm: 56, md: 80, lg: 120 } as const;
const TIER_STROKE: Record<PlayerTier, string> = {
  gold: "stroke-tier-gold",
  silver: "stroke-tier-silver",
  bronze: "stroke-tier-bronze",
};
const TIER_TEXT: Record<PlayerTier, string> = {
  gold: "text-tier-gold",
  silver: "text-tier-silver",
  bronze: "text-tier-bronze",
};

export function tierOf(value: number): PlayerTier {
  return value >= 90 ? "gold" : value >= 80 ? "silver" : "bronze";
}

/** Circular OVR gauge. Arc animates 0→value over 800ms ease-out whenever it
 *  scrolls into view (replays). Reduced motion → renders at final state. */
export function OVRRing({
  value,
  tier,
  size = "md",
  tierLabel,
}: {
  value: number;
  tier?: PlayerTier;
  size?: keyof typeof SIZES;
  tierLabel?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { amount: 0.6 });
  const reduce = useReducedMotion();
  const t = tier ?? tierOf(value);

  const px = SIZES[size];
  const stroke = Math.max(4, Math.round(px / 11));
  const r = (px - stroke) / 2;
  const cx = px / 2;
  const C = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / 99));
  const filled = C * (1 - frac);

  const label = tierLabel ?? t;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        ref={ref}
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        role="img"
        aria-label={`Overall rating ${value} out of 99, ${t} tier`}
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
          className={TIER_STROKE[t]}
          transform={`rotate(-90 ${cx} ${cx})`}
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: inView ? filled : C }}
          transition={{ duration: reduce ? 0 : 0.8, ease: "easeOut" }}
        />
        <text
          x={cx}
          y={cx}
          textAnchor="middle"
          dominantBaseline="central"
          className={cn("fill-text-primary font-mono font-bold")}
          style={{ fontSize: Math.round(px * 0.34) }}
        >
          {value}
        </text>
      </svg>
      <span
        className={cn(
          "font-mono text-[10px] font-semibold uppercase tracking-label",
          TIER_TEXT[t],
        )}
      >
        {label}
      </span>
    </div>
  );
}
