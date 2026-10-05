import { isPeriodRecord } from "./company-work-history";
import type { EvidenceRecordView } from "./import-core";

/**
 * PER-PERSON HOURS OF IMPORTED HISTORY, DAY AND PERIOD KEPT APART.
 *
 * The "who performed this work?" panel summed `hours` over every record of a
 * roster person, so a person with 14.5 h on single days and a 965 h period
 * aggregate read "979.5 h" - the never-sum rule broken on the very page that
 * states it (found by the integrated local QA, 2026-10-05). A PERIOD record
 * (start-end, no single day) is its own figure and never joins day hours.
 */
export type PersonHours = {
  readonly count: number;
  /** Hours of dated single-day records ONLY. */
  readonly dayHours: number;
  /** Hours of period aggregates, kept apart. */
  readonly periodHours: number;
};

export function personHoursOf(records: readonly EvidenceRecordView[]): PersonHours {
  let dayHours = 0;
  let periodHours = 0;
  for (const r of records) {
    if (isPeriodRecord(r)) periodHours += r.hours ?? 0;
    else dayHours += r.hours ?? 0;
  }
  return {
    count: records.length,
    dayHours: Math.round(dayHours * 100) / 100,
    periodHours: Math.round(periodHours * 100) / 100,
  };
}
