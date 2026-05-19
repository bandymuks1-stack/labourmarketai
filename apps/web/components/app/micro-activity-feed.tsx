"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { getPlaceholder, localizeValue } from "@/content/placeholders";

/** 3-row streaming feed. A new governed activity.feed.* item enters at the
 *  top every ~6s; the oldest leaves the bottom. aria-live polite.
 *  Mounted-guarded (timestamps are client-time) so there is no hydration
 *  mismatch; reduced motion collapses the transitions to 0ms. */
type Item = { key: number; text: string; icon: string; time: string };

const POOL = Array.from({ length: 10 }, (_, i) => i + 1);
const GLYPH: Record<string, string> = {
  join: "+",
  demand: "◷",
  match: "⇄",
  checkin: "✓",
};

export function MicroActivityFeed() {
  const locale = useLocale();
  const t = useTranslations("live.activity");
  const reduce = useReducedMotion();
  const [items, setItems] = useState<Item[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const tag = locale === "lt" ? "lt-LT" : "en-GB";
    let n = 0;
    const make = (): Item => {
      const id = POOL[n % POOL.length];
      n += 1;
      const p = getPlaceholder(`activity.feed.${id}`);
      return {
        key: Date.now() + n,
        text: localizeValue(p.value, locale),
        icon: p.icon ?? "match",
        time: new Date().toLocaleTimeString(tag, { hour12: false }),
      };
    };
    setItems([make(), make(), make()]);
    const iv = setInterval(
      () => setItems((cur) => [make(), ...cur].slice(0, 3)),
      6000,
    );
    return () => clearInterval(iv);
  }, [locale]);

  // Reserve height pre-mount: no Date on the server → no mismatch.
  if (!mounted) return <div className="h-[4.5rem]" aria-hidden />;

  return (
    <div
      aria-live="polite"
      aria-label={t("label")}
      className="flex flex-col gap-1.5"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {items.map((it) => (
          <motion.div
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
              className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-sm border border-brand-blue/40 font-mono text-[11px] text-brand-blue"
            >
              {GLYPH[it.icon] ?? "•"}
            </span>
            <span className="min-w-0 flex-1 truncate">{it.text}</span>
            <span className="font-mono text-[10px] tabular-nums text-text-muted">
              {it.time}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
