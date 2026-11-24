"use client";

import { useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import type { CompanyScoreData, CompanyTier } from "@/content/placeholders";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";

const SIZES = { sm: 56, md: 80, lg: 120 } as const;
const TIER_STROKE: Record<CompanyTier, string> = {
  diamond: "stroke-tier-diamond",
  gold: "stroke-tier-gold",
  silver: "stroke-tier-silver",
  bronze: "stroke-tier-bronze",
};
const TIER_TEXT: Record<CompanyTier, string> = {
  diamond: "text-tier-diamond",
  gold: "text-tier-gold",
  silver: "text-tier-silver",
  bronze: "text-tier-bronze",
};

export function companyTierOf(value: number): CompanyTier {
  return value >= 90
    ? "diamond"
    : value >= 80
      ? "gold"
      : value >= 65
        ? "silver"
        : "bronze";
}

/** Company score gauge — symmetric to OVRRing. Hover reveals the score
 *  composition (payment, completion, reviews, response). SSR-safe: renders
 *  the final arc until mounted; reduced-motion → no arc animation. */
export function CompanyScoreRing({
  value,
  breakdown,
  size = "md",
}: {
  value: number;
  breakdown: CompanyScoreData["score_breakdown"];
  size?: keyof typeof SIZES;
}) {
  const t = useTranslations("company.score");
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { amount: 0.6 });
  const reduce = useReducedMotion();
  const mounted = useMounted();
  const animateIn = mounted && !reduce;
  const [hover, setHover] = useState(false);

  const tier = companyTierOf(value);
  const px = SIZES[size];
  const stroke = Math.max(4, Math.round(px / 11));
  const r = (px - stroke) / 2;
  const cx = px / 2;
  const C = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / 99));
  const filled = C * (1 - frac);

  const rows: [string, number][] = [
    [t("payment"), breakdown.payment],
    [t("completion"), breakdown.completion],
    [t("reviews"), breakdown.reviews],
    [t("response"), breakdown.response],
  ];

  return (
    <div
      className="relative flex flex-col items-center gap-1"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <svg
        ref={ref}
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        role="img"
        aria-label={`${t("label")} ${value} / 99, ${tier} — concept preview, not a universal score`}
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
          className={TIER_STROKE[tier]}
          transform={`rotate(-90 ${cx} ${cx})`}
          strokeDasharray={C}
          initial={false}
          animate={{ strokeDashoffset: !animateIn || inView ? filled : C }}
          transition={{
            duration: animateIn && inView ? 0.8 : 0,
            ease: "easeOut",
          }}
        />
        <text
          x={cx}
          y={cx}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-text-primary font-mono font-bold"
          style={{ fontSize: Math.round(px * 0.32) }}
        >
          {value}
        </text>
      </svg>
      <span
        className={cn(
          "font-mono text-meta font-semibold uppercase tracking-label",
          TIER_TEXT[tier],
        )}
      >
        {tier}
      </span>

      {hover && (
        <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-md border border-ink-500 bg-ink-900/95 p-3 shadow-card">
          <p className="mb-2 font-mono text-meta uppercase tracking-label text-text-muted">
            {t("label")}
          </p>
          <ul className="flex flex-col gap-1.5">
            {rows.map(([labelText, v]) => (
              <li
                key={labelText}
                className="flex items-center justify-between gap-3 text-xs text-text-secondary"
              >
                <span>{labelText}</span>
                <span className="font-mono text-text-primary">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
