import { describe, expect, it } from "vitest";

import { periodProvenance as reExported } from "@/components/app/organization-evidence-section";
import {
  formatHoursAsStated,
  isoMonthSpan,
  periodProvenance,
  readPeriodEvidence,
} from "./period-provenance";
import { projectionSumCents } from "./period-projection";

/**
 * SOURCE FACT ≠ DERIVED (owner P0 2026-09-22 §11). The production record
 * "800 h, 2025-06-01 – 2025-11-30" was made from the source sentence "at
 * least 16 month … each month only 50 hours" by a person's choice at import
 * (`derived.timeSemantics.method = human_choice`). The surface must say so
 * beside the period instead of rendering it like an observed date.
 */
describe("periodProvenance reads the record's own provenance", () => {
  const base = { activityDate: null, periodStart: "2025-06-01", factFields: [] as string[] };

  it("is the one rule, re-exported unchanged by the subject surface", () => {
    expect(reExported).toBe(periodProvenance);
  });

  it("a period a person chose at import is `human_choice`", () => {
    expect(
      periodProvenance({ ...base, derived: { timeSemantics: { value: "period_aggregate", method: "human_choice" } } }),
    ).toBe("human_choice");
  });

  it("a period inferred by the importer is `derived`", () => {
    expect(
      periodProvenance({ ...base, derived: { timeSemantics: { value: "period_aggregate", method: "month_heading" } } }),
    ).toBe("derived");
  });

  it("a period the source stated is `source` — whatever else was derived", () => {
    expect(
      periodProvenance({ ...base, factFields: ["periodStart"], derived: { timeSemantics: { method: "human_choice" } } }),
    ).toBe("source");
    expect(periodProvenance({ ...base, derived: { calendarWeek: { method: "iso_week_of_explicit_date" } } })).toBe("source");
  });

  it("a day record with no date derivation is `source`; one with a derived date is `derived`", () => {
    expect(periodProvenance({ activityDate: "2025-11-17", periodStart: null, factFields: [], derived: {} })).toBe("source");
    expect(
      periodProvenance({ activityDate: "2025-11-17", periodStart: null, factFields: [], derived: { workDate: { method: "iso_week_weekday" } } }),
    ).toBe("derived");
  });

  it("TIGHTENED: a row-level workDate never makes a PERIOD `source` (the staged row of the real record lists workDate)", () => {
    const humanPeriod = {
      timeSemantics: { value: "period_aggregate", method: "human_choice", periodStart: "2025-06-01", periodEnd: "2025-11-30" },
    };
    expect(periodProvenance({ ...base, factFields: ["personLabel", "workDate", "hours", "workText"], derived: humanPeriod })).toBe(
      "human_choice",
    );
    // negative control: the period the time-semantics decision set wins even
    // over a stated period field — it is what the commit wrote
    expect(periodProvenance({ ...base, factFields: ["periodStart"], derived: humanPeriod })).toBe("human_choice");
    // and a day record still reads its day field
    expect(periodProvenance({ activityDate: "2025-11-17", periodStart: null, factFields: ["workDate"], derived: {} })).toBe("source");
    expect(
      periodProvenance({ activityDate: "2025-11-17", periodStart: null, factFields: ["periodStart"], derived: { workDate: { method: "iso_week_weekday" } } }),
    ).toBe("derived");
  });
});

/**
 * OWNER RULE 2026-09-23 — never manufacture precision. The two real shapes,
 * as production holds them (the stored classification predates the cues, so
 * the reading takes them from the source sentence itself).
 */
const AGGREGATE_A = {
  hours: 800,
  periodStart: "2025-06-01",
  periodEnd: "2025-11-30",
  derived: {
    timeSemantics: {
      value: "period_aggregate", method: "human_choice", confidence: 1, sourceHours: 800, note: "month",
      remote: true, periodStart: "2025-06-01", periodEnd: "2025-11-30",
    },
  },
  factFields: ["personLabel", "hours", "projectLabel", "workText"],
  sourceText: "Human research and director for at least 16 month calculating each month only 50 hours",
};
const AGGREGATE_B = {
  hours: 165,
  periodStart: "2025-07-01",
  periodEnd: "2025-11-30",
  derived: {
    timeSemantics: {
      value: "period_aggregate", method: "human_choice", confidence: 1, sourceHours: 165, note: "month",
      remote: null, periodStart: "2025-07-01", periodEnd: "2025-11-30",
    },
  },
  factFields: ["personLabel", "hours", "workText"],
  sourceText: "Coordination and consultation all 16 month when was in Lithuania, there is counting only 7 hours per week",
};

