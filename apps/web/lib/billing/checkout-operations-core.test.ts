/**
 * Checkout operations — PURE core (billing safety v1).
 *
 * Pins: the blocking-status set, the derived idempotency key (same operation →
 * same key), the window ↔ Stripe expires_at identity, reusability, and the
 * admission decision table (refuse unless the provider proves the local
 * blocking row is dead; manual grants never block; fail CLOSED when the
 * provider cannot be reached).
 */
import { describe, expect, it } from "vitest";

import {
  BLOCKING_SUBSCRIPTION_STATUSES,
  CHECKOUT_WINDOW_MINUTES,
  checkoutOperationIdempotencyKey,
  checkoutWindow,
  decideCheckoutAdmission,
  expiresAtUnixFromIso,
  isOperationReusable,
  providerStatusIsDead,
  scopeKeyFor,
  subscriptionBlocksCheckout,
} from "./checkout-operations-core";

describe("blocking statuses — what refuses a fresh checkout", () => {
  it("active / trialing / past_due / incomplete / unpaid block; cancelled / expired / none do not", () => {
    for (const s of ["active", "trialing", "past_due", "incomplete", "unpaid"]) {
      expect(subscriptionBlocksCheckout(s), s).toBe(true);
    }
    for (const s of ["cancelled", "expired", "none", null, undefined]) {
      expect(subscriptionBlocksCheckout(s as string | null | undefined), String(s)).toBe(false);
    }
    expect(BLOCKING_SUBSCRIPTION_STATUSES).toHaveLength(5);
  });

  it("only cancelled / expired count as a DEAD provider status", () => {
    expect(providerStatusIsDead("cancelled")).toBe(true);
    expect(providerStatusIsDead("expired")).toBe(true);
    for (const s of ["active", "trialing", "past_due", "incomplete", "unpaid", "none"] as const) {
      expect(providerStatusIsDead(s), s).toBe(false);
    }
  });
});

describe("operation identity → Stripe idempotency key", () => {
  const scope = { type: "organization" as const, id: "org-1" };

  it("the key is derived from the operation id (same op → same key; different op → different key)", () => {
    const a = checkoutOperationIdempotencyKey({ operationId: "op-1", planKey: "company_pilot", scope });
    const b = checkoutOperationIdempotencyKey({ operationId: "op-1", planKey: "company_pilot", scope });
    const c = checkoutOperationIdempotencyKey({ operationId: "op-2", planKey: "company_pilot", scope });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe("co2_organization_org-1_company_pilot_op-1");
  });

  it("stays under Stripe's 255-char limit with uuid-sized ids", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    const key = checkoutOperationIdempotencyKey({
      operationId: uuid,
      planKey: "company_pilot",
      scope: { type: "organization", id: uuid },
    });
    expect(key.length).toBeLessThan(255);
  });

  it("scope keys discriminate organization from personal subjects", () => {
    expect(scopeKeyFor({ type: "organization", id: "x" })).toBe("organization:x");
    expect(scopeKeyFor({ type: "profile", id: "x" })).toBe("profile:x");
  });
});

describe("window ↔ session expiry", () => {
  it("the window is 45 minutes (above Stripe's 30-minute expires_at minimum) and its unix value is exact", () => {
    expect(CHECKOUT_WINDOW_MINUTES).toBe(45);
    const now = new Date("2026-09-05T10:00:00.000Z");
    const w = checkoutWindow(now);
    expect(w.expiresAt.toISOString()).toBe("2026-09-05T10:45:00.000Z");
    expect(w.expiresAtUnix).toBe(Math.floor(w.expiresAt.getTime() / 1000));
    // The stored ISO round-trips to the SAME unix value on every reuse — the
    // Stripe replay requires identical parameters.
    expect(expiresAtUnixFromIso(w.expiresAt.toISOString())).toBe(w.expiresAtUnix);
  });

  it("an operation is reusable only while open AND inside its window", () => {
    const now = new Date("2026-09-05T10:00:00.000Z");
    expect(isOperationReusable({ status: "open", expiresAt: "2026-09-05T10:30:00.000Z" }, now)).toBe(true);
    expect(isOperationReusable({ status: "open", expiresAt: "2026-09-05T09:59:59.000Z" }, now)).toBe(false);
    expect(isOperationReusable({ status: "completed", expiresAt: "2026-09-05T10:30:00.000Z" }, now)).toBe(false);
    expect(isOperationReusable({ status: "failed", expiresAt: "2026-09-05T10:30:00.000Z" }, now)).toBe(false);
  });
});

describe("admission decision — one active subscription per subject + plan", () => {
  it("no local row → admit", () => {
    expect(decideCheckoutAdmission({ local: null, provider: null })).toEqual({ admit: true, reason: "no_local_subscription" });
  });

  it("a manual admin grant is not a payable subscription → admit", () => {
    const r = decideCheckoutAdmission({ local: { status: "active", providerSubscriptionId: "manual_abc" }, provider: null });
    expect(r).toEqual({ admit: true, reason: "manual_override_only" });
  });

  it("a cancelled / expired local row → admit without asking the provider", () => {
    for (const status of ["cancelled", "expired", "none"] as const) {
      const r = decideCheckoutAdmission({ local: { status, providerSubscriptionId: "sub_1" }, provider: null });
      expect(r.admit, status).toBe(true);
    }
  });

  it("a blocking local row with NO provider answer → REFUSE (fail closed)", () => {
    for (const status of ["active", "trialing", "past_due", "incomplete", "unpaid"] as const) {
      const r = decideCheckoutAdmission({ local: { status, providerSubscriptionId: "sub_1" }, provider: null });
      expect(r).toEqual({ admit: false, reason: "subscription_exists", localStatus: status, provider: "unavailable" });
    }
  });

  it("a blocking local row the provider CONFIRMS live → REFUSE", () => {
    const r = decideCheckoutAdmission({
      local: { status: "incomplete", providerSubscriptionId: "sub_1" },
      provider: { status: "active" },
    });
    expect(r).toEqual({ admit: false, reason: "subscription_exists", localStatus: "incomplete", provider: "confirmed_live" });
  });

  it("a blocking local row the provider says is DEAD → admit and heal", () => {
    const r = decideCheckoutAdmission({
      local: { status: "active", providerSubscriptionId: "sub_1" },
      provider: { status: "cancelled" },
    });
    expect(r).toEqual({ admit: true, reason: "healed_from_provider", providerStatus: "cancelled" });
  });

  it("the provider can never ADD an entitlement through admission — a provider 'active' answer only refuses", () => {
    const r = decideCheckoutAdmission({
      local: { status: "past_due", providerSubscriptionId: "sub_1" },
      provider: { status: "active" },
    });
    expect(r.admit).toBe(false);
  });
});
