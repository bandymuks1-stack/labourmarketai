import { describe, expect, it } from "vitest";

import { computeEmploymentJournalContext } from "./employment-journal-context";

/**
 * Employment ↔ journal context helper guard (PR B). Pins the
 * conservative truth table: a stored role label never grants review on
 * its own; foreman / project_manager stay not_enabled; review needs an
 * enabled reviewer role + the explicit flag.
 */

describe("computeEmploymentJournalContext", () => {
  it("no relationship → everything not_enabled", () => {
    const r = computeEmploymentJournalContext({
      relationship: null,
      operationsRole: "company_admin",
      journalReviewEnabled: true,
    });
    expect(r.relationshipType).toBe("none");
    expect(r.reviewCapability).toBe("not_enabled");
    expect(r.coordinationStatus).toBe("not_enabled");
    expect(r.safeUiMessageKey).toBe("no_relationship");
  });

  it("relationship but no role assigned → role_not_assigned / not_enabled", () => {
    const r = computeEmploymentJournalContext({
      relationship: "company",
      operationsRole: null,
      journalReviewEnabled: false,
    });
    expect(r.operationsRole).toBe("not_enabled");
    expect(r.reviewCapability).toBe("not_enabled");
    expect(r.safeUiMessageKey).toBe("role_not_assigned");
  });

  it("foreman is NEVER granted review, even with review flag on", () => {
    const r = computeEmploymentJournalContext({
      relationship: "company",
      operationsRole: "foreman",
      journalReviewEnabled: true,
    });
    expect(r.operationsRole).toBe("foreman");
    expect(r.roleEnabled).toBe(false);
    expect(r.reviewCapability).toBe("not_enabled");
    expect(r.coordinationStatus).toBe("not_enabled");
    expect(r.safeUiMessageKey).toBe("role_not_enabled");
  });

  it("project_manager likewise stays not_enabled", () => {
    const r = computeEmploymentJournalContext({
      relationship: "company",
      operationsRole: "project_manager",
      journalReviewEnabled: true,
    });
    expect(r.reviewCapability).toBe("not_enabled");
  });

  it("enabled reviewer role + review flag ON → can_review / active", () => {
    const r = computeEmploymentJournalContext({
      relationship: "company",
      operationsRole: "company_admin",
      journalReviewEnabled: true,
    });
    expect(r.roleEnabled).toBe(true);
    expect(r.reviewCapability).toBe("can_review");
    expect(r.coordinationStatus).toBe("active");
    expect(r.safeUiMessageKey).toBe("review_enabled");
    expect(r.nextAction).toBe("review_entries");
  });

  it("enabled reviewer role + review flag OFF → can_view / partial", () => {
    const r = computeEmploymentJournalContext({
      relationship: "agency",
      operationsRole: "agency_admin",
      journalReviewEnabled: false,
    });
    expect(r.reviewCapability).toBe("can_view");
    expect(r.coordinationStatus).toBe("partial");
    expect(r.safeUiMessageKey).toBe("review_not_enabled");
    expect(r.nextAction).toBe("enable_review");
  });

  it("worker role (enabled but not a reviewer) never reviews", () => {
    const r = computeEmploymentJournalContext({
      relationship: "company",
      operationsRole: "worker",
      journalReviewEnabled: true,
    });
    // worker is not in REVIEWER_ROLES → cannot review even with flag on.
    expect(r.reviewCapability).toBe("can_view");
    expect(r.coordinationStatus).toBe("partial");
  });

  it("unknown role string is treated as not assigned", () => {
    const r = computeEmploymentJournalContext({
      relationship: "company",
      operationsRole: "ceo",
      journalReviewEnabled: true,
    });
    expect(r.operationsRole).toBe("not_enabled");
    expect(r.reviewCapability).toBe("not_enabled");
  });

  it("is deterministic", () => {
    const input = {
      relationship: "company" as const,
      operationsRole: "company_admin",
      journalReviewEnabled: true,
    };
    expect(computeEmploymentJournalContext(input)).toEqual(
      computeEmploymentJournalContext(input),
    );
  });
});
