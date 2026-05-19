"use client";

import { useLocale, useTranslations } from "next-intl";
import { placeholderText } from "@/content/placeholders";

/** Full-width scrolling strip at the bottom of the hero. Pure CSS
 *  translateX marquee (.ticker-track, 30s linear infinite, GPU-only).
 *  The track holds the events twice so -50% loops seamlessly; reduced
 *  motion freezes it (handled in globals.css). */
export function LiveTicker() {
  const locale = useLocale();
  const t = useTranslations("live.ticker");
  const events = Array.from({ length: 12 }, (_, i) =>
    placeholderText(`ticker.event.${i + 1}`, locale),
  );

  const Run = ({ hidden }: { hidden?: boolean }) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden}>
      {events.map((e, i) => (
        <span key={i} className="flex items-center">
          <span
            className="mx-4 inline-block h-1.5 w-1.5 rounded-full bg-state-live"
            aria-hidden
          />
          <span className="whitespace-nowrap text-text-secondary">{e}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div
      role="region"
      aria-label={t("label")}
      className="overflow-hidden border-y border-ink-600/60"
    >
      <div className="ticker-track flex h-6 w-max items-center font-mono text-[11px] uppercase tracking-label">
        <Run />
        <Run hidden />
      </div>
    </div>
  );
}
