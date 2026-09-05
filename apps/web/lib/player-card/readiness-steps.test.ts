import { describe, expect, it } from "vitest";
import { readinessNextSteps, primaryReadinessStep } from "./readiness-steps";
import { deriveWorkerReadiness } from "./readiness";
import type { WorkerPlayerCard } from "./player-card";

const EMPTY: WorkerPlayerCard = {
  displayName: null,
  skillsDeclared: 0,
  journalSupportedSkills: 0,
  candidateSkills: 0,
  evidenceEntries: 0,
  attentionInstructions: 0,
  workCardConfirmed: false,
  verifiedSkills: [],
  managerConfirmations: 0,
  availabilityStatus: null,
  availableFrom: null,
  professionSlug: null,
  latestEvidenceAt: null,
  workHistory: [],
  locationCountry: null,
  documents: null,
  evidenceTimeline: [],
  skillEvidence: [],
  provenance: { class: "SELF_DECLARED" },
};

describe("readinessNextSteps — every unmet signal gets a real next step", () => {
  it("empty worker → 6 steps, all pointing at real in-app routes", () => {
    const steps = readinessNextSteps(deriveWorkerReadiness(EMPTY));
    expect(steps).toHaveLength(6);
    for (const s of steps) {
      expect(s.href).toMatch(/^\/dashboard\//);
      expect(s.labelKey.length).toBeGreaterThan(0);
    }
  });

  it("fully ready worker → no steps", () => {
    const ready = deriveWorkerReadiness({
      ...EMPTY,
      professionSlug: "plumber",
      availabilityStatus: "available",
      skillsDeclared: 2,
      evidenceEntries: 1,
      journalSupportedSkills: 1,
      workCardConfirmed: true,
    });
    expect(readinessNextSteps(ready)).toHaveLength(0);
    expect(primaryReadinessStep(ready)).toBeNull();
  });

  it("primary step is the first unmet pillar (foundational first)", () => {
    const r = deriveWorkerReadiness({ ...EMPTY, professionSlug: "plumber" });
    const primary = primaryReadinessStep(r);
    expect(primary?.pillar).toBe("availability");
  });
});
