import { describe, it, expect } from "vitest";
import { companyCandidateReadiness } from "./candidate-readiness";

const preview = (over: Partial<{
  preferredCountries: string[];
  location: string | null;
  availability: string | null;
  availableFrom: string | null;
}> = {}) => ({
  preferredCountries: over.preferredCountries ?? [],
  location: over.location ?? null,
  availability: over.availability ?? null,
  availableFrom: over.availableFrom ?? null,
});

describe("companyCandidateReadiness — safe signal", () => {
  it("country in preferred + available → can_be_considered, country match", () => {
    const r = companyCandidateReadiness("DE", preview({ preferredCountries: ["DE", "NL"], availability: "available" }));
    expect(r.countryFit).toBe("match");
    expect(r.availabilityFit).toBe(true);
    expect(r.label).toBe("can_be_considered");
  });

  it("location equals need country counts as match", () => {
    const r = companyCandidateReadiness("NL", preview({ location: "NL", availableFrom: "2026-07-01" }));
    expect(r.countryFit).toBe("match");
    expect(r.label).toBe("can_be_considered");
  });

  it("no stated preference + available → maybe / can_be_considered", () => {
    const r = companyCandidateReadiness("SE", preview({ availability: "available" }));
    expect(r.countryFit).toBe("maybe");
    expect(r.label).toBe("can_be_considered");
  });

  it("different country preference + no availability → not_enough_information", () => {
    const r = companyCandidateReadiness("DK", preview({ preferredCountries: ["PL"] }));
    expect(r.countryFit).toBe("mismatch");
    expect(r.availabilityFit).toBe(false);
    expect(r.label).toBe("not_enough_information");
  });

  it("country match but no availability → limited_information", () => {
    const r = companyCandidateReadiness("DE", preview({ preferredCountries: ["DE"] }));
    expect(r.availabilityFit).toBe(false);
    expect(r.label).toBe("limited_information");
  });

  it("no need country → unknown country fit", () => {
    const r = companyCandidateReadiness(null, preview({ availability: "available" }));
    expect(r.countryFit).toBe("unknown");
  });

  it("ALWAYS keeps documents consent-gated (never a doc claim)", () => {
    const r = companyCandidateReadiness("DE", preview({ preferredCountries: ["DE"], availability: "available" }));
    expect(r.docsSummary).toBe("consent_required");
  });
});
