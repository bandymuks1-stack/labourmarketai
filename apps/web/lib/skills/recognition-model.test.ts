import { describe, expect, it } from "vitest";

import {
  ASSESSOR_ROLES,
  DEMONSTRATION_FLOOR_ENTRIES,
  RECOGNITION_STANDINGS,
  assessorRefusal,
  deriveRecognitionStanding,
  type AssessorCheck,
  type StandingInput,
} from "./recognition-model";

/**
 * SKL-9 — the five states of SEP-6 and the one authority rule.
 *
 * The rule under test: real work can make a person DEMONSTRATED, never
 * RECOGNISED; only an independent assessor can make them RECOGNISED; only the
 * credential itself makes them VALID; and no beneficiary — the subject, or an
 * organization that engages them — may be the assessor.
 */

const today = "2026-09-15";
const base: StandingInput = {
  target: { kind: "document_type", slug: "welding-licence" },
  evidence: { confirmedEntries: 0, selfReportedEntries: 0, confirmedHours: null },
  credentials: [],
  recognitions: [],
  today,
};

describe("deriveRecognitionStanding — five states, no collapse", () => {
  it("names the five states of SEP-6 and never a sixth", () => {
    expect([...RECOGNITION_STANDINGS]).toEqual([
      "missing_requirement",
      "demonstrated_capability",
      "formal_qualification",
      "recognised_equivalence",
      "valid_credential",
    ]);
  });

  it("nothing → MISSING REQUIREMENT, with nothing to assess", () => {
    const r = deriveRecognitionStanding(base);
    expect(r.standing).toBe("missing_requirement");
    expect(r.basis).toEqual({ kind: "nothing" });
    expect(r.assessable).toBe(false);
  });

  it("confirmed real work → DEMONSTRATED CAPABILITY — never recognised, never valid", () => {
    const r = deriveRecognitionStanding({
      ...base,
      evidence: { confirmedEntries: 12, selfReportedEntries: 40, confirmedHours: 96 },
    });
    expect(r.standing).toBe("demonstrated_capability");
    expect(r.basis).toEqual({ kind: "demonstration", confirmedEntries: 12, confirmedHours: 96 });
    expect(r.assessable).toBe(true);
  });

  it("self-reported entries alone do not demonstrate anything (SKL-3)", () => {
    const r = deriveRecognitionStanding({
      ...base,
      evidence: { confirmedEntries: 0, selfReportedEntries: 200, confirmedHours: null },
    });
    expect(r.standing).toBe("missing_requirement");
  });

  it("below the floor, demonstrated but not yet assessable", () => {
    const r = deriveRecognitionStanding({
      ...base,
      evidence: { confirmedEntries: DEMONSTRATION_FLOOR_ENTRIES - 1, selfReportedEntries: 0, confirmedHours: 8 },
    });
    expect(r.standing).toBe("demonstrated_capability");
    expect(r.assessable).toBe(false);
  });

  it("a current recognition by an assessor → RECOGNISED EQUIVALENCE, above demonstration", () => {
    const r = deriveRecognitionStanding({
      ...base,
      evidence: { confirmedEntries: 12, selfReportedEntries: 0, confirmedHours: 96 },
      recognitions: [
        { id: "rec-1", decision: "recognised", validFrom: "2026-01-01", validUntil: "2027-01-01", assessorOrganizationId: "inst" },
      ],
    });
    expect(r.standing).toBe("recognised_equivalence");
    expect(r.basis).toEqual({ kind: "recognition", recognitionId: "rec-1", validUntil: "2027-01-01" });
  });

  it("a revoked or not-recognised decision changes nothing", () => {
    for (const decision of ["revoked", "not_recognised"] as const) {
      const r = deriveRecognitionStanding({
        ...base,
        evidence: { confirmedEntries: 5, selfReportedEntries: 0, confirmedHours: null },
        recognitions: [{ id: "rec-x", decision, validFrom: null, validUntil: null, assessorOrganizationId: "inst" }],
      });
      expect(r.standing).toBe("demonstrated_capability");
    }
  });

  it("a lapsed recognition is reported as lapsed, not as never", () => {
    const r = deriveRecognitionStanding({
      ...base,
      recognitions: [
        { id: "rec-old", decision: "recognised", validFrom: "2024-01-01", validUntil: "2025-01-01", assessorOrganizationId: "inst" },
      ],
    });
    expect(r.standing).toBe("missing_requirement");
    expect(r.lapsed).toEqual([{ kind: "recognition", until: "2025-01-01" }]);
  });

  it("the credential itself → VALID CREDENTIAL, above everything", () => {
    const r = deriveRecognitionStanding({
      ...base,
      evidence: { confirmedEntries: 12, selfReportedEntries: 0, confirmedHours: 96 },
      credentials: [{ documentTypeSlug: "welding-licence", validUntil: "2028-01-01" }],
      recognitions: [
        { id: "rec-1", decision: "recognised", validFrom: null, validUntil: null, assessorOrganizationId: "inst" },
      ],
    });
    expect(r.standing).toBe("valid_credential");
    expect(r.assessable).toBe(false);
  });

  it("an expired credential falls through — and is remembered as lapsed", () => {
    const r = deriveRecognitionStanding({
      ...base,
      evidence: { confirmedEntries: 4, selfReportedEntries: 0, confirmedHours: null },
      credentials: [{ documentTypeSlug: "welding-licence", validUntil: "2025-06-01" }],
    });
    expect(r.standing).toBe("demonstrated_capability");
    expect(r.lapsed).toEqual([{ kind: "credential", until: "2025-06-01" }]);
  });

  it("a credential for a DIFFERENT document type is not this credential", () => {
    const r = deriveRecognitionStanding({
      ...base,
      credentials: [{ documentTypeSlug: "forklift-licence", validUntil: null }],
    });
    expect(r.standing).toBe("missing_requirement");
  });

  it("never emits formal_qualification — a state nothing can evidence is not emitted (SEP-7)", () => {
    const inputs: StandingInput[] = [
      base,
      { ...base, evidence: { confirmedEntries: 9, selfReportedEntries: 0, confirmedHours: 1 } },
      { ...base, credentials: [{ documentTypeSlug: "welding-licence", validUntil: null }] },
    ];
    for (const i of inputs) expect(deriveRecognitionStanding(i).standing).not.toBe("formal_qualification");
  });
});

