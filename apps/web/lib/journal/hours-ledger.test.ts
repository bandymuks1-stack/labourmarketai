import { describe, expect, it } from "vitest";

import {
  calendarDays,
  capacityOf,
  deriveHoursLedger,
  estimateFromMonthlyRate,
  estimatePeriodHours,
  HOURS_LEDGER_VERSION,
  lineState,
  MAX_HOURS_PER_CALENDAR_DAY,
  monthsInclusive,
  skillSplit,
  workingDays,
  type ConfidenceWeights,
  type LedgerLine,
} from "@/lib/journal/hours-ledger";

/**
 * ONE HOURS LEDGER (owner integrated-architecture order 2026-10-24).
 * Every rule of hours-ledger.ts, pinned: deterministic, versioned,
 * explainable; actual beats estimate; never an invented hour.
 */

/** Test-only weights: the production weights are private configuration,
 *  never in this repository. These exist to pin the MECHANICS (injection,
 *  ordering of facts, bands), not any real value. */
const TEST_WEIGHTS: ConfidenceWeights = {
  base: { journalActual: 0.6, organizationActual: 0.6, reported: 0.5, estimated: 0.3 },
  independentConfirmation: 0.3,
  spanChosenByPerson: -0.1,
  spanDerived: -0.1,
  contestedFactor: 0.5,
  ceiling: 1,
  bands: { high: 0.8, medium: 0.45 },
};

const line = (over: Partial<LedgerLine> & Pick<LedgerLine, "key" | "hours">): LedgerLine => ({
  source: "organization_period",
  counted: true,
  from: null,
  to: null,
  confirmedHours: 0,
  ...over,
});

describe("calendar", () => {
  it("counts Monday–Friday days inclusive, minus known non-working weekdays, each once", () => {
    // November 2025: 30 days, 20 weekdays.
    expect(calendarDays("2025-11-01", "2025-11-30")).toBe(30);
    expect(workingDays("2025-11-01", "2025-11-30")).toBe(20);
    // A weekday holiday is removed once; a weekend "holiday" and an out-of-span day change nothing.
    expect(workingDays("2025-11-01", "2025-11-30", ["2025-11-11", "2025-11-11", "2025-11-15", "2025-12-01"])).toBe(19);
    expect(workingDays("2025-11-30", "2025-11-01")).toBe(0);
  });

  it("counts the months a span touches", () => {
    expect(monthsInclusive("2024-08-01", "2025-11-30")).toBe(16);
    expect(monthsInclusive("2025-06-01", "2025-11-30")).toBe(6);
  });
});

describe("estimation H = D × h × K − A", () => {
  it("refuses to produce a figure without h or K — hours are never invented", () => {
    const e = estimatePeriodHours({ from: "2025-11-01", to: "2025-11-30", dailyHours: null, workload: null });
    expect(e).toMatchObject({ kind: "insufficient", missing: ["dailyHours", "workload"] });
    const d = estimatePeriodHours({ from: null, to: "2025-11-30", dailyHours: 8, workload: 1 });
    expect(d).toMatchObject({ kind: "insufficient", missing: ["dates"] });
    const k = estimatePeriodHours({ from: "2025-11-01", to: "2025-11-30", dailyHours: 8, workload: 3 });
    expect(k.kind).toBe("insufficient");
  });

  it("computes the point estimate and explains every factor", () => {
    const e = estimatePeriodHours({ from: "2025-11-01", to: "2025-11-30", dailyHours: 8, workload: 0.5, nonWorkingDays: ["2025-11-11"] });
    expect(e.kind).toBe("estimate");
    if (e.kind !== "estimate") return;
    expect(e.workingDays).toBe(19);
    expect(e.hours).toBe(76); // 19 × 8 × 0.5
    expect(e.version).toBe(HOURS_LEDGER_VERSION);
    expect(e.explanation.join("\n")).toMatch(/D = 19 working days/);
  });

  it("actual beats estimate: recorded actual hours in the span are deducted, never below zero", () => {
    const e = estimatePeriodHours({ from: "2025-11-01", to: "2025-11-30", dailyHours: 8, workload: 0.5, actualHoursInSpan: 30 });
    expect(e).toMatchObject({ kind: "estimate", gross: 80, hours: 50, actualDeducted: 30 });
    const all = estimatePeriodHours({ from: "2025-11-01", to: "2025-11-30", dailyHours: 8, workload: 0.5, actualHoursInSpan: 500 });
    expect(all).toMatchObject({ kind: "estimate", hours: 0, actualDeducted: 80 });
  });

  it("a bound known only to the month becomes a range, the point stays on the stated bounds", () => {
    const e = estimatePeriodHours({
      from: "2024-08-01",
      to: "2025-11-30",
      precision: { from: "month", to: "month" },
      dailyHours: 8,
      workload: 1,
    });
    if (e.kind !== "estimate") throw new Error("expected an estimate");
    expect(e.low).toBeLessThan(e.hours);
    expect(e.high).toBe(e.hours); // stated bounds are already the outer month edges
    expect(e.workingDaysLow).toBe(workingDays("2024-08-31", "2025-11-01"));
  });

  it("a source's own monthly rate: at least 16 months × 50 h = 800 h", () => {
    expect(estimateFromMonthlyRate({ months: 16, hoursPerMonth: 50 })).toMatchObject({
      kind: "estimate",
      method: "months_x_monthly_rate",
      hours: 800,
    });
    expect(estimateFromMonthlyRate({ months: null, hoursPerMonth: 50 })).toMatchObject({ kind: "insufficient" });
  });
});

