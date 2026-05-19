"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

/** Real local time, top-right of the hero card region. Ticks every second
 *  (state-only update — no motion, so reduced-motion is a no-op here).
 *  Mounted-guarded so SSR and first client render agree. */
export function LiveClock() {
  const t = useTranslations("live.clock");
  const locale = useLocale();
  const tag = locale === "lt" ? "lt-LT" : "en-GB";
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now
    ? now.toLocaleTimeString(tag, { hour12: false })
    : "--:--:--";
  const date = now
    ? now.toLocaleDateString(tag, {
        weekday: "short",
        day: "2-digit",
        month: "short",
      })
    : "—";

  return (
    <div className="text-right">
      <div
        suppressHydrationWarning
        className="font-mono text-2xl font-bold tabular-nums tracking-tightest text-text-primary sm:text-3xl"
      >
        {time}
      </div>
      <div
        suppressHydrationWarning
        className="mt-0.5 font-mono text-[10px] uppercase tracking-label text-text-muted"
      >
        {date}
      </div>
      <div className="mt-1 inline-flex items-center gap-1.5 rounded-sm border border-state-live/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-state-live">
        <span className="live-dot" aria-hidden />
        {t("badge")}
      </div>
    </div>
  );
}
