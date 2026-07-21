import { describe, it, expect } from "vitest";
import { evaluatePortalRequest, evaluateCustomerReadiness } from "./portal-core";

const ok = {
  config: { state: "stripe_test" as const },
  authenticated: true,
  customerLookup: "found" as const,
};

describe("evaluatePortalRequest — strict portal gate", () => {
  it("disabled billing → payments_disabled, 400", () => {
    const r = evaluatePortalRequest({ ...ok, config: { state: "disabled" } });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe("payments_disabled"); expect(r.status).toBe(400); }
  });

  it("live blocked → live_blocked, 403", () => {
    const r = evaluatePortalRequest({ ...ok, config: { state: "stripe_live_blocked" } });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe("live_blocked"); expect(r.status).toBe(403); }
  });

  it("unauthenticated → not_authenticated, 401", () => {
    const r = evaluatePortalRequest({ ...ok, authenticated: false });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe("not_authenticated"); expect(r.status).toBe(401); }
  });

  it("no stored customer mapping → no_billing_customer, 404 (no auto-create)", () => {
    const r = evaluatePortalRequest({ ...ok, customerLookup: "absent" });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.reason).toBe("no_billing_customer"); expect(r.status).toBe(404); }
  });

  it("billing tables absent → needs_migration (honest degrade)", () => {
    const r = evaluatePortalRequest({ ...ok, customerLookup: "needs-migration" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("needs_migration");
  });

  it("authenticated + test config + OWN stored customer → ok", () => {
    expect(evaluatePortalRequest(ok).ok).toBe(true);
  });
});

describe("evaluateCustomerReadiness — checkout fails closed without a persisted customer", () => {
  it("a persisted customer proceeds with its id", () => {
    const r = evaluateCustomerReadiness({ ok: true, customerId: "cus_1" });
    expect(r.proceed).toBe(true);
    if (r.proceed) expect(r.customerId).toBe("cus_1");
  });

  it("needs-migration → 503 honest degrade, checkout NOT started", () => {
    const r = evaluateCustomerReadiness({ ok: false, reason: "needs-migration" });
    expect(r.proceed).toBe(false);
    if (!r.proceed) {
      expect(r.status).toBe(503);
      expect(r.reason).toBe("billing_customer_needs_migration");
    }
  });

  it("store/provider error → 502, checkout NOT started (no orphan customer)", () => {
    for (const reason of ["store_error", "provider_inactive", "stripe_error"]) {
      const r = evaluateCustomerReadiness({ ok: false, reason });
      expect(r.proceed).toBe(false);
      if (!r.proceed) expect(r.reason).toBe("billing_customer_unavailable");
    }
  });
});
