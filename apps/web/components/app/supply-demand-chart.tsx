"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { getMarketPanel } from "@/content/placeholders";
import { useMounted } from "@/lib/use-mounted";

const W = 280;
const H = 80;

function points(arr: number[], min: number, range: number): string {
  const last = arr.length - 1;
  return arr
    .map(
      (v, i) =>
        `${((i / last) * W).toFixed(1)},${(H - ((v - min) / range) * H).toFixed(1)}`,
    )
    .join(" ");
}

/** MarketPulse · Panel 3 — supply (cyan) vs demand (amber) 30d sparkline.
 *  Line-draw via strokeDashoffset (pathLength=1); replays on scroll-into-
 *  view. SSR renders the final, fully-drawn state. */
export function SupplyDemandChart() {
  const data = getMarketPanel("market.supplyDemand.series", "supply_demand");
  const t = useTranslations("marketPulse");
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { amount: 0.5 });
  const reduce = useReducedMotion();
  const mounted = useMounted();
  const animateIn = mounted && !reduce;

  const all = [...data.supply, ...data.demand];
  const min = Math.min(...all);
  const range = Math.max(...all) - min || 1;
  const supplyPts = points(data.supply, min, range);
  const demandPts = points(data.demand, min, range);
  const offset = !animateIn || inView ? 0 : 1;

  return (
    <section
      role="region"
      aria-label={t("panel.supplyDemand")}
      className="relative card-border p-5"
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
          <span className="live-dot" aria-hidden />
          {t("panel.supplyDemand")}
        </h3>
        <span className="inline-flex items-center gap-1.5 rounded-sm border border-state-amber/40 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-state-amber">
          {t("demandLed")}
        </span>
      </header>

      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-20 w-full"
        role="img"
        aria-label={t("panel.supplyDemand")}
      >
        <motion.polyline
          points={supplyPts}
          fill="none"
          className="stroke-brand-cyan"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          pathLength={1}
          strokeDasharray={1}
          initial={false}
          animate={{ strokeDashoffset: offset }}
          transition={{
            duration: animateIn && inView ? 1.0 : 0,
            ease: "easeOut",
          }}
        />
        <motion.polyline
          points={demandPts}
          fill="none"
          className="stroke-state-amber"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          pathLength={1}
          strokeDasharray={1}
          initial={false}
          animate={{ strokeDashoffset: offset }}
          transition={{
            duration: animateIn && inView ? 1.0 : 0,
            ease: "easeOut",
            delay: animateIn && inView ? 0.15 : 0,
          }}
        />
      </svg>

      <div className="mt-3 flex items-center justify-between text-meta">
        <div className="flex items-center gap-4 text-text-secondary">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full bg-brand-cyan" />
            {t("legend.supply")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full bg-state-amber" />
            {t("legend.demand")}
          </span>
        </div>
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("autoUpdate")}
        </span>
      </div>
    </section>
  );
}
