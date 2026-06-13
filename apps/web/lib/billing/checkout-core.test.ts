import { describe, it, expect } from "vitest";
import { evaluateCheckoutRequest, isPaidPlanKey } from "./checkout-core";

const ok = {
  config: { state: "stripe_test" as const, reason: "ok" as const },
  authenticated: true,
  planKey: "company_pilot",
  userRoles: ["company"],
  isAdmin: false,
  priceConfigured: true,
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
