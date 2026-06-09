import { describe, expect, it } from "vitest";

import {
  deriveOpsCounters,
  deriveWorkerOps,
  type WorkerOps,
  type WorkerOpsInput,
} from "@/lib/projects/operations-derive";

/**
 * Pilot Operations Launch v1 — honesty of the derived readiness/counters.
 *
 * "Ready" must reflect ONLY the fields actually checked; nothing here may invent
 * verification, document approval, or AI judgement. Counters must be exact rolls
 * of the per-worker rows.
 */

const base: WorkerOpsInput = {
  workerId: "w1",
  workerProfileId: "p1",
  name: "Jonas",
  hasRealName: true,
  assignedAt: "2026-06-01T00:00:00Z",
  readiness: {
    journalEntries: 0,
    declaredSkills: 0,
    confirmedSkills: 0,
    openReviewItems: 0,
    lastActivity: null,
  },
};

describe("deriveWorkerOps — honest readiness", () => {
  it("is ready ONLY when name + declared skill + work evidence are all present", () => {
    const ready = deriveWorkerOps({
      ...base,
      readiness: { ...base.readiness, declaredSkills: 2, journalEntries: 1, lastActivity: "x" },
    });
    expect(ready.ready).toBe(true);
    expect(ready.missing).toEqual([]);
  });

  it("is NOT ready when any checked field is missing, and lists the real reasons", () => {
    const r = deriveWorkerOps(base);
    expect(r.ready).toBe(false);
    expect(r.missing).toContain("declared_skills");
    expect(r.missing).toContain("work_evidence");
  });

  it("flags a missing name honestly (id fallback is not a real name)", () => {
    const r = deriveWorkerOps({
      ...base,
      hasRealName: false,
      readiness: { ...base.readiness, declaredSkills: 1, journalEntries: 1, lastActivity: "x" },
    });
    expect(r.missing).toContain("name");
    expect(r.ready).toBe(false);
  });

  it("marks needs-follow-up only when there is genuinely no activity", () => {
    expect(deriveWorkerOps(base).needsFollowUp).toBe(true);
    expect(
      deriveWorkerOps({ ...base, readiness: { ...base.readiness, lastActivity: "2026-06-02" } })
        .needsFollowUp,
    ).toBe(false);
  });

  it("passes counts straight through (no inflation)", () => {
    const r = deriveWorkerOps({
      ...base,
      readiness: {
        journalEntries: 3,
        declaredSkills: 4,
        confirmedSkills: 1,
        openReviewItems: 2,
        lastActivity: "x",
      },
    });
    expect(r.journalEntries).toBe(3);
    expect(r.declaredSkills).toBe(4);
    expect(r.confirmedSkills).toBe(1);
    expect(r.openReviewItems).toBe(2);
  });
});

describe("deriveOpsCounters — exact rolls", () => {
  const mk = (over: Partial<WorkerOps>): WorkerOps => ({
    workerId: "w",
    workerProfileId: "p",
    name: "n",
    assignedAt: "t",
    journalEntries: 0,
    declaredSkills: 0,
    confirmedSkills: 0,
    openReviewItems: 0,
    lastActivity: null,
    ready: false,
    missing: [],
    needsFollowUp: false,
    ...over,
  });

  it("counts ready / missing / follow-up exactly", () => {
    const workers = [
      mk({ ready: true }),
      mk({ ready: false, missing: ["declared_skills"] }),
      mk({ ready: false, missing: ["work_evidence"], needsFollowUp: true }),
    ];
    const c = deriveOpsCounters(workers, 5);
    expect(c.totalAssigned).toBe(3);
    expect(c.ready).toBe(1);
    expect(c.needsDeclaredSkills).toBe(1);
    expect(c.needsEvidence).toBe(1);
    expect(c.needsFollowUp).toBe(1);
    expect(c.instructionsSent).toBe(5);
  });

  it("an empty project yields all-zero counters (no fabricated minimums)", () => {
    const c = deriveOpsCounters([], 0);
    expect(c).toEqual({
      totalAssigned: 0,
      ready: 0,
      needsDeclaredSkills: 0,
      needsEvidence: 0,
      needsFollowUp: 0,
      openReviewItems: 0,
      instructionsSent: 0,
    });
  });

  it("never reports a negative instructions count", () => {
    expect(deriveOpsCounters([], -3).instructionsSent).toBe(0);
  });
});
