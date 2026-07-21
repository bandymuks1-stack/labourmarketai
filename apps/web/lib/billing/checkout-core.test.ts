import { describe, it, expect } from "vitest";
import {
  evaluateCheckoutRequest,
  isPaidPlanKey,
  planRequiresOrganization,
} from "./checkout-core";

const ok = {
  config: { state: "stripe_test" as const, reason: "ok" as const },
  authenticated: true,
  planKey: "company_pilot",
  userRoles: ["company"],
  isAdmin: false,
  priceConfigured: true,
  orgBinding: "verified" as const,
};

describe("evaluateCheckoutRequest — strict gate", () => {
  it("disabled billing → payments_disabled (safe state)", () => {
    const r = evaluateCheckoutRequest({ ...ok, config: { state: "disabled", reason: "payments_disabled" } });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe("payments_disabled"); expect(r.status).toBe(400); }
  });

  it("live blocked → live_blocked, 403", () => {
    const r = evaluateCheckoutRequest({ ...ok, config: { state: "stripe_live_blocked", reason: "live_blocked" } });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe("live_blocked"); expect(r.status).toBe(403); }
  });

  it("unauthenticated → not_authenticated, 401", () => {
    const r = evaluateCheckoutRequest({ ...ok, authenticated: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_authenticated");
  });

  it("unknown plan rejected", () => {
    const r = evaluateCheckoutRequest({ ...ok, planKey: "nope" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown_plan");
  });

  it("a FREE plan is not purchasable", () => {
    const r = evaluateCheckoutRequest({ ...ok, planKey: "free_worker", userRoles: ["worker"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_a_paid_plan");
  });

  it("a user without the plan's audience role is not eligible", () => {
    const r = evaluateCheckoutRequest({ ...ok, userRoles: ["worker"] });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe("not_eligible"); expect(r.status).toBe(403); }
  });

  it("an admin may start a test checkout for any paid plan (internal testing)", () => {
    const r = evaluateCheckoutRequest({ ...ok, userRoles: [], isAdmin: true });
    expect(r.ok).toBe(true);
  });

  it("missing test price → price_not_configured", () => {
    const r = evaluateCheckoutRequest({ ...ok, priceConfigured: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("price_not_configured");
  });

  it("valid test config + eligible + price → ok", () => {
    const r = evaluateCheckoutRequest(ok);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.planKey).toBe("company_pilot");
  });

  it("isPaidPlanKey marks the pilot tiers paid, free/admin not", () => {
    expect(isPaidPlanKey("worker_plus")).toBe(true);
    expect(isPaidPlanKey("company_pilot")).toBe(true);
    expect(isPaidPlanKey("agency_pilot")).toBe(true);
    expect(isPaidPlanKey("free_worker")).toBe(false);
    expect(isPaidPlanKey("admin_internal")).toBe(false);
  });
});

describe("evaluateCheckoutRequest — organization binding (company/agency)", () => {
  it("company/agency plans require an organization; worker plans do not", () => {
    expect(planRequiresOrganization("company")).toBe(true);
    expect(planRequiresOrganization("agency")).toBe(true);
    expect(planRequiresOrganization("worker")).toBe(false);
    expect(planRequiresOrganization("admin")).toBe(false);
  });

  it("a company plan without a resolvable org → organization_required, 400", () => {
    const r = evaluateCheckoutRequest({ ...ok, orgBinding: "missing" });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe("organization_required"); expect(r.status).toBe(400); }
  });

  it("a company plan for a FOREIGN org (no membership) → not_organization_member, 403", () => {
    const r = evaluateCheckoutRequest({ ...ok, orgBinding: "not_member" });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe("not_organization_member"); expect(r.status).toBe(403); }
  });

  it("omitted orgBinding fails CLOSED for a company plan (legacy caller)", () => {
    const r = evaluateCheckoutRequest({ ...ok, orgBinding: undefined });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("organization_required");
  });

  it("an ADMIN still cannot buy a company plan for a foreign organization", () => {
    const r = evaluateCheckoutRequest({
      ...ok, userRoles: [], isAdmin: true, orgBinding: "not_member",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_organization_member");
  });

  it("a personal (worker) plan needs no organization at all", () => {
    const r = evaluateCheckoutRequest({
      ...ok, planKey: "worker_plus", userRoles: ["worker"], orgBinding: "not_required",
    });
    expect(r.ok).toBe(true);
  });

  it("agency plan with verified membership → ok", () => {
    const r = evaluateCheckoutRequest({
      ...ok, planKey: "agency_pilot", userRoles: ["agency"], orgBinding: "verified",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.audience).toBe("agency");
  });
});
