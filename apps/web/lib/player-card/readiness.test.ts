import { describe, expect, it } from "vitest";
import {
  deriveWorkerReadiness,
  missingReadinessPillars,
} from "./readiness";
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

describe("deriveWorkerReadiness — honest signals, never a fabricated score", () => {
  it("empty card → 0 met, level start", () => {
    const r = deriveWorkerReadiness(EMPTY);
    expect(r.met).toBe(0);
    expect(r.total).toBe(6);
    expect(r.fraction).toBe(0);
    expect(r.level).toBe("start");
    expect(missingReadinessPillars(r)).toHaveLength(6);
  });

  it("a few real signals → building", () => {
    const r = deriveWorkerReadiness({
      ...EMPTY,
      professionSlug: "plumber",
      availabilityStatus: "available",
      skillsDeclared: 3,
    });
    expect(r.met).toBe(3);
    expect(r.level).toBe("building");
  });

  it("all real signals → ready", () => {
    const r = deriveWorkerReadiness({
      ...EMPTY,
      professionSlug: "plumber",
      availabilityStatus: "available",
      skillsDeclared: 3,
      evidenceEntries: 2,
      journalSupportedSkills: 1,
      workCardConfirmed: true,
    });
    expect(r.met).toBe(6);
    expect(r.fraction).toBe(1);
    expect(r.level).toBe("ready");
    expect(missingReadinessPillars(r)).toHaveLength(0);
  });

  it("verified skill alone satisfies the evidence pillar", () => {
    const r = deriveWorkerReadiness({
      ...EMPTY,
      verifiedSkills: [{ slug: "tiling", iconSlug: "tiling" }],
    });
    expect(r.pillars.find((p) => p.key === "evidence")?.met).toBe(true);
  });

  it("met never exceeds total and fraction stays in [0,1]", () => {
    const r = deriveWorkerReadiness({ ...EMPTY, skillsDeclared: 999, evidenceEntries: 999 });
    expect(r.met).toBeLessThanOrEqual(r.total);
    expect(r.fraction).toBeGreaterThanOrEqual(0);
    expect(r.fraction).toBeLessThanOrEqual(1);
  });
});
