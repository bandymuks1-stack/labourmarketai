import { describe, expect, it } from "vitest";

import {
  CONSENT_STATUSES,
  TALENT_SOURCE_TYPES,
  canTransitionConsent,
  parseConsentStatus,
  parseTalentSourceType,
  validateTalentSourceInput,
} from "./provenance-model";

describe("talent source vocabulary (8 closed types)", () => {
  it("carries exactly the 8 contract source types", () => {
    expect([...TALENT_SOURCE_TYPES]).toEqual([
      "direct_registration",
      "cv_import",
      "external_profile",
      "agency",
      "partner",
      "referral",
      "company_added_contact",
      "official_integration",
    ]);
  });

  it("has NO scraping source and rejects one", () => {
    expect(TALENT_SOURCE_TYPES).not.toContain("scraped");
    expect(parseTalentSourceType("scraped")).toBeNull();
    expect(parseTalentSourceType("crawl")).toBeNull();
  });
});

describe("consent transitions (revoked is terminal)", () => {
  it("granted → revoked is always allowed (withdrawal)", () => {
    expect(canTransitionConsent("granted", "revoked")).toBe(true);
  });

  it("revoked can NEVER transition anywhere (no auto-regrant)", () => {
    for (const to of CONSENT_STATUSES) {
      expect(canTransitionConsent("revoked", to)).toBe(false);
    }
  });

  it("pending resolves to granted or revoked only", () => {
    expect(canTransitionConsent("pending", "granted")).toBe(true);
    expect(canTransitionConsent("pending", "revoked")).toBe(true);
    expect(canTransitionConsent("pending", "not_required")).toBe(false);
  });

  it("not_required may become consent-relevant", () => {
    expect(canTransitionConsent("not_required", "pending")).toBe(true);
    expect(canTransitionConsent("not_required", "granted")).toBe(true);
    expect(canTransitionConsent("not_required", "revoked")).toBe(true);
  });

  it("identity transitions are not transitions", () => {
    for (const s of CONSENT_STATUSES) {
      expect(canTransitionConsent(s, s)).toBe(false);
    }
  });
});

describe("validateTalentSourceInput mirrors the RPC checks", () => {
  it("accepts a minimal valid input with defaults", () => {
    const r = validateTalentSourceInput({ sourceType: "direct_registration" });
    expect(r).toEqual({
      ok: true,
      value: {
        sourceType: "direct_registration",
        sourceName: null,
        sourceReference: null,
        importMethod: null,
        consentStatus: "not_required",
      },
    });
  });

  it("rejects unknown source types and consent statuses", () => {
    expect(validateTalentSourceInput({ sourceType: "bought_list" })).toEqual({
      ok: false,
      reason: "sourceType",
    });
    expect(
      validateTalentSourceInput({
        sourceType: "agency",
        consentStatus: "assumed",
      }),
    ).toEqual({ ok: false, reason: "consentStatus" });
  });

  it("enforces the DB text bounds (160/300/80)", () => {
    expect(
      validateTalentSourceInput({
        sourceType: "partner",
        sourceName: "x".repeat(161),
      }),
    ).toEqual({ ok: false, reason: "sourceName" });
    expect(
      validateTalentSourceInput({
        sourceType: "partner",
        sourceReference: "x".repeat(301),
      }),
    ).toEqual({ ok: false, reason: "sourceReference" });
    expect(
      validateTalentSourceInput({
        sourceType: "cv_import",
        importMethod: "x".repeat(81),
      }),
    ).toEqual({ ok: false, reason: "importMethod" });
  });

  it("trims and nulls empty optional fields", () => {
    const r = validateTalentSourceInput({
      sourceType: "referral",
      sourceName: "  ",
      sourceReference: " ref-1 ",
      consentStatus: "granted",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.sourceName).toBeNull();
      expect(r.value.sourceReference).toBe("ref-1");
      expect(r.value.consentStatus).toBe("granted");
    }
  });
});

describe("parseConsentStatus", () => {
  it("accepts only the closed set", () => {
    for (const s of CONSENT_STATUSES) expect(parseConsentStatus(s)).toBe(s);
    expect(parseConsentStatus("implied")).toBeNull();
    expect(parseConsentStatus(null)).toBeNull();
  });
});
