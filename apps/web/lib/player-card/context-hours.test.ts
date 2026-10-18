import { describe, expect, it } from "vitest";

import type { ContextWorkTime } from "@/lib/journal/work-intelligence";

import { contextHoursById } from "./context-hours";

/**
 * Hours per engagement on the identity card are a JOIN on the journal's own
 * per-context figures — never a second ledger. The rules: only rows with
 * entries carry a figure, a missing ledger carries none (UNKNOWN ≠ ZERO),
 * and nothing is summed across engagements.
 */
const ctx = (id: string | null, hours: number, confirmedHours: number, entries: number): ContextWorkTime => ({
  engagementContextId: id,
  hours,
  confirmedHours,
  entries,
});

describe("contextHoursById", () => {
  it("joins the ledger's figures on engagement_contexts.id, verbatim", () => {
    const m = contextHoursById(
      [{ id: "e1" }, { id: "e2" }],
      [ctx("e1", 12.5, 8, 4), ctx("e2", 3, 0, 1), ctx("e-other", 99, 99, 9)],
    );
    expect([...m.entries()]).toEqual([
      ["e1", { hours: 12.5, confirmedHours: 8, entries: 4 }],
      ["e2", { hours: 3, confirmedHours: 0, entries: 1 }],
    ]);
  });

  it("an engagement with no journal entries has NO figure — not a zero", () => {
    const m = contextHoursById([{ id: "e1" }], [ctx("e1", 0, 0, 0)]);
    expect(m.size).toBe(0);
  });

  it("a ledger that was not loaded yields nothing (UNKNOWN ≠ ZERO)", () => {
    expect(contextHoursById([{ id: "e1" }], null).size).toBe(0);
    expect(contextHoursById([{ id: "e1" }], undefined).size).toBe(0);
    expect(contextHoursById([{ id: "e1" }], []).size).toBe(0);
  });

  it("the personal (null-context) bucket never attaches to an engagement", () => {
    const m = contextHoursById([{ id: "e1" }], [ctx(null, 40, 40, 10)]);
    expect(m.size).toBe(0);
  });
});
