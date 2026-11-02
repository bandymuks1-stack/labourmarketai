/**
 * ISO calendar-day arithmetic for the forecast engine. Pure: no clock, no
 * locale, no date library. Days are `YYYY-MM-DD`, compared and differenced in
 * UTC so the same input always gives the same day.
 */

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isIsoDay(v: unknown): v is string {
  return typeof v === "string" && DAY_RX.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

/** The calendar day of an ISO day or instant, or null. */
export function toIsoDay(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const d = v.slice(0, 10);
  return isIsoDay(d) ? d : null;
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** Inclusive: is `day` within [from, to]? */
export function dayWithin(day: string, from: string, to: string): boolean {
  return day >= from && day <= to;
}
