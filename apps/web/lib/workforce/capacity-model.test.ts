import { describe, expect, it } from "vitest";

import type {
  FutureWorkEntry,
  WorkforceRequirement,
} from "@/lib/workforce/future-work-model";
import {
  assessCapacity,
  certificateMatches,
  languageLevelSatisfies,
  workerCanSupervise,
  workerFitsRequirement,
  type CapacityGap,
  type HoursGap,
  type RequirementCapacity,
  type WorkerCapacityInput,
  type WorkforceSupply,
} from "@/lib/workforce/capacity-model";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

function entry(overrides?: Partial<FutureWorkEntry>): FutureWorkEntry {
  return {
    id: "demand:d1",
    source: "demand",
    sourceId: "d1",
    title: "Concrete crew",
    status: "submitted",
    startDate: "2026-08-03",
    endDate: "2026-08-16",
    location: { country: "DE", city: null },
    hoursPerWeek: 40,
    shifts: [],
    teamSize: 2,
    teamSizeSource: "payload_stated",
    teamShape: "team",
    requiredSkills: ["concrete-pouring", "formwork"],
    requiredCertificates: [],
    requiredLanguages: [],
    minExperienceYears: null,
    partnerSupplyExpected: false,
    structuredCaptured: true,
    ...overrides,
  };
}

function requirement(
  overrides?: Partial<WorkforceRequirement>,
): WorkforceRequirement {
  return {
    id: "demand:d1#crew#concrete_worker",
    entryId: "demand:d1",
    kind: "crew",
    professionSlug: "concrete_worker",
    roleTitle: "Concrete crew",
    headcount: 2,
    hoursPerWeek: 40,
    totalHours: 160,
    skills: ["concrete-pouring", "formwork"],
    certificates: ["SCC certificate"],
    languages: [{ lang: "de", level: "B1", onePerTeamSufficient: true }],
    teamShape: "team",
    equipmentNeeded: false,
    partnerNeeded: false,
    undeterminedFields: [],
    source: "deterministic:crew-from-structured-demand",
    explanation: "test",
    confidence: "high",
    status: "suggested",
    ...overrides,
  };
}

function worker(overrides?: Partial<WorkerCapacityInput>): WorkerCapacityInput {
  return {
    workerId: "w1",
    availabilityStatus: "available",
    availableFrom: null,
    plannedCommitments: [],
    skills: ["concrete-pouring", "formwork"],
    professions: ["concrete_worker"],
    certificates: ["SCC certificate"],
    languages: [{ lang: "de", level: "B2" }],
    locationCountry: "DE",
    preferences: {
      willingToRelocate: null,
      needsAccommodation: null,
      hasTransport: null,
      maxTripDays: null,
      teamAvailable: null,
      soloAvailable: null,
    },
    brigadeIds: [],
    confirmedWorkHistoryCount: 1,
    ...overrides,
  };
}

function supply(overrides?: Partial<WorkforceSupply>): WorkforceSupply {
  return { workers: [], assignments: [], brigades: [], ...overrides };
}

function assess(
  reqs: readonly WorkforceRequirement[],
  s: WorkforceSupply,
  entries: readonly FutureWorkEntry[] = [entry()],
) {
  return assessCapacity(reqs, s, { entries });
}

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                                */
/* ------------------------------------------------------------------ */

describe("languageLevelSatisfies (CEFR ladder)", () => {
  it("orders A1..C2 and lets native beat everything", () => {
    expect(languageLevelSatisfies("B2", "B1")).toBe(true);
    expect(languageLevelSatisfies("B1", "B1")).toBe(true);
    expect(languageLevelSatisfies("A2", "B1")).toBe(false);
    expect(languageLevelSatisfies("native", "C2")).toBe(true);
    expect(languageLevelSatisfies("weird", "B1")).toBe(false);
  });
});

describe("certificateMatches (bounded free-text, honest)", () => {
  it("matches normalized equality and containment, not empty strings", () => {
    expect(certificateMatches("SCC Certificate", "scc certificate")).toBe(true);
    expect(certificateMatches("SCC certificate 2026", "SCC certificate")).toBe(true);
    expect(certificateMatches("SCC", "VCA")).toBe(false);
    expect(certificateMatches("", "SCC")).toBe(false);
  });
});

