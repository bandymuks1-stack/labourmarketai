import { describe, expect, it } from "vitest";
import { runCompanyChecks, deriveAutomaticStatus } from "./company-checks";

function outcome(input: Parameters<typeof runCompanyChecks>[0], key: string) {
  return runCompanyChecks(input).find((r) => r.key === key)?.outcome;
}

describe("runCompanyChecks — automated, honest basic checks", () => {
  it("passes a complete, well-formed company", () => {
    const r = runCompanyChecks({
      legalName: "Acme UAB",
      country: "LT",
      registrationCode: "LT302000111",
      website: "https://acme.lt",
      contactEmail: "info@acme.lt",
      requesterRole: "owner",
    });
    expect(r.every((c) => c.outcome !== "warn")).toBe(true);
    expect(deriveAutomaticStatus({
      legalName: "Acme UAB", country: "LT", contactEmail: "info@acme.lt",
    })).toBe("active_unverified");
  });

  it("warns on missing required name / country", () => {
    expect(outcome({ legalName: "", country: "LT" }, "name")).toBe("warn");
    expect(outcome({ legalName: "Acme", country: "" }, "country")).toBe("warn");
    expect(deriveAutomaticStatus({ legalName: "Acme" })).toBe("needs_checks"); // no country
  });

  it("warns on a malformed PROVIDED email / website / reg code", () => {
    expect(outcome({ legalName: "A", country: "LT", contactEmail: "not-an-email" }, "contactEmail")).toBe("warn");
    expect(outcome({ legalName: "A", country: "LT", website: "http://no spaces .x" }, "website")).toBe("warn");
    expect(outcome({ legalName: "A", country: "LT", registrationCode: "x" }, "registrationCode")).toBe("warn");
    expect(deriveAutomaticStatus({ legalName: "A", country: "LT", contactEmail: "bad" })).toBe("needs_checks");
  });

  it("skips optional fields that are absent (no warn)", () => {
    expect(outcome({ legalName: "A", country: "LT" }, "website")).toBe("skipped");
    expect(outcome({ legalName: "A", country: "LT" }, "contactEmail")).toBe("skipped");
    expect(deriveAutomaticStatus({ legalName: "A", country: "LT" })).toBe("active_unverified");
  });

  it("accepts a bare domain (no scheme) as a valid website", () => {
    expect(outcome({ legalName: "A", country: "LT", website: "acme.lt" }, "website")).toBe("pass");
  });

  it("flags email/website domain MISMATCH as a soft warn only (not blocking)", () => {
    expect(
      outcome(
        { legalName: "A", country: "LT", contactEmail: "info@acme.lt", website: "https://other.com" },
        "domainEmailConsistency",
      ),
    ).toBe("warn");
    // Soft signal: a domain mismatch alone must NOT force needs_checks.
    expect(
      deriveAutomaticStatus({
        legalName: "A", country: "LT", contactEmail: "info@acme.lt", website: "https://other.com",
      }),
    ).toBe("active_unverified");
  });

  it("never derives a 'verified' status (verified is not automatic)", () => {
    const s = deriveAutomaticStatus({ legalName: "Acme", country: "LT" });
    expect(["active_unverified", "needs_checks"]).toContain(s);
    expect(s).not.toBe("verified");
  });
});
