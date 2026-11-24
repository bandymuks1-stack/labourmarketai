import {
  deriveEntryWorkTime,
  type WorkTimeMetricRow,
  type WorkTimeUnit,
} from "@/lib/journal/work-time";

/**
 * THE HOURS A REVIEWER IS ASKED TO CONFIRM — the entry's STORED work time,
 * by the one canonical rule (`deriveEntryWorkTime`), never a re-parse of the
 * free text.
 *
 * The inbox, the counterparty review and the review report each re-parsed
 * `original_text` at display time (work-time.ts header, reader 3). A reviewer
 * could approve "8 h" over an entry that stores 6 h, saw nothing for
 * "2 h tinkas, 3 h glaistas" (two mentions → no single parse) though the
 * entry stores 5 h, and never saw a correction. Now every reviewer surface
 * shows what the timesheet and the calendar count.
 *
 * `certain` is false when the canonical rule had to set something aside (the
 * entry stated both per-activity times and a whole-entry duration, or mixed
 * hours with days) — the reviewer is told to look closer, nothing is guessed.
 * No stored duration → null: the reviewer reads the text, no number is made up.
 */
export type ReviewerHours = {
  readonly value: number;
  readonly unit: WorkTimeUnit;
  readonly certain: boolean;
};

export function reviewerHoursOf(entry: {
  readonly id: string;
  readonly createdAt: string;
  readonly metrics: readonly WorkTimeMetricRow[];
}): ReviewerHours | null {
  const wt = deriveEntryWorkTime({ entryId: entry.id, createdAt: entry.createdAt, metrics: entry.metrics });
  if (wt.lines.length === 0) return null;
  const mixed = wt.totalHours > 0 && wt.totalDayUnits > 0;
  const certain = wt.conflict === null && !mixed;
  if (wt.lines.length === 1) {
    const only = wt.lines[0]!;
    return { value: only.value, unit: only.unit, certain };
  }
  if (wt.totalHours > 0) return { value: wt.totalHours, unit: "hours", certain };
  if (wt.totalDayUnits > 0) return { value: wt.totalDayUnits, unit: "days", certain };
  return null;
}
