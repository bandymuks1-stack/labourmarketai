import type { WorkIntelligence, WorkPeriodTotals } from "@/lib/journal/work-intelligence";

import { fmtHours, type Translate } from "./format";

/**
 * The honest remainder — what no skill can claim yet — and where every hour
 * came from. All four figures are the model's own, reported once each:
 * shared (several skills at once), multi-activity (timed parts split by
 * kind of work, not by skill), unattributed (no skill linked), and the
 * provenance split by the metric row's source. `tk` is the audience-aware
 * translator (the organization view rewords "you"); it defaults to `t`.
 */
export function HoursRemainder({
  wi,
  period,
  locale,
  t,
  tk = t,
}: {
  wi: WorkIntelligence;
  period: WorkPeriodTotals;
  locale: string;
  t: Translate;
  tk?: Translate;
}) {
  const hasAnyHours = wi.totalHours > 0 || period.dayUnits > 0;
  return (
    <div className="flex flex-col gap-1.5" data-testid="wi-remainder">
      {wi.sharedHours > 0 && (
        <p className="text-meta leading-relaxed text-text-muted" data-testid="wi-shared-hours">
          {t("sharedHours", { hours: fmtHours(wi.sharedHours, locale), count: wi.sharedEntries })}
        </p>
      )}
      {wi.multiActivityHours > 0 && (
        <p className="text-meta leading-relaxed text-text-muted" data-testid="wi-multi-activity-hours">
          {t("multiActivityHours", { hours: fmtHours(wi.multiActivityHours, locale), count: wi.multiActivityEntries })}
        </p>
      )}
      {wi.unattributedHours > 0 && (
        <p className="text-meta leading-relaxed text-text-muted" data-testid="wi-unattributed-hours">
          {tk("unattributedHours", { hours: fmtHours(wi.unattributedHours, locale), count: wi.unattributedEntries })}
        </p>
      )}
      {hasAnyHours && (
        <p className="text-meta leading-relaxed text-text-muted" data-testid="wi-provenance">
          {tk("provenance", {
            worker: fmtHours(wi.provenance.workerInput, locale),
            extracted: fmtHours(wi.provenance.aiExtracted, locale),
            corrected: fmtHours(wi.provenance.managerCorrected, locale),
          })}{" "}
          {tk("provenanceRule")}
          {/* an entry with no stated work day is placed by the UTC day it
              was saved — said, never silently a fact (re-audit F10) */}
          {period.entriesDayInferred > 0 ? (
            <>
              {" "}
              <span data-testid="wi-day-inferred">
                {t("dayInferred", { count: period.entriesDayInferred })}
              </span>
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
