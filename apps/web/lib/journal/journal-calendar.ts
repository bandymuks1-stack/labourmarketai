/**
 * THE WORK JOURNAL CALENDAR — the day navigator for recorded work
 * (owner direction 2026-09-13: "įrašai turi būti normaliame kalendoriuje
 * (diena/savaitė/mėnuo pagal poreikį), ne ilgame datų ir įrašų sąraše").
 *
 * WHAT THIS IS NOT. It is not a second time store and not a second
 * projection. It reads NOTHING. It is a pure re-shaping of the day groups
 * the journal page already derived through THE canonical work-time rule
 * (`resolveWorkDayDetail` → `deriveEntryWorkTime`), so a day's entry count
 * and its hours are the same figures the diary card, the calendar
 * (`/dashboard/planning`) and every Work-in-Numbers tile show. The
 * anti-second-calendar rule survives by construction: this module cannot
 * disagree with the journal, because it is given the journal's own days.
 *
 * UTC, deliberately. Every label the journal renders goes through
 * `lib/time/display.ts`, which is UTC-only (W12) — so the grid is built in
 * UTC too. A grid built in the ambient zone would put the same entry in a
 * different cell on the server and in the browser.
 *
 * HONESTY (SEP-7). A cell with no records carries `entryCount: 0` because
 * nothing was recorded on that day — that is a real zero over a known
 * window, not an unknown. A day the reader could not answer for never
 * reaches this module; the page renders its own "could not read" line.
 */

/** Which period the grid spans. The day view is the selected cell itself. */
export type JournalCalendarScale = "month" | "week";

export const JOURNAL_CALENDAR_SCALES: readonly JournalCalendarScale[] = [
  "month",
  "week",
] as const;

/** One day that actually carries recorded work. */
export interface JournalCalendarDayInput {
  /** ISO day, `YYYY-MM-DD` (UTC) — the key `?date=` navigates by. */
  readonly iso: string;
  readonly entryCount: number;
  /** Summed through the canonical work-time rule; 0 when the day is untimed. */
  readonly totalMinutes: number;
}

export interface JournalCalendarCell {
  readonly iso: string;
  readonly dayOfMonth: number;
  /** False for the leading/trailing days a month grid borrows from its neighbours. */
  readonly inScope: boolean;
  readonly isToday: boolean;
  readonly isSelected: boolean;
  /** Days after today — never offered as a place to look for recorded work. */
  readonly isFuture: boolean;
  readonly entryCount: number;
  readonly totalMinutes: number;
}

