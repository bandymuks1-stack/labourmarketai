/**
 * EVERY HOUR ONCE, ACROSS AN ORGANIZATION'S RECORDS (decision 0025, owner P0
 * 2026-11-24). The organization-level form of the person rule in
 * `lib/journal/organization-all-time.ts`: a PERIOD record (no day, a stated
 * span) whose span holds a DAY record of the same person may be a summary of
 * those days, so it is listed as overlapping and its hours are NOT added. A
 * period record with no day record of that person inside its span is the only
 * account of that time and is counted.
 *
 * One total therefore means day hours + non-overlapping period hours, and no
 * surface shows period sums as a second, competing figure. Pure, no IO.
 */

export type HoursRecord = {
  readonly id: string;
  readonly personId: string | null;
  readonly activityDate: string | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  readonly hours: number | null;
};

const positive = (h: number | null) => (h !== null && Number.isFinite(h) && h > 0 ? h : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Ids of period records whose span holds a day record of the same person. */
export function overlappingPeriodRecordIds(records: readonly HoursRecord[]): ReadonlySet<string> {
  const daysOf = new Map<string, string[]>();
  for (const r of records) {
    if (!r.personId || !r.activityDate) continue;
    const arr = daysOf.get(r.personId);
    if (arr) arr.push(r.activityDate);
    else daysOf.set(r.personId, [r.activityDate]);
  }
  const out = new Set<string>();
  for (const r of records) {
    if (r.activityDate !== null || !r.periodStart || !r.periodEnd || !r.personId) continue;
    const days = daysOf.get(r.personId);
    if (days?.some((d) => d >= r.periodStart! && d <= r.periodEnd!)) out.add(r.id);
  }
  return out;
}

export type HoursCountedOnce = {
  /** Day hours + non-overlapping period hours: THE total. */
  readonly hours: number;
  /** Period records not added (they may summarise counted days). */
  readonly overlapping: { readonly records: number; readonly hours: number };
};

export function hoursCountedOnce(records: readonly HoursRecord[]): HoursCountedOnce {
  const skip = overlappingPeriodRecordIds(records);
  let hours = 0;
  let oh = 0;
  for (const r of records) {
    if (skip.has(r.id)) oh += positive(r.hours);
    else hours += positive(r.hours);
  }
  return { hours: round2(hours), overlapping: { records: skip.size, hours: round2(oh) } };
}
