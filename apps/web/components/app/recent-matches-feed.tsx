"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { getMarketPanel } from "@/content/placeholders";
import { useMounted } from "@/lib/use-mounted";

type Item = {
  key: number;
  initials: string;
  project: { lt: string; en: string };
  minutesAgo: number;
};

/** MarketPulse · Panel 4 — streaming recent-matches feed (~7s tick).
 *  Same visual language as 5b.1's MicroActivityFeed. Initial 5 items are
 *  deterministic; AnimatePresence `initial={false}` suppresses the
 *  first-render entrance so SSR + first client render match exactly. */
export function RecentMatchesFeed() {
  const data = getMarketPanel("market.recentMatches.feed", "recent_matches");
  const locale = useLocale();
  const t = useTranslations("marketPulse");
  const reduce = useReducedMotion();
  const mounted = useMounted();
  const pool = data.rows;

  const [items, setItems] = useState<Item[]>(() =>
    pool.slice(0, 5).map((r, i) => ({
      key: i,
      initials: r.initials,
      project: r.project,
      minutesAgo: r.minutesAgo,
    })),
  );

  useEffect(() => {
    if (!mounted) return;
    let n = 5;
    const iv = setInterval(() => {
      setItems((cur) => {
        const r = pool[n % pool.length];
        n += 1;
        const fresh: Item = {
          key: Date.now() + n,
          initials: r.initials,
          project: r.project,
          minutesAgo: r.minutesAgo,
        };
        return [fresh, ...cur].slice(0, 5);
      });
    }, 7000);
    return () => clearInterval(iv);
  }, [mounted, pool]);

  function ago(min: number): string {
    if (min < 1) return t("timeAgo.justNow");
    if (min < 60) return t("timeAgo.minutes", { n: min });
    return t("timeAgo.hours", { n: Math.floor(min / 60) });
  }

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
              className="flex items-center gap-3 text-xs text-text-secondary"
            >
              <span
                aria-hidden
                className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full border border-brand-blue/40 font-mono text-[10px] text-brand-blue"
              >
                {it.initials}
              </span>
              <span aria-hidden className="text-text-muted">
                →
              </span>
              <span className="min-w-0 flex-1 truncate text-text-primary">
                {locale === "lt" ? it.project.lt : it.project.en}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-text-muted">
                {ago(it.minutesAgo)}
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
