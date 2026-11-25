import type { BusinessHistory, HistoryBucketTotals } from "@/lib/organization-evidence/business-history";
import { businessHistoryHeader } from "@/lib/organization-evidence/business-history-header";
import type { OrganizationLivingHistory } from "@/lib/company/team-profile-model";

const BUSINESS_HISTORY = "companyWorkHistory.business";

type Translate = (key: string, values?: Record<string, string | number>) => string;
type TimelineRow =
  | { readonly kind: "year"; readonly year: BusinessHistory["years"][number]; readonly fromYear: number; readonly toYear: number }
  | { readonly kind: "gap"; readonly from: number; readonly to: number };

function figures(
  totals: HistoryBucketTotals,
  number: Intl.NumberFormat,
  t: Translate,
): string {
  return t(BUSINESS_HISTORY + ".figures", {
    records: number.format(totals.records),
    hours: number.format(totals.hours),
    people: number.format(totals.people),
    places: number.format(totals.places),
  });
}

/** Start-year buckets retain full record spans and place their whole hours on one shared scale. */
export function OrganizationLivingActivity({
  historyDetail,
  locale,
  t,
}: {
  readonly historyDetail: OrganizationLivingHistory | null;
  readonly locale: string;
  readonly t: Translate;
}) {
  if (!historyDetail) return null;
  const business = historyDetail.business;
  if ((!business || (business.years.length === 0 && business.undated === 0)) && !historyDetail.truncated) return null;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const years = [...(business?.years ?? [])].sort((a, b) => a.year - b.year);
  const maxHours = Math.max(0, ...years.map((year) => year.hours));
  const rows: TimelineRow[] = [];
  let coveredThrough: number | null = null;

  years.forEach((year) => {
    const fromYear = year.from ? Number(year.from.slice(0, 4)) : year.year;
    const toYear = year.to ? Number(year.to.slice(0, 4)) : year.year;
    if (!historyDetail.truncated && coveredThrough !== null && fromYear > coveredThrough + 1) {
      rows.push({ kind: "gap", from: coveredThrough + 1, to: fromYear - 1 });
    }
    rows.push({ kind: "year", year, fromYear, toYear });
    coveredThrough = Math.max(coveredThrough ?? toYear, toYear);
  });

  const split = business ? businessHistoryHeader(business, historyDetail.identity).split : false;

  return (
    <section
      aria-labelledby="org-living-activity-title"
      className="flex min-w-0 flex-col gap-3 border-t border-text-primary/10 pt-4"
      data-testid="org-living-activity"
      data-scale-max={maxHours}
      data-legal-split={split ? "true" : "false"}
    >
      <header className="flex min-w-0 flex-col gap-1">
        <h3 id="org-living-activity-title" className="font-display text-base font-semibold text-text-primary">
          {t("businessProfile.team.living.activityTitle")}
        </h3>
        {split ? (
          <p className="text-meta leading-relaxed text-text-muted">
            {t(BUSINESS_HISTORY + ".totalsHeld", { name: historyDetail.organizationName })}
          </p>
        ) : null}
      </header>

      {historyDetail.truncated ? (
        <p className="text-meta leading-relaxed text-text-muted" data-testid="org-living-activity-truncated">
          {t("companyWorkHistory.truncated", { count: historyDetail.recordsRead })}
        </p>
      ) : null}

      {years.length > 0 ? (
        <>
          <div
            className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-end gap-x-3"
            aria-label={t(BUSINESS_HISTORY + ".totals.hours")}
          >
            <span className="text-meta text-text-muted">{t(BUSINESS_HISTORY + ".totals.hours")}</span>
            <div className="flex justify-between text-meta tabular-nums text-text-muted">
              <span>{number.format(0)}</span>
              <span>{number.format(maxHours)}</span>
            </div>
          </div>

          <ol className="flex min-w-0 flex-col" data-testid="org-living-activity-years">
            {rows.map((row) =>
              row.kind === "gap" ? (
                <li
                  key={"gap-" + row.from}
                  className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3 border-t border-dashed border-text-primary/10 py-2"
                  data-testid="org-living-activity-gap"
                  data-gap-from={row.from}
                  data-gap-to={row.to}
                >
                  <span className="min-w-0 font-display text-meta tabular-nums text-text-muted [overflow-wrap:anywhere]">
                    {row.from === row.to
                      ? row.from
                      : t(BUSINESS_HISTORY + ".bounds", { from: row.from, to: row.to })}
                  </span>
                  <p className="min-w-0 text-meta text-text-muted [overflow-wrap:anywhere]">
                    {t(BUSINESS_HISTORY + ".periodNoRecords")}
                  </p>
                </li>
              ) : (
                <li
                  key={"year-" + row.year.year}
                  className="grid min-w-0 grid-cols-[4.75rem_minmax(0,1fr)] items-start gap-x-3 border-t border-text-primary/10 py-2.5"
                  data-testid="org-living-activity-year"
                  data-year={row.year.year}
                  data-year-hours={row.year.hours}
                  data-period-from={row.fromYear}
                  data-period-to={row.toYear}
                >
                  <span className="font-display text-sm font-semibold tabular-nums text-text-primary">
                    {row.fromYear === row.toYear ? row.fromYear : `${row.fromYear}–${row.toYear}`}
                  </span>
                  <div className="min-w-0">
                    <div className="h-2 overflow-hidden rounded-full bg-text-primary/10" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-brand-orange/80"
                        style={{ width: (maxHours > 0 ? (row.year.hours / maxHours) * 100 : 0) + "%" }}
                      />
                    </div>
                    <p className="mt-1.5 min-w-0 text-meta leading-relaxed text-text-secondary [overflow-wrap:anywhere]">
                      {figures(row.year, number, t)}
                    </p>
                  </div>
                </li>
              ),
            )}
          </ol>
        </>
      ) : null}

      {(business?.undated ?? 0) > 0 ? (
        <p className="text-meta leading-relaxed text-text-muted" data-testid="org-living-activity-undated">
          {t(BUSINESS_HISTORY + ".undated", { count: business?.undated ?? 0 })}
        </p>
      ) : null}
    </section>
  );
}
