"use client";

import { useLocale, useTranslations } from "next-intl";
import { getMarketPanel } from "@/content/placeholders";
import { cn } from "@/lib/utils";

function intensityBar(i: number): string {
  if (i >= 80) return "bg-state-danger";
  if (i >= 60) return "bg-state-amber";
  return "bg-brand-blue";
}

/** MarketPulse · Panel 1 — demand intensity per launch country. */
export function RegionalHeatmap() {
  const data = getMarketPanel("market.demand.byCountry", "demand_by_country");
  const locale = useLocale();
  const t = useTranslations("marketPulse");
  const topCode = data.rows.reduce((a, b) => (b.intensity > a.intensity ? b : a)).code;

  return (
    <section
      role="region"
      aria-label={t("panel.demandByCountry")}
      className="relative card-border p-5"
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-text-muted">
          <span className="live-dot" aria-hidden />
          {t("panel.demandByCountry")}
        </h3>
      </header>
      <ul className="flex flex-col gap-2">
        {data.rows.map((r) => (
          <li key={r.code} className="grid grid-cols-[2rem_5rem_1fr_3rem] items-center gap-2 text-xs">
            <span aria-hidden className="text-base">{r.flag}</span>
            <span className="truncate text-text-secondary">
              {locale === "lt" ? r.name.lt : r.name.en}
            </span>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink-600">
              <div
                className={cn("h-full rounded-full", intensityBar(r.intensity))}
                style={{ width: `${r.intensity}%` }}
              />
            </div>
            <span className="text-right font-mono tabular-nums text-text-primary">
              {r.intensity}%
              {r.code === topCode && (
                <span className="ml-1 rounded-sm border border-state-danger/50 px-1 font-mono text-[9px] uppercase tracking-label text-state-danger">
                  {t("hot")}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-right font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("autoUpdate")}
      </p>
    </section>
  );
}
