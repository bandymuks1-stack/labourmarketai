import type { OrgLedgerView } from "@/lib/journal/work-in-numbers-view";
import { formatMonthSpan, monthSpanOf } from "@/lib/organization-evidence/period-provenance";
import { formatUtcDateRange } from "@/lib/time/display";

import { fmtHours, type Translate } from "./format";

/** A span a person chose, at the precision it has: "Jun – Nov 2025". */
function monthSpanLabel(periodStart: string, periodEnd: string, locale: string): string {
  const span = monthSpanOf(periodStart, periodEnd);
  return span ? formatMonthSpan(span, locale) : `${periodStart} – ${periodEnd}`;
}

/** Period lines shown before the count folds the rest — a person with two
 *  imported spans reads both; one with forty reads five and a number. */
const PERIOD_LINES_SHOWN = 5;

/**
 * The organization's OWN hour records (`work_hour_allocations` — timesheet
 * lines, imported documents), shown BESIDE the journal figures as the
 * organization's ledger and added to nothing (owner §19). `unknown` says the
 * ledger could not be read (never "none"); `none` renders nothing — a
 * ledger that holds nothing is not a fact worth a box.
 *
 * PERIOD RECORDS (2026-09-20): an imported total over a span with no source
 * days ("800 h, Jun–Nov 2025") is listed here as lines of its own, beside
 * the day figure — never summed into it, never split onto days (IA §2).
 *
 * `periodWord` is the scope in words the figure is named by; `tk` is the
 * audience-aware translator (defaults to `t`).
 */
export function OrgLedger({
  view,
  periodWord,
  locale,
  t,
  tk = t,
}: {
  view: OrgLedgerView;
  periodWord: string;
  locale: string;
  t: Translate;
  tk?: Translate;
}) {
  if (view.kind === "none") return null;
  if (view.kind === "unknown") {
    return (
      <p className="text-meta leading-relaxed text-text-muted" data-testid="wi-org-records-unknown">
        {t("numbers.ledgerUnknown")}
      </p>
    );
  }
  const { period: orgPeriod, all: orgAll, periodRecords } = view;
  // A ledger of period records only has no day figure to name — the day
  // sentence would read "0 h", which is not what the organization said.
  const hasDayFigure = orgAll.hours > 0 || orgAll.rejectedHours > 0;
  const shownPeriods = periodRecords.slice(0, PERIOD_LINES_SHOWN);
  const foldedPeriods = periodRecords.length - shownPeriods.length;
  return (
    <div
      className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-1/50 px-3 py-2.5"
      data-testid="wi-org-records"
      data-hours={orgPeriod.hours}
      data-all-hours={orgAll.hours}
      data-imported-hours={orgPeriod.importedHours}
      data-linked-hours={orgPeriod.linkedHours}
      data-period-records={periodRecords.length}
    >
      <span className="font-mono text-meta uppercase tracking-label text-text-secondary">
        {tk("orgRecords.title")}
      </span>
      {hasDayFigure && (
        <span className="text-support leading-relaxed text-text-primary" data-testid="wi-org-records-hours">
          {orgPeriod.hours > 0
            ? tk("orgRecords.body", {
                hours: fmtHours(orgPeriod.hours, locale),
                days: orgPeriod.daysWorked,
                period: periodWord,
                organizations: orgPeriod.organizations,
              })
            : tk("orgRecords.periodEmpty", {
                period: periodWord,
                hours: fmtHours(orgAll.hours, locale),
                days: orgAll.daysWorked,
              })}
        </span>
      )}
      {(orgPeriod.importedHours > 0 ||
        orgPeriod.approvedHours > 0 ||
        orgPeriod.linkedHours > 0 ||
        orgPeriod.rejectedHours > 0) && (
        <span className="text-meta leading-relaxed text-text-muted" data-testid="wi-org-records-provenance">
          {[
            orgPeriod.importedHours > 0
              ? t("orgRecords.imported", { hours: fmtHours(orgPeriod.importedHours, locale) })
              : null,
            orgPeriod.approvedHours > 0
              ? t("orgRecords.approved", { hours: fmtHours(orgPeriod.approvedHours, locale) })
              : null,
            orgPeriod.linkedHours > 0
              ? t("orgRecords.linked", { hours: fmtHours(orgPeriod.linkedHours, locale) })
              : null,
            orgPeriod.rejectedHours > 0
              ? t("orgRecords.rejected", { hours: fmtHours(orgPeriod.rejectedHours, locale) })
              : null,
          ]
            .filter((x): x is string => x !== null)
            .join(" · ")}
        </span>
      )}
      {/* PERIOD RECORDS — a total over a span, no source days. Each is its
          own line with its own span; none enters the figure above and none
          is spread onto days (a month share is a derived view elsewhere). */}
      {shownPeriods.length > 0 && (
        <ul className="flex flex-col gap-0.5" data-testid="wi-org-records-periods">
          {shownPeriods.map((p) => (
            <li
              key={p.id}
              className="text-meta leading-relaxed text-text-secondary"
              data-testid="wi-org-records-period"
              data-period-hours={p.hours}
              data-period-start={p.periodStart}
              data-period-end={p.periodEnd}
              data-provenance={p.provenance}
            >
              {/* A span the SOURCE stated reads as its days; a span a person
                  chose at import (or one derived) reads as MONTHS and says so
                  — never as two day-precise dates (owner rule 2026-09-23). */}
              {p.provenance === "source"
                ? t("orgRecords.periodRecord", {
                    hours: fmtHours(p.hours, locale),
                    span:
                      formatUtcDateRange(p.periodStart, p.periodEnd, locale) ?? `${p.periodStart} – ${p.periodEnd}`,
                  })
                : t(p.provenance === "human_choice" ? "orgRecords.periodRecordHuman" : "orgRecords.periodRecordDerived", {
                    hours: fmtHours(p.hours, locale),
                    span: monthSpanLabel(p.periodStart, p.periodEnd, locale),
                  })}
            </li>
          ))}
          {foldedPeriods > 0 && (
            <li className="text-meta leading-relaxed text-text-muted" data-testid="wi-org-records-period-more">
              {t("orgRecords.periodMore", { count: foldedPeriods })}
            </li>
          )}
        </ul>
      )}
      <span className="text-meta leading-relaxed text-text-muted" data-testid="wi-org-records-rule">
        {tk("orgRecords.rule")}
      </span>
    </div>
  );
}
