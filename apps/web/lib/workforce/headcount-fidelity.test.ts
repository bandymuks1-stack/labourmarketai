import { describe, expect, it } from "vitest";

import { PROFESSION_SKILLS } from "@/lib/taxonomy/profession-skills";
import {
  demandToFutureWork,
  type FutureWorkEntry,
} from "@/lib/workforce/future-work-model";
import {
  confirmRequirement,
  deriveWorkforceRequirements,
  editRequirement,
  planFromDerived,
  type WorkforceCatalog,
} from "@/lib/workforce/work-breakdown";
import {
  assessCapacity,
  type WorkerCapacityInput,
} from "@/lib/workforce/capacity-model";
import { buildGapTimeline } from "@/lib/workforce/gap-timeline";

/**
 * Headcount fidelity — the owner-blocking 5→1 defect and its regression
 * matrix (PR #749 fix round, real scenarios 1–8).
 *
 * OWNER PRINCIPLE under test: the system never silently rewrites
 * user-entered facts. `user_entered_required_headcount`,
 * `system_suggested_headcount`, `confirmed_required_headcount`,
 * `available_headcount` and `headcount_gap` stay distinct values.
 */

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
    endDate: "2026-08-16",
    location: { country: "DE", city: null },
    hoursPerWeek: 40,
    shifts: ["day"],
    teamSize: 5,
    teamSizeSource: "user_entered",
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

