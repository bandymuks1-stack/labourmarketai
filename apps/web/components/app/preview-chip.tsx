"use client";

import { useTranslations } from "next-intl";

/** Static directions label — top-left of the hero map region. Calm, neutral
 *  styling (no warning colour, no pulsing dot) so it reads as a section label,
 *  not a pseudo-live status badge. */
export function PreviewChip() {
  const t = useTranslations("live.chip");
  return (
    <div className="inline-flex items-center gap-2 rounded-sm border border-ink-600/70 bg-ink-800/70 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-text-muted">
      {t("text")}
    </div>
  );
}
