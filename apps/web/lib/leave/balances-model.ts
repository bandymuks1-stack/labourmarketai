/**
 * Leave balance — pure derivation model (v1). No server-only imports, no IO.
 *
 * NO stored balances anywhere: a balance is DERIVED at read time as
 *
 *   available = annual_entitlement_days + carryover_days
 *               − approved absence days inside the period (half-day aware)
 *
 * over the org's `leave_balance_policies` row (org-configured numbers — the
 * platform ships NO statutory defaults and simulates NO law) and the
 * worker's own `worker_absences` rows the caller can already read under
 * existing RLS.
 *
 * ADVISORY ONLY, STATED ONCE FOR EVERY SURFACE: a balance never blocks a
 * request and never auto-decides anything — managers decide. UI copy must
 * never claim legal compliance.
 */

import type { AbsenceType, WorkerAbsence } from "@/lib/leave/absences-model";

export type LeaveBalancePolicy = {
  readonly id: string;
  readonly organizationId: string;
  readonly absenceType: AbsenceType;
  readonly annualEntitlementDays: number;
  readonly periodBasis: "calendar_year";
  readonly carryoverDays: number;
  readonly isActive: boolean;
};

export type LeaveBalance = {
  readonly organizationId: string;
  readonly absenceType: AbsenceType;
  readonly entitlementDays: number;
  readonly carryoverDays: number;
  /** Approved absence days consumed inside the period (half-day aware). */
  readonly usedDays: number;
  /** entitlement + carryover − used. May be negative — shown honestly. */
  readonly remainingDays: number;
  /** The calendar year the derivation ran for. */
  readonly year: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

function utcDate(iso: string): number | null {
  if (!DATE_RX.test(iso)) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

/**
 * How many leave days one absence consumes, counted inside [periodStart,
 * periodEnd] (both inclusive, ISO dates). Date-only domain, UTC calendar
 * days (W12 doctrine).
 *
 * Half-day rule, stated once: `half_day` marks the REQUEST as half a day
 * shorter than its date range (the existing worker_absences flag is
 * request-level, not per-day — in practice a half-day absence is a
 * single-day range counting 0.5). The 0.5 deduction applies when the range
 * overlaps the period at all; a multi-day half-day range clipped by the
 * period boundary still deducts the 0.5 once. Never negative.
 */
export function absenceDaysWithinPeriod(
  absence: Pick<WorkerAbsence, "startDate" | "endDate" | "halfDay">,
  periodStart: string,
  periodEnd: string,
): number {
  const s = utcDate(absence.startDate);
  const e = utcDate(absence.endDate);
  const ps = utcDate(periodStart);
  const pe = utcDate(periodEnd);
  if (s === null || e === null || ps === null || pe === null) return 0;
  if (e < s || pe < ps) return 0;
  const from = Math.max(s, ps);
  const to = Math.min(e, pe);
  if (to < from) return 0;
  const days = Math.round((to - from) / DAY_MS) + 1;
  const counted = absence.halfDay ? days - 0.5 : days;
  return counted > 0 ? counted : 0;
}

/** The calendar-year period bounds for the given year. */
export function calendarYearPeriod(year: number): {
  readonly start: string;
  readonly end: string;
} {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/**
 * Derive one balance from a policy and the worker's absences. Counts ONLY
 * `approved` absences of the policy's type — requested/rejected/cancelled
 * rows consume nothing (a pending request is advisory context, not usage).
 */
export function deriveLeaveBalance(
  policy: LeaveBalancePolicy,
  absences: readonly WorkerAbsence[],
  year: number,
): LeaveBalance {
  const { start, end } = calendarYearPeriod(year);
  const usedDays = absences
    .filter(
      (a) => a.status === "approved" && a.absenceType === policy.absenceType,
    )
    .reduce((sum, a) => sum + absenceDaysWithinPeriod(a, start, end), 0);
  const remainingDays =
    policy.annualEntitlementDays + policy.carryoverDays - usedDays;
  return {
    organizationId: policy.organizationId,
    absenceType: policy.absenceType,
    entitlementDays: policy.annualEntitlementDays,
    carryoverDays: policy.carryoverDays,
    usedDays,
    remainingDays,
    year,
  };
}

/**
 * The days one request ASKS for (advisory context beside a pending review).
 * Same half-day arithmetic as the usage derivation — one rule, one place.
 */
export function requestedAbsenceDays(
  absence: Pick<WorkerAbsence, "startDate" | "endDate" | "halfDay">,
): number {
  return absenceDaysWithinPeriod(
    absence,
    absence.startDate,
    absence.endDate,
  );
}
