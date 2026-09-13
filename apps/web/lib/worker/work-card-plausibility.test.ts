import { describe, expect, it } from "vitest";
import {
  ANNUAL_SUSPECT_EUR,
  MONTHLY_FLOOR_EUR,
  deriveWorkCardChecks,
  type WorkCardCheckInput,
} from "./work-card-plausibility";

const TODAY = "2026-09-13";
const v = (over: Partial<WorkCardCheckInput>): WorkCardCheckInput => ({
  salaryMin: null,
  salaryMax: null,
  availabilityStatus: null,
  availableFrom: null,
  ...over,
});
const codes = (i: WorkCardCheckInput) => deriveWorkCardChecks(i, TODAY).map((c) => c.code);

describe("work-card plausibility — the owner's 150–500 EUR/month case", () => {
  // NEGATIVE CONTROL: before this module the CV printed "150–500" under
  // "Atlyginimo lūkestis (EUR/mėn.)" with no sentence beside it — nothing in
  // the tree derived a check from the stored figures.
  it("150–500 as a month reads like a rate, and says so", () => {
    const checks = deriveWorkCardChecks(v({ salaryMin: 150, salaryMax: 500 }), TODAY);
    expect(checks.map((c) => c.code)).toEqual(["salary_below_monthly_floor"]);
    expect(checks[0]!.salaryMin).toBe(150);
    expect(checks[0]!.salaryMax).toBe(500);
    expect(checks[0]!.daysFromToday).toBeNull();
  });

  it("the check never changes the figures — it only carries them", () => {
    const input = v({ salaryMin: 150, salaryMax: 500 });
    const before = JSON.stringify(input);
    deriveWorkCardChecks(input, TODAY);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("a wide range whose ceiling is a wage is not flagged", () => {
    expect(codes(v({ salaryMin: 150, salaryMax: 2500 }))).toEqual([]);
    expect(codes(v({ salaryMin: 1500, salaryMax: 2500 }))).toEqual([]);
    expect(codes(v({ salaryMin: MONTHLY_FLOOR_EUR, salaryMax: null }))).toEqual([]);
  });

  it("a one-sided figure is judged on its own", () => {
    expect(codes(v({ salaryMin: 25, salaryMax: null }))).toEqual(["salary_below_monthly_floor"]);
    expect(codes(v({ salaryMin: null, salaryMax: 400 }))).toEqual(["salary_below_monthly_floor"]);
  });

  it("a figure above the annual threshold reads like a year", () => {
    expect(codes(v({ salaryMin: ANNUAL_SUSPECT_EUR + 1, salaryMax: 48_000 }))).toEqual([
      "salary_reads_annual",
    ]);
    expect(codes(v({ salaryMin: 3_000, salaryMax: 48_000 }))).toEqual([]);
  });

  it("no salary, zero and non-finite values produce no salary check", () => {
    expect(codes(v({}))).toEqual([]);
    expect(codes(v({ salaryMin: 0, salaryMax: 0 }))).toEqual([]);
    expect(codes(v({ salaryMin: Number.NaN, salaryMax: null }))).toEqual([]);
  });

  it("the fingerprint changes when the figures change, so a kept value stays kept", () => {
    const a = deriveWorkCardChecks(v({ salaryMin: 150, salaryMax: 500 }), TODAY)[0]!;
    const b = deriveWorkCardChecks(v({ salaryMin: 150, salaryMax: 500 }), "2026-10-01")[0]!;
    const c = deriveWorkCardChecks(v({ salaryMin: 150, salaryMax: 600 }), TODAY)[0]!;
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).not.toBe(c.fingerprint);
  });
});

describe("work-card plausibility — availability dates", () => {
  it("a start date well in the past reads as 'now'", () => {
    const checks = deriveWorkCardChecks(v({ availableFrom: "2026-01-01" }), TODAY);
    expect(checks.map((c) => c.code)).toEqual(["available_from_past"]);
    expect(checks[0]!.daysFromToday).toBeLessThan(0);
  });

  it("a start date a few days back is within grace — no check", () => {
    expect(codes(v({ availableFrom: "2026-09-01" }))).toEqual([]);
    expect(codes(v({ availableFrom: TODAY }))).toEqual([]);
  });

  it("a start date more than a year ahead is worth a look", () => {
    expect(codes(v({ availableFrom: "2028-01-01" }))).toEqual(["available_from_far"]);
    expect(codes(v({ availableFrom: "2027-03-01" }))).toEqual([]);
  });

  it("'cannot work now' with a near start date is named, not refused", () => {
    expect(
      codes(v({ availabilityStatus: "unavailable", availableFrom: "2026-11-01" })),
    ).toEqual(["unavailable_with_start_date"]);
    expect(codes(v({ availabilityStatus: "available", availableFrom: "2026-11-01" }))).toEqual([]);
  });

  it("a malformed date produces no date check (unknown is not wrong)", () => {
    expect(codes(v({ availableFrom: "soon" }))).toEqual([]);
  });

  it("salary and date checks are listed together, salary first", () => {
    expect(codes(v({ salaryMin: 150, salaryMax: 500, availableFrom: "2028-01-01" }))).toEqual([
      "salary_below_monthly_floor",
      "available_from_far",
    ]);
  });
});
