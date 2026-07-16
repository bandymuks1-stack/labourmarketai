/**
 * Company scouting SAFE VIEW — behavioural unit tests (Step 3B).
 *
 * Proves the company-facing candidate is anonymized + profile-safe: it routes
 * through the Step 3A visibility policy, exposes no contact/name/private field,
 * counts only real evidence, and reports communication eligibility honestly.
 */
import { describe, expect, it } from "vitest";
import {
  toScoutSafeCandidate,
  countWorkerEvidence,
  anonymizedToken,
} from "./scout-safe-view";
import { isContactSafe } from "@/lib/visibility/worker-profile-visibility";
import type { MatchResultV1, MatchSubject } from "@/lib/market/match-v1";

const fakeMatch = { status: "possible" } as unknown as MatchResultV1;

const subject: MatchSubject = {
  skills: [
    { uri: "esco/a", evidence: "manager_confirmed" },
    { uri: "esco/b", evidence: "work_journal" },
    { uri: "esco/c", evidence: "self_declared" },
  ],
  professionSlug: "x",
  country: "LT",
  preferredCountries: ["NL", "DE"],
  availabilityStatus: "available",
  availableFrom: "2026-08-01",
  salaryMinEur: 18,
};

describe("toScoutSafeCandidate — anonymized + profile-safe", () => {
  const c = toScoutSafeCandidate({
    workerId: "11111111-2222-3333",
    professionSlug: "steel-fixer",
    subject,
    match: fakeMatch,
    shortlistStatus: null,
    lastActiveBucket: "active",
  });

  it("exposes only the profile-safe preview (no name/contact/private key)", () => {
    expect(isContactSafe(c.preview as unknown as Record<string, unknown>)).toBe(true);
    const keys = Object.keys(c.preview);
    // No contact/private key is ever part of the shape.
    for (const forbidden of ["displayName", "name", "email", "phone", "bio", "profileText"]) {
      expect(keys).not.toContain(forbidden);
    }
    // `headline` is a Step 3A-allowed non-contact field but we intentionally
    // never populate it for scouting — it stays null (no free-text leak).
    expect(c.preview.headline).toBeNull();
  });

  it("carries the anonymized label, not a real identity", () => {
    expect(c.preview.kind).toBe("worker_shortlist_safe_preview");
    expect(c.preview.anonymizedLabel).toMatch(/^Candidate /);
  });

  it("maps the owner-approved profile-safe fields", () => {
    expect(c.preview.location).toBe("LT");
    expect(c.preview.availability).toBe("available");
    expect(c.preview.availableFrom).toBe("2026-08-01");
    expect(c.preview.rate.minEur).toBe(18);
    expect(c.preview.evidenceCount).toBe(2); // manager_confirmed + work_journal, NOT self
  });

  it("passes the deterministic match through untouched", () => {
    expect(c.match).toBe(fakeMatch);
  });

  it("carries the honest freshness bucket (non-PII) through", () => {
    expect(c.lastActiveBucket).toBe("active");
  });
});

describe("communication/booking eligibility (rule 6)", () => {
  it("eligible when worker is available", () => {
    const c = toScoutSafeCandidate({
      workerId: "w1",
      professionSlug: null,
      subject: { ...subject, availabilityStatus: "available", availableFrom: null },
      match: fakeMatch,
      shortlistStatus: null,
    lastActiveBucket: "active",
    });
    expect(c.canContact).toBe(true);
  });

  it("eligible when worker has an available-from date", () => {
    const c = toScoutSafeCandidate({
      workerId: "w2",
      professionSlug: null,
      subject: { ...subject, availabilityStatus: "busy", availableFrom: "2026-09-01" },
      match: fakeMatch,
      shortlistStatus: null,
    lastActiveBucket: "active",
    });
    expect(c.canContact).toBe(true);
  });

  it("NOT eligible when busy with no available-from date", () => {
    const c = toScoutSafeCandidate({
      workerId: "w3",
      professionSlug: null,
      subject: { ...subject, availabilityStatus: "busy", availableFrom: null },
      match: fakeMatch,
      shortlistStatus: null,
    lastActiveBucket: "active",
    });
    expect(c.canContact).toBe(false);
  });
});

describe("helpers", () => {
  it("countWorkerEvidence counts only manager_confirmed + work_journal", () => {
    expect(countWorkerEvidence(subject)).toBe(2);
    expect(countWorkerEvidence({ ...subject, skills: [] })).toBe(0);
  });

  it("anonymizedToken strips the Candidate prefix", () => {
    expect(anonymizedToken("Candidate ABC123")).toBe("ABC123");
    expect(anonymizedToken("Candidate")).toBe("Candidate");
  });
});
