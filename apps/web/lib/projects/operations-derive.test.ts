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
    operationalStatus: null,
    readinessItems: [],
    docsMissing: 0,
    docsReceived: 0,
    docsChecked: 0,
    docsBlocked: 0,
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
      byOperationalStatus: {
        candidate: 0,
        contacted: 0,
        interested: 0,
        documents_needed: 0,
        ready: 0,
        assigned: 0,
        unavailable: 0,
        rejected: 0,
      },
      withMissingDocs: 0,
      docsMissing: 0,
      docsReceived: 0,
      docsChecked: 0,
      docsBlocked: 0,
    });
  });

  it("never reports a negative instructions count", () => {
    expect(deriveOpsCounters([], -3).instructionsSent).toBe(0);
  });
});

describe("v2 — manager-set status + checklist are carried through honestly", () => {
  it("operational status passes through verbatim and is null when unset", () => {
    expect(deriveWorkerOps(base).operationalStatus).toBeNull();
    expect(
      deriveWorkerOps({ ...base, operationalStatus: "documents_needed" }).operationalStatus,
    ).toBe("documents_needed");
  });

  it("does NOT let a manager-set 'ready' status override derived readiness", () => {
    // operationalStatus 'ready' is a manager assertion; derived `ready` still
    // reflects only the checked fields (here: missing skills + evidence).
    const r = deriveWorkerOps({ ...base, operationalStatus: "ready" });
    expect(r.operationalStatus).toBe("ready");
    expect(r.ready).toBe(false);
  });

  it("rolls checklist item statuses into honest counts", () => {
    const r = deriveWorkerOps({
      ...base,
      readinessItems: [
        { itemKey: "id", label: "ID", status: "needed", note: null },
        { itemKey: "a1", label: "A1", status: "missing", note: null },
        { itemKey: "contract", label: "Contract", status: "received", note: null },
        { itemKey: "safety", label: "Safety", status: "checked", note: null },
        { itemKey: "qual", label: "Qual", status: "expired", note: null },
        { itemKey: "client", label: "Client", status: "not_required", note: null },
      ],
    });
    expect(r.docsMissing).toBe(2); // needed + missing
    expect(r.docsReceived).toBe(1);
    expect(r.docsChecked).toBe(1);
    expect(r.docsBlocked).toBe(1); // expired (rejected would also count)
  });

  it("counts workers per operational status and with-missing-docs", () => {
    const mkw = (over: Partial<WorkerOps>): WorkerOps => ({
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
      operationalStatus: null,
      readinessItems: [],
      docsMissing: 0,
      docsReceived: 0,
      docsChecked: 0,
      docsBlocked: 0,
      ...over,
    });
    const c = deriveOpsCounters(
      [
        mkw({ operationalStatus: "ready" }),
        mkw({ operationalStatus: "documents_needed", docsMissing: 2 }),
        mkw({ operationalStatus: "documents_needed", docsMissing: 1 }),
        mkw({ operationalStatus: null }),
      ],
      0,
    );
    expect(c.byOperationalStatus.ready).toBe(1);
    expect(c.byOperationalStatus.documents_needed).toBe(2);
    expect(c.byOperationalStatus.candidate).toBe(0);
    expect(c.withMissingDocs).toBe(2);
    expect(c.docsMissing).toBe(3);
  });
});
