import { describe, expect, it } from "vitest";

import { matchWorkerToNeed, type MatchNeed, type MatchSubject } from "@/lib/market/match-v1";
import { requirementsForContext, readinessScopeFor } from "./context-requirements";
import {
  deriveItemState,
  deriveReadiness,
  type ReadinessRecord,
  type ReadinessRequirement,
} from "./readiness-model";
import { attachReadiness } from "./with-readiness";

const NOW = new Date("2026-10-08T12:00:00Z");

const REQ: ReadinessRequirement = {
  requirementType: "a1_certificate",
  level: "required",
  stage: "mobilisation",
  context: { country: "DE", scope: "worker_posted" },
  provenance: "country_matrix",
};

const rec = (over: Partial<ReadinessRecord> = {}): ReadinessRecord => ({
  requirementType: "a1_certificate",
  storedStatus: "ready",
  validUntil: "2027-06-30",
  verification: "unverified",
  ...over,
});

const st = (record: ReadinessRecord | null, currentStage: Parameters<typeof deriveItemState>[0]["currentStage"] = null, readable = true) =>
  deriveItemState({ requirement: REQ, record, recordsReadable: readable, now: NOW, currentStage });

describe("readiness states (decision 0021)", () => {
  it("nothing recorded before the stage is `required`, never `missing`", () => {
    expect(st(null)).toBe("required");
    expect(st(null, "contract")).toBe("required");
  });
  it("`missing` only once the stage is reached AND records were readable", () => {
    expect(st(null, "mobilisation")).toBe("missing");
    expect(st(null, "work_start")).toBe("missing");
    expect(st(null, "mobilisation", false)).toBe("required");
  });
  it("maps declared / pending / verified / rejected / expiry", () => {
    expect(st(rec())).toBe("declared_available");
    expect(st(rec({ verification: "pending" }))).toBe("needs_check");
    expect(st(rec({ verification: "verified", checkedBy: "u", checkedAt: "2026-10-01" }))).toBe("checked");
    expect(st(rec({ verification: "rejected" }))).toBe("missing");
    expect(st(rec({ storedStatus: "blocked" }))).toBe("missing");
    expect(st(rec({ validUntil: "2026-10-20" }))).toBe("expiring");
    expect(st(rec({ validUntil: "2026-01-01", verification: "verified" }))).toBe("expired");
  });
  it("recommended with no record is not_required; conditional with no record is unknown; uncheckable is unknown", () => {
    expect(deriveItemState({ requirement: { ...REQ, level: "recommended" }, record: null, recordsReadable: true, now: NOW, currentStage: null })).toBe("not_required");
    expect(deriveItemState({ requirement: { ...REQ, level: "conditional" }, record: null, recordsReadable: true, now: NOW, currentStage: null })).toBe("unknown");
    expect(deriveItemState({ requirement: { ...REQ, notMachineCheckable: true }, record: null, recordsReadable: true, now: NOW, currentStage: "work_start" })).toBe("unknown");
  });
});

describe("requirement set is derived, never universal", () => {
  it("unknown jurisdiction/scope => null => summary `unknown`, never missing", () => {
    expect(requirementsForContext({ workCountry: "GE", personCountry: "LT" })).toBeNull();
    expect(requirementsForContext({ workCountry: "DE", personCountry: null })).toBeNull();
    expect(readinessScopeFor("DE", "LT")).toBe("worker_posted");
    expect(readinessScopeFor("DE", "DE")).toBe("worker_solo");
    const s = deriveReadiness({ requirements: null, records: [], recordsReadable: false, now: NOW });
    expect(s.status).toBe("unknown");
    expect(s.outstanding).toBe(0);
  });
  it("a posted worker into DE gets matrix-derived pre-start checks with a nextStage", () => {
    const reqs = requirementsForContext({ workCountry: "DE", personCountry: "LT" });
    expect(reqs).not.toBeNull();
    const s = deriveReadiness({ requirements: reqs, records: [], recordsReadable: false, now: NOW });
    expect(s.status === "checks_outstanding" || s.status === "unknown").toBe(true);
    expect(s.items.every((i) => i.state !== "missing")).toBe(true);
    expect(s.items.every((i) => i.recorded === false)).toBe(true);
  });
});

describe("READINESS NEVER CHANGES FIT (before/after proof)", () => {
  const need: MatchNeed = { skillIds: ["tiling", "waterproofing"], country: "DE", professionSlug: "tiler" };
  const subject: MatchSubject = {
    skills: [
      { uri: "tiling", evidence: "manager_confirmed" },
      { uri: "waterproofing", evidence: "work_journal" },
    ],
    professionSlug: "tiler",
    country: "LT",
    availabilityStatus: "available",
  };
  const base = matchWorkerToNeed(need, subject);

  it("attaching a readiness block with outstanding checks leaves every fit field identical", () => {
    const withChecks = attachReadiness(
      base,
      deriveReadiness({ requirements: requirementsForContext({ workCountry: "DE", personCountry: "LT" }), records: [], recordsReadable: false, now: NOW }),
    );
    const clear = attachReadiness(
      base,
      deriveReadiness({
        requirements: [REQ],
        records: [rec({ verification: "verified" })],
        recordsReadable: true,
        now: NOW,
      }),
    );
    const { readiness: r1, ...fit1 } = withChecks;
    const { readiness: r2, ...fit2 } = clear;
    expect(fit1).toEqual(base);
    expect(fit2).toEqual(base);
    expect(withChecks.status).toBe(clear.status);
    expect(r1).toBeDefined();
    expect(r2?.status).toBe("clear");
    expect(r1?.status).not.toBe(r2?.status);
  });

  it("matchWorkerToNeed itself never produces a readiness block", () => {
    expect(base.readiness).toBeUndefined();
  });
});
