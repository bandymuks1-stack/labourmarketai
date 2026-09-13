import type { OrgLedgerView } from "@/lib/journal/work-in-numbers-view";

import { fmtHours, type Translate } from "./format";

/**
 * The organization's OWN hour records (`work_hour_allocations` — timesheet
 * lines, imported documents), shown BESIDE the journal figures as the
 * organization's ledger and added to nothing (owner §19). `unknown` says the
 * ledger could not be read (never "none"); `none` renders nothing — a
 * ledger that holds nothing is not a fact worth a box.
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
  const { period: orgPeriod, all: orgAll } = view;
  return (
    <div
      className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-1/50 px-3 py-2.5"
      data-testid="wi-org-records"
      data-hours={orgPeriod.hours}
      data-all-hours={orgAll.hours}
      data-imported-hours={orgPeriod.importedHours}
      data-linked-hours={orgPeriod.linkedHours}
    >
      <span className="font-mono text-meta uppercase tracking-label text-text-secondary">
        {tk("orgRecords.title")}
      </span>
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
      <span className="text-meta leading-relaxed text-text-muted" data-testid="wi-org-records-rule">
        {tk("orgRecords.rule")}
      </span>
    </div>
  );
}
