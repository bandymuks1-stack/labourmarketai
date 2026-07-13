import { describe, expect, it } from "vitest";

import { PROFESSION_SKILLS } from "@/lib/taxonomy/profession-skills";
import type { FutureWorkEntry } from "@/lib/workforce/future-work-model";
import {
  SUPERVISOR_TEAM_THRESHOLD,
  confirmRequirement,
  deriveWorkforceRequirements,
  durationWeeks,
  editRequirement,
  planFromDerived,
  professionFromSkills,
  professionFromTitle,
  rejectRequirement,
  type WorkforceCatalog,
} from "@/lib/workforce/work-breakdown";

const CATALOG: WorkforceCatalog = {
  professions: Object.keys(PROFESSION_SKILLS),
  professionSkills: PROFESSION_SKILLS,
};

function entry(overrides?: Partial<FutureWorkEntry>): FutureWorkEntry {
  return {
    id: "demand:d1",
    source: "demand",
    sourceId: "d1",
    title: "Concrete works crew",
    status: "submitted",
    startDate: "2026-08-03",
    endDate: "2026-08-16", // 14 inclusive days = 2 weeks
    location: { country: "DE", city: null },
    hoursPerWeek: 40,
    shifts: ["day"],
    teamSize: 6,
    teamShape: "team",
    requiredSkills: ["concrete-pouring", "formwork"],
    requiredCertificates: ["SCC certificate"],
    requiredLanguages: [{ lang: "de", level: "B1", onePerTeamSufficient: true }],
    minExperienceYears: 3,
    partnerSupplyExpected: false,
    structuredCaptured: true,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Dictionary rules                                                     */
/* ------------------------------------------------------------------ */

describe("professionFromSkills (deterministic dictionary rule)", () => {
  it("picks the profession covering the most stated skills", () => {
    const best = professionFromSkills(["concrete-pouring", "formwork"], CATALOG);
    expect(best).toEqual({ slug: "concrete_worker", covered: 2 });
  });

  it("is deterministic on ties (alphabetical catalogue order)", () => {
    // "formwork" is carried by builder, concrete_worker and rebar_worker —
    // one covered skill each; alphabetically first wins.
    const best = professionFromSkills(["formwork"], CATALOG);
    expect(best).toEqual({ slug: "builder", covered: 1 });
  });

  it("returns null when no profession covers any skill", () => {
    expect(professionFromSkills(["quantum-welding"], CATALOG)).toBeNull();
    expect(professionFromSkills([], CATALOG)).toBeNull();
  });
});

describe("professionFromTitle (weak token rule)", () => {
  it("matches multi-token slugs only when every token appears", () => {
    expect(professionFromTitle("Site manager needed for Hamburg", CATALOG)).toBe(
      "site_manager",
    );
    expect(professionFromTitle("manager needed", CATALOG)).toBeNull();
  });

  it("returns null for null/no-match titles", () => {
    expect(professionFromTitle(null, CATALOG)).toBeNull();
    expect(professionFromTitle("Betonuotojų komanda", CATALOG)).toBeNull();
  });
});

describe("durationWeeks", () => {
  it("rounds partial weeks up and rejects reversed/absent bands", () => {
    expect(durationWeeks({ startDate: "2026-08-03", endDate: "2026-08-16" })).toBe(2);
    expect(durationWeeks({ startDate: "2026-08-03", endDate: "2026-08-03" })).toBe(1);
    expect(durationWeeks({ startDate: "2026-08-03", endDate: "2026-08-20" })).toBe(3);
    expect(durationWeeks({ startDate: "2026-08-03", endDate: null })).toBeNull();
    expect(durationWeeks({ startDate: null, endDate: "2026-08-20" })).toBeNull();
    expect(durationWeeks({ startDate: "2026-08-20", endDate: "2026-08-03" })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Derivation                                                           */
/* ------------------------------------------------------------------ */

describe("deriveWorkforceRequirements", () => {
  it("derives a crew line with provenance, explanation and confidence", () => {
    const [crew] = deriveWorkforceRequirements(entry(), CATALOG);
    expect(crew.kind).toBe("crew");
    expect(crew.professionSlug).toBe("concrete_worker");
    expect(crew.headcount).toBe(6);
    expect(crew.hoursPerWeek).toBe(40);
    expect(crew.totalHours).toBe(40 * 6 * 2);
    expect(crew.skills).toEqual(["concrete-pouring", "formwork"]);
    expect(crew.certificates).toEqual(["SCC certificate"]);
    expect(crew.languages).toHaveLength(1);
    expect(crew.source).toBe("deterministic:crew-from-structured-demand");
    expect(crew.explanation.length).toBeGreaterThan(0);
    expect(crew.confidence).toBe("high"); // stated headcount + skills-derived profession
    expect(crew.undeterminedFields).toEqual([]);
  });

  it("NEVER auto-confirms — every derived line is status 'suggested'", () => {
    for (const r of deriveWorkforceRequirements(entry(), CATALOG)) {
      expect(r.status).toBe("suggested");
    }
    for (const r of deriveWorkforceRequirements(
      entry({ teamSize: null, requiredSkills: [], title: null }),
      CATALOG,
    )) {
      expect(r.status).toBe("suggested");
    }
  });

  it("is deterministic — same entry + catalogue, same output", () => {
    const a = deriveWorkforceRequirements(entry(), CATALOG);
    const b = deriveWorkforceRequirements(entry(), CATALOG);
    expect(a).toEqual(b);
  });

  it(`suggests ONE supervisor line for crews >= ${SUPERVISOR_TEAM_THRESHOLD}`, () => {
    const lines = deriveWorkforceRequirements(entry({ teamSize: 6 }), CATALOG);
    expect(lines).toHaveLength(2);
    const supervisor = lines[1];
    expect(supervisor.kind).toBe("supervisor");
    expect(supervisor.headcount).toBe(1);
    expect(supervisor.professionSlug).toBe("foreman");
    expect(supervisor.source).toBe("deterministic:supervisor-team-of-5");
    expect(supervisor.explanation).toContain(String(SUPERVISOR_TEAM_THRESHOLD));
  });

  it("suggests NO supervisor below the threshold", () => {
    const lines = deriveWorkforceRequirements(
      entry({ teamSize: SUPERVISOR_TEAM_THRESHOLD - 1 }),
      CATALOG,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe("crew");
  });

  it("marks undetermined fields instead of inventing values", () => {
    const [crew] = deriveWorkforceRequirements(
      entry({
        teamSize: null,
        requiredSkills: [],
        title: "Pagalba objekte",
        hoursPerWeek: null,
        startDate: null,
        endDate: null,
      }),
      CATALOG,
    );
    expect(crew.headcount).toBe(1);
    expect(crew.professionSlug).toBeNull();
    expect(crew.undeterminedFields).toContain("headcount");
    expect(crew.undeterminedFields).toContain("profession");
    expect(crew.undeterminedFields).toContain("skills");
    expect(crew.undeterminedFields).toContain("hours");
    expect(crew.undeterminedFields).toContain("startDate");
    expect(crew.confidence).toBe("low");
  });

  it("uses title tokens as a low-confidence fallback for the profession", () => {
    const [crew] = deriveWorkforceRequirements(
      entry({ requiredSkills: [], title: "Experienced welder for pipelines" }),
      CATALOG,
    );
    expect(crew.professionSlug).toBe("welder");
    // implied skills come from the catalogue mapping, labelled in explanation
    expect(crew.skills).toEqual(PROFESSION_SKILLS.welder);
    expect(crew.explanation).toContain("implied by profession");
    expect(crew.confidence).toBe("medium"); // headcount stated, profession weak
  });

  it("passes partner expectation through to the crew line", () => {
    const [crew] = deriveWorkforceRequirements(
      entry({ partnerSupplyExpected: true }),
      CATALOG,
    );
    expect(crew.partnerNeeded).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Human confirmation transitions                                       */
/* ------------------------------------------------------------------ */

describe("human confirmation transitions (pure, explicit — no auto-confirm)", () => {
  const derived = deriveWorkforceRequirements(entry(), CATALOG);
  const basePlan = planFromDerived(derived);
  const crewId = derived[0].id;

  it("confirmRequirement moves suggested → confirmed and stamps the plan", () => {
    const next = confirmRequirement(basePlan, crewId, "user-1", "2026-07-13T10:00:00Z");
    expect(next.requirements[0].status).toBe("confirmed");
    expect(next.confirmedAtIso).toBe("2026-07-13T10:00:00Z");
    expect(next.confirmedBy).toBe("user-1");
    // pure — the input plan is untouched
    expect(basePlan.requirements[0].status).toBe("suggested");
  });

  it("confirmRequirement is a no-op for rejected lines and unknown ids", () => {
    const rejected = rejectRequirement(basePlan, crewId);
    const attempt = confirmRequirement(rejected, crewId, "user-1", "2026-07-13T10:00:00Z");
    expect(attempt).toBe(rejected);
    expect(attempt.requirements[0].status).toBe("rejected");
    expect(confirmRequirement(basePlan, "nope", "u", "t")).toBe(basePlan);
  });

  it("editRequirement applies the patch, marks 'edited' and human source", () => {
    const next = editRequirement(basePlan, crewId, { headcount: 8 });
    expect(next.requirements[0].headcount).toBe(8);
    expect(next.requirements[0].status).toBe("edited");
    expect(next.requirements[0].source).toBe("human");
  });

  it("an edit after confirmation drops the line back to 'edited'", () => {
    const confirmed = confirmRequirement(basePlan, crewId, "u", "t");
    const edited = editRequirement(confirmed, crewId, { headcount: 9 });
    expect(edited.requirements[0].status).toBe("edited");
  });

  it("edited lines can then be confirmed (edit is not a confirmation)", () => {
    const edited = editRequirement(basePlan, crewId, { headcount: 8 });
    expect(edited.requirements[0].status).toBe("edited");
    const confirmed = confirmRequirement(edited, crewId, "u", "t");
    expect(confirmed.requirements[0].status).toBe("confirmed");
  });

  it("rejectRequirement marks the line rejected and cannot be edited after", () => {
    const rejected = rejectRequirement(basePlan, crewId);
    expect(rejected.requirements[0].status).toBe("rejected");
    const edited = editRequirement(rejected, crewId, { headcount: 3 });
    expect(edited.requirements[0].status).toBe("rejected");
    expect(edited.requirements[0].headcount).toBe(derived[0].headcount);
  });
});
