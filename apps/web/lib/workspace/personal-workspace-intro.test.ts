import { describe, expect, it } from "vitest";

import type { WorkerPlayerCard } from "@/lib/player-card/player-card";
import { deriveWorkerReadiness } from "@/lib/player-card/readiness";
import { CHIP_FOR_STEP } from "@/lib/conversation/worker-activity-chips";

import {
  actionForPillar,
  derivePersonalWorkspaceIntro,
  INTRO_ACTION_IDS,
  INTRO_ACTION_LABEL_KEYS,
} from "./personal-workspace-intro";

/**
 * "Mano erdvė" decision model (S2).
 *
 * The readiness input is always produced by the CANONICAL deriver from a real
 * card shape — never hand-written — so if the pillar set or its order ever
 * changes, these expectations move with it instead of quietly drifting into a
 * second model.
 */

function card(over: Partial<WorkerPlayerCard> = {}): WorkerPlayerCard {
  return {
    displayName: null,
    skillsDeclared: 0,
    journalSupportedSkills: 0,
    candidateSkills: 0,
    evidenceEntries: 0,
    attentionInstructions: 0,
    workCardConfirmed: false,
    verifiedSkills: [],
    locationCountry: null,
    ...over,
  } as unknown as WorkerPlayerCard;
}

const readinessOf = (over: Partial<WorkerPlayerCard> = {}) =>
  deriveWorkerReadiness(card(over));

const FULL: Partial<WorkerPlayerCard> = {
  professionSlug: "carpenter",
  availabilityStatus: "available",
  skillsDeclared: 3,
  evidenceEntries: 4,
  journalSupportedSkills: 2,
  workCardConfirmed: true,
} as Partial<WorkerPlayerCard>;

const personal = {
  identity: "person" as const,
  workspaceKind: "personal" as const,
  signedIn: true,
  hasWorkerProfile: true,
  displayName: "Jonas Petraitis",
};

describe("who sees the personal space at all", () => {
  it("a signed-out visitor sees nothing", () => {
    const r = derivePersonalWorkspaceIntro({
      ...personal,
      signedIn: false,
      readiness: readinessOf(),
    });
    expect(r).toEqual({ kind: "hidden", reason: "signed-out" });
  });

  it("an ORGANIZATION workspace never renders the personal space (§9 variant A)", () => {
    const r = derivePersonalWorkspaceIntro({
      ...personal,
      workspaceKind: "organization",
      readiness: readinessOf(FULL),
    });
    expect(r).toEqual({ kind: "hidden", reason: "organization-workspace" });
  });

  it("an organization workspace wins even for a person identity with a worker profile", () => {
    // The order matters: acting inside a company must not leak worker
    // readiness just because the person also happens to be a worker.
    const r = derivePersonalWorkspaceIntro({
      ...personal,
      identity: "person",
      hasWorkerProfile: true,
      workspaceKind: "organization",
      readiness: readinessOf(FULL),
    });
    expect(r.kind).toBe("hidden");
  });

  it.each(["company", null] as const)(
    "identity %s gets no worker-only copy",
    (identity) => {
      const r = derivePersonalWorkspaceIntro({
        ...personal,
        identity,
        readiness: readinessOf(FULL),
      });
      expect(r).toEqual({ kind: "hidden", reason: "not-person-identity" });
    },
  );

  it("an account with no worker row (company-only / agency / customer) sees nothing", () => {
    const r = derivePersonalWorkspaceIntro({
      ...personal,
      hasWorkerProfile: false,
      readiness: null,
    });
    expect(r).toEqual({ kind: "hidden", reason: "no-worker-profile" });
  });

  it("a readiness read failure degrades honestly — no readiness claim, no CTA", () => {
    const r = derivePersonalWorkspaceIntro({ ...personal, readiness: null });
    expect(r).toEqual({ kind: "unavailable", displayName: "Jonas Petraitis" });
    expect(r).not.toHaveProperty("primary");
    expect(r).not.toHaveProperty("met");
  });
});

