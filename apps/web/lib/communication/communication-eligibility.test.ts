/**
 * Communication request eligibility — behavioural unit tests (Step 4A).
 */
import { describe, expect, it } from "vitest";
import {
  evaluateCommunicationRequest,
  isShortlistedForContact,
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
