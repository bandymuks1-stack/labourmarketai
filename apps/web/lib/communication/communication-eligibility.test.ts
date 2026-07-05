/**
 * Communication request eligibility — behavioural unit tests (Step 4A)
 * + contact permission states (§8.1, product-tree branch 20).
 */
import { describe, expect, it } from "vitest";
import {
  CONTACT_PERMISSION_STATES,
  evaluateCommunicationRequest,
  evaluateContactPermission,
  isContactPermitted,
  isShortlistedForContact,
  type ContactPermissionFacts,
} from "./communication-eligibility";

describe("evaluateCommunicationRequest — default-closed gate", () => {
  it("allows only when owner + shortlisted + contactable all hold", () => {
    expect(
      evaluateCommunicationRequest({ ownsDemand: true, shortlisted: true, canContact: true }),
    ).toBe("allowed");
  });

  it("denies when the caller does not own the demand", () => {
    expect(
      evaluateCommunicationRequest({ ownsDemand: false, shortlisted: true, canContact: true }),
    ).toBe("not_owner");
  });

  it("denies when the worker is not shortlisted", () => {
    expect(
      evaluateCommunicationRequest({ ownsDemand: true, shortlisted: false, canContact: true }),
    ).toBe("not_shortlisted");
  });

  it("denies when the worker is not contactable (rule 6)", () => {
    expect(
      evaluateCommunicationRequest({ ownsDemand: true, shortlisted: true, canContact: false }),
    ).toBe("not_contactable");
  });
});

describe("isShortlistedForContact", () => {
  it("true for saved/interested/reviewed", () => {
    for (const s of ["saved", "interested", "reviewed"]) {
      expect(isShortlistedForContact(s)).toBe(true);
    }
  });
  it("false for not_fit, null, or empty (no engagement)", () => {
    expect(isShortlistedForContact("not_fit")).toBe(false);
    expect(isShortlistedForContact(null)).toBe(false);
    expect(isShortlistedForContact(undefined)).toBe(false);
    expect(isShortlistedForContact("")).toBe(false);
  });
});

const NO_FACTS: ContactPermissionFacts = {
  sharesConversation: false,
  hasEngagement: false,
  scoutingAllowed: false,
  isAdmin: false,
};

describe("evaluateContactPermission — §8.1 permission states, default-closed", () => {
  it("no relationship at all → no_permission (default-closed)", () => {
    expect(evaluateContactPermission(NO_FACTS)).toBe("no_permission");
  });

  it("each single fact resolves to its own named state (traceable source)", () => {
    expect(
      evaluateContactPermission({ ...NO_FACTS, sharesConversation: true }),
    ).toBe("allowed_existing_conversation");
    expect(evaluateContactPermission({ ...NO_FACTS, hasEngagement: true })).toBe(
      "allowed_engagement",
    );
    expect(
      evaluateContactPermission({ ...NO_FACTS, scoutingAllowed: true }),
    ).toBe("allowed_scouting_shortlist");
    expect(evaluateContactPermission({ ...NO_FACTS, isAdmin: true })).toBe(
      "allowed_admin",
    );
  });

  it("precedence: most-established relationship wins when several hold", () => {
    expect(
      evaluateContactPermission({
        sharesConversation: true,
        hasEngagement: true,
        scoutingAllowed: true,
        isAdmin: true,
      }),
    ).toBe("allowed_existing_conversation");
    expect(
      evaluateContactPermission({
        ...NO_FACTS,
        hasEngagement: true,
        scoutingAllowed: true,
      }),
    ).toBe("allowed_engagement");
  });

  it("every evaluator result is a member of the pinned enumeration", () => {
    const combos: ContactPermissionFacts[] = [];
    for (const a of [false, true])
      for (const b of [false, true])
        for (const c of [false, true])
          for (const d of [false, true])
            combos.push({
              sharesConversation: a,
              hasEngagement: b,
              scoutingAllowed: c,
              isAdmin: d,
            });
    for (const facts of combos) {
      expect(CONTACT_PERMISSION_STATES).toContain(
        evaluateContactPermission(facts),
      );
    }
  });
});

describe("isContactPermitted — only explicit allowed_* states pass", () => {
  it("true for every allowed_* state", () => {
    for (const s of CONTACT_PERMISSION_STATES) {
      if (s === "no_permission") continue;
      expect(isContactPermitted(s), s).toBe(true);
    }
  });
  it("false for no_permission, null, undefined", () => {
    expect(isContactPermitted("no_permission")).toBe(false);
    expect(isContactPermitted(null)).toBe(false);
    expect(isContactPermitted(undefined)).toBe(false);
  });
});
