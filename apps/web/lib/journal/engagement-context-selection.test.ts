import { describe, expect, it } from "vitest";

import {
  isApplicableOn,
  requiresExplicitChoice,
  resolveEngagementContext,
  type EngagementCandidate,
} from "./engagement-context-selection";

function ctx(p: Partial<EngagementCandidate> & { id: string }): EngagementCandidate {
  return {
    relationshipSlug: "employee",
    organizationId: null,
    status: "active",
    startedAt: null,
    endedAt: null,
    isPrimary: false,
    ...p,
  };
}

const PERSONAL = ctx({ id: "personal", isPrimary: true });
const EMPLOYER_A = ctx({ id: "empA", organizationId: "orgA" });
const EMPLOYER_B = ctx({ id: "empB", organizationId: "orgB" });
const OWNED = ctx({ id: "own", organizationId: "orgOwn", relationshipSlug: "owner" });

describe("rule A — the work already names its context", () => {
  it("uses the source context and infers nothing", () => {
    const r = resolveEngagementContext({
      candidates: [PERSONAL, EMPLOYER_A, EMPLOYER_B],
      sourceContextId: "empB",
    });
    expect(r).toEqual({ rule: "A", selectedId: "empB" });
  });

  it("A wins even when B alone would have been unambiguous", () => {
    const r = resolveEngagementContext({
      candidates: [PERSONAL, EMPLOYER_A],
      sourceContextId: "personal",
    });
    expect(r.rule).toBe("A");
    expect(r.selectedId).toBe("personal");
  });

  it("a source context that does not apply never becomes a guess", () => {
    // Ended before the work day: it cannot be the answer, and the fallback
    // must ASK rather than quietly substitute another employer.
    const stale = ctx({ id: "old", organizationId: "orgOld", endedAt: "2026-01-01" });
    const r = resolveEngagementContext({
      candidates: [PERSONAL, stale, EMPLOYER_A, EMPLOYER_B],
      sourceContextId: "old",
      workDay: "2026-08-10",
    });
    expect(r.rule).toBe("C");
    expect(r.selectedId).toBeNull();
  });
});

describe("rule B — exactly one organization context applies", () => {
  it("prefers the employer over the personal context", () => {
    const r = resolveEngagementContext({ candidates: [PERSONAL, EMPLOYER_A] });
    expect(r).toEqual({ rule: "B", selectedId: "empA" });
  });

  it("an OWNED company counts — work for your own company is still work", () => {
    // Excluding `owner` would route it to the personal context, which is the
    // exact bug being fixed.
    const r = resolveEngagementContext({ candidates: [PERSONAL, OWNED] });
    expect(r).toEqual({ rule: "B", selectedId: "own" });
  });

  it("B only counts contexts applicable ON THE WORK DAY", () => {
    const ended = ctx({ id: "ended", organizationId: "orgOld", endedAt: "2026-06-30" });
    const r = resolveEngagementContext({
      candidates: [PERSONAL, ended, EMPLOYER_A],
      workDay: "2026-08-10",
    });
    expect(r).toEqual({ rule: "B", selectedId: "empA" });
  });

  it("an inactive organization context is not an employer for this purpose", () => {
    const revoked = ctx({ id: "rev", organizationId: "orgX", status: "ended" });
    const r = resolveEngagementContext({ candidates: [PERSONAL, revoked] });
    expect(r).toEqual({ rule: "D", selectedId: "personal" });
  });
});

