"use client";

import { useLocale, useTranslations } from "next-intl";
import { getMarketPanel, type SkillTrend } from "@/content/placeholders";

const TREND_GLYPH: Record<SkillTrend, string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};
const TREND_COLOR: Record<SkillTrend, string> = {
  up: "text-state-live",
  down: "text-state-danger",
  flat: "text-text-muted",
};

/** MarketPulse · Panel 2 — ranked top in-demand skills. */
export function SkillsDemandList() {
  const data = getMarketPanel("market.skills.topDemand", "skills_top");
  const locale = useLocale();
  const t = useTranslations("marketPulse");

  return (
    <section
      role="region"
      aria-label={t("panel.topSkills")}
      className="relative card-border p-5"
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-text-muted">
          <span className="live-dot" aria-hidden />
          {t("panel.topSkills")}
        </h3>
      </header>
      <ol className="flex flex-col gap-1.5">
        {data.rows.map((r, i) => (
          <li
            key={r.name.en}
            className="grid grid-cols-[1.25rem_1fr_1.5rem] items-center gap-2 text-xs"
          >
            <span className="font-mono text-text-muted">{i + 1}.</span>
            <span className="truncate text-text-secondary">
              {locale === "lt" ? r.name.lt : r.name.en}
            </span>
            <span aria-hidden className={`text-right font-mono ${TREND_COLOR[r.trend]}`}>
              {TREND_GLYPH[r.trend]}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-right font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("autoUpdate")}
      </p>
    </section>
  );
}
