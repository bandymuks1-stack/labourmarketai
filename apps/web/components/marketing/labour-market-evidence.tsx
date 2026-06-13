import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import {
  LABOUR_MARKET_EVIDENCE,
  type ClaimType,
} from "@/lib/labour-market/evidence";
import { getSource } from "@/lib/labour-market/sources";

/**
 * Public labour-market EVIDENCE module. Renders sourced evidence cards that
 * ground the product in real public statistics. Every card shows its full
 * provenance (source · figure date · region · last checked) and links to the
 * official source.
 *
 * LOCALIZATION: all user-facing prose (title, summary, figure date, region,
 * unit, method note, source label, disclaimer) is read from the `labourMarket`
 * i18n catalog by evidence id, so LT/RU/EN users only see their own language.
 * Only the locale-neutral provenance (numeric value, ISO last-checked date, the
 * real source URL) comes from the typed data. No English literals are printed
 * here; the real source href is never localized.
 */
const CLAIM_BADGE: Record<ClaimType, string> = {
  statistic: "claimStatistic",
  trend: "claimTrend",
  forecast: "claimForecast",
  shortage_signal: "claimShortage",
  skills_signal: "claimSkills",
};

export async function LabourMarketEvidence() {
  const t = await getTranslations("labourMarket");

  return (
    <section className="mt-16" data-testid="labour-market-evidence">
      <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-brand-cyan">
        <span className="live-dot" aria-hidden />
        {t("evidenceEyebrow")}
      </p>
      <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl">
        {t("evidenceTitle")}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
        {t("evidenceSubcopy")}
      </p>

      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {LABOUR_MARKET_EVIDENCE.map((e) => {
          const source = getSource(e.sourceId);
          return (
            <Card key={e.id} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-sm border border-brand-blue/40 bg-brand-blue/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-brand-blue">
                  {t(CLAIM_BADGE[e.claimType])}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {t(`evidence.${e.id}.region`)}
                </span>
              </div>

              <h3 className="font-display text-lg font-semibold leading-snug text-text-primary">
                {t(`evidence.${e.id}.title`)}
              </h3>
              {e.value && (
                <p className="font-display text-2xl font-bold text-text-primary">
                  {e.value}
                  <span className="ml-1 text-sm font-normal text-text-secondary">
                    {t(`evidence.${e.id}.unit`)}
                  </span>
                </p>
              )}
              <p className="text-sm leading-relaxed text-text-secondary">
                {t(`evidence.${e.id}.summary`)}
              </p>

              {/* Provenance — always visible, never optional. Labels + values
                  localized; only the date + the real source href are neutral. */}
              <dl className="mt-auto grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-ink-600 pt-3 text-[11px] text-text-muted">
                <dt className="font-mono uppercase tracking-label">{t("fieldSource")}</dt>
                <dd>
                  <a
                    href={e.sourceUrl || source.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-brand-blue hover:text-brand-cyan"
                  >
                    {t(`sourceLabel.${e.sourceId}`)}
                  </a>
                </dd>
                <dt className="font-mono uppercase tracking-label">{t("fieldFigureDate")}</dt>
                <dd>{t(`evidence.${e.id}.figureDate`)}</dd>
                <dt className="font-mono uppercase tracking-label">{t("fieldLastChecked")}</dt>
                <dd>{e.lastChecked}</dd>
              </dl>
              <p className="text-[10px] leading-relaxed text-text-muted">
                {t(`evidence.${e.id}.methodNote`)}
              </p>
            </Card>
          );
        })}
      </div>

      <p className="mt-5 max-w-3xl text-[11px] leading-relaxed text-text-muted">
        {t("evidenceDisclaimer")}
      </p>
    </section>
  );
}
