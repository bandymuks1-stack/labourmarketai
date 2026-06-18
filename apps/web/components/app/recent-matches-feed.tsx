"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { getMarketPanel } from "@/content/placeholders";
import { useMounted } from "@/lib/use-mounted";

type Item = {
  key: number;
  from: { lt: string; en: string };
  to: { lt: string; en: string };
};

/** MarketPulse · Panel 4 — match-logic flow. Streams how the system turns a
 *  signal into a next step (need → readiness, skill → role fit). No people,
 *  no timestamps, no fabricated live counters. */
export function RecentMatchesFeed() {
  const data = getMarketPanel("market.recentMatches.feed", "recent_matches");
  const locale = useLocale();
  const t = useTranslations("marketPulse");
  const reduce = useReducedMotion();
  const mounted = useMounted();
  const pool = data.rows;

  const [items, setItems] = useState<Item[]>(() =>
    pool.slice(0, 5).map((r, i) => ({ key: i, from: r.from, to: r.to })),
  );

  useEffect(() => {
    if (!mounted) return;
    let n = 5;
    const iv = setInterval(() => {
      setItems((cur) => {
        const r = pool[n % pool.length];
        n += 1;
        const fresh: Item = { key: n, from: r.from, to: r.to };
        return [fresh, ...cur].slice(0, 5);
      });
    }, 7000);
    return () => clearInterval(iv);
  }, [mounted, pool]);

  const lc = (v: { lt: string; en: string }) => (locale === "lt" ? v.lt : v.en);

  return (
    <section
      role="region"
      aria-label={t("panel.recentMatches")}
      className="relative card-border p-5"
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-text-muted">
          <span className="live-dot" aria-hidden />
          {t("panel.recentMatches")}
        </h3>
      </header>
      <ul aria-live="polite" className="flex flex-col gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((it) => (
            <motion.li
              key={it.key}
              layout
              initial={reduce ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: reduce ? 0 : 0.4, ease: "easeOut" }}
              className="flex items-center gap-3 text-xs"
            >
              <span className="min-w-0 flex-1 truncate text-text-secondary">
                {lc(it.from)}
              </span>
              <span aria-hidden className="font-mono text-brand-cyan">
                →
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-text-primary">
                {lc(it.to)}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <p className="mt-3 text-right font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("autoUpdate")}
      </p>
    </section>
  );
}