import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { countrySignals, type CountryCode } from "@/lib/labour-market/country-evidence";
import { getSource } from "@/lib/labour-market/sources";
import type { ClaimType } from "@/lib/labour-market/evidence";

/**
 * Per-country source-backed signal cards (Step 5/6). Same honest provenance
 * contract as the EU evidence module: every card shows source · figure date ·
 * region · last checked and links to the official source. Content is localized
 * (countryEvidence.<COUNTRY>.<id>.{title,summary}); provenance comes from the
 * typed country layer. Qualitative sourced statements — no invented figures.
 */
const CLAIM_BADGE: Record<ClaimType, string> = {
  statistic: "claimStatistic",
  trend: "claimTrend",
  forecast: "claimForecast",
  shortage_signal: "claimShortage",
  skills_signal: "claimSkills",
};

export async function CountrySignals({ country }: { country: CountryCode }) {
  const t = await getTranslations("labourMarket");
  const signals = countrySignals(country);
  const countryName = t(`countryNames.${country}`);

  return (
    <div
      className="grid gap-5 md:grid-cols-2"
      data-testid={`country-signals-${country}`}
    >
      {signals.map((s) => {
        const source = getSource(s.sourceId);
        return (
          <Card key={s.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-sm border border-brand-blue/40 bg-brand-blue/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-brand-blue">
                {t(CLAIM_BADGE[s.claimType])}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {countryName}
              </span>
            </div>
            <h3 className="font-display text-lg font-semibold leading-snug text-text-primary">
              {t(`countryEvidence.${country}.${s.id}.title`)}
            </h3>
            <p className="text-sm leading-relaxed text-text-secondary">
              {t(`countryEvidence.${country}.${s.id}.summary`)}
            </p>
            <dl className="mt-auto grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-ink-600 pt-3 text-[11px] text-text-muted">
              <dt className="font-mono uppercase tracking-label">{t("fieldSource")}</dt>
              <dd>
                <a
                  href={s.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-brand-blue hover:text-brand-cyan"
                >
                  {t(`sourceLabel.${s.sourceId}`)}
                </a>
              </dd>
              <dt className="font-mono uppercase tracking-label">{t("fieldFigureDate")}</dt>
              <dd>{s.figureDate}</dd>
              <dt className="font-mono uppercase tracking-label">{t("fieldLastChecked")}</dt>
              <dd>{s.lastChecked}</dd>
            </dl>
            <p className="text-[10px] leading-relaxed text-text-muted">
              {source.publisher}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