function worker(overrides?: Partial<WorkerCapacityInput>): WorkerCapacityInput {
  return {
    workerId: "w1",
    availabilityStatus: "available",
    availableFrom: null,
    plannedCommitments: [],
    skills: ["concrete-pouring", "formwork"],
    professions: ["concrete_worker"],
    certificates: [],
    languages: [],
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

function workers(n: number): WorkerCapacityInput[] {
  return Array.from({ length: n }, (_, i) => worker({ workerId: `w${i + 1}` }));
}

function crewOf(e: FutureWorkEntry) {
  const reqs = deriveWorkforceRequirements(e, CATALOG);
  const crew = reqs.find((r) => r.kind === "crew");
  if (!crew) throw new Error("no crew line derived");
  return { reqs, crew };
}

/* ------------------------------------------------------------------ */
/* The 5→1 root cause itself                                            */
/* ------------------------------------------------------------------ */

describe("5→1 root cause (team_size column threading)", () => {
  it("a demand row with team_size COLUMN 5 and no payload key projects teamSize 5, user_entered", () => {
    // Exactly the browser-proof row shape: the wizard wrote 5 to the
    // customer_requests.team_size column; the payload has no headcount key.
    const e = demandToFutureWork({
      id: "d1",
      title: "Plytelių klojėjų brigada",
      status: "submitted",
      payload: {},
      teamSize: 5,
    });
    expect(e.teamSize).toBe(5);
    expect(e.teamSizeSource).toBe("user_entered");
  });

  it("the user-entered column WINS over a historical payload key", () => {
    const e = demandToFutureWork({
      id: "d1",
      title: null,
      status: "submitted",
      payload: { team_size: 2 },
      teamSize: 5,
    });
    expect(e.teamSize).toBe(5);
    expect(e.teamSizeSource).toBe("user_entered");
  });

  it("payload keys still work when the column is empty (historical rows)", () => {
    const e = demandToFutureWork({
      id: "d1",
      title: null,
      status: "submitted",
      payload: { team_size: 4 },
      teamSize: null,
    });
    expect(e.teamSize).toBe(4);
    expect(e.teamSizeSource).toBe("payload_stated");
  });

  it("derivation keeps the user's 5 authoritative — no silent rewrite, no suggestion competes", () => {
    const { crew } = crewOf(entry({ teamSize: 5, teamSizeSource: "user_entered" }));
    expect(crew.headcount).toBe(5);
    expect(crew.userEnteredHeadcount).toBe(5);
    expect(crew.systemSuggestedHeadcount).toBeNull();
    expect(crew.undeterminedFields).not.toContain("headcount");
    expect(crew.explanation).toContain("user-entered fact");
  });

  it("with NO stated headcount the 1 is a labelled SYSTEM SUGGESTION, never a fact", () => {
    const { crew } = crewOf(entry({ teamSize: null, teamSizeSource: null }));
    expect(crew.headcount).toBe(1);
    expect(crew.userEnteredHeadcount).toBeNull();
    expect(crew.systemSuggestedHeadcount).toBe(1);
    expect(crew.undeterminedFields).toContain("headcount");
    expect(crew.explanation).toContain("SYSTEM SUGGESTION");
  });
});

/* ------------------------------------------------------------------ */
/* Scenario matrix                                                      */
/* ------------------------------------------------------------------ */

describe("real-scenario matrix (P1)", () => {
  it("1. user entered 5, available 4 → gap 1", () => {
    const e = entry();
    const { reqs } = crewOf(e);
    const crewOnly = reqs.filter((r) => r.kind === "crew");
    const a = assessCapacity(
      crewOnly,
      { workers: workers(4), assignments: [], brigades: [] },
      { entries: [e] },
    );
    const row = a.requirements[0];
    expect(row.headcountRequired).toBe(5);
    expect(row.matchedWorkerIds).toHaveLength(4);
    expect(row.headcountGap.shortfall).toBe(1);
  });

  it("2. user entered 5, available 0 → gap 5", () => {
    const e = entry();
    const { reqs } = crewOf(e);
    const crewOnly = reqs.filter((r) => r.kind === "crew");
    const a = assessCapacity(
      crewOnly,
      { workers: [], assignments: [], brigades: [] },
      { entries: [e] },
    );
    expect(a.requirements[0].headcountRequired).toBe(5);
    expect(a.requirements[0].headcountGap.shortfall).toBe(5);
  });

  it("3. system suggests 1 (none stated), user CONFIRMS an edited 5 → requirement 5", () => {
    const { reqs, crew } = crewOf(entry({ teamSize: null, teamSizeSource: null }));
    expect(crew.systemSuggestedHeadcount).toBe(1);
    let plan = planFromDerived(reqs);
    plan = editRequirement(plan, crew.id, { headcount: 5 });
    plan = confirmRequirement(plan, crew.id, "owner", "2026-07-13T12:00:00Z");
    const line = plan.requirements.find((r) => r.id === crew.id)!;
    expect(line.status).toBe("confirmed");
    expect(line.headcount).toBe(5);
    expect(line.userEnteredHeadcount).toBe(5);
    expect(line.systemSuggestedHeadcount).toBeNull();
  });

  it("4. system view has 5 (user entered), user edits to 2 → requirement 2, edit wins", () => {
    const { reqs, crew } = crewOf(entry({ teamSize: 5, teamSizeSource: "user_entered" }));
    let plan = planFromDerived(reqs);
    plan = editRequirement(plan, crew.id, { headcount: 2 });
    const line = plan.requirements.find((r) => r.id === crew.id)!;
    expect(line.status).toBe("edited");
    expect(line.headcount).toBe(2);
    expect(line.userEnteredHeadcount).toBe(2);
  });

  it("5. two professions 3 + 2 → total 5, but skill gaps stay separate per line", () => {
    const e1 = entry({
      id: "demand:d1",
      sourceId: "d1",
      teamSize: 3,
      requiredSkills: ["concrete-pouring"],
    });
    const e2 = entry({
      id: "demand:d2",
      sourceId: "d2",
      teamSize: 2,
      requiredSkills: ["tile-laying"],
    });
    const reqs = [
      ...deriveWorkforceRequirements(e1, CATALOG).filter((r) => r.kind === "crew"),
      ...deriveWorkforceRequirements(e2, CATALOG).filter((r) => r.kind === "crew"),
    ];
    const a = assessCapacity(
      reqs,
      { workers: [], assignments: [], brigades: [] },
      { entries: [e1, e2] },
    );
    const totalRequired = a.requirements.reduce((s, r) => s + r.headcountRequired, 0);
    expect(totalRequired).toBe(5);
    expect(a.totalHeadcountShortfall).toBe(5);
    // Skill gaps remain attached to their own requirement line — never merged.
    const bySubjects = a.requirements.map((r) =>
      r.skillGaps.map((g) => g.subject),
    );
    expect(bySubjects[0]).toContain("concrete-pouring");
    expect(bySubjects[0]).not.toContain("tile-laying");
    expect(bySubjects[1]).toContain("tile-laying");
    expect(bySubjects[1]).not.toContain("concrete-pouring");
  });

  it("6. need 5, only 1 holds the required certificate → headcount and certificate gaps reported separately", () => {
    const e = entry({ requiredCertificates: ["SCC certificate"] });
    const { reqs } = crewOf(e);
    const crewOnly = reqs.filter((r) => r.kind === "crew");
    const five = workers(5).map((w, i) =>
      i === 0 ? { ...w, certificates: ["SCC certificate"] } : { ...w, certificates: [] },
    );
    const a = assessCapacity(
      crewOnly,
      { workers: five, assignments: [], brigades: [] },
      { entries: [e] },
    );
    const row = a.requirements[0];
    const certGap = row.certificateGaps.find((g) => g.subject === "SCC certificate");
    expect(certGap).toBeDefined();
    // Certificate dimension: only 1 of the required 5 can cover it.
    expect(certGap!.matchedWorkerIds).toHaveLength(1);
    expect(certGap!.shortfall).toBe(4);
    // Headcount dimension reports independently of the certificate gap.
    expect(row.headcountRequired).toBe(5);
    expect(row.headcountGap.shortfall).toBeLessThanOrEqual(5);
  });

  it("7. 5 people across two periods → timeline buckets stay separate, never a false consolidation", () => {
    const aug = entry({
      id: "demand:d1",
      sourceId: "d1",
      teamSize: 3,
      startDate: "2026-08-03",
      endDate: "2026-08-16",
    });
    const oct = entry({
      id: "demand:d2",
      sourceId: "d2",
      teamSize: 2,
      startDate: "2026-10-05",
      endDate: "2026-10-18",
    });
    const reqs = [
      ...deriveWorkforceRequirements(aug, CATALOG).filter((r) => r.kind === "crew"),
      ...deriveWorkforceRequirements(oct, CATALOG).filter((r) => r.kind === "crew"),
    ];
    const a = assessCapacity(
      reqs,
      { workers: [], assignments: [], brigades: [] },
      { entries: [aug, oct] },
    );
    const tl = buildGapTimeline([aug, oct], a, { granularity: "month" });
    const augBucket = tl.buckets.find((b) => b.bucketStart.startsWith("2026-08"));
    const octBucket = tl.buckets.find((b) => b.bucketStart.startsWith("2026-10"));
    expect(augBucket?.requiredHeadcount).toBe(3);
    expect(octBucket?.requiredHeadcount).toBe(2);
    // No bucket ever claims the combined 5 — the periods do not overlap.
    for (const b of tl.buckets) {
      expect(b.requiredHeadcount).toBeLessThanOrEqual(3);
    }
  });

  it("8. direct-position path (column) and future-work path (payload) yield the SAME canonical headcount semantics", () => {
    // save_customer_request path: headcount lives on the team_size column.
    const viaColumn = demandToFutureWork({
      id: "p1",
      title: "Elektrikas objekte",
      status: "submitted",
      payload: {},
      teamSize: 5,
    });
    // Historical structured-draft path: headcount on a payload key.
    const viaPayload = demandToFutureWork({
      id: "p2",
      title: "Elektrikas objekte",
      status: "submitted",
      payload: { team_size: 5 },
      teamSize: null,
    });
    expect(viaColumn.teamSize).toBe(5);
    expect(viaPayload.teamSize).toBe(5);
    const crewA = deriveWorkforceRequirements(viaColumn, CATALOG).find(
      (r) => r.kind === "crew",
    )!;
    const crewB = deriveWorkforceRequirements(viaPayload, CATALOG).find(
      (r) => r.kind === "crew",
    )!;
    // Same effective requirement either way — one canonical semantics.
    expect(crewA.headcount).toBe(5);
    expect(crewB.headcount).toBe(5);
    expect(crewA.undeterminedFields).not.toContain("headcount");
    expect(crewB.undeterminedFields).not.toContain("headcount");
    // Provenance is honest about which path stated it.
    expect(crewA.userEnteredHeadcount).toBe(5);
    expect(crewB.userEnteredHeadcount).toBeNull();
  });
});
