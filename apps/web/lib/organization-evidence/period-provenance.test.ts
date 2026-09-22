import { describe, expect, it } from "vitest";

import { periodProvenance } from "@/components/app/organization-evidence-section";

/**
 * SOURCE FACT ≠ DERIVED (owner P0 2026-09-22 §11). The production record
 * "800 h, 2025-06-01 – 2025-11-30" was made from the source sentence "at
 * least 16 month … each month only 50 hours" by a person's choice at import
 * (`derived.timeSemantics.method = human_choice`). The surface must say so
 * beside the period instead of rendering it like an observed date.
 */
describe("periodProvenance reads the record's own provenance", () => {
  const base = { activityDate: null, periodStart: "2025-06-01", factFields: [] as string[] };

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
});
