import { describe, expect, it } from "vitest";

import {
  monthsBetween,
  projectPeriodAggregateByMonth,
  projectionSumCents,
} from "./period-projection";

/**
 * Owner decision 2026-09-17 (B1): a confirmed period aggregate is READ as an
 * even monthly share; the canonical record stays one period record; the
 * shares conserve the total exactly; nothing here is a day.
 */
describe("projectPeriodAggregateByMonth — the owner's two real cases", () => {
  it("800 h over 2025-06-01 → 2025-11-30: six months, sum EXACTLY 800.00", () => {
    const p = projectPeriodAggregateByMonth({ hours: 800, periodStart: "2025-06-01", periodEnd: "2025-11-30" })!;
    expect(p.method).toBe("equal_month_share");
    expect(p.monthCount).toBe(6);
    expect(p.months.map((m) => m.month)).toEqual(["2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11"]);
    // 80000 hundredths / 6 = 13333 rem 2 → the first two months carry the cent
    expect(p.months.map((m) => m.hours)).toEqual([133.34, 133.34, 133.33, 133.33, 133.33, 133.33]);
    expect(projectionSumCents(p)).toBe(80000);
    expect(p.totalHours).toBe(800);
  });

  it("165 h over 2025-07-01 → 2025-11-30: five months at 33 h each, sum EXACTLY 165", () => {
    const p = projectPeriodAggregateByMonth({ hours: 165, periodStart: "2025-07-01", periodEnd: "2025-11-30" })!;
    expect(p.monthCount).toBe(5);
    expect(p.months.map((m) => m.month)).toEqual(["2025-07", "2025-08", "2025-09", "2025-10", "2025-11"]);
    expect(p.months.every((m) => m.hours === 33)).toBe(true);
    expect(projectionSumCents(p)).toBe(16500);
  });
});

describe("exact conservation, generically", () => {
  const cases: Array<[number, string, string]> = [
    [800, "2025-06-01", "2025-11-30"],
    [165, "2025-07-01", "2025-11-30"],
    [100, "2025-01-01", "2025-03-31"], // 33.34 / 33.33 / 33.33
    [1, "2025-01-01", "2025-07-31"], // 0.15 / 0.15 / 0.14 …
    [0.07, "2025-01-01", "2025-12-31"], // 7 cents over 12 months: 0.01 × 7, 0 × 5
    [1234.56, "2024-11-15", "2026-02-03"], // cross-year, odd cents
    [7.5, "2025-05-10", "2025-05-10"], // a single month, a single day
  ];
  it.each(cases)("%s h over %s → %s sums to the cent and never drifts", (hours, start, end) => {
    const p = projectPeriodAggregateByMonth({ hours, periodStart: start, periodEnd: end })!;
    expect(p).not.toBeNull();
    expect(projectionSumCents(p)).toBe(Math.round(hours * 100));
    // no share differs from another by more than one cent — "equal"
    const cents = p.months.map((m) => Math.round(m.hours * 100));
    expect(Math.max(...cents) - Math.min(...cents)).toBeLessThanOrEqual(1);
    // deterministic: the same input yields the same shares
    expect(projectPeriodAggregateByMonth({ hours, periodStart: start, periodEnd: end })).toEqual(p);
  });

  it("a single-month period is one share equal to the total", () => {
    const p = projectPeriodAggregateByMonth({ hours: 42.5, periodStart: "2025-03-02", periodEnd: "2025-03-28" })!;
    expect(p.months).toEqual([{ month: "2025-03", hours: 42.5 }]);
  });

  it("a cross-year period walks the calendar correctly", () => {
    expect(monthsBetween("2025-11-01", "2026-02-28")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    const p = projectPeriodAggregateByMonth({ hours: 400, periodStart: "2025-11-01", periodEnd: "2026-02-28" })!;
    expect(p.monthCount).toBe(4);
    expect(p.months.every((m) => m.hours === 100)).toBe(true);
  });
});

describe("no fabricated projection", () => {
  it("missing, partial or inverted period → null", () => {
    expect(projectPeriodAggregateByMonth({ hours: 800, periodStart: null, periodEnd: null })).toBeNull();
    expect(projectPeriodAggregateByMonth({ hours: 800, periodStart: undefined, periodEnd: "2025-11-30" })).toBeNull();
    expect(projectPeriodAggregateByMonth({ hours: 800, periodStart: "2025-11-30", periodEnd: "2025-06-01" })).toBeNull();
    expect(projectPeriodAggregateByMonth({ hours: 800, periodStart: "June 2025", periodEnd: "2025-11-30" })).toBeNull();
    expect(projectPeriodAggregateByMonth({ hours: 800, periodStart: "2025-13-01", periodEnd: "2025-11-30" })).toBeNull();
  });

  it("no total, zero or negative → null", () => {
    expect(projectPeriodAggregateByMonth({ hours: null, periodStart: "2025-06-01", periodEnd: "2025-11-30" })).toBeNull();
    expect(projectPeriodAggregateByMonth({ hours: 0, periodStart: "2025-06-01", periodEnd: "2025-11-30" })).toBeNull();
    expect(projectPeriodAggregateByMonth({ hours: -5, periodStart: "2025-06-01", periodEnd: "2025-11-30" })).toBeNull();
    expect(projectPeriodAggregateByMonth({ hours: Number.NaN, periodStart: "2025-06-01", periodEnd: "2025-11-30" })).toBeNull();
  });

  it("the output has no day key — it cannot be mistaken for daily ACTUAL work", () => {
    const p = projectPeriodAggregateByMonth({ hours: 800, periodStart: "2025-06-01", periodEnd: "2025-11-30" })!;
    for (const m of p.months) {
      expect(Object.keys(m).sort()).toEqual(["hours", "month"]);
      expect(m.month).toMatch(/^\d{4}-\d{2}$/);
    }
    expect(JSON.stringify(p)).not.toMatch(/workDate|activity_date|activityDate|"day"/);
  });
});
