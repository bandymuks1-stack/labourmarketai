import { describe, expect, it } from "vitest";
import {
  deriveSkillEvidenceState,
  aggregateSkillEvidenceStates,
  hasUnreviewedSkills,
} from "./skill-evidence-state";

describe("deriveSkillEvidenceState — honest, never over-stated", () => {
  it("unclassified wins when the system could not map it (needs review)", () => {
    expect(
      deriveSkillEvidenceState({ classified: false, verified: true }),
    ).toBe("unclassified");
  });

  it("verified is the strongest classified state", () => {
    expect(deriveSkillEvidenceState({ verified: true })).toBe("verified");
  });

  it("manager_confirmed from source", () => {
    expect(deriveSkillEvidenceState({ source: "manager_confirmed" })).toBe(
      "manager_confirmed",
    );
  });

  it("work_supported from journal link or work_journal source", () => {
    expect(deriveSkillEvidenceState({ journalSupported: true })).toBe(
      "work_supported",
    );
    expect(deriveSkillEvidenceState({ source: "work_journal" })).toBe(
      "work_supported",
    );
  });

  it("plain self-declared is the honest default", () => {
    expect(deriveSkillEvidenceState({ source: "self_declared" })).toBe(
      "self_declared",
    );
    expect(deriveSkillEvidenceState({})).toBe("self_declared");
  });
});

describe("aggregateSkillEvidenceStates + hasUnreviewedSkills", () => {
  it("counts each state and flags unreviewed work", () => {
    const b = aggregateSkillEvidenceStates([
      { verified: true },
      { source: "work_journal" },
      { source: "self_declared" },
      { classified: false },
    ]);
    expect(b).toEqual({
      verified: 1,
      manager_confirmed: 0,
      work_supported: 1,
      self_declared: 1,
      unclassified: 1,
    });
    expect(hasUnreviewedSkills(b)).toBe(true);
  });

  it("no unreviewed when everything is supported/verified", () => {
    const b = aggregateSkillEvidenceStates([
      { verified: true },
      { source: "manager_confirmed" },
    ]);
    expect(hasUnreviewedSkills(b)).toBe(false);
  });
});
