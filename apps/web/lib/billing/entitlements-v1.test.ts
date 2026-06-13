import { describe, it, expect } from "vitest";
import { resolveEntitlements, entitlementAllows } from "./entitlements-v1";

const base = {
  billingActive: true,
  isAdmin: false,
  audience: "company" as const,
  subscriptionPlanKey: null as string | null,
  subscriptionStatus: null as
    | "none" | "trialing" | "active" | "past_due" | "unpaid" | "cancelled" | "incomplete" | "expired" | null,
  manualOverridePlanKey: null as string | null,
};

describe("resolveEntitlements — subscription-derived", () => {
  it("an ACTIVE subscription grants its plan", () => {
    const c = resolveEntitlements({ ...base, subscriptionPlanKey: "company_pilot", subscriptionStatus: "active" });
    expect(c.source).toBe("subscription");
    expect(c.effectivePlanKey).toBe("company_pilot");
    expect(c.active).toBe(true);
  });

  it("trialing also grants", () => {
    const c = resolveEntitlements({ ...base, subscriptionPlanKey: "company_pilot", subscriptionStatus: "trialing" });
    expect(c.active).toBe(true);
  });

  it("past_due is a flagged GRACE (still active for now)", () => {
    const c = resolveEntitlements({ ...base, subscriptionPlanKey: "company_pilot", subscriptionStatus: "past_due" });
    expect(c.active).toBe(true);
    expect(c.grace).toBe(true);
  });

  it("cancelled / expired / unpaid → fall back to free (not active)", () => {
    for (const s of ["cancelled", "expired", "unpaid"] as const) {
      const c = resolveEntitlements({ ...base, subscriptionPlanKey: "company_pilot", subscriptionStatus: s });
      expect(c.active, s).toBe(false);
      expect(c.source).toBe("free");
    }
  });

  it("admin override → admin_internal, always active", () => {
    const c = resolveEntitlements({ ...base, isAdmin: true });
    expect(c.source).toBe("admin");
    expect(c.effectivePlanKey).toBe("admin_internal");
    expect(c.active).toBe(true);
  });

  it("a manual override (admin-granted pilot) grants the plan with no subscription", () => {
    const c = resolveEntitlements({ ...base, manualOverridePlanKey: "agency_pilot", audience: "agency" });
    expect(c.source).toBe("manual_override");
    expect(c.active).toBe(true);
  });

  it("no subscription + billing active → free, inactive", () => {
    const c = resolveEntitlements({ ...base, audience: "worker" });
    expect(c.source).toBe("free");
    expect(c.effectivePlanKey).toBe("free_worker");
    expect(c.active).toBe(false);
  });

  it("billing DISABLED → permissive (pilot preserved, not enforced)", () => {
    const c = resolveEntitlements({ ...base, billingActive: false, audience: "company" });
    expect(c.enforced).toBe(false);
    expect(c.source).toBe("billing_disabled");
  });
});

describe("entitlementAllows — enforcement", () => {
  it("permissive when not enforced (billing disabled) — nothing hard-locked", () => {
    const c = resolveEntitlements({ ...base, billingActive: false });
    expect(entitlementAllows(c, "booking_requests")).toBe(true);
  });

  it("active company_pilot subscription unlocks its features", () => {
    const c = resolveEntitlements({ ...base, subscriptionPlanKey: "company_pilot", subscriptionStatus: "active" });
    expect(entitlementAllows(c, "booking_requests")).toBe(true);
    expect(entitlementAllows(c, "candidate_readiness_summaries")).toBe(true);
  });

  it("a free worker (enforced) cannot use a paid company feature", () => {
    const c = resolveEntitlements({ ...base, audience: "worker" });
    expect(entitlementAllows(c, "booking_requests")).toBe(false);
  });

  it("a free worker keeps free features", () => {
    const c = resolveEntitlements({ ...base, audience: "worker" });
    expect(entitlementAllows(c, "worker_journal")).toBe(true);
    expect(entitlementAllows(c, "readiness_checklist_countries")).toBe(true);
  });

  it("cancelled subscription loses the paid feature (enforced)", () => {
    const c = resolveEntitlements({ ...base, subscriptionPlanKey: "company_pilot", subscriptionStatus: "cancelled", audience: "company" });
    expect(entitlementAllows(c, "booking_requests")).toBe(false);
  });
});
