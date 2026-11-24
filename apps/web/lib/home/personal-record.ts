import type { MonthWorkTime } from "@/lib/journal/work-intelligence";

/**
 * THE PERSONAL RECORD — the sport principle for ONE person (Future
 * Experience C, owner decision 2026-10-14: "asmeniniai rekordai matomi tik
 * pačiam žmogui; darbdaviai mato leidžiamus profesinius faktus, ne
 * žaidybinius rodiklius").
 *
 * The person's best month of CONFIRMED hours (hours a second party approved —
 * the journal model's own `months[].confirmedHours`) beside this month's.
 * Rules (pinned by `personal-record.test.ts`):
 *   - compared ONLY with the person's own history — no other person, no
 *     average, no percentile, no rank;
 *   - confirmed hours only: a record of self-reported hours would reward
 *     typing, and a record of raw hours could reward overwork the platform
 *     cannot see; confirmed work is the fact a second party stands behind;
 *   - a record needs history: fewer than two months with confirmed hours is
 *     NONE (one month is not a record, it is a month);
 *   - an unreadable journal is UNKNOWN (never "no record").
 * Rendered only on the person's own home; never in the CV, never to an
 * employer, never in matching.
 *
 * Pure and deterministic: no IO, no `Date` (the current month is passed in).
 */

export type PersonalRecord =
  | {
      readonly kind: "record";
      readonly best: { readonly month: string; readonly confirmedHours: number };
      /** This month so far (0 when nothing is confirmed yet this month). */
      readonly current: { readonly month: string; readonly confirmedHours: number };
      /** This month IS the best month (a new or equalled record). */
      readonly isRecordMonth: boolean;
    }
  | { readonly kind: "none" }
  | { readonly kind: "unknown" };

export function derivePersonalRecord(
  months: readonly MonthWorkTime[] | null,
  currentMonth: string,
): PersonalRecord {
  if (months === null) return { kind: "unknown" };
  const confirmed = months.filter((m) => m.confirmedHours > 0);
  if (confirmed.length < 2) return { kind: "none" };
  // Highest confirmed hours; ties go to the EARLIER month (the record was set
  // first then — equalling it later is still said as reaching it).
  const best = confirmed.reduce((a, b) =>
    b.confirmedHours > a.confirmedHours || (b.confirmedHours === a.confirmedHours && b.month < a.month) ? b : a,
  );
  const current = months.find((m) => m.month === currentMonth)?.confirmedHours ?? 0;
  return {
    kind: "record",
    best: { month: best.month, confirmedHours: best.confirmedHours },
    current: { month: currentMonth, confirmedHours: current },
    isRecordMonth: current > 0 && current >= best.confirmedHours,
  };
}
