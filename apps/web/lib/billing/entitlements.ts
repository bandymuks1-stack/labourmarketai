/**
 * Feature entitlement resolution (Stage 8) — pure, no IO.
 *
 * Describes the plan boundary WITHOUT enforcing a hard paywall: payments are
 * off this sprint, so a premium surface shows an honest "payment not enabled —
 * request pilot access" state rather than charging or hard-blocking. The same
 * helpers will back real enforcement once the Stripe sprint flips
 * PAYMENTS_ENABLED.
 */

import {
  PAYMENTS_ENABLED,
  getPlan,
  type Entitlement,
  type FeatureKey,
  type PlanCta,
  type PrePaymentPlan,
} from "./plans";

export function isPaymentEnabled(): boolean {
  return PAYMENTS_ENABLED;
}

export function entitlementFor(
  plan: PrePaymentPlan,
  feature: FeatureKey,
): Entitlement | undefined {
  return plan.entitlements[feature];
}

/** Numeric limit for a feature, or null when it is not a numeric entitlement. */
export function limitFor(plan: PrePaymentPlan, feature: FeatureKey): number | null {
  const e = plan.entitlements[feature];
  return typeof e === "number" ? e : null;
}

/** Whether the plan includes the feature at all (boolean true or limit > 0). */
export function planIncludes(plan: PrePaymentPlan, feature: FeatureKey): boolean {
  const e = plan.entitlements[feature];
  if (typeof e === "boolean") return e;
  if (typeof e === "number") return e > 0;
  return false;
}

export type GateReason =
  | "ok"
  | "payment_not_enabled"
  | "not_in_plan"
  | "over_limit";

export interface GateResult {
  readonly allowed: boolean;
  readonly reason: GateReason;
  /** CTA the UI should render for this gate. */
  readonly cta: PlanCta | null;
  readonly limit: number | null;
}

/**
 * Resolve the gate for a feature on a plan, given current usage (for numeric
 * limits). Pre-payment: a feature that the plan includes but that sits on a
 * `payment_not_enabled` tier resolves to `payment_not_enabled` (informational),
 * never a charge.
 */
export function gateFeature(
  plan: PrePaymentPlan,
  feature: FeatureKey,
  usage = 0,
): GateResult {
  const limit = limitFor(plan, feature);
  if (!planIncludes(plan, feature)) {
    return { allowed: false, reason: "not_in_plan", cta: plan.cta, limit };
  }
  if (limit !== null && usage >= limit) {
    return { allowed: false, reason: "over_limit", cta: plan.cta, limit };
  }
  if (plan.accessState === "payment_not_enabled") {
    return {
      allowed: false,
      reason: "payment_not_enabled",
      cta: "request_pilot_access",
      limit,
    };
  }
  return { allowed: true, reason: "ok", cta: null, limit };
}

/** Convenience: gate a feature by plan slug (unknown slug → not_in_plan). */
export function gateFeatureBySlug(
  slug: string,
  feature: FeatureKey,
  usage = 0,
): GateResult {
  const plan = getPlan(slug);
  if (!plan) return { allowed: false, reason: "not_in_plan", cta: "contact", limit: null };
  return gateFeature(plan, feature, usage);
}
