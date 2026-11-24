import { describe, expect, it } from "vitest";

import {
  absenceDaysWithinPeriod,
  calendarYearPeriod,
  deriveLeaveBalance,
  requestedAbsenceDays,
  type LeaveBalancePolicy,
} from "@/lib/leave/balances-model";
import type { WorkerAbsence } from "@/lib/leave/absences-model";

/**
 * The derived-balance arithmetic — the module's single source of day math,
 * proven here because it lives in TS (no SQL computes a balance anywhere;
 * that is the design: NO stored balances).
 */

const POLICY: LeaveBalancePolicy = {
  id: "p1",
  organizationId: "org1",
  absenceType: "annual_leave",
  annualEntitlementDays: 20,
  periodBasis: "calendar_year",
  carryoverDays: 2,
  isActive: true,
};

function absence(
  startDate: string,
  endDate: string,
  overrides: Partial<WorkerAbsence> = {},
): WorkerAbsence {
  return {
    id: `${startDate}-${endDate}`,
    workerId: "w1",
    workerName: null,
    absenceType: "annual_leave",
    startDate,
    endDate,
    halfDay: false,
    note: null,
    status: "approved",
    ...overrides,
  };
}

describe("absenceDaysWithinPeriod", () => {
  const { start, end } = calendarYearPeriod(2026);

  it("counts inclusive calendar days", () => {
    expect(
      absenceDaysWithinPeriod(absence("2026-03-02", "2026-03-06"), start, end),
    ).toBe(5);
    expect(
      absenceDaysWithinPeriod(absence("2026-03-02", "2026-03-02"), start, end),
    ).toBe(1);
  });

  it("a half-day single-day absence counts 0.5", () => {
    expect(
      absenceDaysWithinPeriod(
        absence("2026-03-02", "2026-03-02", { halfDay: true }),
        start,
        end,
      ),
    ).toBe(0.5);
  });

  it("a half-day range deducts the 0.5 exactly once", () => {
    expect(
      absenceDaysWithinPeriod(
        absence("2026-03-02", "2026-03-04", { halfDay: true }),
        start,
        end,
      ),
    ).toBe(2.5);
  });

  it("clips to the period boundary (year-crossing absence)", () => {
    // 2025-12-29 .. 2026-01-03 → only 3 days fall inside 2026.
    expect(
      absenceDaysWithinPeriod(absence("2025-12-29", "2026-01-03"), start, end),
    ).toBe(3);
    // Entirely outside the period → 0.
    expect(
      absenceDaysWithinPeriod(absence("2025-05-01", "2025-05-05"), start, end),
    ).toBe(0);
  });

  it("never returns a negative count and rejects malformed dates", () => {
    expect(
      absenceDaysWithinPeriod(absence("2026-03-06", "2026-03-02"), start, end),
    ).toBe(0);
    expect(
      absenceDaysWithinPeriod(absence("not-a-date", "2026-03-02"), start, end),
    ).toBe(0);
  });
});

describe("deriveLeaveBalance", () => {
  it("entitlement + carryover − approved used days, half-day aware", () => {
    const balance = deriveLeaveBalance(
      POLICY,
      [
        absence("2026-02-02", "2026-02-06"), // 5 days
        absence("2026-07-01", "2026-07-01", { halfDay: true }), // 0.5
      ],
      2026,
    );
    expect(balance.usedDays).toBe(5.5);
    expect(balance.remainingDays).toBe(20 + 2 - 5.5);
  });

  it("counts ONLY approved absences of the policy's type", () => {
    const balance = deriveLeaveBalance(
      POLICY,
      [
        absence("2026-02-02", "2026-02-06", { status: "requested" }),
        absence("2026-03-02", "2026-03-06", { status: "rejected" }),
        absence("2026-04-02", "2026-04-06", { status: "cancelled" }),
        absence("2026-05-04", "2026-05-06", { absenceType: "sickness" }),
      ],
      2026,
    );
    expect(balance.usedDays).toBe(0);
    expect(balance.remainingDays).toBe(22);
  });

  it("goes honestly negative when usage exceeds the configured numbers", () => {
    const balance = deriveLeaveBalance(
      { ...POLICY, annualEntitlementDays: 2, carryoverDays: 0 },
      [absence("2026-02-02", "2026-02-06")],
      2026,
    );
    expect(balance.remainingDays).toBe(-3);
  });
});

describe("requestedAbsenceDays", () => {
  it("matches the usage arithmetic exactly (one rule, one place)", () => {
    expect(requestedAbsenceDays(absence("2026-02-02", "2026-02-06"))).toBe(5);
    expect(
      requestedAbsenceDays(
        absence("2026-02-02", "2026-02-02", { halfDay: true }),
      ),
    ).toBe(0.5);
  });
});
