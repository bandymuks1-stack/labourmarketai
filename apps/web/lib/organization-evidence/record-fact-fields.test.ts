import { describe, expect, it } from "vitest";

import { periodProvenance } from "./period-provenance";
import { committedFactFields } from "./record-fact-fields";

/**
 * FACT vs DERIVED for a committed record (owner P0 §18). The read used to
 * return `factFields: []` for every record; it now names the canonical
 * fields the record's own source line states — and a span a person chose at
 * import is never one of them.
 */
const SOURCE_LINE = {
  Worker: "Person G",
  Date: "2025-11-17",
  Hours: "800",
  Object: "Administraciniai/koordinavimo darbai",
  "Work performed": "Human research and director for at least 16 month calculating each month only 50 hours",
  "Date provenance": "Derived from ISO year 2025 + source week + source weekday",
};

const HUMAN_PERIOD = {
  timeSemantics: {
    value: "period_aggregate", method: "human_choice", confidence: 1, sourceHours: 800, note: "month",
    remote: true, periodStart: "2025-06-01", periodEnd: "2025-11-30",
  },
};

describe("committedFactFields", () => {
  it("the real period record: the source's person, hours, place and words are facts; the chosen span is NOT", () => {
    const facts = committedFactFields({
      sourceFact: SOURCE_LINE,
      activityDate: null,
      periodStart: "2025-06-01",
      periodEnd: "2025-11-30",
      hours: 800,
      text: SOURCE_LINE["Work performed"],
      contextLabel: SOURCE_LINE.Object,
      derived: HUMAN_PERIOD,
    });
    expect(facts).toEqual(expect.arrayContaining(["personLabel", "hours", "workText"]));
    expect(facts).not.toContain("periodStart");
    expect(facts).not.toContain("periodEnd");
    // the source line HAS a date column, but this record holds no day — a
    // row-level date is never promoted to the period's provenance
    expect(facts).not.toContain("workDate");
    expect(
      periodProvenance({ activityDate: null, periodStart: "2025-06-01", factFields: facts, derived: HUMAN_PERIOD }),
    ).toBe("human_choice");
  });

  it("a day record whose date the source stated carries workDate as a fact", () => {
    const facts = committedFactFields({
      sourceFact: { Worker: "Person A", Date: "2025-11-17", Hours: "8", "Work performed": "tiling" },
      activityDate: "2025-11-17",
      periodStart: null,
      periodEnd: null,
      hours: 8,
      text: "tiling",
      contextLabel: null,
      derived: {},
    });
    expect(facts).toEqual(expect.arrayContaining(["personLabel", "workDate", "hours", "workText"]));
    expect(facts).not.toContain("projectLabel");
  });

  it("a period the source's own columns state is a fact — and reads as `source`", () => {
    const facts = committedFactFields({
      sourceFact: { Worker: "Person A", "Period start": "2025-06-01", "Period end": "2025-11-30", Hours: "800" },
      activityDate: null,
      periodStart: "2025-06-01",
      periodEnd: "2025-11-30",
      hours: 800,
      text: "",
      contextLabel: null,
      derived: {},
    });
    expect(facts).toEqual(expect.arrayContaining(["periodStart", "periodEnd", "hours"]));
    expect(periodProvenance({ activityDate: null, periodStart: "2025-06-01", factFields: facts, derived: {} })).toBe("source");
  });

  it("negative controls: a derivation, a missing value or an unknown header is never claimed as a fact", () => {
    const derivedDate = committedFactFields({
      sourceFact: { Worker: "Person A", Date: "05/06/2025", Hours: "8" },
      activityDate: "2025-06-05",
      periodStart: null,
      periodEnd: null,
      hours: 8,
      text: "",
      contextLabel: null,
      derived: { workDate: { value: "2025-06-05", method: "date_day_first", confidence: 0.6 } },
    });
    expect(derivedDate).not.toContain("workDate");
    expect(derivedDate).not.toContain("workText");

    const unknownDuration = committedFactFields({
      sourceFact: { Worker: "Person A", Date: "2025-11-17", Hours: "800" },
      activityDate: "2025-11-17",
      periodStart: null,
      periodEnd: null,
      hours: null,
      text: "werk",
      contextLabel: null,
      derived: {},
    });
    expect(unknownDuration).not.toContain("hours");

    expect(
      committedFactFields({
        sourceFact: { Zzz: "x" },
        activityDate: "2025-11-17",
        periodStart: null,
        periodEnd: null,
        hours: 8,
        text: "werk",
        contextLabel: null,
        derived: {},
      }),
    ).toEqual([]);
    expect(
      committedFactFields({
        sourceFact: null,
        activityDate: "2025-11-17",
        periodStart: null,
        periodEnd: null,
        hours: 8,
        text: "werk",
        contextLabel: null,
        derived: {},
      }),
    ).toEqual([]);
  });
});
