/**
 * Test-checkout request gate — PURE core (Stripe sprint PR3). No IO. The route
 * (app/api/billing/test-checkout) wires auth + the provider around this. Every
 * rejection is honest and specific; checkout is possible ONLY in a valid Stripe
 * test config, for a known PAID plan, by an eligible user, with a configured
 * test price.
 */

import { PRE_PAYMENT_PLANS, type PlanAudience } from "@/lib/billing/plans";
import type { BillingConfig } from "@/lib/billing/config-core";

export type CheckoutRejectReason =
  | "payments_disabled"
  | "live_blocked"
  | "unknown_plan"
  | "not_a_paid_plan"
  | "not_eligible"
  | "price_not_configured"
  | "not_authenticated";

export type CheckoutGateResult =
  | { ok: true; planKey: string; audience: PlanAudience }
  | { ok: false; status: number; reason: CheckoutRejectReason };

/** The plans a user can start a TEST checkout for (the paid pilot tiers). */
export function isPaidPlanKey(planKey: string): boolean {
  const p = PRE_PAYMENT_PLANS.find((x) => x.slug === planKey);
  return Boolean(p && p.accessState === "payment_not_enabled");
}

export function evaluateCheckoutRequest(input: {
  config: Pick<BillingConfig, "state" | "reason">;
  authenticated: boolean;
  planKey: string;
  userRoles: readonly string[];
  isAdmin: boolean;
  priceConfigured: boolean;
}): CheckoutGateResult {
  // Billing must be in a valid Stripe TEST state.
  if (input.config.state === "stripe_live_blocked") {
    return { ok: false, status: 403, reason: "live_blocked" };
  }
  if (input.config.state !== "stripe_test") {
    return { ok: false, status: 400, reason: "payments_disabled" };
  }
  if (!input.authenticated) {
    return { ok: false, status: 401, reason: "not_authenticated" };
  }

  const plan = PRE_PAYMENT_PLANS.find((p) => p.slug === input.planKey);
  if (!plan) return { ok: false, status: 400, reason: "unknown_plan" };
  if (plan.accessState !== "payment_not_enabled") {
    return { ok: false, status: 400, reason: "not_a_paid_plan" };
  }

  // Eligibility: the plan's audience role, or an admin (for internal testing).
  const eligible = input.isAdmin || input.userRoles.includes(plan.audience);
  if (!eligible) return { ok: false, status: 403, reason: "not_eligible" };

  if (!input.priceConfigured) {
    return { ok: false, status: 400, reason: "price_not_configured" };
  }

  return { ok: true, planKey: plan.slug, audience: plan.audience };
}
