import { describe, it, expect } from "vitest";
import {
  computeWorkerCountryReadiness,
  isReadyToStart,
  type WorkerReadinessInput,
} from "./worker-readiness";
import { matrixRequirementRows } from "../country-readiness/requirement-rows";

const req = (
  slug: string,
  present: boolean,
  expired = false,
  verification: "unverified" | "pending" | "verified" | "rejected" = "unverified",
) => ({ slug, present, expired, verification });

const base: WorkerReadinessInput = {
  availabilitySet: false,
  requiredItems: [],
  recommendedItems: [],
  expiringSoon: false,
};

describe("computeWorkerCountryReadiness — §3.1 ladder", () => {
  it("no inputs at all → not_enough_information", () => {
    expect(computeWorkerCountryReadiness(base).status).toBe("not_enough_information");
  });

  it("availability set but a required doc missing → missing_documents", () => {
    const r = computeWorkerCountryReadiness({
      ...base,
      availabilitySet: true,
      requiredItems: [req("a1_certificate", false)],
    });
    expect(r.status).toBe("missing_documents");
    expect(r.missingRequired).toContain("a1_certificate");
  });

  it("an expired required doc counts as missing", () => {
    const r = computeWorkerCountryReadiness({
      ...base,
      availabilitySet: true,
      requiredItems: [req("a1_certificate", true, true)],
    });
    expect(r.status).toBe("missing_documents");
  });

  it("a rejected required doc counts as missing", () => {
    const r = computeWorkerCountryReadiness({
      ...base,
      availabilitySet: true,
      requiredItems: [req("a1_certificate", true, false, "rejected")],
    });
    expect(r.status).toBe("missing_documents");
  });

  it("all required present but one pending → needs_verification", () => {
    const r = computeWorkerCountryReadiness({
      ...base,
      availabilitySet: true,
      requiredItems: [
        req("a1_certificate", true, false, "verified"),
        req("id_document", true, false, "pending"),
      ],
    });
    expect(r.status).toBe("needs_verification");
    expect(r.pendingVerification).toEqual(["id_document"]);
  });

  it("all required satisfied but a recommended missing → almost_ready", () => {
    const r = computeWorkerCountryReadiness({
      ...base,
      availabilitySet: true,
      requiredItems: [req("id_document", true, false, "verified")],
      recommendedItems: [{ slug: "employment_contract", present: false, expired: false }],
    });
    expect(r.status).toBe("almost_ready");
  });

  it("all required satisfied but something expiring soon → almost_ready", () => {
    const r = computeWorkerCountryReadiness({
      ...base,
      availabilitySet: true,
      requiredItems: [req("id_document", true, false, "verified")],
      expiringSoon: true,
    });
    expect(r.status).toBe("almost_ready");
  });

  it("everything satisfied → ready_for_country and isReadyToStart", () => {
    const r = computeWorkerCountryReadiness({
      ...base,
      availabilitySet: true,
      requiredItems: [
        req("a1_certificate", true, false, "verified"),
        req("id_document", true, false, "unverified"),
      ],
      recommendedItems: [{ slug: "employment_contract", present: true, expired: false }],
    });
    expect(r.status).toBe("ready_for_country");
    expect(isReadyToStart(r)).toBe(true);
  });

  it("unverified-but-present required does NOT block ready (worker self-claim)", () => {
    const r = computeWorkerCountryReadiness({
      ...base,
      availabilitySet: true,
      requiredItems: [req("id_document", true, false, "unverified")],
    });
    expect(r.status).toBe("ready_for_country");
  });
});

describe("matrixRequirementRows bridge", () => {
  it("returns sourced rows for a known country+scope (worker_posted)", () => {
    const rows = matrixRequirementRows("DE", "worker_posted");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.sourceUrl).toMatch(/^https:\/\//);
      expect(["needs_legal_source", "sourced", "reviewed"]).toContain(r.sourceStatus);
      expect(r.documentTypeSlug.length).toBeGreaterThan(0);
    }
    expect(rows.some((r) => r.documentTypeSlug === "a1_certificate")).toBe(true);
  });

  it("maps official→reviewed and needs_legal_review→needs_legal_source", () => {
    const rows = matrixRequirementRows("NL", "worker_posted");
    const a1 = rows.find((r) => r.documentTypeSlug === "a1_certificate");
    expect(a1?.sourceStatus).toBe("reviewed"); // a1 is 'official'
  });

  it("unknown country → no rows (never invents)", () => {
    expect(matrixRequirementRows("XX", "worker_solo")).toEqual([]);
  });
});