describe("rule C — several possible, so NOTHING is preselected", () => {
  it("refuses to guess between two employers", () => {
    const r = resolveEngagementContext({
      candidates: [PERSONAL, EMPLOYER_A, EMPLOYER_B],
    });
    expect(r.rule).toBe("C");
    expect(r.selectedId).toBeNull();
    expect(requiresExplicitChoice(r)).toBe(true);
  });

  it("refuses to guess between an employer and an owned company", () => {
    const r = resolveEngagementContext({ candidates: [PERSONAL, EMPLOYER_A, OWNED] });
    expect(r.rule).toBe("C");
  });

  it("the personal context stays among the choices — it may be the truth", () => {
    // The 15 production entries include dog-walking and a house renovation.
    // Excluding personal from the choice would force a false employer claim.
    const r = resolveEngagementContext({
      candidates: [PERSONAL, EMPLOYER_A, EMPLOYER_B],
    });
    if (r.rule !== "C") throw new Error("expected C");
    expect(r.candidateIds).toContain("personal");
    expect(r.candidateIds).toHaveLength(3);
  });

  it("this is exactly the shape of the two real production profiles", () => {
    // dc3284ea: personal + employee@orgA + owner@orgB + owner@orgC
    const real = resolveEngagementContext({
      candidates: [
        PERSONAL,
        ctx({ id: "emp", organizationId: "a3d59458" }),
        ctx({ id: "own1", organizationId: "19f47e78", relationshipSlug: "owner" }),
        ctx({ id: "own2", organizationId: "2e3a4744", relationshipSlug: "owner" }),
      ],
    });
    expect(real.rule).toBe("C");
    // 6fd1bd46: personal + owner of TWO companies, no employer at all
    const real2 = resolveEngagementContext({
      candidates: [
        PERSONAL,
        ctx({ id: "o1", organizationId: "a3d59458", relationshipSlug: "owner" }),
        ctx({ id: "o2", organizationId: "af6cc3d6", relationshipSlug: "owner" }),
      ],
    });
    expect(real2.rule).toBe("C");
  });
});

describe("rule D — no organization context applies", () => {
  it("the personal context is a valid answer, not a fallback failure", () => {
    const r = resolveEngagementContext({ candidates: [PERSONAL] });
    expect(r).toEqual({ rule: "D", selectedId: "personal" });
    expect(requiresExplicitChoice(r)).toBe(false);
  });

  it("prefers the PRIMARY personal context when several exist", () => {
    const other = ctx({ id: "other" });
    const r = resolveEngagementContext({ candidates: [other, PERSONAL] });
    expect(r.selectedId).toBe("personal");
  });
});

describe("no context at all", () => {
  it("answers NONE rather than inventing one", () => {
    expect(resolveEngagementContext({ candidates: [] })).toEqual({
      rule: "NONE",
      selectedId: null,
    });
    const allEnded = ctx({ id: "x", status: "ended" });
    expect(resolveEngagementContext({ candidates: [allEnded] }).rule).toBe("NONE");
  });
});

describe("applicability", () => {
  it("an unbounded context applies on any day", () => {
    expect(isApplicableOn(PERSONAL, "2020-01-01")).toBe(true);
    expect(isApplicableOn(PERSONAL, null)).toBe(true);
  });

  it("respects both bounds inclusively", () => {
    const c = ctx({ id: "b", startedAt: "2026-01-01", endedAt: "2026-12-31" });
    expect(isApplicableOn(c, "2026-01-01")).toBe(true);
    expect(isApplicableOn(c, "2026-12-31")).toBe(true);
    expect(isApplicableOn(c, "2025-12-31")).toBe(false);
    expect(isApplicableOn(c, "2027-01-01")).toBe(false);
  });
});

describe("the invariant that makes B safe", () => {
  it("B never fires when more than one organization is in play", () => {
    const many = [PERSONAL, EMPLOYER_A, EMPLOYER_B, OWNED];
    for (let i = 2; i <= many.length; i++) {
      const r = resolveEngagementContext({ candidates: many.slice(0, i) });
      const orgCount = many.slice(0, i).filter((c) => c.organizationId).length;
      if (orgCount > 1) expect(r.rule).toBe("C");
    }
  });

  it("resolution NEVER returns an id outside the candidate list", () => {
    const cands = [PERSONAL, EMPLOYER_A];
    const ids = new Set(cands.map((c) => c.id));
    for (const src of [null, "empA", "personal", "nonexistent"]) {
      const r = resolveEngagementContext({ candidates: cands, sourceContextId: src });
      if (r.selectedId !== null) expect(ids.has(r.selectedId)).toBe(true);
    }
  });
});