describe("assessorRefusal — the one authority rule", () => {
  const ok: AssessorCheck = {
    assessorOrganizationId: "inst",
    assessorRoles: ["training_provider"],
    actorManagesAssessor: true,
    actorProfileId: "assessor-person",
    subjectProfileId: "subject",
    subjectEngagedByOrganizationIds: ["employer-a"],
  };

  it("an independent training provider, managed by the actor, may assess", () => {
    expect(assessorRefusal(ok)).toBeNull();
    expect([...ASSESSOR_ROLES]).toEqual(["training_provider"]);
  });

  it("an organization without an assessor role may not", () => {
    expect(assessorRefusal({ ...ok, assessorRoles: ["employer", "staffing_agency"] })).toBe("not_an_assessor_role");
  });

  it("a person who does not manage the assessor may not act for it", () => {
    expect(assessorRefusal({ ...ok, actorManagesAssessor: false })).toBe("actor_does_not_manage_assessor");
  });

  it("nobody recognises themselves", () => {
    expect(assessorRefusal({ ...ok, actorProfileId: "subject" })).toBe("self_recognition");
  });

  it("a beneficiary — any organization that engages the subject — may not, however many roles it holds", () => {
    expect(
      assessorRefusal({
        ...ok,
        assessorRoles: ["training_provider", "employer"],
        subjectEngagedByOrganizationIds: ["inst", "employer-a"],
      }),
    ).toBe("beneficiary_organization");
  });
});
