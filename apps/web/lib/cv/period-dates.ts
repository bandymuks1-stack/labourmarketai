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