describe("what a worker is told", () => {
  it("a brand-new worker: nothing known, the first canonical gap is the next step", () => {
    const r = derivePersonalWorkspaceIntro({ ...personal, readiness: readinessOf() });
    if (r.kind !== "intro") throw new Error("expected intro");
    expect(r.met).toEqual([]);
    // `profession` is the FIRST pillar of the canonical readiness order.
    expect(r.nextMissing).toBe("profession");
    expect(r.primary.id).toBe("link:/dashboard/profile");
    expect(r.primary.labelKey).toBe("startWithYourself");
  });

  it("a partial profile names what is already there and ONE next step", () => {
    const r = derivePersonalWorkspaceIntro({
      ...personal,
      readiness: readinessOf({ professionSlug: "welder", skillsDeclared: 2 } as Partial<WorkerPlayerCard>),
    });
    if (r.kind !== "intro") throw new Error("expected intro");
    expect(r.met).toEqual(["profession", "skills"]);
    expect(r.nextMissing).toBe("availability");
    expect(r.primary).toEqual({
      id: "f:worker.save-work-card",
      labelKey: "whenICanWork",
    });
  });

  it("the same form asks a DIFFERENT honest question per gap", () => {
    // availability and workCard are both closed by the work card; the wording
    // must name the gap the person actually has.
    expect(actionForPillar("availability")).toEqual({
      id: "f:worker.save-work-card",
      labelKey: "whenICanWork",
    });
    expect(actionForPillar("workCard")).toEqual({
      id: "f:worker.save-work-card",
      labelKey: "whereICanWork",
    });
  });

  it("a COMPLETE profile is never asked to complete itself (§8 rule 1)", () => {
    const r = derivePersonalWorkspaceIntro({ ...personal, readiness: readinessOf(FULL) });
    if (r.kind !== "intro") throw new Error("expected intro");
    expect(r.nextMissing).toBeNull();
    expect(r.met).toHaveLength(6);
    expect(r.primary).toEqual({
      id: "link:/dashboard/profile",
      labelKey: "viewWorkProfile",
    });
    const labels = [r.primary, ...r.secondary].map((a) => a.labelKey);
    expect(labels).not.toContain("completeWorkProfile");
  });

  it("secondary actions are at most two and never repeat the primary", () => {
    const cases = [
      readinessOf(),
      readinessOf({ professionSlug: "welder" } as Partial<WorkerPlayerCard>),
      readinessOf({ ...FULL, workCardConfirmed: false } as Partial<WorkerPlayerCard>),
      readinessOf(FULL),
    ];
    for (const readiness of cases) {
      const r = derivePersonalWorkspaceIntro({ ...personal, readiness });
      if (r.kind !== "intro") throw new Error("expected intro");
      expect(r.secondary.length).toBeLessThanOrEqual(2);
      expect(r.secondary.map((a) => a.id)).not.toContain(r.primary.id);
      expect(new Set(r.secondary.map((a) => a.id)).size).toBe(r.secondary.length);
    }
  });

  it("the honest neutral case: no name is a null, never an invented one", () => {
    const r = derivePersonalWorkspaceIntro({
      ...personal,
      displayName: null,
      readiness: readinessOf(),
    });
    if (r.kind !== "intro") throw new Error("expected intro");
    expect(r.displayName).toBeNull();
  });

  it("is deterministic — same input, same output", () => {
    const input = { ...personal, readiness: readinessOf({ professionSlug: "x" } as Partial<WorkerPlayerCard>) };
    expect(derivePersonalWorkspaceIntro(input)).toEqual(
      derivePersonalWorkspaceIntro(input),
    );
  });
});

describe("one action map — no divergence from the chat's own recommendation", () => {
  it("wherever CHIP_FOR_STEP has an answer, this block gives the SAME one", () => {
    for (const [pillar, chipId] of Object.entries(CHIP_FOR_STEP)) {
      expect(
        actionForPillar(pillar as keyof typeof CHIP_FOR_STEP).id,
        `${pillar} must reuse the canonical chip, not a second opinion`,
      ).toBe(chipId);
    }
  });

  it("every emitted id and label key is declared", () => {
    expect(INTRO_ACTION_IDS.length).toBeGreaterThan(0);
    expect(INTRO_ACTION_LABEL_KEYS.length).toBeGreaterThan(0);
    expect(new Set(INTRO_ACTION_IDS).size).toBe(INTRO_ACTION_IDS.length);
  });
});
