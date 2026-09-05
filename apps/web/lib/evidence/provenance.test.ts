import { describe, expect, it } from "vitest";

import {
  deriveProvenance,
  provenanceTextKey,
  provenanceTextParams,
  strongestProvenance,
  PROVENANCE_UNREADABLE_CONFIRMER,
  type ProvenanceConfirmation,
} from "./provenance";

/**
 * Provenance truth table (frozen design §2.9 / §5 P6; design system M).
 * Every class must come from a REAL row shape; nothing may inflate.
 */

const approved = (
  org: string | null,
  at: string,
  extra: Partial<ProvenanceConfirmation> = {},
): ProvenanceConfirmation => ({
  confirmation_scope: { decision: "approved" },
  created_at: at,
  confirmer_role: "manager",
  organizationName: org,
  ...extra,
});

const rejected = (org: string | null, at: string): ProvenanceConfirmation => ({
  confirmation_scope: { decision: "rejected" },
  created_at: at,
  confirmer_role: "manager",
  organizationName: org,
});

const fmt = { date: (iso: string) => iso.slice(0, 10) };

describe("deriveProvenance — truth table", () => {
  it("nothing recorded → SELF_DECLARED ('iš CV, nepatvirtinta')", () => {
    const p = deriveProvenance({});
    expect(p).toEqual({ class: "SELF_DECLARED" });
    expect(provenanceTextKey(p)).toBe("selfDeclared");
    expect(provenanceTextParams(p, fmt)).toEqual({});
  });

  it("a self_declared skill row with no evidence stays SELF_DECLARED", () => {
    expect(deriveProvenance({ skill: { verified: false, source: "self_declared" } }).class).toBe(
      "SELF_DECLARED",
    );
    expect(deriveProvenance({ skill: { verified: null, source: null } }).class).toBe(
      "SELF_DECLARED",
    );
  });

  it("journal entries linked to the subject → EVIDENCE_SUPPORTED with the count", () => {
    const p = deriveProvenance({ journalEntries: 14 });
    expect(p).toEqual({ class: "EVIDENCE_SUPPORTED", journalEntries: 14, validUntil: null });
    expect(provenanceTextKey(p)).toBe("evidenceEntries");
    expect(provenanceTextParams(p, fmt)).toEqual({ count: 14 });
  });

  it("a work_journal-tier skill row → EVIDENCE_SUPPORTED even with 0 counted links — 'backed by records', never '0 entries'", () => {
    const p = deriveProvenance({ skill: { verified: false, source: "work_journal" } });
    expect(p.class).toBe("EVIDENCE_SUPPORTED");
    expect(provenanceTextKey(p)).toBe("evidenceRecorded");
    expect(provenanceTextParams(p, fmt)).toEqual({ count: 0 });
  });

  it("a recorded document WITHOUT a validity date → EVIDENCE_SUPPORTED, 'backed by records'", () => {
    const p = deriveProvenance({ document: { validUntil: null } });
    expect(p).toEqual({ class: "EVIDENCE_SUPPORTED", journalEntries: 0, validUntil: null });
    expect(provenanceTextKey(p)).toBe("evidenceRecorded");
  });

  it("a recorded document → EVIDENCE_SUPPORTED with 'sertifikatas iki …'", () => {
    const p = deriveProvenance({ document: { validUntil: "2027-03-01" } });
    expect(p).toEqual({ class: "EVIDENCE_SUPPORTED", journalEntries: 0, validUntil: "2027-03-01" });
    expect(provenanceTextKey(p)).toBe("evidenceDocument");
    expect(provenanceTextParams(p, fmt)).toEqual({ count: 0, until: "2027-03-01" });
  });

  it("entries AND a document → the combined text key", () => {
    const p = deriveProvenance({ journalEntries: 3, document: { validUntil: "2027-03-01" } });
    expect(provenanceTextKey(p)).toBe("evidenceEntriesAndDocument");
  });

  it("an approved confirmation with a readable org → EMPLOYER_CONFIRMED 'patvirtino <org>, <date>'", () => {
    const p = deriveProvenance({
      confirmations: [approved("E2E Walker UAB", "2026-09-05T10:00:00Z")],
      journalEntries: 1,
    });
    expect(p).toEqual({
      class: "EMPLOYER_CONFIRMED",
      confirmedBy: "E2E Walker UAB",
      confirmedAt: "2026-09-05T10:00:00Z",
    });
    expect(provenanceTextKey(p)).toBe("employerConfirmed");
    expect(provenanceTextParams(p, fmt)).toEqual({ org: "E2E Walker UAB", date: "2026-09-05" });
  });

  it("confirmation WITHOUT a readable org → EMPLOYER_CONFIRMED with the dash, never a fake name", () => {
    const p = deriveProvenance({ confirmations: [approved(null, "2026-09-05T10:00:00Z")] });
    expect(p.class).toBe("EMPLOYER_CONFIRMED");
    if (p.class !== "EMPLOYER_CONFIRMED") throw new Error("unreachable");
    expect(p.confirmedBy).toBeNull();
    const params = provenanceTextParams(p, fmt);
    expect(params.org).toBe(PROVENANCE_UNREADABLE_CONFIRMER);
    expect(params.org).toBe("—");
    // A whitespace-only name is not a name either.
    const blank = deriveProvenance({ confirmations: [approved("   ", "2026-09-05T10:00:00Z")] });
    expect(blank.class === "EMPLOYER_CONFIRMED" && blank.confirmedBy).toBeNull();
  });

  it("the newest APPROVING row names the confirmer and the time (latest-wins)", () => {
    const p = deriveProvenance({
      confirmations: [
        approved("Old UAB", "2026-01-01T00:00:00Z"),
        approved("New UAB", "2026-09-05T00:00:00Z"),
      ],
    });
    expect(p).toEqual({
      class: "EMPLOYER_CONFIRMED",
      confirmedBy: "New UAB",
      confirmedAt: "2026-09-05T00:00:00Z",
    });
  });

  it("a rejection AFTER an approval is NOT employer-confirmed (the journal's latest-wins rule)", () => {
    const p = deriveProvenance({
      confirmations: [
        approved("E2E Walker UAB", "2026-09-01T00:00:00Z"),
        rejected("E2E Walker UAB", "2026-09-05T00:00:00Z"),
      ],
      journalEntries: 2,
    });
    expect(p.class).toBe("EVIDENCE_SUPPORTED");
  });

  it("only a rejection → not confirmed and not evidence unless entries exist", () => {
    expect(deriveProvenance({ confirmations: [rejected("X", "2026-09-05T00:00:00Z")] }).class).toBe(
      "SELF_DECLARED",
    );
  });

  it("worker_skills.verified === true → EMPLOYER_CONFIRMED (tier ladder top rung), dash without a row", () => {
    const p = deriveProvenance({ skill: { verified: true, source: "self_declared" } });
    expect(p).toEqual({ class: "EMPLOYER_CONFIRMED", confirmedBy: null, confirmedAt: null });
    expect(provenanceTextKey(p)).toBe("employerConfirmedNoDate");
    expect(provenanceTextParams(p, fmt)).toEqual({ org: "—" });
  });

  it("a manager_confirmed SOURCE without the verified flag never inflates (tier ladder rule)", () => {
    expect(
      deriveProvenance({ skill: { verified: false, source: "manager_confirmed" } }).class,
    ).toBe("SELF_DECLARED");
  });

  it("a derived value is SYSTEM_DERIVED whatever backs its inputs — 'išvesta iš …'", () => {
    const p = deriveProvenance({
      derivedFrom: "requirement-ledger",
      confirmations: [approved("E2E Walker UAB", "2026-09-05T00:00:00Z")],
      journalEntries: 9,
    });
    expect(p).toEqual({ class: "SYSTEM_DERIVED", derivedFrom: "requirement-ledger" });
    expect(provenanceTextKey(p)).toBe("systemDerived");
    expect(provenanceTextParams(p, { ...fmt, source: (s) => `[${s}]` })).toEqual({
      source: "[requirement-ledger]",
    });
    expect(provenanceTextParams(p, fmt)).toEqual({ source: "requirement-ledger" });
  });

  it("negative inputs never produce a negative count", () => {
    const p = deriveProvenance({ journalEntries: -4, skill: { source: "work_journal" } });
    expect(p.class === "EVIDENCE_SUPPORTED" && p.journalEntries).toBe(0);
  });
});

describe("strongestProvenance — the person's edge is the strongest REAL class", () => {
  it("confirmed beats evidence beats self-declared; a derivation is skipped", () => {
    expect(
      strongestProvenance([
        { class: "SELF_DECLARED" },
        { class: "SYSTEM_DERIVED", derivedFrom: "x" },
        { class: "EVIDENCE_SUPPORTED", journalEntries: 2, validUntil: null },
      ]).class,
    ).toBe("EVIDENCE_SUPPORTED");
    expect(
      strongestProvenance([
        { class: "EVIDENCE_SUPPORTED", journalEntries: 2, validUntil: null },
        { class: "EMPLOYER_CONFIRMED", confirmedBy: "E2E Walker UAB", confirmedAt: "2026-09-05" },
      ]).class,
    ).toBe("EMPLOYER_CONFIRMED");
  });
  it("an empty list is SELF_DECLARED — never invented upwards", () => {
    expect(strongestProvenance([])).toEqual({ class: "SELF_DECLARED" });
    expect(strongestProvenance([{ class: "SYSTEM_DERIVED", derivedFrom: "x" }])).toEqual({
      class: "SELF_DECLARED",
    });
  });
});
