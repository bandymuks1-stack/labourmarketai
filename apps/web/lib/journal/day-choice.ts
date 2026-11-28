/**
 * The journal's work-day choice (owner P1, 2026-11-21): pure date helpers for
 * `app/[locale]/dashboard/journal/day-choice.tsx`.
 */

/** `YYYY-MM-DD` shifted by whole days, in UTC so no clock shifts the key. */
export function shiftIsoDay(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The recorder's link for a day; `null` is today (no parameter). */
export function journalDayHref(day: string | null, full: boolean): string {
  const q = new URLSearchParams();
  if (full) q.set("compose", "full");
  if (day) q.set("date", day);
  const qs = q.toString();
  return `/dashboard/journal${qs ? `?${qs}` : ""}#journal-composer`;
}

export type JournalDayChoiceKey = "today" | "yesterday" | "weekAgo" | "other";

/** Which option the current `?date=` is. */
export function journalDayChoice(selected: string | null, today: string): JournalDayChoiceKey {
  if (!selected || selected === today) return "today";
  if (selected === shiftIsoDay(today, -1)) return "yesterday";
  if (selected === shiftIsoDay(today, -7)) return "weekAgo";
  return "other";
}
