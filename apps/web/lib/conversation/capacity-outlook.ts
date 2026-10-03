import { addDays, effectiveEndDay, rangesOverlapInclusive } from "@/lib/planning/planning-model";

/**
 * THE FOUR-WEEK OUTLOOK — a DERIVED reading of rows the capacity answer
 * already holds (SEP-1: fact → derived → forecast). Pure, no IO, nothing
 * stored: change a booking, an assignment or an approved absence and the next
 * read of this function changes with it.
 *
 * Per person and per window of 7 days from today, ONE bucket, strongest
 * first:
 *   away       approved absence touches the window (the hard constraint)
 *   committed  a DATED commitment touches the window (real work, not a bar)
 *   unclear    the only thing on record is an assignment nobody dated — the
 *              person is NOT free and the window is NOT known (SEP-7:
 *              UNKNOWN is neither zero nor free)
 *   free       nothing on record touches the window
 *
 * "free" therefore means "nothing recorded", exactly as the capacity answer
 * words it; the surface never turns it into a promise.
 */

export const OUTLOOK_WEEKS = 4;

export interface OutlookWeek {
  readonly from: string;
  readonly to: string;
  readonly free: number;
  readonly committed: number;
  readonly away: number;
  readonly unclear: number;
}

interface Band {
  readonly workerId: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

export function buildCapacityOutlook(input: {
  readonly workerIds: readonly string[];
  readonly startDay: string;
  readonly absences: readonly Band[];
  readonly commitments: readonly Band[];
  readonly undatedWorkerIds: ReadonlySet<string>;
  readonly weeks?: number;
}): readonly OutlookWeek[] {
  const weeks = Math.min(Math.max(input.weeks ?? OUTLOOK_WEEKS, 1), 12);
  const touches = (b: Band, from: string, to: string): boolean => {
    const end = effectiveEndDay(b);
    if (!b.startDate || !end) return false;
    return rangesOverlapInclusive(from, to, b.startDate, end);
  };
  const out: OutlookWeek[] = [];
  for (let i = 0; i < weeks; i++) {
    const from = addDays(input.startDay, i * 7);
    const to = addDays(from, 6);
    let free = 0;
    let committed = 0;
    let away = 0;
    let unclear = 0;
    for (const id of input.workerIds) {
      if (input.absences.some((a) => a.workerId === id && touches(a, from, to))) away++;
      else if (input.commitments.some((c) => c.workerId === id && touches(c, from, to))) committed++;
      else if (input.undatedWorkerIds.has(id)) unclear++;
      else free++;
    }
    out.push({ from, to, free, committed, away, unclear });
  }
  return out;
}
