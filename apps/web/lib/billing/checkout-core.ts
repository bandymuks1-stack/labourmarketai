/**
 * Test-checkout request gate — PURE core (Stripe sprint PR3). No IO. The route
 * (app/api/billing/test-checkout) wires auth + the provider around this. Every
 * rejection is honest and specific; checkout is possible ONLY in a valid Stripe
 * test config, for a known PAID plan, by an eligible user, with a configured
 * test price.
 */

import {
  PRE_PAYMENT_PLANS,
  PLAN_CATALOGUE_V2,
  type PlanAudience,
  type PlanV2Audience,
} from "@/lib/billing/plans";
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

/** V2 audience → the role string that makes a user eligible for its plans. */
function roleForV2Audience(audience: PlanV2Audience): string {
  return audience === "person" ? "worker" : audience;
}

/**
 * The plans a user can start a TEST checkout for: the legacy paid pilot
 * tiers plus the Sprint v2 §9 paid catalogue (ai_plus, vip_media,
 * launch_offer_99, agency_*). Free tiers are never checkout-able.
 */
export function isPaidPlanKey(planKey: string): boolean {
  const p = PRE_PAYMENT_PLANS.find((x) => x.slug === planKey);
  if (p) return p.accessState === "payment_not_enabled";
  const v2 = PLAN_CATALOGUE_V2.find((x) => x.slug === planKey);
  return Boolean(v2 && v2.accessState === "payment_not_enabled");
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
  const planV2 = plan
    ? null
    : (PLAN_CATALOGUE_V2.find((p) => p.slug === input.planKey) ?? null);
  if (!plan && !planV2) {
    return { ok: false, status: 400, reason: "unknown_plan" };
  }
  const accessState = plan ? plan.accessState : planV2!.accessState;
  if (accessState !== "payment_not_enabled") {
    return { ok: false, status: 400, reason: "not_a_paid_plan" };
  }

  // Eligibility: the plan's audience role, or an admin (for internal testing).
  // V2 "person" plans map to the worker role.
  const eligibleRole = plan
    ? plan.audience
    : roleForV2Audience(planV2!.audience);
  const eligible = input.isAdmin || input.userRoles.includes(eligibleRole);
  if (!eligible) return { ok: false, status: 403, reason: "not_eligible" };

  if (!input.priceConfigured) {
    return { ok: false, status: 400, reason: "price_not_configured" };
  }

  const audience: PlanAudience = plan
    ? plan.audience
    : (eligibleRole as PlanAudience);
  return { ok: true, planKey: plan ? plan.slug : planV2!.slug, audience };
}