describe("states and confidence", () => {
  it("a journal line is actual; its manager-confirmed part is confirmed", () => {
    const s = lineState(line({ key: "j", source: "journal", hours: 10, confirmedHours: 4 }));
    expect(s.basis).toBe("actual");
    expect(s.byState).toEqual({ actual: 6, reported: 0, estimated: 0, confirmed: 4 });
  });

  it("a period figure with no stated basis is REPORTED — neither actual nor estimated", () => {
    const s = lineState(line({ key: "p", hours: 800 }));
    expect(s.byState).toEqual({ actual: 0, reported: 800, estimated: 0, confirmed: 0 });
  });

  it("a self-attested estimate stays an estimate — a person never confirms their own hours", () => {
    const s = lineState(
      line({
        key: "p",
        hours: 800,
        selfAttestedHours: 800,
        hoursBasis: { value: "estimated", method: "months_x_monthly_rate", note: null },
        spanProvenance: "human_choice",
      }),
    );
    expect(s.confirmation).toBe("self_attested");
    expect(s.byState).toEqual({ actual: 0, reported: 0, estimated: 800, confirmed: 0 });
    expect(s.facts).toEqual(["organization_record", "basis_estimated", "self_attested", "span_chosen_by_person"]);
    expect(lineState(line({ key: "p", hours: 800, hoursBasis: { value: "estimated", method: "m", note: null } }), TEST_WEIGHTS).confidenceBand).toBe("low");
  });

  it("without injected weights there is no band — unrated, never a default", () => {
    expect(lineState(line({ key: "d", source: "organization_day", hours: 40, attestedHours: 40 })).confidenceBand).toBeNull();
  });

  it("an independent attestation makes the hours confirmed and lifts the band", () => {
    const plain = lineState(line({ key: "d", source: "organization_day", hours: 40 }), TEST_WEIGHTS);
    const s = lineState(line({ key: "d", source: "organization_day", hours: 40, attestedHours: 40 }), TEST_WEIGHTS);
    expect(s.byState.confirmed).toBe(40);
    expect(plain.confidenceBand).toBe("medium");
    expect(s.confidenceBand).toBe("high");
    expect(s.facts).toContain("independently_confirmed");
  });

  it("a contested line drops a band", () => {
    const s = lineState(line({ key: "d", source: "organization_day", hours: 8, contested: true }), TEST_WEIGHTS);
    expect(s.confidenceBand).toBe("low");
    expect(s.facts).toContain("contested");
  });

  it("the public module carries no confidence weights", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./hours-ledger.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/CONFIDENCE_TABLE|base:\s*\{\s*journalActual:\s*0\.\d/);
  });
});

describe("overlap capacity — overlapping periods never double count", () => {
  it("lines that do not overlap are untouched", () => {
    const c = capacityOf([
      line({ key: "a", hours: 800, from: "2024-08-01", to: "2025-11-30" }),
      line({ key: "b", hours: 100, from: "2026-01-01", to: "2026-01-31" }),
    ]);
    expect(c).toEqual({ excessHours: 0, reductions: [], implausible: [] });
  });

  it("two estimates over the same 10 days beyond the calendar: the excess is removed from the estimates", () => {
    const c = capacityOf([
      line({ key: "a", hours: 150, from: "2025-01-01", to: "2025-01-10", hoursBasis: { value: "estimated", method: "m", note: null } }),
      line({ key: "b", hours: 150, from: "2025-01-01", to: "2025-01-10" }),
    ]);
    expect(c.excessHours).toBe(300 - 10 * MAX_HOURS_PER_CALENDAR_DAY);
    expect(c.reductions).toEqual([
      { key: "a", hours: 70 },
      { key: "b", hours: 70 },
    ]);
  });

  it("actual beats estimate: only the estimate is reduced", () => {
    const c = capacityOf([
      line({ key: "act", source: "organization_day", hours: 120, from: "2025-01-01", to: "2025-01-10" }),
      line({ key: "est", hours: 100, from: "2025-01-01", to: "2025-01-10", hoursBasis: { value: "estimated", method: "m", note: null } }),
    ]);
    expect(c.reductions).toEqual([{ key: "est", hours: 60 }]);
    expect(c.implausible).toEqual([]);
  });

  it("day-made lines are checked on their ACTUAL days — no hours invented on days without work", () => {
    // 16 h on Jan 1 and 16 h on Jan 31 (journal), 16 h period figure on Jan 15: no day exceeds 16 h.
    const l = deriveHoursLedger({
      lines: [
        line({
          key: "j",
          source: "journal",
          hours: 32,
          from: "2025-01-01",
          to: "2025-01-31",
          days: [
            { day: "2025-01-01", hours: 16 },
            { day: "2025-01-31", hours: 16 },
          ],
        }),
        line({ key: "p", hours: 16, from: "2025-01-15", to: "2025-01-15" }),
      ],
    });
    expect(l.capacity.excessHours).toBe(0);
    expect(l.total).toBe(48);
  });

  it("actual records that alone exceed the calendar are flagged, never edited", () => {
    const c = capacityOf([
      line({ key: "a1", source: "organization_day", hours: 150, from: "2025-01-01", to: "2025-01-05" }),
      line({ key: "a2", source: "journal", hours: 20, from: "2025-01-01", to: "2025-01-05" }),
    ]);
    expect(c.excessHours).toBe(0);
    expect(c.implausible).toEqual([{ from: "2025-01-01", to: "2025-01-05", hours: 170, capacity: 80 }]);
  });
});

