import type { EvidenceRecordView } from "./import-core";
import {
  buildCompanyWorkHistory,
  type CompanyWorkHistory,
  type PlaceObjectFacts,
} from "./company-work-history";

/**
 * THE COMPANY-SIDE HISTORICAL PERSON CARD, AS NUMBERS (pure).
 *
 * One roster person's records folded with the SAME pure function the company
 * history uses (`buildCompanyWorkHistory`) — places/projects, a record without
 * a work object grouped under its own source label or under "none" (never
 * dropped) — plus the honesty counts a reader needs next to any total:
 *
 *   · hours are STATED hours, summed only over records that state them;
 *   · a record with no hours is COUNTED, not treated as zero (unknown != 0);
 *   · a PERIOD record's hours are kept apart and never spread onto days or
 *     months (single-day records only feed the month table);
 *   · an undated record stays in the history and is counted.
 *
 * Nothing here is written, inferred or verified.
 */

export interface PersonHistorySummary {
  readonly history: CompanyWorkHistory;
  readonly liveRecords: number;
  /** Sum of the hours the records STATE. */
  readonly statedHours: number;
  /** Stated hours of period aggregates (inside `statedHours`), kept apart. */
  readonly periodHours: number;
  /** Records that state no hours — unknown, not zero. */
  readonly recordsWithoutHours: number;
  /** Records with no work date and no period. */
  readonly recordsUndated: number;
  /** Records not tied to a work object the platform knows (kept in the history). */
  readonly recordsWithoutWorkObject: number;
  /** `YYYY-MM` → stated hours of single-day records, oldest first. */
  readonly byMonth: readonly { readonly month: string; readonly hours: number }[];
}

const isPeriod = (r: EvidenceRecordView) =>
  r.activityDate === null && r.periodStart !== null && r.periodEnd !== null;

export function summarizePersonHistory(
  records: readonly EvidenceRecordView[],
  objects: readonly PlaceObjectFacts[] = [],
): PersonHistorySummary {
  const live = records.filter((r) => !r.withdrawn);
  const months = new Map<string, number>();
  for (const r of live) {
    if (r.activityDate && r.hours !== null) {
      const m = r.activityDate.slice(0, 7);
      months.set(m, (months.get(m) ?? 0) + r.hours);
    }
  }
  return {
    history: buildCompanyWorkHistory(live, objects),
    liveRecords: live.length,
    statedHours: live.reduce((s, r) => s + (r.hours ?? 0), 0),
    periodHours: live.filter(isPeriod).reduce((s, r) => s + (r.hours ?? 0), 0),
    recordsWithoutHours: live.filter((r) => r.hours === null).length,
    recordsUndated: live.filter((r) => !r.activityDate && !r.periodStart && !r.periodEnd).length,
    recordsWithoutWorkObject: live.filter((r) => !r.workObjectId).length,
    byMonth: [...months.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([month, hours]) => ({ month, hours })),
  };
}
