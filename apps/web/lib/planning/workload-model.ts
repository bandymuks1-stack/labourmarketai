/**
 * Pure workload model (functional completion train V2 — the audit's
 * "workload: MISSING" row, first honest slice). No IO, no persistence: a
 * DERIVED read-model over rows the calendar already loads.
 *
 * ONE WEEK ROW = two honest numbers side by side, in their OWN units:
 *   - plannedDays  — how many days of that Monday-started week are covered
 *     by a CONFIRMED personal commitment (the `indicatesExpectedWork`
 *     predicate: the caller's accepted incoming bookings + personally
 *     assigned projects — the same rule the month grid's "unfilled" mark
 *     uses, so the two surfaces cannot disagree);
 *   - actualHours  — the caller's recorded journal work-item hours on those
 *     days (journal_entry_work_items — the SAME truth timesheets freeze).
 *
 * DELIBERATELY NOT CONVERTED INTO EACH OTHER: planned days are never
 * multiplied by an invented workday length, and hours are never divided
 * into days. The strip presents both facts and claims nothing it has not
 * measured (A-06).
 */

import {
  addDays,
  indicatesExpectedWork,
  itemCoversDay,
  startOfWeekMonday,
  type PlanningItem,
} from "@/lib/planning/planning-model";

export interface WorkloadWeek {
  /** Monday, "YYYY-MM-DD" (UTC). */
  readonly weekStart: string;
  /** Sunday, "YYYY-MM-DD" (UTC). */
  readonly weekEnd: string;
  /** Days of this week covered by a confirmed personal commitment. */
  readonly plannedDays: number;
  /** Recorded journal work-item hours on this week's days. */
  readonly actualHours: number;
}

export interface WorkloadDayHours {
  readonly day: string;
  readonly hours: number;
}

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Build the per-week workload rows covering [rangeStart, rangeEnd]
 * (whole Monday-started weeks; the range is expanded outward to week
 * boundaries). Pure, deterministic; bounded by the caller's already-bounded
 * inputs and a hard 12-week cap so a malformed range can never loop.
 */
export function buildWorkloadWeeks(
  items: readonly PlanningItem[],
  actuals: readonly WorkloadDayHours[],
  rangeStart: string,
  rangeEnd: string,
): readonly WorkloadWeek[] {
  if (!DAY_RX.test(rangeStart) || !DAY_RX.test(rangeEnd)) return [];
  if (rangeEnd < rangeStart) return [];

  const hoursByDay = new Map<string, number>();
  for (const a of actuals) {
    if (!DAY_RX.test(a.day) || !Number.isFinite(a.hours) || a.hours <= 0) {
      continue;
    }
    hoursByDay.set(a.day, (hoursByDay.get(a.day) ?? 0) + a.hours);
  }
  const expected = items.filter(indicatesExpectedWork);

  const weeks: WorkloadWeek[] = [];
  let cursor = startOfWeekMonday(rangeStart);
  const lastWeekStart = startOfWeekMonday(rangeEnd);
  for (let guard = 0; guard < 12 && cursor <= lastWeekStart; guard++) {
    let plannedDays = 0;
    let actualHours = 0;
    for (let i = 0; i < 7; i++) {
      const day = addDays(cursor, i);
      if (expected.some((it) => itemCoversDay(it, day))) plannedDays++;
      actualHours += hoursByDay.get(day) ?? 0;
    }
    weeks.push({
      weekStart: cursor,
      weekEnd: addDays(cursor, 6),
      plannedDays,
      actualHours: Math.round(actualHours * 100) / 100,
    });
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

/** True when at least one week has something to say — an all-zero strip is
 *  rendered as a calm empty note, never as a wall of zeros. */
export function workloadHasSignal(weeks: readonly WorkloadWeek[]): boolean {
  return weeks.some((w) => w.plannedDays > 0 || w.actualHours > 0);
}
