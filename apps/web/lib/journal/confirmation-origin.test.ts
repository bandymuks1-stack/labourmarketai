import { describe, expect, it } from "vitest";

import {
  authorityBasisOf,
  conceptOfApprovalRow,
  deriveProofConcepts,
  originOf,
  provenanceViolations,
} from "@/lib/journal/confirmation-origin";
import { deriveProvenance } from "@/lib/evidence/provenance";

const SUBJECT = "subject";
const employer = (id = "boss", at = "2026-10-01T10:00:00Z") => ({
  confirmer_id: id,
  created_at: at,
  confirmation_scope: {
    action: "confirm",
    decision: "approved",
    authority: { basis: "employer" },
    provenance: { origin: "NATIVE_PLATFORM_EMPLOYER_CONFIRMATION" },
  },
});
const client = (decision: "approved" | "rejected" | "changes_requested", at: string) => ({
  confirmer_id: "client-rep",
  created_at: at,
  confirmation_scope: {
    action: { approved: "client_accept", rejected: "client_dispute", changes_requested: "client_request_correction" }[decision],
    decision,
    authority: { basis: "counterparty" },
    provenance: { origin: "NATIVE_PLATFORM_CLIENT_CONFIRMATION" },
  },
});
const legacySelf = {
  confirmer_id: SUBJECT,
  created_at: "2026-06-16T10:00:00Z",
  confirmation_scope: { action: "confirm", decision: "approved" },
};

describe("origin + basis classification", () => {
  it("rows that predate the fields are employer-path, LEGACY_UNCLASSIFIED, never rewritten", () => {
    expect(authorityBasisOf(legacySelf)).toBe("employer");
    expect(originOf(legacySelf)).toBe("LEGACY_UNCLASSIFIED");
  });
  it("native client rows classify as counterparty", () => {
    const r = client("approved", "2026-10-02T00:00:00Z");
    expect(authorityBasisOf(r)).toBe("counterparty");
    expect(originOf(r)).toBe("NATIVE_PLATFORM_CLIENT_CONFIRMATION");
  });
  it("unknown origin strings fall to LEGACY_UNCLASSIFIED, never inflated", () => {
    expect(
      originOf({ confirmation_scope: { provenance: { origin: "TRUST_ME" } } }),
    ).toBe("LEGACY_UNCLASSIFIED");
  });
});

describe("distinct proof concepts, never one verified boolean", () => {
  it("a subject's own legacy self-confirmation is SELF_DECLARED, not EMPLOYER_CONFIRMED", () => {
    expect(conceptOfApprovalRow(legacySelf, SUBJECT)).toBe("SELF_DECLARED");
    expect(deriveProofConcepts({ confirmations: [legacySelf], subjectProfileId: SUBJECT })).toEqual(["SELF_DECLARED"]);
  });
  it("employer and client acceptance are different concepts and neither implies the other", () => {
    const e = deriveProofConcepts({ confirmations: [employer()], subjectProfileId: SUBJECT });
    const c = deriveProofConcepts({ confirmations: [client("approved", "2026-10-02T00:00:00Z")], subjectProfileId: SUBJECT });
    expect(e).toContain("EMPLOYER_CONFIRMED");
    expect(e).not.toContain("CLIENT_ACCEPTED");
    expect(c).toContain("CLIENT_ACCEPTED");
    expect(c).not.toContain("EMPLOYER_CONFIRMED");
  });
  it("INDEPENDENTLY_VERIFIED is never derived from journal rows, only supplied from the evidence side", () => {
    expect(
      deriveProofConcepts({ confirmations: [employer(), client("approved", "2026-10-02T00:00:00Z")], subjectProfileId: SUBJECT }),
    ).not.toContain("INDEPENDENTLY_VERIFIED");
    expect(deriveProofConcepts({ independentlyVerifiedEvidence: true })).toContain("INDEPENDENTLY_VERIFIED");
  });
  it("SUPERVISOR_CONFIRMED has no source yet and is never derived", () => {
    expect(
      deriveProofConcepts({ confirmations: [employer()], subjectProfileId: SUBJECT, journalEntries: 3 }),
    ).not.toContain("SUPERVISOR_CONFIRMED");
  });
  it("a later dispute withdraws the client concept; a later acceptance restores it (history stays)", () => {
    const rows = [client("approved", "2026-10-02T00:00:00Z"), client("rejected", "2026-10-03T00:00:00Z")];
    expect(deriveProofConcepts({ confirmations: rows, subjectProfileId: SUBJECT })).not.toContain("CLIENT_ACCEPTED");
    expect(
      deriveProofConcepts({ confirmations: [...rows, client("approved", "2026-10-04T00:00:00Z")], subjectProfileId: SUBJECT }),
    ).toContain("CLIENT_ACCEPTED");
  });
  it("journal entries add EVIDENCE_SUPPORTED, nothing stronger", () => {
    expect(deriveProofConcepts({ journalEntries: 2 })).toEqual(["SELF_DECLARED", "EVIDENCE_SUPPORTED"]);
  });
});

describe("a client acceptance never reads as an employer confirmation", () => {
  it("deriveProvenance keeps it out of EMPLOYER_CONFIRMED and flags clientAccepted", () => {
    const p = deriveProvenance({
      subjectProfileId: SUBJECT,
      journalEntries: 1,
      confirmations: [{ ...client("approved", "2026-10-02T00:00:00Z"), organizationName: "Client Ltd" }],
    });
    expect(p.class).toBe("EVIDENCE_SUPPORTED");
    expect(p).toMatchObject({ clientAccepted: true });
  });
  it("an employer confirmation still reaches EMPLOYER_CONFIRMED (nothing that worked stops working)", () => {
    const p = deriveProvenance({
      subjectProfileId: SUBJECT,
      confirmations: [{ ...employer(), organizationName: "Employer Ltd" }],
    });
    expect(p.class).toBe("EMPLOYER_CONFIRMED");
  });
});

describe("provenance invariants", () => {
  it("a native row has no importer", () => {
    expect(provenanceViolations({ origin: "NATIVE_PLATFORM_CLIENT_CONFIRMATION", imported_by: "x" })).not.toEqual([]);
    expect(provenanceViolations({ origin: "NATIVE_PLATFORM_CLIENT_CONFIRMATION", recorded_by: "rep" })).toEqual([]);
  });
  it("a reconstructed historical confirmation names an importer and never a platform confirmer", () => {
    expect(
      provenanceViolations({
        origin: "RECONSTRUCTED_HISTORICAL_CLIENT_CONFIRMATION",
        imported_by: "owner",
        imported_at: "2026-10-04T00:00:00Z",
      }),
    ).toEqual([]);
    expect(
      provenanceViolations({
        origin: "RECONSTRUCTED_HISTORICAL_CLIENT_CONFIRMATION",
        imported_by: "owner",
        imported_at: "2026-10-04T00:00:00Z",
        confirmed_by_profile_id: "owner",
      }).length,
    ).toBeGreaterThan(0);
    expect(provenanceViolations({ origin: "RECONSTRUCTED_HISTORICAL_CLIENT_CONFIRMATION" }).length).toBeGreaterThan(0);
  });
});
