import { describe, expect, it } from "vitest";

import {
  activeOrganizationOf,
  isApplicableOn,
  orderContextsForChoice,
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

/**
 * RULE W — THE ACTIVE WORKSPACE (owner P0 2026-10-29): "automatic context
 * determination when enough data exists". Generic replay of the case that
 * produced the rule: an owner with a personal context, an owned company and
 * an UNNAMED self-owned agency, acting for a fourth organization where they
 * hold only a membership — every resolution was rule C, and an unexplained
 * choice is how work landed in the unnamed agency.
 */
describe("rule W — the active workspace is a preselect signal", () => {
  const OWNED_COMPANY = ctx({ id: "ownCo", organizationId: "orgCo", relationshipSlug: "owner" });
  const UNNAMED_AGENCY = ctx({ id: "ownAg", organizationId: "orgAg", relationshipSlug: "owner" });

  it("one person, one organization: the single org context is preselected (B), with or without the signal", () => {
    expect(resolveEngagementContext({ candidates: [PERSONAL, EMPLOYER_A] })).toEqual({
      rule: "B",
      selectedId: "empA",
    });
    expect(
      resolveEngagementContext({ candidates: [PERSONAL, EMPLOYER_A], activeOrganizationId: "orgA" }),
    ).toEqual({ rule: "W", selectedId: "empA" });
  });

  it("several organizations: acting for one of them preselects ITS context instead of asking", () => {
    const r = resolveEngagementContext({
      candidates: [PERSONAL, OWNED_COMPANY, UNNAMED_AGENCY],
      activeOrganizationId: "orgCo",
    });
    expect(r).toEqual({ rule: "W", selectedId: "ownCo" });
    expect(requiresExplicitChoice(r)).toBe(false);
  });

  it("CONTROL: the same contexts without the signal still ask — behaviour unchanged", () => {
    const r = resolveEngagementContext({ candidates: [PERSONAL, OWNED_COMPANY, UNNAMED_AGENCY] });
    expect(r.rule).toBe("C");
    expect(r.activeWorkspaceWithoutContext).toBeUndefined();
    const personalSpace = resolveEngagementContext({
      candidates: [PERSONAL, OWNED_COMPANY, UNNAMED_AGENCY],
      activeOrganizationId: null,
    });
    expect(personalSpace).toEqual(r);
  });

  it("several roles at once at the ACTIVE organization (employee AND owner) is still ambiguity → C", () => {
    const empHere = ctx({ id: "empHere", organizationId: "orgCo" });
    const r = resolveEngagementContext({
      candidates: [PERSONAL, OWNED_COMPANY, empHere],
      activeOrganizationId: "orgCo",
    });
    expect(r.rule).toBe("C");
    expect(r.activeWorkspaceWithoutContext).toBeUndefined();
  });

  it("several roles across organizations: W picks the active one and nothing else", () => {
    const r = resolveEngagementContext({
      candidates: [PERSONAL, EMPLOYER_A, OWNED_COMPANY, UNNAMED_AGENCY],
      activeOrganizationId: "orgA",
    });
    expect(r).toEqual({ rule: "W", selectedId: "empA" });
  });

  it("A still wins: a source-determined context outranks the active workspace", () => {
    const r = resolveEngagementContext({
      candidates: [PERSONAL, OWNED_COMPANY, UNNAMED_AGENCY],
      sourceContextId: "ownAg",
      activeOrganizationId: "orgCo",
    });
    expect(r).toEqual({ rule: "A", selectedId: "ownAg" });
  });

  it("bounds by work day: an active-org context that ENDED before the day is not W", () => {
    const endedHere = ctx({ id: "endedHere", organizationId: "orgCo", endedAt: "2026-06-30" });
    const r = resolveEngagementContext({
      candidates: [PERSONAL, endedHere, UNNAMED_AGENCY, EMPLOYER_A],
      activeOrganizationId: "orgCo",
      workDay: "2026-08-10",
    });
    expect(r.rule).toBe("C");
    expect(r.activeWorkspaceWithoutContext).toBe(true);
    // …and on a day inside its bounds it IS the answer.
    const inside = resolveEngagementContext({
      candidates: [PERSONAL, endedHere, UNNAMED_AGENCY, EMPLOYER_A],
      activeOrganizationId: "orgCo",
      workDay: "2026-05-02",
    });
    expect(inside).toEqual({ rule: "W", selectedId: "endedHere" });
  });

  it("a context that starts AFTER the work day is not W either", () => {
    const future = ctx({ id: "future", organizationId: "orgCo", startedAt: "2026-09-01" });
    const r = resolveEngagementContext({
      candidates: [PERSONAL, future],
      activeOrganizationId: "orgCo",
      workDay: "2026-08-10",
    });
    expect(r).toEqual({ rule: "D", selectedId: "personal", activeWorkspaceWithoutContext: true });
  });

  it("W never returns a context outside the active organization", () => {
    const cands = [PERSONAL, EMPLOYER_A, EMPLOYER_B, OWNED_COMPANY, UNNAMED_AGENCY];
    for (const org of ["orgA", "orgB", "orgCo", "orgAg", "orgNone"]) {
      const r = resolveEngagementContext({ candidates: cands, activeOrganizationId: org });
      if (r.rule === "W") {
        expect(cands.find((c) => c.id === r.selectedId)?.organizationId).toBe(org);
      }
    }
  });
});

describe("membership WITHOUT a work relationship at the active organization", () => {
  const OWNED_COMPANY = ctx({ id: "ownCo", organizationId: "orgCo", relationshipSlug: "owner" });
  const UNNAMED_AGENCY = ctx({ id: "ownAg", organizationId: "orgAg", relationshipSlug: "owner" });

  it("is SAID (activeWorkspaceWithoutContext) and the choice proceeds — nothing invented", () => {
    const r = resolveEngagementContext({
      candidates: [PERSONAL, OWNED_COMPANY, UNNAMED_AGENCY],
      activeOrganizationId: "orgActing",
    });
    expect(r.rule).toBe("C");
    expect(r.activeWorkspaceWithoutContext).toBe(true);
    if (r.rule !== "C") throw new Error("expected C");
    // The acting organization is never fabricated into the candidates.
    expect(r.candidateIds).toEqual(["ownCo", "ownAg", "personal"]);
  });

  it("with one other organization context, B still preselects it — and the fact is still carried", () => {
    const r = resolveEngagementContext({
      candidates: [PERSONAL, OWNED_COMPANY],
      activeOrganizationId: "orgActing",
    });
    expect(r).toEqual({ rule: "B", selectedId: "ownCo", activeWorkspaceWithoutContext: true });
  });

  it("personal stays valid (rule D) when no organization context applies", () => {
    const r = resolveEngagementContext({ candidates: [PERSONAL], activeOrganizationId: "orgActing" });
    expect(r).toEqual({ rule: "D", selectedId: "personal", activeWorkspaceWithoutContext: true });
  });

  it("no fact without an organization workspace", () => {
    for (const active of [null, undefined]) {
      const r = resolveEngagementContext({ candidates: [PERSONAL], activeOrganizationId: active });
      expect(r).toEqual({ rule: "D", selectedId: "personal" });
    }
  });
});

describe("the ONE choice order — active organization first, personal last", () => {
  const rows = [
    { id: "p", org: null },
    { id: "a", org: "orgA" },
    { id: "b", org: "orgB" },
    { id: "p2", org: null },
    { id: "c", org: "orgC" },
  ];

  it("active first, other organizations in their own order, personal last", () => {
    expect(orderContextsForChoice(rows, "orgB", (r) => r.org).map((r) => r.id)).toEqual([
      "b",
      "a",
      "c",
      "p",
      "p2",
    ]);
  });

  it("without an active organization: organizations first, personal last, order otherwise kept", () => {
    expect(orderContextsForChoice(rows, null, (r) => r.org).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
      "p",
      "p2",
    ]);
  });

  it("never drops or duplicates a row, and does not mutate its input", () => {
    const copy = [...rows];
    const out = orderContextsForChoice(rows, "orgC", (r) => r.org);
    expect(out).toHaveLength(rows.length);
    expect(new Set(out.map((r) => r.id)).size).toBe(rows.length);
    expect(rows).toEqual(copy);
  });

  it("rule C hands its candidates over in that order", () => {
    const r = resolveEngagementContext({
      candidates: [PERSONAL, EMPLOYER_A, EMPLOYER_B],
      activeOrganizationId: "orgOther",
    });
    if (r.rule !== "C") throw new Error("expected C");
    expect(r.candidateIds).toEqual(["empA", "empB", "personal"]);
  });
});

describe("activeOrganizationOf — the personal sentinel is never an organization id", () => {
  const ws = [
    { id: "personal", kind: "personal" },
    { id: "orgA", kind: "organization" },
  ];
  it("organization workspace → its id", () => {
    expect(activeOrganizationOf({ activeWorkspaceId: "orgA", workspaces: ws })).toBe("orgA");
  });
  it("personal workspace → null", () => {
    expect(activeOrganizationOf({ activeWorkspaceId: "personal", workspaces: ws })).toBeNull();
  });
  it("an id not among the memberships → null (never trusted)", () => {
    expect(activeOrganizationOf({ activeWorkspaceId: "orgX", workspaces: ws })).toBeNull();
  });
});
