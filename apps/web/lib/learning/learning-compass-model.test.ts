import { describe, expect, it } from "vitest";

import type { EvidenceTier } from "@/lib/evidence/evidence-tier";
import { skillsForProfession } from "@/lib/taxonomy/profession-skills";

import {
  buildLearningCompass,
  deriveStudyingAt,
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
    expect(c.becoming).toEqual({ professionSlug: null, currentEducation: null, cohorts: [], studyingAt: null });
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

  it("'studying at' is named from the active student link FIRST (W6 honesty); without a link the old sources stand unchanged", () => {
    // Measured on production 2026-09-06: a learner linked to "E2E Walker UAB"
    // (active student engagement) saw no institution on the compass — the
    // line was derived only from a `worker_education.is_current` row.
    const edu = { institutionName: "VTU", programOrField: "Electrical", educationTypeSlug: "vocational", isCurrent: true };
    const cohort = {
      cohortId: "c1",
      cohortName: "2026 autumn",
      programName: "Electrical installation",
      institutionName: "VTU",
      targetProfessionSlug: null,
      educationTypeSlug: null,
      startsOn: null,
      endsOn: null,
      demandCount: null,
    };
    // engagement present → the institution is named, even with no education row
    expect(buildLearningCompass({ ...base, studentInstitutionName: "E2E Walker UAB" }).becoming.studyingAt).toBe("E2E Walker UAB");
    // the link is the canonical fact: it outranks a self-declared row
    expect(buildLearningCompass({ ...base, education: [edu], studentInstitutionName: "E2E Walker UAB" }).becoming.studyingAt).toBe("E2E Walker UAB");
    // no link → unchanged: the current row, then a cohort's institution, then nothing
    expect(buildLearningCompass({ ...base, education: [edu] }).becoming.studyingAt).toBe("VTU");
    expect(buildLearningCompass({ ...base, cohorts: [cohort] }).becoming.studyingAt).toBe("VTU");
    expect(buildLearningCompass(base).becoming.studyingAt).toBeNull();
    // a blank name is not a name — never a placeholder
    expect(buildLearningCompass({ ...base, studentInstitutionName: "   " }).becoming.studyingAt).toBeNull();
    expect(deriveStudyingAt({ studentInstitutionName: null, currentEducation: null, cohorts: [] })).toBeNull();
    // the link names the institution but invents no education row
    expect(buildLearningCompass({ ...base, studentInstitutionName: "E2E Walker UAB" }).becoming.currentEducation).toBeNull();
  });

  it("cohort membership is carried into 'becoming' untouched; without it the list is empty (callers may omit it)", () => {
    const cohort = {
      cohortId: "c1",
      cohortName: "2026 autumn",
      programName: "Electrical installation",
      institutionName: "VTU",
      targetProfessionSlug: "electrician",
      educationTypeSlug: "vocational",
      startsOn: "2026-09-01",
      endsOn: null,
      demandCount: 17,
    };
    expect(buildLearningCompass(base).becoming.cohorts).toEqual([]);
    const c = buildLearningCompass({ ...base, cohorts: [cohort] });
    expect(c.becoming.cohorts).toEqual([cohort]);
    // membership does not invent a direction or an education row
    expect(c.becoming.professionSlug).toBeNull();
    expect(c.nextSteps).toContain("choose_direction");
  });

  it("with no own direction, the programme's target direction drives 'missing' and is named as the programme's", () => {
    const registry = skillsForProfession("electrician");
    expect(registry.length).toBeGreaterThan(1);
    const cohort = {
      cohortId: "c1",
      cohortName: "A",
      programName: "P",
      institutionName: null,
      targetProfessionSlug: "electrician",
      educationTypeSlug: null,
      startsOn: null,
      endsOn: null,
      demandCount: null,
    };
    const c = buildLearningCompass({
      ...base,
      cohorts: [cohort],
      skills: [{ slug: registry[0], evidence: tier("self_declared") }],
    });
    expect(c.missing.source).toBe("program");
    expect(c.missing.skills.map((m) => m.slug)).not.toContain(registry[0]);
    expect(c.missing.skills.every((m) => m.askedBy === 0)).toBe(true);

    // an own direction wins over the programme's — the person's choice is the anchor
    const own = buildLearningCompass({ ...base, cohorts: [cohort], professionSlug: "electrician" });
    expect(own.missing.source).toBe("profession");
    // and the engine's gaps over real opportunities win over both
    const withOpps = buildLearningCompass({
      ...base,
      cohorts: [cohort],
      opportunities: [opp({ missingSkillSlugs: ["panel-wiring"] })],
    });
    expect(withOpps.missing.source).toBe("opportunities");
    // a cohort without a direction contributes nothing to 'missing'
    const noDir = buildLearningCompass({ ...base, cohorts: [{ ...cohort, targetProfessionSlug: null }] });
    expect(noDir.missing).toEqual({ source: null, skills: [] });
  });

  it("a fit's declared opportunity type travels untouched (the board's value, never inferred here)", () => {
    const c = buildLearningCompass({
      ...base,
      opportunities: [
        opp({ requestId: "i", status: "strong", opportunityType: "internship" }),
        opp({ requestId: "j", status: "possible" }),
      ],
    });
    expect(c.fitsNow.map((o) => [o.requestId, o.opportunityType ?? null])).toEqual([
      ["i", "internship"],
      ["j", null],
    ]);
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