describe("workerFitsRequirement", () => {
  it("profession match fits regardless of skills", () => {
    expect(
      workerFitsRequirement(worker({ skills: [] }), requirement()),
    ).toBe(true);
  });

  it("covering >= half the skills fits without the profession", () => {
    const w = worker({ professions: [], skills: ["concrete-pouring"] });
    expect(workerFitsRequirement(w, requirement())).toBe(true); // 1 of 2
    const w2 = worker({ professions: [], skills: ["other"] });
    expect(workerFitsRequirement(w2, requirement())).toBe(false);
  });

  it("no profession + no skills on the requirement never fits (honest)", () => {
    expect(
      workerFitsRequirement(
        worker(),
        requirement({ professionSlug: null, skills: [] }),
      ),
    ).toBe(false);
  });
});

describe("workerCanSupervise", () => {
  it("accepts coordinating professions and supervision skills", () => {
    expect(workerCanSupervise(worker({ professions: ["foreman"] }))).toBe(true);
    expect(
      workerCanSupervise(worker({ professions: [], skills: ["site-supervision"] })),
    ).toBe(true);
    expect(workerCanSupervise(worker({ professions: [], skills: [] }))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* assessCapacity — every gap type                                      */
/* ------------------------------------------------------------------ */

describe("assessCapacity", () => {
  it("computes a zero-shortfall headcount gap when capacity covers the need", () => {
    const result = assess(
      [requirement()],
      supply({ workers: [worker(), worker({ workerId: "w2" })] }),
    );
    const rc = result.requirements[0];
    expect(rc.matchedWorkerIds).toEqual(["w1", "w2"]);
    expect(rc.headcountGap.shortfall).toBe(0);
    expect(result.totalHeadcountShortfall).toBe(0);
  });

  it("computes headcount shortfall with matched ids listed", () => {
    const result = assess([requirement({ headcount: 3 })], supply({ workers: [worker()] }));
    const rc = result.requirements[0];
    expect(rc.headcountGap).toMatchObject<Partial<CapacityGap>>({
      kind: "headcount",
      required: 3,
      matchedWorkerIds: ["w1"],
      shortfall: 2,
    });
  });

  it("excludes unavailable workers and workers available too late", () => {
    const result = assess(
      [requirement()],
      supply({
        workers: [
          worker({ workerId: "sick", availabilityStatus: "unavailable" }),
          worker({ workerId: "late", availableFrom: "2026-09-01" }),
          worker({ workerId: "ok", availableFrom: "2026-08-01" }),
        ],
      }),
    );
    expect(result.requirements[0].matchedWorkerIds).toEqual(["ok"]);
  });

  it("committed workers in the window are busy-fit, not capacity (inclusive overlap)", () => {
    const result = assess(
      [requirement()],
      supply({
        workers: [
          worker({
            workerId: "busy",
            plannedCommitments: [{ startDate: "2026-08-10", endDate: "2026-08-20" }],
          }),
          worker({
            workerId: "edge", // ends exactly on need start — inclusive overlap
            plannedCommitments: [{ startDate: "2026-07-20", endDate: "2026-08-03" }],
          }),
          worker({
            workerId: "before",
            plannedCommitments: [{ startDate: "2026-07-01", endDate: "2026-08-02" }],
          }),
        ],
      }),
    );
    const rc = result.requirements[0];
    expect(rc.matchedWorkerIds).toEqual(["before"]);
    expect(rc.busyMatchedWorkerIds).toEqual(["busy", "edge"]);
  });

  it("merges explicit assignment ranges into commitments", () => {
    const result = assess(
      [requirement()],
      supply({
        workers: [worker()],
        assignments: [{ workerId: "w1", startDate: "2026-08-05", endDate: "2026-08-06" }],
      }),
    );
    expect(result.requirements[0].matchedWorkerIds).toEqual([]);
    expect(result.requirements[0].busyMatchedWorkerIds).toEqual(["w1"]);
  });

  it("computes hours gaps proportionally (documented approximation)", () => {
    const result = assess(
      [requirement({ headcount: 2, totalHours: 160 })],
      supply({ workers: [worker()] }),
    );
    expect(result.requirements[0].hoursGap).toEqual<HoursGap>({
      requirementId: "demand:d1#crew#concrete_worker",
      requiredHours: 160,
      coverableHours: 80,
      shortfallHours: 80,
    });
  });

  it("hours gap is an honest null without a derivable volume", () => {
    const result = assess([requirement({ totalHours: null })], supply({ workers: [worker()] }));
    expect(result.requirements[0].hoursGap.requiredHours).toBeNull();
    expect(result.requirements[0].hoursGap.shortfallHours).toBeNull();
  });

  it("computes per-skill gaps over the eligible workers", () => {
    const result = assess(
      [requirement()],
      supply({
        workers: [
          worker({ workerId: "full" }),
          worker({ workerId: "half", skills: ["concrete-pouring"] }),
        ],
      }),
    );
    const gaps = result.requirements[0].skillGaps;
    expect(gaps.find((g) => g.subject === "concrete-pouring")).toMatchObject({
      matchedWorkerIds: ["full", "half"],
      shortfall: 0,
    });
    expect(gaps.find((g) => g.subject === "formwork")).toMatchObject({
      matchedWorkerIds: ["full"],
      shortfall: 1,
    });
  });

  it("computes certificate gaps (normalized matching)", () => {
    const result = assess(
      [requirement({ headcount: 2 })],
      supply({
        workers: [
          worker({ workerId: "certified" }),
          worker({ workerId: "uncertified", certificates: [] }),
        ],
      }),
    );
    const [gap] = result.requirements[0].certificateGaps;
    expect(gap.subject).toBe("SCC certificate");
    expect(gap.matchedWorkerIds).toEqual(["certified"]);
    expect(gap.shortfall).toBe(1);
  });

  it("language gap honours one_per_team_sufficient and CEFR levels", () => {
    const result = assess(
      [requirement({ headcount: 3 })],
      supply({
        workers: [
          worker({ workerId: "speaks" }),
          worker({ workerId: "tooLow", languages: [{ lang: "de", level: "A2" }] }),
          worker({ workerId: "none", languages: [] }),
        ],
      }),
    );
    const [gap] = result.requirements[0].languageGaps;
    expect(gap.required).toBe(1); // one per team sufficient
    expect(gap.matchedWorkerIds).toEqual(["speaks"]);
    expect(gap.shortfall).toBe(0);

    const strict = assess(
      [
        requirement({
          headcount: 3,
          languages: [{ lang: "de", level: "B1", onePerTeamSufficient: false }],
        }),
      ],
      supply({ workers: [worker({ workerId: "speaks" })] }),
    );
    expect(strict.requirements[0].languageGaps[0].required).toBe(3);
    expect(strict.requirements[0].languageGaps[0].shortfall).toBe(2);
  });

  it("supervisor gap only on supervisor-kind lines, matched by capability", () => {
    const crew = assess([requirement()], supply({ workers: [worker()] }));
    expect(crew.requirements[0].supervisorGap).toBeNull();

    const result = assess(
      [
        requirement({
          id: "demand:d1#supervisor",
          kind: "supervisor",
          professionSlug: "foreman",
          headcount: 1,
          skills: [],
          certificates: [],
          languages: [],
          teamShape: null,
        }),
      ],
      supply({
        workers: [
          worker({ workerId: "boss", professions: ["foreman"] }),
          worker({ workerId: "hands", professions: ["concrete_worker"] }),
        ],
      }),
    );
    const gap = result.requirements[0].supervisorGap!;
    expect(gap.kind).toBe("supervisor");
    expect(gap.matchedWorkerIds).toEqual(["boss"]);
    expect(gap.shortfall).toBe(0);
  });

  it("location gap counts country matches and willing relocators; unknown never matches", () => {
    const result = assess(
      [requirement({ headcount: 3 })],
      supply({
        workers: [
          worker({ workerId: "local" }),
          worker({
            workerId: "mover",
            locationCountry: "LT",
            preferences: { ...worker().preferences, willingToRelocate: true },
          }),
          worker({ workerId: "unknown", locationCountry: null }),
        ],
      }),
    );
    const gap = result.requirements[0].locationGap!;
    expect(gap.subject).toBe("DE");
    expect(gap.matchedWorkerIds).toEqual(["local", "mover"]);
    expect(gap.shortfall).toBe(1);
  });

  it("no location gap axis when the entry states no country", () => {
    const result = assess(
      [requirement()],
      supply({ workers: [worker()] }),
      [entry({ location: { country: null, city: null } })],
    );
    expect(result.requirements[0].locationGap).toBeNull();
  });

  it("brigade gap: the best brigade's eligible members vs the required headcount", () => {
    const result = assess(
      [requirement({ headcount: 3, teamShape: "brigade" })],
      supply({
        workers: [
          worker({ workerId: "a", brigadeIds: ["b1"] }),
          worker({ workerId: "b", brigadeIds: ["b1"] }),
          worker({ workerId: "c", brigadeIds: ["b2"] }),
        ],
        brigades: [
          { brigadeId: "b1", memberWorkerIds: ["a", "b"] },
          { brigadeId: "b2", memberWorkerIds: ["c"] },
        ],
      }),
    );
    const gap = result.requirements[0].brigadeGap!;
    expect(gap.subject).toBe("b1");
    expect(gap.matchedWorkerIds).toEqual(["a", "b"]);
    expect(gap.shortfall).toBe(1);
  });

  it("rejected requirements are excluded; statuses travel with the result", () => {
    const result = assess(
      [
        requirement({ id: "r-ok", status: "confirmed" }),
        requirement({ id: "r-no", status: "rejected" }),
      ],
      supply({ workers: [worker()] }),
    );
    expect(result.requirements.map((r) => r.requirementId)).toEqual(["r-ok"]);
    expect(result.requirements[0].requirementStatus).toBe("confirmed");
  });

  it("without a need window the commitment check degrades to availability only", () => {
    const result = assessCapacity(
      [requirement()],
      supply({
        workers: [
          worker({
            plannedCommitments: [{ startDate: "2026-08-10", endDate: "2026-08-20" }],
          }),
        ],
      }),
      { entries: [entry({ startDate: null, endDate: null })] },
    );
    expect(result.requirements[0].matchedWorkerIds).toEqual(["w1"]);
  });

  it("near-miss workers (partial skill coverage) are listed for training", () => {
    const result = assess(
      [requirement({ professionSlug: null, skills: ["concrete-pouring", "formwork", "waterproofing", "precast-install"] })],
      supply({
        workers: [worker({ workerId: "learner", professions: [], skills: ["concrete-pouring"] })],
      }),
    );
    const rc = result.requirements[0];
    expect(rc.matchedWorkerIds).toEqual([]); // 1 of 4 < half
    expect(rc.nearMissWorkerIds).toEqual(["learner"]);
  });
});

/* ------------------------------------------------------------------ */
/* Privacy: NO contact data in the capacity boundary (type-level)       */
/* ------------------------------------------------------------------ */

type ForbiddenContactKeys =
  | "email"
  | "phone"
  | "phoneNumber"
  | "fullName"
  | "name"
  | "displayName"
  | "contact"
  | "address";

type AssertNoPII<T> = Extract<keyof T, ForbiddenContactKeys> extends never
  ? true
  : never;

describe("privacy: capacity types carry opaque ids only", () => {
  it("WorkerCapacityInput / outputs have no contact fields (compile-time pin)", () => {
    const inputOk: AssertNoPII<WorkerCapacityInput> = true;
    const prefsOk: AssertNoPII<WorkerCapacityInput["preferences"]> = true;
    const reqOk: AssertNoPII<RequirementCapacity> = true;
    const gapOk: AssertNoPII<CapacityGap> = true;
    const hoursOk: AssertNoPII<HoursGap> = true;
    expect([inputOk, prefsOk, reqOk, gapOk, hoursOk]).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it("runtime outputs never contain contact-shaped keys", () => {
    const result = assess([requirement()], supply({ workers: [worker()] }));
    const seen = new Set<string>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (v && typeof v === "object") {
        for (const [k, val] of Object.entries(v)) {
          seen.add(k);
          walk(val);
        }
      }
    };
    walk(result);
    for (const bad of ["email", "phone", "fullName", "name", "displayName", "address"]) {
      expect(seen.has(bad), `output leaks "${bad}"`).toBe(false);
    }
  });
});
