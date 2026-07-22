import { describe, expect, it } from "vitest";

import { daysInMonth, periodEndIso, periodStartIso } from "./period-dates";

/**
 * DB-date semantics for self-declared work-history periods (PR #851
 * correction): the STATED precision decides the saved dates —
 * year → first/last day of year, year-month → first/last REAL day of that
 * month (leap-aware), full date → the exact day. Invalid input is rejected
 * (null), never silently normalised.
 */
describe("period-dates", () => {
  it("year-only expands to Y-01-01 / Y-12-31", () => {
    expect(periodStartIso({ year: 2021, month: null, day: null })).toBe("2021-01-01");
    expect(periodEndIso({ year: 2024, month: null, day: null })).toBe("2024-12-31");
  });

  it("year-month expands to first / last real day of the stated month", () => {
    expect(periodStartIso({ year: 2021, month: 3, day: null })).toBe("2021-03-01");
    expect(periodEndIso({ year: 2024, month: 11, day: null })).toBe("2024-11-30");
    expect(periodEndIso({ year: 2022, month: 1, day: null })).toBe("2022-01-31");
  });

  it("is leap-aware for February ends", () => {
    expect(periodEndIso({ year: 2024, month: 2, day: null })).toBe("2024-02-29");
    expect(periodEndIso({ year: 2023, month: 2, day: null })).toBe("2023-02-28");
    expect(daysInMonth(2000, 2)).toBe(29); // century leap rule
    expect(daysInMonth(1900, 2)).toBe(28);
  });

  it("full dates are kept exactly", () => {
    expect(periodStartIso({ year: 2021, month: 3, day: 15 })).toBe("2021-03-15");
    expect(periodEndIso({ year: 2024, month: 11, day: 20 })).toBe("2024-11-20");
  });

  it("rejects invalid months, days and out-of-range years — never normalises", () => {
    expect(periodStartIso({ year: 2021, month: 13, day: null })).toBeNull();
    expect(periodStartIso({ year: 2021, month: 0, day: null })).toBeNull();
    expect(periodEndIso({ year: 2021, month: 2, day: 30 })).toBeNull();
    expect(periodEndIso({ year: 2023, month: 2, day: 29 })).toBeNull(); // non-leap
    expect(periodStartIso({ year: 2021, month: null, day: 5 })).toBeNull(); // day without month
    expect(periodStartIso({ year: 1899, month: null, day: null })).toBeNull();
    expect(periodEndIso({ year: 2101, month: null, day: null })).toBeNull();
    expect(periodStartIso(null)).toBeNull();
  });
});
