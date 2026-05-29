import { describe, expect, it } from "vitest";

import {
  computeEngagementBridgeReadiness,
  EMPLOYMENT_ENGAGEMENT_BRIDGE_LIVE,
  type EngagementBridgeState,
} from "./engagement-bridge";

/**
 * Truth-table guards for the engagement-context bridge readiness classifier
 * (slice engagement-context-ops-bridge-v1). Proves the honesty invariants
 * with no DB:
 *   - review is NEVER ready/active from a label alone;
 *   - foreman / project_manager stay not_enabled even with review flag true;
 *   - a plain worker relationship is not_allowed;
 *   - reviewer roles still need a real engagement context (bridge) first;
 *   - only context-linked + reviewer + flag-true yields "connected".
 */

const base = {
  relationshipExists: true,
  operationsRole: "company_admin" as string | null,
  journalReviewEnabled: false as boolean | null,
  engagementContextLinked: false as boolean | null,
};

function state(overrides: Partial<typeof base>): EngagementBridgeState {
  return computeEngagementBridgeReadiness({ ...base, ...overrides }).state;
}

describe("computeEngagementBridgeReadiness — truth table", () => {
  it("relationship_not_found when no relationship row", () => {
    expect(state({ relationshipExists: false })).toBe("relationship_not_found");
  });

  it("role_not_assigned for null / blank / unknown roles", () => {
    for (const r of [null, "", "   ", "manager", "Worker", "site_manager"]) {
      expect(state({ operationsRole: r }), `role=${r}`).toBe("role_not_assigned");
    }
  });

  it("not_enabled for stored-but-not-enabled labels (foreman / project_manager)", () => {
    for (const r of ["foreman", "project_manager"]) {
      expect(state({ operationsRole: r }), `role=${r}`).toBe("not_enabled");
      // Even if the review flag + a (fake) context are present, the label
      // must NOT become a reviewer.
      expect(
        state({
          operationsRole: r,
          journalReviewEnabled: true,
          engagementContextLinked: true,
        }),
        `role=${r} with flags`,
      ).toBe("not_enabled");
    }
  });

  it("not_allowed for an enabled but non-reviewer role (worker)", () => {
    expect(state({ operationsRole: "worker" })).toBe("not_allowed");
    expect(
      state({
        operationsRole: "worker",
        journalReviewEnabled: true,
        engagementContextLinked: true,
      }),
    ).toBe("not_allowed");
  });

  it("missing_engagement_context for a reviewer role with no context link", () => {
    for (const r of ["company_admin", "agency_admin"]) {
      expect(
        state({ operationsRole: r, engagementContextLinked: false }),
        `role=${r}`,
      ).toBe("missing_engagement_context");
      // The flag alone, without a real context, never advances the state.
      expect(
        state({
          operationsRole: r,
          journalReviewEnabled: true,
          engagementContextLinked: false,
        }),
        `role=${r} flag-only`,
      ).toBe("missing_engagement_context");
    }
  });

  it("review_not_enabled when bridge present + reviewer role + flag off", () => {
    expect(
      state({
        operationsRole: "company_admin",
        engagementContextLinked: true,
        journalReviewEnabled: false,
      }),
    ).toBe("review_not_enabled");
  });

  it("connected only when context-linked + reviewer + flag true", () => {
    const r = computeEngagementBridgeReadiness({
      relationshipExists: true,
      operationsRole: "agency_admin",
      engagementContextLinked: true,
      journalReviewEnabled: true,
    });
    expect(r.state).toBe("connected");
    expect(r.bridgeReady).toBe(true);
    expect(r.reviewActive).toBe(true);
  });
});

describe("review can never be ready/active from a label alone", () => {
  it("bridgeReady is false for every state without a real context link", () => {
    const noContext: Array<Partial<typeof base>> = [
      { relationshipExists: false },
      { operationsRole: null },
      { operationsRole: "foreman", journalReviewEnabled: true },
      { operationsRole: "worker", journalReviewEnabled: true },
      { operationsRole: "company_admin", engagementContextLinked: false, journalReviewEnabled: true },
    ];
    for (const o of noContext) {
      const r = computeEngagementBridgeReadiness({ ...base, ...o });
      expect(r.bridgeReady, JSON.stringify(o)).toBe(false);
      expect(r.reviewActive, JSON.stringify(o)).toBe(false);
    }
  });

  it("reviewActive requires BOTH a context link AND journalReviewEnabled", () => {
    // context but flag off → not active
    expect(
      computeEngagementBridgeReadiness({
        relationshipExists: true,
        operationsRole: "company_admin",
        engagementContextLinked: true,
        journalReviewEnabled: false,
      }).reviewActive,
    ).toBe(false);
  });
});

describe("bridge is not live in production yet", () => {
  it("EMPLOYMENT_ENGAGEMENT_BRIDGE_LIVE is false until the provisioning RPC ships", () => {
    expect(EMPLOYMENT_ENGAGEMENT_BRIDGE_LIVE).toBe(false);
  });

  it("with the live flag, a reviewer relationship reports missing_engagement_context", () => {
    expect(
      state({
        operationsRole: "company_admin",
        engagementContextLinked: EMPLOYMENT_ENGAGEMENT_BRIDGE_LIVE,
      }),
    ).toBe("missing_engagement_context");
  });
});