describe("readPeriodEvidence — the one reading every period surface uses", () => {
  it("800 h + 'at least 16 month' + 'each month only 50 hours', interpreted as 6 months → month span, provenance, NO 133.33, conflict flagged", () => {
    const r = readPeriodEvidence(AGGREGATE_A)!;
    expect(r.kind).toBe("interpreted_period");
    if (r.kind !== "interpreted_period") throw new Error("unreachable");
    expect(r.provenance).toBe("human_choice");
    expect(r.precision).toBe("month");
    expect(r.span).toEqual({ first: "2025-06", last: "2025-11", months: 6 });
    expect(r.totalHours).toBe(800);
    // the source's own figures travel beside the total, verbatim
    expect(r.rate).toEqual({ hours: 50, per: "month", words: "each month only 50 hours" });
    expect(r.duration).toMatchObject({ count: 16, unit: "month", bound: "at_least" });
    // the span a person chose disagrees with the words — WARNED, not refused
    expect(r.conflicts).toEqual(expect.arrayContaining(["span_below_stated_minimum", "rate_differs"]));
    // NO invented monthly figure anywhere in the reading
    expect("projection" in r).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/133\.3[34]/);
  });

  it("165 h + 'all 16 month' + '7 hours per week', interpreted as 5 months → no 33.00 split, conflict flagged", () => {
    const r = readPeriodEvidence(AGGREGATE_B)!;
    expect(r.kind).toBe("interpreted_period");
    if (r.kind !== "interpreted_period") throw new Error("unreachable");
    expect(r.span.months).toBe(5);
    expect(r.rate).toMatchObject({ hours: 7, per: "week" });
    expect(r.conflicts).toEqual(expect.arrayContaining(["span_differs_from_stated", "source_internally_inconsistent"]));
    expect("projection" in r).toBe(false);
  });

  it("cues recorded at classification win over re-reading the text", () => {
    const withCues = {
      ...AGGREGATE_A,
      derived: { timeSemantics: { ...AGGREGATE_A.derived.timeSemantics, sourceCues: null } },
    };
    const r = readPeriodEvidence(withCues)!;
    expect(r.rate).toBeNull();
    expect(r.kind).toBe("interpreted_period");
  });

  it("a SOURCE-stated period with no stated rate is the ONLY shape that projects — labelled derived, exact to the cent", () => {
    const r = readPeriodEvidence({
      hours: 800, periodStart: "2025-06-01", periodEnd: "2025-11-30",
      derived: {}, factFields: ["periodStart", "periodEnd", "hours"], sourceText: "Tiling and plastering on site",
    })!;
    expect(r.kind).toBe("source_period");
    if (r.kind !== "source_period") throw new Error("unreachable");
    expect(r.projection.monthCount).toBe(6);
    expect(projectionSumCents(r.projection)).toBe(80000);
  });

  it("a SOURCE-stated period whose words state a rate shows that rate — nothing is divided", () => {
    const r = readPeriodEvidence({
      hours: 300, periodStart: "2025-06-01", periodEnd: "2025-11-30",
      derived: {}, factFields: ["periodStart", "periodEnd"], sourceText: "coordination, 50 hours per month",
    })!;
    expect(r.kind).toBe("source_rate");
    if (r.kind !== "source_rate") throw new Error("unreachable");
    expect(r.rate).toMatchObject({ hours: 50, per: "month" });
    expect("projection" in r).toBe(false);
  });

  it("negative control: no period, no end, an inverted span or no figure → no reading at all", () => {
    expect(readPeriodEvidence({ ...AGGREGATE_A, periodStart: null, periodEnd: null })).toBeNull();
    expect(readPeriodEvidence({ ...AGGREGATE_A, periodEnd: null })).toBeNull();
    expect(readPeriodEvidence({ ...AGGREGATE_A, periodStart: "2025-12-01" })).toBeNull();
    expect(readPeriodEvidence({ ...AGGREGATE_A, hours: 0 })).toBeNull();
    expect(readPeriodEvidence({ ...AGGREGATE_A, hours: null })).toBeNull();
  });
});

describe("totals as the source gave them; spans at the precision they have", () => {
  it("no invented decimals", () => {
    expect(formatHoursAsStated(800)).toBe("800");
    expect(formatHoursAsStated(165)).toBe("165");
    expect(formatHoursAsStated(7.5)).toBe("7.5");
    expect(formatHoursAsStated(42.25)).toBe("42.25");
  });
  it("ISO month spans", () => {
    expect(isoMonthSpan({ first: "2025-06", last: "2025-11", months: 6 })).toBe("2025-06 – 2025-11");
    expect(isoMonthSpan({ first: "2025-06", last: "2025-06", months: 1 })).toBe("2025-06");
  });
});
