import type { EvidenceRecordView } from "./import-core";
import {
  buildCompanyWorkHistory,
  type CompanyWorkHistory,
  type PlaceObjectFacts,
} from "./company-work-history";
import { personHoursOf } from "./person-hours";

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
 *   · a PERIOD record's hours are their OWN figure: never added to the day
 *     hours (the headline), never spread onto days or months — the ONE
 *     per-person rule, `personHoursOf` (person-hours.ts, 2026-10-05). The
 *     card's places already state day hours; the headline says the same
 *     (decision 0025: a period total never joins a day sum outside the one
 *     reading, `deriveProfessionalExperience`);
 *   · an undated record stays in the history and is counted.
 *
 * Nothing here is written, inferred or verified.
 */

export interface PersonHistorySummary {
  readonly history: CompanyWorkHistory;
  readonly liveRecords: number;
  /** Stated hours of the records that are NOT period aggregates (dated days,
   *  and undated single records) — the headline. Never includes `periodHours`. */
  readonly dayHours: number;
  /** Stated hours of period aggregates — a figure of its own, kept apart. */
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
  // Day and period hours by the ONE per-person rule — never one sum.
  const hours = personHoursOf(live);
  return {
    history: buildCompanyWorkHistory(live, objects),
    liveRecords: live.length,
    dayHours: hours.dayHours,
    periodHours: hours.periodHours,
    recordsWithoutHours: live.filter((r) => r.hours === null).length,
    recordsUndated: live.filter((r) => !r.activityDate && !r.periodStart && !r.periodEnd).length,
    recordsWithoutWorkObject: live.filter((r) => !r.workObjectId).length,
    byMonth: [...months.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([month, hours]) => ({ month, hours })),
  };
}
