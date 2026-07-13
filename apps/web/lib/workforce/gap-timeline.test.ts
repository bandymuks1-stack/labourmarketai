import { describe, expect, it } from "vitest";

import type {
  FutureWorkEntry,
  WorkforceRequirement,
} from "@/lib/workforce/future-work-model";
import {
  assessCapacity,
  type WorkerCapacityInput,
  type WorkforceSupply,
} from "@/lib/workforce/capacity-model";
import {
  AGENCY_SHORTFALL_THRESHOLD,
  CRITICAL_SHORTFALL_RATIO,
  buildGapTimeline,
  recommendActions,
} from "@/lib/workforce/gap-timeline";

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
    startDate: "2026-08-05", // Wednesday
    endDate: "2026-08-18",
    location: { country: "DE", city: null },
    hoursPerWeek: 40,
    shifts: [],
    teamSize: 2,
    teamSizeSource: "payload_stated",
    teamShape: "team",
    requiredSkills: ["concrete-pouring"],
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
    skills: ["concrete-pouring"],
    certificates: [],
    languages: [],
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
    skills: ["concrete-pouring"],
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
    confirmedWorkHistoryCount: 0,
    ...overrides,
  };
}

function supply(overrides?: Partial<WorkforceSupply>): WorkforceSupply {
  return { workers: [], assignments: [], brigades: [], ...overrides };
}

/* ------------------------------------------------------------------ */
/* buildGapTimeline                                                     */
/* ------------------------------------------------------------------ */

