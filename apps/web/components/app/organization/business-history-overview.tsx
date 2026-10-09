import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { formatUtcDate } from "@/lib/time/display";
import type { BusinessHistory, HistoryBucketTotals } from "@/lib/organization-evidence/business-history";

/**
 * THE BUSINESS HISTORY, AT A GLANCE — one continuous history read in periods
 * (owner model 2026-09-30). Totals, the stated periods (each with what it rests
 * on and what it does NOT claim), the records no period statement places, and
 * the work by year. Every figure is a count of canonical records; nothing here
 * is a second store, and no legal identity is asserted beyond the statement.
 */

function spanText(t: HistoryBucketTotals, locale: string): string | null {
  if (!t.from) return null;
  const o: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };
  const a = formatUtcDate(t.from, locale, o);
  const b = t.to ? formatUtcDate(t.to, locale, o) : null;
  return b && b !== a ? `${a} – ${b}` : a;
}

export async function BusinessHistoryOverview({
  business,
  organizationId,
  organizationName,
  locale,
}: {
  readonly business: BusinessHistory | null;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly locale: string;
}) {
  const t = await getTranslations("companyWorkHistory.business");
  if (business === null) {
    return (
      <p className="text-meta text-text-muted" data-testid="business-history-unavailable">
        {t("unavailable")}
      </p>
    );
  }
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const { totals } = business;
  const maxYearHours = Math.max(1, ...business.years.map((y) => y.hours));
  const orgQuery = `?org=${organizationId}`;

  const figures = (b: HistoryBucketTotals) =>
    t("figures", {
      records: n.format(b.records),
      hours: n.format(b.hours),
      people: n.format(b.people),
      places: n.format(b.places),
    });

  return (
    <section
      className="flex flex-col gap-6 rounded-[26px] p-5 shadow-[inset_0_0_0_1px_rgb(var(--c-text-primary)/0.10)] md:p-8"
      data-testid="business-history-overview"
      data-records={totals.records}
      data-hours={totals.hours}
      data-periods={business.periods.length}
    >
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-text-muted">{t("eyebrow")}</span>
        <h2 className="font-display text-[clamp(1.55rem,2.6vw,2.15rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-text-primary">
          {t("title", { name: organizationName })}
        </h2>
        <p className="max-w-[60ch] text-sm leading-relaxed text-text-secondary">{t("subtitle")}</p>
      </header>

      {/* Totals — the whole continuous history. */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6" data-testid="business-history-totals">
        {(
          [
            ["records", n.format(totals.records)],
            ["hours", n.format(totals.hours)],
            ["people", n.format(totals.people)],
            ["places", n.format(totals.places)],
            ["projects", n.format(totals.projects)],
            ["span", spanText(totals, locale) ?? t("spanUnknown")],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 border-t border-text-primary/10 pt-3">
            <dt className="text-meta text-text-muted">{t(`totals.${k}`)}</dt>
            <dd className="font-display text-xl font-semibold tabular-nums text-text-primary">{v}</dd>
          </div>
        ))}
      </dl>

      {/* Periods — what the owner (or a document) stated, and what it rests on. */}
      <div className="flex flex-col gap-3" data-testid="business-history-periods">
        <h3 className="font-display text-base font-semibold text-text-primary">{t("periodsTitle")}</h3>
        {business.periods.length === 0 ? (
          <p className="text-sm text-text-secondary" data-testid="business-history-no-periods">
            {t("noPeriods")}
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {business.periods.map(({ statement: p, totals: pt, placedByLabel, placedByDate }) => (
              <li
                key={p.id}
                className="flex flex-col gap-2 rounded-2xl border border-text-primary/10 p-4"
                data-testid="business-history-period"
                data-period-records={pt.records}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display text-lg font-semibold text-text-primary">{p.periodLabel}</p>
                  <p className="text-meta text-text-muted">
                    {p.periodStart || p.periodEnd
                      ? t("bounds", {
                          from: p.periodStart ? (formatUtcDate(p.periodStart, locale) ?? "") : t("notDocumented"),
                          to: p.periodEnd ? (formatUtcDate(p.periodEnd, locale) ?? "") : t("notDocumented"),
                        })
                      : t("boundsNotDocumented")}
                  </p>
                </div>
                {p.legalEntityLabel ? (
                  <p className="text-sm text-text-secondary">{t("legalEntity", { name: p.legalEntityLabel })}</p>
                ) : null}
                <p className="text-sm text-text-secondary">{t(`relation.${p.legalEntityRelation}`)}</p>
                <p className="text-meta text-text-muted">
                  {t(`basis.${p.basis}`)}
                  {p.basisReference ? ` · ${p.basisReference}` : ""}
                </p>
                {p.statement ? (
                  <blockquote className="border-l-2 border-brand-orange/60 pl-3 text-sm italic leading-relaxed text-text-secondary">
                    {p.statement}
                  </blockquote>
                ) : null}
                <p className="text-sm text-text-primary" data-testid="business-history-period-figures">
                  {pt.records > 0 ? figures(pt) : t("periodNoRecords")}
                  {pt.records > 0 && spanText(pt, locale) ? ` · ${spanText(pt, locale)}` : ""}
                </p>
                {p.sourceLabels.length > 0 ? (
                  <p className="text-meta text-text-muted">
                    {t("placedBy", {
                      labels: p.sourceLabels.map((l) => `“${l}”`).join(", "),
                      byLabel: n.format(placedByLabel),
                      byDate: n.format(placedByDate),
                    })}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {business.notPlaced.records > 0 ? (
          <p className="text-sm text-text-secondary" data-testid="business-history-not-placed" data-records={business.notPlaced.records}>
            {t("notPlaced", {
              figures: figures(business.notPlaced),
              span: spanText(business.notPlaced, locale) ?? t("spanUnknown"),
            })}
          </p>
        ) : null}
      </div>

      {/* The work by year — every record by its own date, never split. */}
      {business.years.length > 0 ? (
        <div className="flex flex-col gap-3" data-testid="business-history-years">
          <h3 className="font-display text-base font-semibold text-text-primary">{t("yearsTitle")}</h3>
          <ol className="flex flex-col">
            {business.years.map((y) => (
              <li
                key={y.year}
                className="grid grid-cols-[3.5rem_1fr] items-center gap-x-4 gap-y-1 border-t border-text-primary/10 py-2.5 first:border-t-0 sm:grid-cols-[3.5rem_1fr_16rem]"
                data-testid="business-history-year"
                data-year={y.year}
              >
                <span className="font-display text-base font-semibold tabular-nums text-text-primary">{y.year}</span>
                <span className="relative h-[3px] overflow-hidden rounded-full bg-text-primary/10" aria-hidden>
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-brand-orange/80"
                    style={{ width: `${Math.max(2, (y.hours / maxYearHours) * 100)}%` }}
                  />
                </span>
                <span className="text-meta text-text-muted max-sm:col-span-2">{figures(y)}</span>
              </li>
            ))}
          </ol>
          {business.undated > 0 ? (
            <p className="text-meta text-text-muted">{t("undated", { count: business.undated })}</p>
          ) : null}
        </div>
      ) : null}

      {/* Doors into the same records, seen by people, projects and places. */}
      <nav className="flex flex-wrap gap-2" aria-label={t("doorsLabel")} data-testid="business-history-doors">
        <Link
          href={`/dashboard/company/people${orgQuery}` as "/dashboard"}
          className="inline-flex min-h-11 items-center rounded-full border border-text-primary/20 px-4 text-sm font-semibold text-text-primary hover:border-brand-blue"
          data-testid="business-history-door-people"
        >
          {t("doors.people")} →
        </Link>
        <Link
          href={"/dashboard/projects" as "/dashboard"}
          className="inline-flex min-h-11 items-center rounded-full border border-text-primary/20 px-4 text-sm font-semibold text-text-primary hover:border-brand-blue"
          data-testid="business-history-door-projects"
        >
          {t("doors.projects")} →
        </Link>
        <a
          href="#company-work-history-places"
          className="inline-flex min-h-11 items-center rounded-full border border-text-primary/20 px-4 text-sm font-semibold text-text-primary hover:border-brand-blue"
          data-testid="business-history-door-places"
        >
          {t("doors.places")} ↓
        </a>
      </nav>
    </section>
  );
}
