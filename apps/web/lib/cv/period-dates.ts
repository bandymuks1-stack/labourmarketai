/**
 * Period-endpoint → DB date conversion for self-declared work history.
 *
 * Contract (worker E2E date-precision correction, PR #851):
 *   - the STATED precision is preserved, never widened and never invented:
 *       year only        → start = Y-01-01,  end = Y-12-31
 *       year + month     → start = Y-M-01,   end = last real day of Y-M
 *                          (leap-aware: 2024-02 → 2024-02-29, 2023-02 → 2023-02-28)
 *       full date        → the exact stated day
 *   - calendar-invalid or out-of-range input returns null (REJECTED, never
 *     silently normalised into a different date).
 *
 * PURE + DETERMINISTIC — no IO, no clock access (Date is used only as a
 * calendar table via Date.UTC of explicit fields).
 */

import { formatUtcDate } from "@/lib/time/display";

import type { CvDatePart } from "./structured-parse";

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

/** Days in a calendar month (leap-aware). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isValidPart(p: CvDatePart): boolean {
  if (!Number.isInteger(p.year) || p.year < MIN_YEAR || p.year > MAX_YEAR) return false;
  if (p.month === null) return p.day === null; // a day without a month is meaningless
  if (!Number.isInteger(p.month) || p.month < 1 || p.month > 12) return false;
  if (p.day === null) return true;
  return Number.isInteger(p.day) && p.day >= 1 && p.day <= daysInMonth(p.year, p.month);
}

function iso(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** First day of the STATED unit — or null when the part is invalid/absent. */
export function periodStartIso(p: CvDatePart | null | undefined): string | null {
  if (!p || !isValidPart(p)) return null;
  if (p.month === null) return iso(p.year, 1, 1);
  if (p.day === null) return iso(p.year, p.month, 1);
  return iso(p.year, p.month, p.day);
}

/** Last day of the STATED unit — or null when the part is invalid/absent. */
export function periodEndIso(p: CvDatePart | null | undefined): string | null {
  if (!p || !isValidPart(p)) return null;
  if (p.month === null) return iso(p.year, 12, 31);
  if (p.day === null) return iso(p.year, p.month, daysInMonth(p.year, p.month));
  return iso(p.year, p.month, p.day);
}

/**
 * THE OTHER HALF OF THAT CONTRACT: READING IT BACK (found 2026-11-04, UF-3).
 *
 * A self-declared date column has no precision of its own, so a person who wrote
 * "2018-2019" was printed as "2018-01-01 - 2019-12-31": a day and a month nobody
 * stated. The stored edge says what was stated, as far as it can be told: the
 * first day of a year or month starts that unit, its last day ends it. An exact
 * date that happens to fall there reads less precisely, which invents nothing.
 *
 * ONLY for dates a person stated about themselves. An organization's recorded
 * start of 1 January is a real date, so its rows keep their own formatting.
 */
export type PeriodEdge = "start" | "end";
export type StatedPrecision = "year" | "month" | "day";

export function statedPrecision(iso: string | null | undefined, edge: PeriodEdge): StatedPrecision | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (edge === "start") {
    if (day !== 1) return "day";
    return month === 1 ? "year" : "month";
  }
  if (day !== daysInMonth(year, month)) return "day";
  return month === 12 ? "year" : "month";
}

/** The stated part of a stored date in the same ISO shape: 2018, 2018-03, 2018-03-14. */
export function statedIsoText(iso: string | null | undefined, edge: PeriodEdge): string | null {
  const precision = statedPrecision(iso, edge);
  if (!precision || !iso) return null;
  return iso.slice(0, precision === "year" ? 4 : precision === "month" ? 7 : 10);
}

/** The stated part of a stored date, localized. `finest` is how fine the surface
 *  ever goes: a list that shows months keeps showing months for a stated day. */
export function statedDateLabel(
  iso: string | null | undefined,
  edge: PeriodEdge,
  locale: string,
  finest: "month" | "day" = "day",
): string | null {
  const precision = statedPrecision(iso, edge);
  if (!precision || !iso) return null;
  if (precision === "year") return formatUtcDate(iso, locale, { year: "numeric" });
  if (precision === "month" || finest === "month") {
    return formatUtcDate(iso, locale, { year: "numeric", month: "short" });
  }
  return formatUtcDate(iso, locale);
}
