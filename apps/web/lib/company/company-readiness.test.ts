import { describe, it, expect } from "vitest";
import { computeCompanyReadiness, type CompanyReadinessInput } from "./company-readiness";

const full: CompanyReadinessInput = {
  legalName: "Acme UAB",
  country: "LT",
  registrationCode: "123456789",
  contactEmail: "billing@acme.lt",
  companyType: "construction",
  verificationStatus: "active_unverified",
};

describe("computeCompanyReadiness — §3.2", () => {
  it("missing a core field → incomplete", () => {
    const r = computeCompanyReadiness({ ...full, registrationCode: null });
    expect(r.status).toBe("incomplete");
    expect(r.missing).toContain("registration_code");
  });

  it("missing billing email → incomplete", () => {
    const r = computeCompanyReadiness({ ...full, contactEmail: "" });
    expect(r.status).toBe("incomplete");
    expect(r.missing).toContain("billing_email");
  });

  it("core present but activity unspecified ('other') → basic", () => {
    const r = computeCompanyReadiness({ ...full, companyType: "other" });
    expect(r.status).toBe("basic");
    expect(r.missing).toContain("activity");
  });

  it("core present + a real activity → hiring_ready", () => {
    expect(computeCompanyReadiness(full).status).toBe("hiring_ready");
  });

  it("verified is admin-set only (never asserted by readiness)", () => {
    expect(computeCompanyReadiness(full).verified).toBe(false);
    expect(
      computeCompanyReadiness({ ...full, verificationStatus: "verified" }).verified,
    ).toBe(true);
  });

  it("an empty company → incomplete with all core fields missing", () => {
    const r = computeCompanyReadiness({
      legalName: null,
      country: null,
      registrationCode: null,
      contactEmail: null,
      companyType: "other",
      verificationStatus: "draft",
    });
    expect(r.status).toBe("incomplete");
    expect(r.missing).toEqual([
      "legal_name",
      "country",
      "registration_code",
      "billing_email",
    ]);
  });
});
