import { describe, it, expect } from "vitest";
import {
  computeOpportunityFit,
  type WorkerOpportunityProfile,
  type OpportunityNeed,
} from "./opportunity-fit";

const need = (over: Partial<OpportunityNeed> = {}): OpportunityNeed => ({
  id: "n1",
  roleText: "Warehouse worker",
  country: "NL",
  teamSize: 4,
  startPeriod: "2026-07",
  accommodation: "provided_free",
  ...over,
});

const ready: WorkerOpportunityProfile = {
  hasWorkType: true,
  hasSkills: true,
  countries: ["NL"],
  availabilitySet: true,
  documentsCount: 2,
};

describe("computeOpportunityFit — honest, no score", () => {
  it("flags an incomplete profile before anything else", () => {
    const r = computeOpportunityFit({ ...ready, hasSkills: false }, need());
    expect(r.status).toBe("missing_profile_info");
    expect(r.gaps).toContain("incomplete_profile");
  });

  it("flags missing documents once basics are present", () => {
    const r = computeOpportunityFit({ ...ready, documentsCount: 0 }, need());
    expect(r.status).toBe("needs_documents");
    expect(r.gaps).toContain("no_documents");
  });

  it("asks to check conditions on a country mismatch", () => {
    const r = computeOpportunityFit({ ...ready, countries: ["LT"] }, need({ country: "NL" }));
    expect(r.status).toBe("check_conditions");
    expect(r.gaps).toContain("country_mismatch");
  });

  it("asks to check conditions when availability is unknown", () => {
    const r = computeOpportunityFit({ ...ready, availabilitySet: false }, need());
    expect(r.status).toBe("check_conditions");
    expect(r.gaps).toContain("availability_unknown");
  });

  it("is a possible match when everything checkable lines up", () => {
    const r = computeOpportunityFit(ready, need());
    expect(r.status).toBe("possible_match");
    expect(r.gaps).toEqual([]);
  });

  it("treats unknown need country as a possible match (not a mismatch)", () => {
    const r = computeOpportunityFit({ ...ready, countries: [] }, need({ country: null }));
    expect(r.status).toBe("possible_match");
  });

  it("never returns a numeric score", () => {
    const r = computeOpportunityFit(ready, need());
    expect(Object.values(r).every((v) => typeof v !== "number")).toBe(true);
  });
});
