"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";

/** Real local time, top-right of the hero card region. Ticks every second
 *  (state-only update — no motion, so reduced-motion is a no-op here).
 *  Mounted-guarded so SSR and first client render agree. */
export function LiveClock() {
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
      {/* 5b.5: 'EU-N MARKET · LIVE' badge consolidated into the map's
          single UTC chip — see live-map.tsx. */}
    </div>
  );
}