describe("buildGapTimeline", () => {
  it("buckets by Monday weeks covering the need band", () => {
    const entries = [entry()];
    const assessment = assessCapacity([requirement()], supply(), { entries });
    const timeline = buildGapTimeline(entries, assessment);
    expect(timeline.granularity).toBe("week");
    // 2026-08-05 (Wed) → week of Mon 2026-08-03; band ends 2026-08-18 →
    // week of Mon 2026-08-17.
    expect(timeline.buckets.map((b) => b.bucketStart)).toEqual([
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
    ]);
    expect(timeline.buckets[0].bucketEnd).toBe("2026-08-09");
  });

  it("month buckets when asked", () => {
    const entries = [entry({ startDate: "2026-08-20", endDate: "2026-09-10" })];
    const assessment = assessCapacity([requirement()], supply(), { entries });
    const timeline = buildGapTimeline(entries, assessment, { granularity: "month" });
    expect(timeline.buckets.map((b) => b.bucketStart)).toEqual([
      "2026-08-01",
      "2026-09-01",
    ]);
  });

  it("reports per-bucket required/matched/shortfall + missing skills", () => {
    const entries = [entry()];
    const assessment = assessCapacity(
      [requirement()],
      supply({ workers: [worker({ skills: [] })] }), // fits by profession, lacks skill
      { entries },
    );
    const timeline = buildGapTimeline(entries, assessment);
    const bucket = timeline.buckets[0];
    expect(bucket.entryIds).toEqual(["demand:d1"]);
    expect(bucket.requiredHeadcount).toBe(2);
    expect(bucket.matchedHeadcount).toBe(1);
    expect(bucket.shortfall).toBe(1);
    expect(bucket.missingSkills).toEqual(["concrete-pouring"]);
  });

  it("riskDate = the need start inside the first shortfall bucket (never before the need)", () => {
    const entries = [entry()]; // starts Wed 2026-08-05, bucket starts Mon 08-03
    const assessment = assessCapacity([requirement()], supply(), { entries });
    const timeline = buildGapTimeline(entries, assessment);
    expect(timeline.riskDate).toBe("2026-08-05");
  });

  it("riskDate is null when capacity always suffices", () => {
    const entries = [entry()];
    const assessment = assessCapacity(
      [requirement()],
      supply({ workers: [worker(), worker({ workerId: "w2" })] }),
      { entries },
    );
    const timeline = buildGapTimeline(entries, assessment);
    expect(timeline.riskDate).toBeNull();
    expect(timeline.buckets.every((b) => b.riskLevel === "ok")).toBe(true);
  });

  it("risk levels: ok / tight / critical with the documented thresholds", () => {
    // 1 short of 10 = 10% → tight (<= CRITICAL_SHORTFALL_RATIO of 20%)
    const entries = [entry()];
    const nineWorkers = Array.from({ length: 9 }, (_, i) =>
      worker({ workerId: `w${i}` }),
    );
    const tight = buildGapTimeline(
      entries,
      assessCapacity([requirement({ headcount: 10 })], supply({ workers: nineWorkers }), {
        entries,
      }),
    );
    expect(tight.buckets[0].riskLevel).toBe("tight");

    // 5 short of 10 = 50% > 20% → critical
    const critical = buildGapTimeline(
      entries,
      assessCapacity(
        [requirement({ headcount: 10 })],
        supply({ workers: nineWorkers.slice(0, 5) }),
        { entries },
      ),
    );
    expect(critical.buckets[0].riskLevel).toBe("critical");
    expect(CRITICAL_SHORTFALL_RATIO).toBe(0.2);
  });

  it("a supervisor shortfall escalates the bucket to critical", () => {
    const entries = [entry()];
    const assessment = assessCapacity(
      [
        requirement({ headcount: 1 }),
        requirement({
          id: "demand:d1#supervisor",
          kind: "supervisor",
          professionSlug: "foreman",
          headcount: 1,
          skills: [],
        }),
      ],
      supply({ workers: [worker()] }), // covers crew, cannot supervise
      { entries },
    );
    const timeline = buildGapTimeline(entries, assessment);
    expect(timeline.buckets[0].riskLevel).toBe("critical");
  });

  it("undated needs are reported honestly outside the timeline", () => {
    const undatedEntry = entry({ id: "demand:d2", sourceId: "d2", startDate: null, endDate: null });
    const entries = [entry(), undatedEntry];
    const assessment = assessCapacity(
      [requirement(), requirement({ id: "r2", entryId: "demand:d2" })],
      supply(),
      { entries },
    );
    const timeline = buildGapTimeline(entries, assessment);
    expect(timeline.undatedEntryIds).toEqual(["demand:d2"]);
    expect(timeline.buckets.every((b) => !b.entryIds.includes("demand:d2"))).toBe(true);
  });

  it("no dated requirements → empty timeline, null riskDate", () => {
    const undatedEntry = entry({ startDate: null, endDate: null });
    const assessment = assessCapacity([requirement()], supply(), {
      entries: [undatedEntry],
    });
    const timeline = buildGapTimeline([undatedEntry], assessment);
    expect(timeline.buckets).toEqual([]);
    expect(timeline.riskDate).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* recommendActions                                                     */
/* ------------------------------------------------------------------ */

describe("recommendActions", () => {
  const entries = [entry()];

  it("assign_existing_worker when eligible capacity exists", () => {
    const assessment = assessCapacity(
      [requirement()],
      supply({ workers: [worker()] }),
      { entries },
    );
    const actions = recommendActions(assessment);
    const assign = actions.find((a) => a.type === "assign_existing_worker");
    expect(assign).toBeTruthy();
    expect(assign!.evidence.workerIds).toEqual(["w1"]);
    expect(assign!.evidence.gapKind).toBe("headcount");
  });

  it("transfer_from_project when fitting workers are committed elsewhere", () => {
    const assessment = assessCapacity(
      [requirement()],
      supply({
        workers: [
          worker({
            plannedCommitments: [{ startDate: "2026-08-01", endDate: "2026-08-30" }],
          }),
        ],
      }),
      { entries },
    );
    const actions = recommendActions(assessment);
    const transfer = actions.find((a) => a.type === "transfer_from_project");
    expect(transfer).toBeTruthy();
    expect(transfer!.evidence.workerIds).toEqual(["w1"]);
  });

  it("form_brigade for brigade-shaped needs with a partial brigade", () => {
    const assessment = assessCapacity(
      [requirement({ headcount: 3, teamShape: "brigade" })],
      supply({
        workers: [worker({ workerId: "a", brigadeIds: ["b1"] })],
        brigades: [{ brigadeId: "b1", memberWorkerIds: ["a"] }],
      }),
      { entries },
    );
    const actions = recommendActions(assessment);
    expect(actions.some((a) => a.type === "form_brigade")).toBe(true);
  });

  it("train_existing_worker when a skill gap has near-miss workers", () => {
    const assessment = assessCapacity(
      [
        requirement({
          professionSlug: null,
          skills: ["concrete-pouring", "formwork", "waterproofing", "precast-install"],
        }),
      ],
      supply({
        workers: [worker({ workerId: "learner", professions: [], skills: ["concrete-pouring"] })],
      }),
      { entries },
    );
    const actions = recommendActions(assessment);
    const train = actions.find((a) => a.type === "train_existing_worker");
    expect(train).toBeTruthy();
    expect(train!.evidence.gapKind).toBe("skill");
    expect(train!.evidence.workerIds).toEqual(["learner"]);
  });

  it("HARD RULE: create_position ONLY from a human-confirmed gap", () => {
    // Same shortfall, unconfirmed → NO create_position.
    const suggested = assessCapacity(
      [requirement({ status: "suggested" })],
      supply(),
      { entries },
    );
    expect(
      recommendActions(suggested).some((a) => a.type === "create_position"),
    ).toBe(false);

    const edited = assessCapacity([requirement({ status: "edited" })], supply(), {
      entries,
    });
    expect(
      recommendActions(edited).some((a) => a.type === "create_position"),
    ).toBe(false);

    // Confirmed + shortfall → create_position with evidence.
    const confirmed = assessCapacity(
      [requirement({ status: "confirmed" })],
      supply(),
      { entries },
    );
    const create = recommendActions(confirmed).find(
      (a) => a.type === "create_position",
    );
    expect(create).toBeTruthy();
    expect(create!.evidence.shortfall).toBe(2);

    // Confirmed but NO shortfall → no create_position either.
    const covered = assessCapacity(
      [requirement({ status: "confirmed" })],
      supply({ workers: [worker(), worker({ workerId: "w2" })] }),
      { entries },
    );
    expect(
      recommendActions(covered).some((a) => a.type === "create_position"),
    ).toBe(false);
  });

  it(`engage_staffing_agency on big shortfalls (>= ${AGENCY_SHORTFALL_THRESHOLD} or >= half)`, () => {
    const big = assessCapacity([requirement({ headcount: 6 })], supply(), { entries });
    expect(
      recommendActions(big).some((a) => a.type === "engage_staffing_agency"),
    ).toBe(true);

    // 1 short of 4 (25%, < 5 heads and < half) → no agency suggestion.
    const small = assessCapacity(
      [requirement({ headcount: 4 })],
      supply({
        workers: [worker(), worker({ workerId: "w2" }), worker({ workerId: "w3" })],
      }),
      { entries },
    );
    expect(
      recommendActions(small).some((a) => a.type === "engage_staffing_agency"),
    ).toBe(false);
  });

  it("engage_partner when the demand itself expects an external partner", () => {
    const assessment = assessCapacity(
      [requirement({ partnerNeeded: true })],
      supply({ workers: [worker(), worker({ workerId: "w2" })] }),
      { entries },
    );
    expect(
      recommendActions(assessment).some((a) => a.type === "engage_partner"),
    ).toBe(true);
  });

  it("every action carries a reason and evidencing gap", () => {
    const assessment = assessCapacity(
      [requirement({ status: "confirmed", headcount: 6, partnerNeeded: true })],
      supply({ workers: [worker()] }),
      { entries },
    );
    for (const action of recommendActions(assessment)) {
      expect(action.reason.length).toBeGreaterThan(0);
      expect(action.requirementId).toBe("demand:d1#crew#concrete_worker");
      expect(action.entryId).toBe("demand:d1");
      expect(action.evidence.gapKind).toBeTruthy();
    }
  });
});
