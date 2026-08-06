/**
 * Customer Portal request gate — PURE core (Stripe TEST subscriptions v1).
 * No IO. The route (app/api/billing/portal) wires auth + the customer lookup +
 * the provider around this. A portal session is possible ONLY in a valid
 * Stripe TEST config, for an authenticated user, for the user's OWN stored
 * billing customer (the route never accepts a caller-supplied customer id).
 */

import type { BillingConfig } from "@/lib/billing/config-core";

export type PortalRejectReason =
  | "payments_disabled"
  | "live_blocked"
  | "not_authenticated"
  | "no_billing_customer"
  | "needs_migration";

export type PortalGateResult =
  | { ok: true }
  | { ok: false; status: number; reason: PortalRejectReason };

export function evaluatePortalRequest(input: {
  config: Pick<BillingConfig, "state">;
  authenticated: boolean;
  /** Result of looking up the CALLER's own billing_customers row. */
  customerLookup: "found" | "absent" | "needs-migration";
}): PortalGateResult {
  if (input.config.state === "stripe_live_blocked") {
    return { ok: false, status: 403, reason: "live_blocked" };
  }
  if (input.config.state !== "stripe_test") {
    return { ok: false, status: 400, reason: "payments_disabled" };
  }
  if (!input.authenticated) {
    return { ok: false, status: 401, reason: "not_authenticated" };
  }
  if (input.customerLookup === "needs-migration") {
    return { ok: false, status: 400, reason: "needs_migration" };
  }
  if (input.customerLookup !== "found") {
    // No stored mapping → the user has never started a checkout; there is
    // nothing to manage. Honest, specific error (no auto-create here).
    return { ok: false, status: 404, reason: "no_billing_customer" };
  }
  return { ok: true };
}

/**
 * Checkout-side customer readiness (pure). Checkout must NOT proceed without
 * a PERSISTED customer mapping: a session created with a bare email mints a
 * provider customer that has no billing_customers row, so the portal can
 * never manage it and expired idempotency keys could mint further customers.
 * Fail closed with an honest, specific reason instead.
 */
export type CustomerReadiness =
  | { proceed: true; customerId: string }
  | {
      proceed: false;
      status: number;
      reason: "billing_customer_needs_migration" | "billing_customer_unavailable";
    };

export function evaluateCustomerReadiness(
  ensure:
    | { ok: true; customerId: string }
    | { ok: false; reason: string },
): CustomerReadiness {
  if (ensure.ok) return { proceed: true, customerId: ensure.customerId };
  if (ensure.reason === "needs-migration") {
    return { proceed: false, status: 503, reason: "billing_customer_needs_migration" };
  }
  return { proceed: false, status: 502, reason: "billing_customer_unavailable" };
}