export interface JournalCalendarGrid {
  readonly scale: JournalCalendarScale;
  /** First day of the anchored period (UTC ISO). */
  readonly anchor: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  /** Rows of exactly 7 cells, Monday first. */
  readonly weeks: readonly (readonly JournalCalendarCell[])[];
  /** Anchors for the previous / next period — plain ISO, never a delta. */
  readonly prevAnchor: string;
  readonly nextAnchor: string;
  /** Totals over the days IN SCOPE — the honest sum of what this view shows. */
  readonly recordedDays: number;
  readonly recordedEntries: number;
  readonly recordedMinutes: number;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `true` when the value is a plain ISO day this module can navigate by. */
export function isIsoDay(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function key(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO day `days` after (or before) `iso`. */
export function addDays(iso: string, days: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return key(d);
}

/** The Monday of the ISO week `iso` falls in. */
export function startOfWeek(iso: string): string {
  const d = utc(iso);
  // getUTCDay: 0 = Sunday … 6 = Saturday. Monday-first ⇒ Sunday is day 6.
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -offset);
}

/** The first day of the month `iso` falls in. */
export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** The first day of the month `months` after (or before) `iso`'s month. */
export function shiftMonth(iso: string, months: number): string {
  const d = utc(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + months);
  return key(d);
}

/** The first day of the period `iso` belongs to, for the given scale. */
export function startOfScale(iso: string, scale: JournalCalendarScale): string {
  return scale === "week" ? startOfWeek(iso) : startOfMonth(iso);
}

/**
 * THE ANCHOR a grid opens on, in one place so every caller agrees:
 * an explicit `?month=` wins, then the selected day, then today.
 * Anything unparseable falls back rather than throwing — a bad URL shows
 * the person their own month, never an error page.
 */
export function resolveAnchor({
  requested,
  selected,
  today,
  scale,
}: {
  readonly requested?: unknown;
  readonly selected?: string | null;
  readonly today: string;
  readonly scale: JournalCalendarScale;
}): string {
  const base = isIsoDay(requested)
    ? requested
    : selected && isIsoDay(selected)
      ? selected
      : today;
  return startOfScale(base, scale);
}

/** The scale a `?cal=` value asks for; anything else is the month view. */
export function resolveScale(requested: unknown): JournalCalendarScale {
  return requested === "week" ? "week" : "month";
}

export function buildJournalCalendar({
  scale,
  anchor,
  today,
  selected,
  days,
}: {
  readonly scale: JournalCalendarScale;
  /** Any day inside the period; normalised here. */
  readonly anchor: string;
  readonly today: string;
  readonly selected?: string | null;
  readonly days: readonly JournalCalendarDayInput[];
}): JournalCalendarGrid {
  const periodStart = startOfScale(anchor, scale);
  const periodEnd =
    scale === "week" ? addDays(periodStart, 6) : addDays(shiftMonth(periodStart, 1), -1);

  const byDay = new Map<string, JournalCalendarDayInput>();
  for (const d of days) {
    if (!isIsoDay(d.iso)) continue;
    // Two inputs for one day would be a defect upstream; sum rather than
    // drop, so a figure can never silently disappear from the grid.
    const prev = byDay.get(d.iso);
    byDay.set(
      d.iso,
      prev
        ? {
            iso: d.iso,
            entryCount: prev.entryCount + d.entryCount,
            totalMinutes: prev.totalMinutes + d.totalMinutes,
          }
        : d,
    );
  }

  const gridStart = startOfWeek(periodStart);
  const gridEnd = addDays(startOfWeek(periodEnd), 6);

  const weeks: JournalCalendarCell[][] = [];
  let cursor = gridStart;
  let row: JournalCalendarCell[] = [];
  while (cursor <= gridEnd) {
    const rec = byDay.get(cursor);
    row.push({
      iso: cursor,
      dayOfMonth: Number(cursor.slice(8, 10)),
      inScope: cursor >= periodStart && cursor <= periodEnd,
      isToday: cursor === today,
      isSelected: selected != null && cursor === selected,
      isFuture: cursor > today,
      entryCount: rec?.entryCount ?? 0,
      totalMinutes: rec?.totalMinutes ?? 0,
    });
    if (row.length === 7) {
      weeks.push(row);
      row = [];
    }
    cursor = addDays(cursor, 1);
  }
  if (row.length > 0) weeks.push(row);

  let recordedDays = 0;
  let recordedEntries = 0;
  let recordedMinutes = 0;
  for (const week of weeks) {
    for (const cell of week) {
      if (!cell.inScope || cell.entryCount === 0) continue;
      recordedDays += 1;
      recordedEntries += cell.entryCount;
      recordedMinutes += cell.totalMinutes;
    }
  }

  return {
    scale,
    anchor: periodStart,
    rangeStart: periodStart,
    rangeEnd: periodEnd,
    weeks,
    prevAnchor: scale === "week" ? addDays(periodStart, -7) : shiftMonth(periodStart, -1),
    nextAnchor: scale === "week" ? addDays(periodStart, 7) : shiftMonth(periodStart, 1),
    recordedDays,
    recordedEntries,
    recordedMinutes,
  };
}

/** The seven Monday-first weekday keys, for locale labels built by the caller. */
export const WEEKDAY_ANCHOR_ISO: readonly string[] = [
  // 2026-01-05 is a Monday — a fixed anchor week for `Intl` weekday labels,
  // so the header never depends on what "this week" happens to be.
  "2026-01-05",
  "2026-01-06",
  "2026-01-07",
  "2026-01-08",
  "2026-01-09",
  "2026-01-10",
  "2026-01-11",
] as const;
