import { describe, expect, it } from "vitest";

import { matchTeamToNeed } from "./match-team-v1";
import {
  offerRefusalOf,
  offerToTeamMatchInput,
  parseHandOffResult,
  parseOfferResult,
  parseOfferableDemand,
  parseReceivedOffer,
  parseSentOffer,
  summarizeTeamMatch,
} from "./team-offer-model";

const RAW = {
  offer_id: "o1",
  team_org_id: "t1",
  team_name: "Crew C",
  status: "offered",
  note: "three welders",
  offered_at: "2026-10-07T10:00:00Z",
  responded_at: null,
  assignment_id: null,
  member_count: 3,
  deployable_min: 2,
  deployable_max: 3,
  availability_status: "available_now",
  available_from: null,
  destination_countries: ["NO", "SE"],
  accommodation_needed: true,
  transport_own: false,
  details_updated_at: "2026-10-06T10:00:00Z",
  skills: [
    { slug: "welding", declared: 2, confirmed: 1 },
    { slug: "tiling", declared: 1, confirmed: 0 },
  ],
  languages: [{ code: "en", level: "B2", count: 2 }],
  consented_members: 2,
};

describe("received offer parsing - team-level facts only", () => {
  it("parses the aggregate row", () => {
    const o = parseReceivedOffer(RAW)!;
    expect(o.teamName).toBe("Crew C");
    expect(o.memberCount).toBe(3);
    expect(o.skills).toEqual([
      { slug: "welding", declared: 2, confirmed: 1 },
      { slug: "tiling", declared: 1, confirmed: 0 },
    ]);
    expect(o.consentedMembers).toBe(2);
  });

  it("PRIVACY: the parsed shape has no member identity field, even if the wire row carried one", () => {
    const o = parseReceivedOffer({
      ...RAW,
      profile_id: "p-secret",
      worker_id: "w-secret",
      full_name: "Secret Person",
      email: "x@example.com",
    })!;
    const json = JSON.stringify(o);
    expect(json).not.toMatch(/p-secret|w-secret|Secret Person|x@example/);
    expect(Object.keys(o)).not.toEqual(expect.arrayContaining(["profileId"]));
    for (const k of Object.keys(o)) {
      expect(k).not.toMatch(/profile|worker|fullName|email|phone/i);
    }
  });

  it("rejects rows without ids or with an unknown status instead of guessing", () => {
    expect(parseReceivedOffer(null)).toBeNull();
    expect(parseReceivedOffer({ ...RAW, offer_id: null })).toBeNull();
    expect(parseReceivedOffer({ ...RAW, status: "weird" })).toBeNull();
  });

  it("an unfilled team_details row is UNKNOWN, not 'not available'", () => {
    const o = parseReceivedOffer({
      ...RAW,
      availability_status: null,
      deployable_min: null,
      deployable_max: null,
      destination_countries: null,
      accommodation_needed: null,
      transport_own: null,
      details_updated_at: null,
    })!;
    expect(o.availabilityStatus).toBeNull();
    const input = offerToTeamMatchInput(o);
    expect(input.availability).toEqual({ status: "unknown", availableFrom: null });
    expect(input.destinationCountries).toBeNull();
    expect(input.accommodationNeeded).toBeNull();
    expect(input.transport.ownTransport).toBeNull();
    expect(input.dataFreshness.bucket).toBe("unknown");
  });
});

describe("the canonical TeamMatchInputV1 built from an offer", () => {
  it("is built from the aggregates only and keeps certification coverage NOT DERIVABLE", () => {
    const input = offerToTeamMatchInput(parseReceivedOffer(RAW)!, Date.parse("2026-10-07T10:00:00Z"));
    expect(input.activeMemberCount).toBe(3);
    expect(input.skillComposition).toEqual([
      { slug: "welding", membersDeclared: 2, membersConfirmed: 1 },
      { slug: "tiling", membersDeclared: 1, membersConfirmed: 0 },
    ]);
    expect(input.certificationCoverage).toBeNull();
    expect(input.memberConsentCompleteness).toEqual({ consentedMembers: 2, totalMembers: 3 });
    expect(input.dataFreshness.bucket).toBe("active");
    expect(input.visibilityState).toBe("private");
  });

  it("matchTeamToNeed runs on the TEAM_AGGREGATE basis - a per-member result is unreachable here", () => {
    const input = offerToTeamMatchInput(parseReceivedOffer(RAW)!);
    const result = matchTeamToNeed({ skillIds: ["welding", "tiling", "scaffolding"] }, input);
    expect(result.basis).toBe("team_aggregate");
    expect(result.members).toEqual([]);
    expect(result.eligibleMemberCount).toBeNull();
    const view = summarizeTeamMatch(result);
    expect(view.basis).toBe("team_aggregate");
    expect(view.coveredCount).toBe(2);
    expect(view.needTotal).toBe(3);
    expect(view.skillCoverage.find((s) => s.skillId === "scaffolding")?.members).toBe(0);
  });

  it("a team with no stated skills is a stated MISSING FACT, never a zero", () => {
    const input = offerToTeamMatchInput(parseReceivedOffer({ ...RAW, skills: [] })!);
    const view = summarizeTeamMatch(matchTeamToNeed({ skillIds: ["welding"] }, input));
    expect(view.coveredCount).toBeNull();
    expect(view.missingData).toContain("team_skills_not_stated");
  });
});

describe("other rows and results", () => {
  it("parses the offering side and the offerable demand whitelist", () => {
    expect(
      parseSentOffer({ offer_id: "o", request_id: "r", role_text: "welder", country: "NO", company_name: "B", status: "accepted", offered_at: "x" }),
    ).toMatchObject({ offerId: "o", requestId: "r", status: "accepted" });
    expect(
      parseOfferableDemand({ request_id: "r", role_text: "welder", team_size: 3, open_offer_id: null, open_offer_status: null }),
    ).toMatchObject({ requestId: "r", teamSize: 3, openOfferId: null });
  });

  it("parses write results", () => {
    expect(parseOfferResult({ outcome: "already_offered", offer_id: "o" })).toEqual({ outcome: "already_offered", offerId: "o" });
    expect(parseOfferResult({ outcome: "created" })).toBeNull();
    expect(parseHandOffResult({ outcome: "created", assignment_id: "a" })).toEqual({ outcome: "created", assignmentId: "a" });
  });

  it("maps database refusals onto the closed vocabulary", () => {
    expect(offerRefusalOf({ code: "42501", message: "Not authenticated" })).toBe("not_authed");
    expect(offerRefusalOf({ code: "42501", message: "Not authorized to offer this team" })).toBe("not_authorized");
    expect(offerRefusalOf({ code: "22023", message: "demand_not_offerable" })).toBe("demand_not_offerable");
    expect(offerRefusalOf({ code: "22023", message: "team_too_small" })).toBe("team_too_small");
    expect(offerRefusalOf({ code: "PGRST202", message: "function not found" })).toBe("needs_migration");
    expect(offerRefusalOf({ code: "XX000", message: "boom" })).toBe("error");
    expect(offerRefusalOf(null)).toBe("error");
  });
});
