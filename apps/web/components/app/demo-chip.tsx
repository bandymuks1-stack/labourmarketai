"use client";

import { useTranslations } from "next-intl";

/** Persistent honesty pill — always visible, top-left of the hero card
 *  region. The pulsing dot reuses .live-dot (already reduced-motion safe). */
export function DemoChip() {
  const t = useTranslations("live.chip");
  return (
    <div
      role="status"
      className="inline-flex items-center gap-2 rounded-sm border border-state-warning/40 bg-ink-800/70 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-state-warning"
    >
      <span className="live-dot" aria-hidden />
      {t("text")}
    </div>
  );
}
