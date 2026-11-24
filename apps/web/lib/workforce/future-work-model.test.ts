import { describe, expect, it } from "vitest";

import {
  WORKFORCE_PLAN_PAYLOAD_KEY,
  WORKFORCE_PLAN_VERSION,
  composeFutureWork,
  demandToFutureWork,
  projectToFutureWork,
  readRequiredSkills,
  readTeamSize,
  readWorkforcePlanV1,
  writeWorkforcePlanV1,
  type DemandWorkInput,
  type ProjectWorkInput,
  type WorkforcePlanV1,
  type WorkforceRequirement,
} from "@/lib/workforce/future-work-model";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

const V2 = {
  opportunity_type: "project_work",
  target_supply: "team",
  contract_country: "DE",
  time: {
    start_earliest: "2026-08-03",
    end_date: "2026-09-27",
    hours_per_week: 40,
    shifts: ["day"],
  },
  requirements: {
    min_experience_years: 3,
    certificates: ["SCC certificate"],
    languages: [{ lang: "de", level: "B1", one_per_team_sufficient: true }],
  },
  meta: { contract_version: 2 },
};

function demandInput(overrides?: Partial<DemandWorkInput>): DemandWorkInput {
  return {
    id: "d1",
    title: "Concrete crew for Hamburg site",
    status: "submitted",
    payload: { structured_v2: V2, team_size: 6, required_skills: ["concrete-works"] },
    ...overrides,
  };
}

