import { describe, expect, it } from "vitest";

import {
  CONTACT_PERMISSION_STATES,
  evaluateContactPermission,
  evaluateTeamOfferContact,
  isContactPermitted,
} from "./communication-eligibility";

describe("allowed_team_demand_offer — the brigade-offer negotiation thread", () => {
  it("both parties of a LIVE offer may talk: before, after agreement, after hand-off", () => {
    for (const side of ["supplier", "receiver"] as const) {
      for (const offerStatus of ["offered", "accepted", "assigned"]) {
        expect(evaluateTeamOfferContact({ side, offerStatus })).toBe("allowed");
      }
    }
  });

  it("a declined, withdrawn or unreadable offer opens nothing new", () => {
    for (const offerStatus of ["declined", "withdrawn", null, undefined, ""]) {
      expect(evaluateTeamOfferContact({ side: "supplier", offerStatus })).toBe("offer_not_live");
      expect(evaluateTeamOfferContact({ side: "receiver", offerStatus })).toBe("offer_not_live");
    }
  });

  it("no proven side is no party, whatever the status", () => {
    expect(evaluateTeamOfferContact({ side: null, offerStatus: "offered" })).toBe("not_a_party");
  });

  it("is a grant-only state: never minted from generic facts", () => {
    expect(CONTACT_PERMISSION_STATES).toContain("allowed_team_demand_offer");
    expect(isContactPermitted("allowed_team_demand_offer")).toBe(true);
    for (const sharesConversation of [true, false]) {
      for (const hasEngagement of [true, false]) {
        for (const scoutingAllowed of [true, false]) {
          for (const isAdmin of [true, false]) {
            expect(
              evaluateContactPermission({ sharesConversation, hasEngagement, scoutingAllowed, isAdmin }),
            ).not.toBe("allowed_team_demand_offer");
          }
        }
      }
    }
  });
});
