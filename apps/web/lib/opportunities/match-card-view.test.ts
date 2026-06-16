import { describe, expect, it } from "vitest";
import { buildMatchCardView } from "./match-card-view";
import type {
  OpportunityNeed,
  WorkerOpportunityProfile,
} from "./opportunity-fit";

const NEED: OpportunityNeed = {
  id: "n1",
  roleText: "tiler",
  country: "NL",
  teamSize: 3,
  startPeriod: "this_month",
  accommodation: "provided_free",
};

const FULL_PROFILE: WorkerOpportunityProfile = {
  hasWorkType: true,
  hasSkills: true,
  countries: ["NL"],
  availabilitySet: true,
  documentsCount: 2,
};

describe("buildMatchCardView — honest per-dimension breakdown, never a score", () => {
  it("a fully-aligned profile → possible_match, all signals fit", () => {
    const v = buildMatchCardView(FULL_PROFILE, NEED);
    expect(v.status).toBe("possible_match");
    expect(v.isPossibleMatch).toBe(true);
    expect(v.signals.every((s) => s.state === "fit")).toBe(true);
  });

  it("a different country → country signal is 'check', not a fake fit", () => {
    const v = buildMatchCardView({ ...FULL_PROFILE, countries: ["LT"] }, NEED);
    expect(v.signals.find((s) => s.key === "country")?.state).toBe("check");
    expect(v.status).toBe("check_conditions");
    expect(v.isPossibleMatch).toBe(false);
  });

  it("no countries on profile → country is 'unknown' (never guessed)", () => {
    const v = buildMatchCardView({ ...FULL_PROFILE, countries: [] }, NEED);
    expect(v.signals.find((s) => s.key === "country")?.state).toBe("unknown");
  });

  it("no documents → documents signal check + needs_documents status", () => {
    const v = buildMatchCardView({ ...FULL_PROFILE, documentsCount: 0 }, NEED);
    expect(v.signals.find((s) => s.key === "documents")?.state).toBe("check");
    expect(v.status).toBe("needs_documents");
  });

  it("thin profile → missing_profile_info; never a numeric score anywhere", () => {
    const v = buildMatchCardView(
      { ...FULL_PROFILE, hasWorkType: false, hasSkills: false },
      NEED,
    );
    expect(v.status).toBe("missing_profile_info");
    // the view never carries a number/percentage
    expect(JSON.stringify(v)).not.toMatch(/\d+%/);
  });
});
