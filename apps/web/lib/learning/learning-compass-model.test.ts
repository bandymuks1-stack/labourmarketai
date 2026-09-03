import { describe, expect, it } from "vitest";

import type { EvidenceTier } from "@/lib/evidence/evidence-tier";
import { skillsForProfession } from "@/lib/taxonomy/profession-skills";

import {
  buildLearningCompass,
  isStudentPath,
  type CompassInput,
  type CompassOpportunity,
} from "./learning-compass-model";

const tier = (t: string) => t as unknown as EvidenceTier;

const opp = (over: Partial<CompassOpportunity>): CompassOpportunity => ({
  requestId: "r",
  roleSlug: null,
  companyName: null,
  country: null,
  status: "possible",
  matchedSkillSlugs: [],
  missingSkillSlugs: [],
  ...over,
});

const base: CompassInput = {
  professionSlug: null,
  skills: [],
  journalEntryCount: 0,
  education: [],
  opportunities: [],
  availabilityKnown: false,
};

describe("learning compass — pure model", () => {
  it("with nothing declared, every answer is an honest 'nothing yet' and the steps say what unblocks first", () => {
    const c = buildLearningCompass(base);
    expect(c.becoming).toEqual({ professionSlug: null, currentEducation: null });
    expect(c.evidence).toEqual({
      skillsTotal: 0,
      skillsConfirmed: 0,
      skillsJournalSupported: 0,
      skillsSelfDeclared: 0,
      journalEntries: 0,
      educationEntries: 0,
    });
    expect(c.fitsNow).toEqual([]);
    expect(c.missing).toEqual({ source: null, skills: [] });
    expect(c.nextSteps).toEqual(["choose_direction", "declare_skills", "add_current_education", "log_first_entry"]);
  });

  it("missing skills come from the engine's own gaps over the shown opportunities, most-asked first, never from a model", () => {
    const c = buildLearningCompass({
      ...base,
      professionSlug: "electrician",
      skills: [{ slug: "cable-pulling", evidence: tier("self_declared") }],
      journalEntryCount: 2,
      availabilityKnown: true,
      opportunities: [
        opp({ requestId: "a", status: "strong", missingSkillSlugs: ["panel-wiring", "testing"] }),
        opp({ requestId: "b", status: "possible", missingSkillSlugs: ["panel-wiring"] }),
        opp({ requestId: "c", status: "weak", missingSkillSlugs: ["cable-pulling", "welding"] }),
      ],
    });
    expect(c.fitsNow.map((o) => o.requestId)).toEqual(["a", "b"]);
    expect(c.missing.source).toBe("opportunities");
    expect(c.missing.skills).toEqual([
      { slug: "panel-wiring", askedBy: 2 },
      { slug: "testing", askedBy: 1 },
      { slug: "welding", askedBy: 1 },
    ]);
    // no education row yet → the student path still asks for it, then the fits, then the gaps
    expect(c.nextSteps).toEqual(["add_current_education", "express_interest", "gain_evidence_for_missing"]);
  });

  it("with no opportunities yet, the profession registry (minus declared skills) is the honest fallback", () => {
    const registry = skillsForProfession("electrician");
    expect(registry.length).toBeGreaterThan(1);
    const c = buildLearningCompass({
      ...base,
      professionSlug: "electrician",
      skills: [{ slug: registry[0], evidence: tier("manager_confirmed") }],
      availabilityKnown: true,
      journalEntryCount: 1,
    });
    expect(c.missing.source).toBe("profession");
    expect(c.missing.skills.map((m) => m.slug)).not.toContain(registry[0]);
    expect(c.missing.skills.every((m) => m.askedBy === 0)).toBe(true);
    expect(c.evidence.skillsConfirmed).toBe(1);
  });

  it("current education is the 'becoming' anchor; the student path is the current row or the learner link", () => {
    const edu = { institutionName: "VTU", programOrField: "Electrical", educationTypeSlug: "vocational", isCurrent: true };
    const c = buildLearningCompass({ ...base, education: [edu] });
    expect(c.becoming.currentEducation).toEqual(edu);
    expect(c.nextSteps).not.toContain("add_current_education");
    expect(isStudentPath({ education: [edu], hasLearnerLink: false })).toBe(true);
    expect(isStudentPath({ education: [{ ...edu, isCurrent: false }], hasLearnerLink: false })).toBe(false);
    expect(isStudentPath({ education: [], hasLearnerLink: true })).toBe(true);
  });

  it("never lists a missing skill the person already holds", () => {
    const c = buildLearningCompass({
      ...base,
      professionSlug: "electrician",
      skills: [{ slug: "panel-wiring", evidence: tier("work_journal") }],
      opportunities: [opp({ missingSkillSlugs: ["panel-wiring"] })],
    });
    expect(c.missing.skills.map((m) => m.slug)).not.toContain("panel-wiring");
  });
});
