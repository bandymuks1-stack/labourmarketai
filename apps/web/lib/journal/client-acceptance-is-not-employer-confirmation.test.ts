import { describe, expect, it } from "vitest";

import {
  countClientAcceptedEntries,
  isConfirmingScope,
  selectStandingConfirmations,
} from "@/lib/cv-export/confirmation-standing";
import { deriveProvenance, provenanceTextKey } from "@/lib/evidence/provenance";
import { deriveProofConcepts } from "./confirmation-origin";
import {
  deriveReviewOrigin,
  deriveReviewResult,
  deriveReviewTimeline,
} from "./review-status";

/**
 * D. READ-BACK: a CLIENT acceptance is CLIENT_ACCEPTED and nothing else.
 *
 * Every employer-facing reader (journal standing, verified CV "Confirmed Work
 * Proof", provenance gold class) must ignore counterparty-basis rows; the
 * client acceptance has its own line ("accepted by the client") and is never
 * a payment record.
 */
const employer = (decision: string, at: string, entry = "e1") => ({
  entry_id: entry,
  created_at: at,
  confirmer_id: "mgr",
  confirmer_role: "manager",
  confirmation_scope: {
    action: decision === "approved" ? "confirm" : "request_changes",
    decision,
    authority: { basis: "employer" },
    provenance: { origin: "NATIVE_PLATFORM_EMPLOYER_CONFIRMATION" },
  },
});
const client = (decision: string, at: string, entry = "e1") => ({
  entry_id: entry,
  created_at: at,
  confirmer_id: "rep",
  confirmer_role: "manager",
  confirmation_scope: {
    action:
      decision === "approved"
        ? "client_accept"
        : decision === "rejected"
          ? "client_dispute"
          : "client_request_correction",
    decision,
    authority: { basis: "counterparty" },
    provenance: { origin: "NATIVE_PLATFORM_CLIENT_CONFIRMATION" },
  },
});

describe("journal standing (employer review) ignores counterparty rows", () => {
  it("a client acceptance does not make the entry read as employer-approved", () => {
    expect(deriveReviewResult([client("approved", "2026-10-04T10:00:00Z")])).toBe("submitted");
    expect(deriveReviewOrigin([client("approved", "2026-10-04T10:00:00Z")])).toBeNull();
    expect(deriveReviewTimeline([client("approved", "2026-10-04T10:00:00Z")])).toEqual([]);
  });

  it("a client dispute does not retract an employer confirmation, and vice versa", () => {
    const rows = [employer("approved", "2026-10-01T10:00:00Z"), client("rejected", "2026-10-04T10:00:00Z")];
    expect(deriveReviewResult(rows)).toBe("approved");
    const rows2 = [client("approved", "2026-10-01T10:00:00Z"), employer("changes_requested", "2026-10-04T10:00:00Z")];
    expect(deriveReviewResult(rows2)).toBe("changes_requested");
  });

  it("legacy rows without an authority block remain employer rows", () => {
    expect(
      deriveReviewResult([{ confirmation_scope: { action: "confirm" }, created_at: "2026-09-01T00:00:00Z" }]),
    ).toBe("approved");
  });
});

describe("verified CV 'Confirmed Work Proof' (confirmation-standing)", () => {
  it("does not count a client acceptance as a confirmation", () => {
    expect(isConfirmingScope(client("approved", "x").confirmation_scope)).toBe(false);
    expect(selectStandingConfirmations([client("approved", "2026-10-04T10:00:00Z")])).toEqual([]);
  });

  it("an employer confirmation stands when a newer client dispute exists", () => {
    const rows = [employer("approved", "2026-10-01T10:00:00Z"), client("rejected", "2026-10-04T10:00:00Z")];
    expect(selectStandingConfirmations(rows)).toHaveLength(1);
  });

  it("counts 'accepted by the client' separately, latest decision wins, per entry", () => {
    const rows = [
      client("approved", "2026-10-01T10:00:00Z", "e1"),
      client("rejected", "2026-10-02T10:00:00Z", "e1"), // dispute withdraws it
      client("approved", "2026-10-03T10:00:00Z", "e2"),
      employer("approved", "2026-10-03T10:00:00Z", "e3"), // employer: not a client acceptance
    ];
    expect(countClientAcceptedEntries(rows)).toBe(1);
    expect(countClientAcceptedEntries([])).toBe(0);
  });
});

describe("provenance: CLIENT_ACCEPTED is distinct from EMPLOYER_CONFIRMED", () => {
  it("a client acceptance never reaches the gold employer class and has its own text", () => {
    const p = deriveProvenance({
      confirmations: [{ ...client("approved", "2026-10-04T10:00:00Z"), organizationName: "Client C" }],
      journalEntries: 1,
      subjectProfileId: "worker",
    });
    expect(p.class).toBe("EVIDENCE_SUPPORTED");
    expect(p).toMatchObject({ clientAccepted: true });
    expect(provenanceTextKey(p)).toBe("evidenceClientAccepted");
  });

  it("when BOTH exist the employer class wins and the client fact is not lost from proof concepts", () => {
    const rows = [
      { ...employer("approved", "2026-10-01T10:00:00Z"), organizationName: "Employer" },
      { ...client("approved", "2026-10-04T10:00:00Z"), organizationName: "Client C" },
    ];
    expect(deriveProvenance({ confirmations: rows, journalEntries: 1, subjectProfileId: "worker" }).class).toBe(
      "EMPLOYER_CONFIRMED",
    );
    const concepts = deriveProofConcepts({ confirmations: rows, subjectProfileId: "worker", journalEntries: 1 });
    expect(concepts).toContain("EMPLOYER_CONFIRMED");
    expect(concepts).toContain("CLIENT_ACCEPTED");
  });

  it("a client dispute withdraws CLIENT_ACCEPTED", () => {
    const concepts = deriveProofConcepts({
      confirmations: [client("approved", "2026-10-01T10:00:00Z"), client("rejected", "2026-10-02T10:00:00Z")],
      subjectProfileId: "worker",
    });
    expect(concepts).not.toContain("CLIENT_ACCEPTED");
  });
});