describe("skill split H_skill = Σ H_i × P_ij", () => {
  const lines = [
    line({ key: "a", source: "journal", hours: 10, from: "2026-01-01", to: "2026-01-01" }),
    line({ key: "b", source: "journal", hours: 6, from: "2026-01-02", to: "2026-01-02" }),
    line({ key: "c", source: "journal", hours: 4, from: "2026-01-03", to: "2026-01-03" }),
  ];
  it("one hour supports several skills: skill hours are supporting, never added to the total", () => {
    const s = skillSplit(lines, [
      { lineKey: "a", skillKey: "welding", share: 1, state: "confirmed" },
      { lineKey: "a", skillKey: "blueprint-reading", share: 0.5, state: "potential" },
      { lineKey: "b", skillKey: "welding", share: 1, state: "recorded" },
    ]);
    expect(s.skills).toEqual([
      { skillKey: "welding", hours: 16, byState: { confirmed: 10, recorded: 6 }, lines: 2 },
      { skillKey: "blueprint-reading", hours: 5, byState: { potential: 5 }, lines: 1 },
    ]);
    expect(s.unattributedHours).toBe(4);
    expect(s.supportingNotAdditive).toBe(true);
  });

  it("the same (line, skill) pair is counted once — the largest share, the strongest state", () => {
    const s = skillSplit(lines, [
      { lineKey: "a", skillKey: "welding", share: 0.4, state: "recorded" },
      { lineKey: "a", skillKey: "welding", share: 0.4, state: "confirmed" },
      { lineKey: "a", skillKey: "welding", share: 2, state: "declared" },
    ]);
    expect(s.skills[0]).toEqual({ skillKey: "welding", hours: 10, byState: { declared: 10 }, lines: 1 });
  });
});

describe("the ledger", () => {
  it("an AI agent's autonomous work is project history, never the person's hours", () => {
    const l = deriveHoursLedger({
      lines: [
        line({ key: "own", source: "journal", hours: 8, from: "2026-05-01", to: "2026-05-01" }),
        line({ key: "agent", source: "journal", hours: 40, actor: "ai_agent", from: "2026-05-01", to: "2026-05-05" }),
      ],
    });
    expect(l.total).toBe(8);
    expect(l.projectHistoryOnly).toEqual([{ key: "agent", hours: 40 }]);
  });

  it("not-counted lines stay out; the total is counted minus the capacity excess; byState sums to it", () => {
    const l = deriveHoursLedger({
      lines: [
        line({ key: "x", hours: 150, from: "2025-01-01", to: "2025-01-10" }),
        line({ key: "y", hours: 150, from: "2025-01-01", to: "2025-01-10" }),
        line({ key: "z", source: "journal", hours: 5, counted: false, from: "2025-01-02", to: "2025-01-02" }),
      ],
    });
    expect(l.countedBeforeCapacity).toBe(300);
    expect(l.total).toBe(160);
    const sum = l.byState.actual + l.byState.reported + l.byState.estimated + l.byState.confirmed;
    expect(Math.round(sum * 100) / 100).toBe(l.total);
  });

  it("is deterministic: the same lines give the same ledger", () => {
    const input = {
      lines: [
        line({ key: "b", hours: 100, from: "2025-01-01", to: "2025-01-05" }),
        line({ key: "a", source: "organization_day" as const, hours: 50, from: "2025-01-03", to: "2025-01-04" }),
      ],
    };
    expect(deriveHoursLedger(input)).toEqual(deriveHoursLedger({ lines: [...input.lines].reverse() }));
  });
});
