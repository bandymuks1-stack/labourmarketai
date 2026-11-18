import { describe, expect, it } from "vitest";

import { deriveNeedFit, deriveOutlookGaps } from "@/lib/company/company-home-field-model";

const wk = (from: string, free: number, unclear = 0) => ({ from, free, unclear });

describe("deriveNeedFit — DERIVED from the capacity outlook, UNKNOWN is not zero", () => {
  it("no outlook or no team size is unknown, never fits and never short", () => {
    expect(deriveNeedFit(3, null).kind).toBe("unknown");
    expect(deriveNeedFit(null, [wk("2026-10-01", 5)]).kind).toBe("unknown");
    expect(deriveNeedFit(0, [wk("2026-10-01", 5)]).kind).toBe("unknown");
  });

  it("before -> a team change -> after moves the verdict", () => {
    const need = 3;
    const before = [wk("a", 4), wk("b", 4), wk("c", 4), wk("d", 4)];
    expect(deriveNeedFit(need, before)).toEqual({ kind: "fits" });
    // two people put on dated work in weeks b..d
    const after = [wk("a", 4), wk("b", 2), wk("c", 2), wk("d", 2)];
    expect(deriveNeedFit(need, after)).toEqual({ kind: "some" });
    // and with one more person away everywhere, it is short
    expect(deriveNeedFit(need, [wk("a", 1), wk("b", 1), wk("c", 1), wk("d", 1)])).toEqual({
      kind: "short",
      short: 2,
    });
  });

  it("free only in later weeks says from when", () => {
    expect(deriveNeedFit(3, [wk("a", 1), wk("b", 3), wk("c", 3), wk("d", 3)])).toEqual({
      kind: "from",
      date: "b",
    });
  });

  it("never enough says how many short", () => {
    expect(deriveNeedFit(5, [wk("a", 1), wk("b", 2), wk("c", 2), wk("d", 1)])).toEqual({
      kind: "short",
      short: 3,
    });
  });
});

describe("deriveOutlookGaps", () => {
  it("null without an outlook", () => {
    expect(deriveOutlookGaps(null)).toBeNull();
  });
  it("names the first empty week, the peak and the undated unknown", () => {
    expect(deriveOutlookGaps([wk("a", 2, 1), wk("b", 0, 1), wk("c", 3, 1)])).toEqual({
      firstEmptyWeek: "b",
      peakFree: 3,
      peakFreeFrom: "c",
      unclear: 1,
    });
  });
  it("nobody free anywhere has no peak week", () => {
    expect(deriveOutlookGaps([wk("a", 0), wk("b", 0)])?.peakFreeFrom).toBeNull();
  });
});
