"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { placeholderCycle } from "@/content/placeholders";

/** Four hero counters. Each rotates through its placeholder `cycle` every
 *  8s with a 300ms ease-out digit roll, plus a delta indicator. No real
 *  data — the motion is the point (the values are governed placeholders). */
const COUNTERS = [
  { id: "counters.active_workers", label: "activeWorkers" },
  { id: "counters.live_demand", label: "liveDemand" },
  { id: "counters.matches_today", label: "matchesToday" },
  { id: "counters.avg_ovr", label: "avgOvr" },
] as const;

function numeric(s: string): number | null {
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function MarketCounters() {
  const locale = useLocale();
  const t = useTranslations("live.counters");
  const reduce = useReducedMotion();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((v) => v + 1), 8000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
      {COUNTERS.map((c) => {
        const cycle = placeholderCycle(c.id, locale);
        const i = idx % cycle.length;
        const cur = cycle[i];
        const prev = cycle[(i - 1 + cycle.length) % cycle.length];
        const a = numeric(cur);
        const b = numeric(prev);
        const dir = a != null && b != null ? Math.sign(a - b) : 0;

        return (
          <div key={c.id} className="flex flex-col gap-1">
            {/* 5b.5: 2-line min-height + items-end so the number baselines
                stay aligned even when one label wraps to a single line
                (notably LT "Atvira paklausa" vs the 2-line others). */}
            <span className="flex min-h-9 items-end font-mono text-[11px] uppercase tracking-label text-text-muted">
              {t(c.label)}
            </span>
            <span className="relative inline-flex h-9 items-center overflow-hidden font-display text-3xl font-bold tabular-nums tracking-tightest text-text-primary">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={cur}
                  initial={reduce ? false : { y: "0.7em", opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { y: "-0.7em", opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.3, ease: "easeOut" }}
                >
                  {cur}
                </motion.span>
              </AnimatePresence>
            </span>
            <span
              className={
                "font-mono text-[10px] tracking-label " +
                (dir > 0
                  ? "text-state-live"
                  : dir < 0
                    ? "text-state-amber"
                    : "text-text-muted")
              }
            >
              {dir > 0 ? "▲" : dir < 0 ? "▼" : "■"}{" "}
              {a != null && b != null
                ? Math.abs(a - b).toLocaleString()
                : "·"}
            </span>
          </div>
        );
      })}
      </div>
      {/* Calm forward-looking caption so the figures read as an illustrative
          interface overview, not real platform scale — no warning/pseudo-live
          styling. */}
      <p className="w-fit font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("previewNote")}
      </p>
    </div>
  );
}