function projectInput(overrides?: Partial<ProjectWorkInput>): ProjectWorkInput {
  return {
    id: "p1",
    title: "Hamburg residential block",
    status: "live",
    country: "DE",
    city: "Hamburg",
    startDate: "2026-07-20",
    endDate: "2026-10-15",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Demand mapping                                                       */
/* ------------------------------------------------------------------ */

describe("demandToFutureWork", () => {
  it("maps the structured_v2 cluster onto the entry", () => {
    const entry = demandToFutureWork(demandInput());
    expect(entry.id).toBe("demand:d1");
    expect(entry.source).toBe("demand");
    expect(entry.startDate).toBe("2026-08-03");
    expect(entry.endDate).toBe("2026-09-27");
    expect(entry.location.country).toBe("DE");
    expect(entry.hoursPerWeek).toBe(40);
    expect(entry.shifts).toEqual(["day"]);
    expect(entry.teamSize).toBe(6);
    expect(entry.teamShape).toBe("team");
    expect(entry.requiredSkills).toEqual(["concrete-works"]);
    expect(entry.requiredCertificates).toEqual(["SCC certificate"]);
    expect(entry.requiredLanguages).toEqual([
      { lang: "de", level: "B1", onePerTeamSufficient: true },
    ]);
    expect(entry.minExperienceYears).toBe(3);
    expect(entry.structuredCaptured).toBe(true);
  });

  it("degrades honestly without structured_v2 — nulls, never fabrication", () => {
    const entry = demandToFutureWork(
      demandInput({ payload: { title: "just text" } }),
    );
    expect(entry.startDate).toBeNull();
    expect(entry.endDate).toBeNull();
    expect(entry.hoursPerWeek).toBeNull();
    expect(entry.teamSize).toBeNull();
    expect(entry.teamShape).toBeNull();
    expect(entry.requiredSkills).toEqual([]);
    expect(entry.requiredCertificates).toEqual([]);
    expect(entry.requiredLanguages).toEqual([]);
    expect(entry.structuredCaptured).toBe(false);
  });

  it("flags partner supply for company-supply and subcontract demand", () => {
    const company = demandToFutureWork(
      demandInput({
        payload: {
          structured_v2: { ...V2, target_supply: "company" },
        },
      }),
    );
    expect(company.partnerSupplyExpected).toBe(true);
    const sub = demandToFutureWork(
      demandInput({
        payload: {
          structured_v2: { ...V2, opportunity_type: "subcontract", target_supply: "individual" },
        },
      }),
    );
    expect(sub.partnerSupplyExpected).toBe(true);
    const plain = demandToFutureWork(demandInput());
    expect(plain.partnerSupplyExpected).toBe(false);
  });
});

describe("payload readers are tolerant, bounded and never throw", () => {
  it("readTeamSize accepts the historical keys and rejects junk", () => {
    expect(readTeamSize({ team_size: 4 })).toBe(4);
    expect(readTeamSize({ teamSize: 7 })).toBe(7);
    expect(readTeamSize({ number_of_workers: 12 })).toBe(12);
    expect(readTeamSize({ team_size: 0 })).toBeNull();
    expect(readTeamSize({ team_size: 2.5 })).toBeNull();
    expect(readTeamSize({ team_size: "6" })).toBeNull();
    expect(readTeamSize(null)).toBeNull();
    expect(readTeamSize("string")).toBeNull();
  });

  it("readRequiredSkills keeps bounded strings only", () => {
    expect(readRequiredSkills({ required_skills: ["a", 1, "", "  b  "] })).toEqual([
      "a",
      "b",
    ]);
    expect(readRequiredSkills({ requiredSkills: ["x"] })).toEqual(["x"]);
    expect(readRequiredSkills({})).toEqual([]);
    expect(readRequiredSkills(undefined)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Project mapping + composition                                        */
/* ------------------------------------------------------------------ */

describe("projectToFutureWork", () => {
  it("maps the delivery axis honestly — no invented requirements", () => {
    const entry = projectToFutureWork(projectInput());
    expect(entry.id).toBe("project:p1");
    expect(entry.location).toEqual({ country: "DE", city: "Hamburg" });
    expect(entry.startDate).toBe("2026-07-20");
    expect(entry.requiredSkills).toEqual([]);
    expect(entry.teamSize).toBeNull();
    expect(entry.structuredCaptured).toBe(false);
  });
});

describe("composeFutureWork", () => {
  it("orders by start date then source/id; undated entries go last", () => {
    const entries = composeFutureWork({
      demands: [
        demandInput(),
        demandInput({ id: "d2", payload: {} }), // undated
      ],
      projects: [projectInput()],
    });
    expect(entries.map((e) => e.id)).toEqual([
      "project:p1", // 2026-07-20
      "demand:d1", // 2026-08-03
      "demand:d2", // no date → last
    ]);
  });

  it("deduplicates the same source row — first occurrence wins", () => {
    const entries = composeFutureWork({
      demands: [demandInput(), demandInput({ title: "duplicate later row" })],
      projects: [projectInput(), projectInput({ title: "dup" })],
    });
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.id === "demand:d1")?.title).toBe(
      "Concrete crew for Hamburg site",
    );
  });

  it("never merges a demand with a project (no invented relation)", () => {
    const entries = composeFutureWork({
      demands: [demandInput({ id: "same-id" })],
      projects: [projectInput({ id: "same-id" })],
    });
    expect(entries).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* WorkforcePlanV1 payload round-trip                                   */
/* ------------------------------------------------------------------ */

function requirement(
  overrides?: Partial<WorkforceRequirement>,
): WorkforceRequirement {
  return {
    id: "demand:d1#crew#builder",
    entryId: "demand:d1",
    kind: "crew",
    professionSlug: "builder",
    roleTitle: "Concrete crew",
    headcount: 6,
    hoursPerWeek: 40,
    totalHours: 1920,
    skills: ["concrete-works"],
    certificates: ["SCC certificate"],
    languages: [{ lang: "de", level: "B1", onePerTeamSufficient: true }],
    teamShape: "team",
    equipmentNeeded: false,
    partnerNeeded: false,
    undeterminedFields: [],
    source: "deterministic:crew-from-structured-demand",
    explanation: "test line",
    confidence: "high",
    status: "suggested",
    ...overrides,
  };
}

function plan(overrides?: Partial<WorkforcePlanV1>): WorkforcePlanV1 {
  return {
    version: WORKFORCE_PLAN_VERSION,
    requirements: [requirement()],
    ...overrides,
  };
}

describe("WorkforcePlanV1 read/write on the canonical demand payload", () => {
  it("writes at the additive sibling key and preserves every other key", () => {
    const payload = { structured_v2: V2, team_size: 6 };
    const next = writeWorkforcePlanV1(payload, plan());
    expect(next).not.toBeNull();
    expect(next![WORKFORCE_PLAN_PAYLOAD_KEY]).toBeTruthy();
    // structured_v2 untouched — the strict v2 schema must keep parsing.
    expect(next!.structured_v2).toBe(V2);
    expect(next!.team_size).toBe(6);
    // never mutates the input
    expect(payload).toEqual({ structured_v2: V2, team_size: 6 });
  });

  it("the plan is a SIBLING of structured_v2, never inside it (strict-schema safety)", () => {
    const next = writeWorkforcePlanV1({ structured_v2: V2 }, plan());
    expect(
      (next!.structured_v2 as Record<string, unknown>)[WORKFORCE_PLAN_PAYLOAD_KEY],
    ).toBeUndefined();
  });

  it("round-trips through readWorkforcePlanV1", () => {
    const stored = writeWorkforcePlanV1({}, plan({ confirmedAtIso: "2026-07-13T10:00:00Z", confirmedBy: "user-1" }));
    const read = readWorkforcePlanV1(stored);
    expect(read).not.toBeNull();
    expect(read!.requirements).toHaveLength(1);
    expect(read!.confirmedBy).toBe("user-1");
  });

  it("unknown/absent/corrupt plans read as an honest null", () => {
    expect(readWorkforcePlanV1(null)).toBeNull();
    expect(readWorkforcePlanV1({})).toBeNull();
    expect(readWorkforcePlanV1({ workforce_plan: { version: 99 } })).toBeNull();
    expect(
      readWorkforcePlanV1({ workforce_plan: { version: 1, requirements: "x" } }),
    ).toBeNull();
  });

  it("rejects an invalid plan instead of overwriting a stored one", () => {
    const bad = plan({
      requirements: [requirement({ headcount: -1 })],
    });
    expect(writeWorkforcePlanV1({ keep: true }, bad)).toBeNull();
  });
});
