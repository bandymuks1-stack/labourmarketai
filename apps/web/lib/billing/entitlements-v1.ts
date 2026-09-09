/**
 * Entitlement enforcement v1 — PURE core (Stripe sprint PR5). Joins the plan
 * boundary with the REAL (test) subscription state. No IO.
 *
 * Honesty rules:
 *   - an entitlement is NEVER granted from a fake/active claim — only from an
 *     active/trialing subscription, an admin, or an explicit admin override;
 *   - cancelled/expired/unpaid/none → fall back to free; past_due → a flagged
 *     grace (still entitled for now, surfaced honestly);
 *   - when billing is DISABLED (no test config), enforcement is PERMISSIVE so
 *     the existing pilot is not retroactively locked — features marked future
 *     stay open and nothing claims a paid status.
 */

import {
  FREE_ORGANIZATION_PLAN_KEY,
  PRE_PAYMENT_PLANS,
  getPlan,
  type FeatureKey,
  type PlanAudience,
} from "@/lib/billing/plans";
import { planIncludes } from "@/lib/billing/entitlements";
import type { SubStatus } from "@/lib/billing/webhook-core";

export type EntitlementSource =
  | "admin"
  | "subscription"
  | "manual_override"
  | "free"
  | "billing_disabled";

export interface EntitlementContext {
  readonly effectivePlanKey: string;
  readonly source: EntitlementSource;
  readonly subscriptionStatus: SubStatus | null;
  /** A paid plan is currently entitling (active/trialing/grace/override/admin). */
  readonly active: boolean;
  /** past_due grace — entitled for now, but surfaced honestly. */
  readonly grace: boolean;
  /** Billing not in test mode → enforcement is permissive (pilot preserved). */
  readonly enforced: boolean;
}

/** The free/base plan for an audience (only workers have a real free tier). */
function freePlanFor(audience: PlanAudience): string {
  if (audience === "worker") return "free_worker";
  if (audience === "admin") return "admin_internal";
  // Owner launch pricing 2026-09-05: ONE organization plan family — an
  // organization without a subscription is ORGANIZATION FREE (a real free
  // plan: 1 active position) whether it acts as employer, staffing provider,
  // contractor or training provider.
  return FREE_ORGANIZATION_PLAN_KEY;
}

export interface ResolveEntitlementsInput {
  /** Billing is in a valid Stripe test config (enforcement on). */
  readonly billingActive: boolean;
  readonly isAdmin: boolean;
  readonly audience: PlanAudience;
  readonly subscriptionPlanKey: string | null;
  readonly subscriptionStatus: SubStatus | null;
  /** Admin-granted pilot access (no subscription required). */
  readonly manualOverridePlanKey: string | null;
}

export function resolveEntitlements(
  input: ResolveEntitlementsInput,
): EntitlementContext {
  // Admins always have internal access.
  if (input.isAdmin) {
    return {
      effectivePlanKey: "admin_internal",
      source: "admin",
      subscriptionStatus: input.subscriptionStatus,
      active: true,
      grace: false,
      enforced: input.billingActive,
    };
  }

  const s = input.subscriptionStatus;
  const subActive = s === "active" || s === "trialing";
  const subGrace = s === "past_due";

  if (input.subscriptionPlanKey && (subActive || subGrace)) {
    return {
      effectivePlanKey: input.subscriptionPlanKey,
      source: "subscription",
      subscriptionStatus: s,
      active: true,
      grace: subGrace,
      enforced: input.billingActive,
    };
  }

  if (input.manualOverridePlanKey) {
    return {
      effectivePlanKey: input.manualOverridePlanKey,
      source: "manual_override",
      subscriptionStatus: s,
      active: true,
      grace: false,
      enforced: input.billingActive,
    };
  }

  return {
    effectivePlanKey: freePlanFor(input.audience),
    source: input.billingActive ? "free" : "billing_disabled",
    subscriptionStatus: s,
    active: false,
    grace: false,
    enforced: input.billingActive,
  };
}

/**
 * Whether a feature is allowed under a context. PERMISSIVE when billing is not
 * enforced (pilot preserved). When enforced: allowed iff the effective plan
 * includes the feature AND (the plan is the free tier OR the context is active).
 */
export function entitlementAllows(
  ctx: EntitlementContext,
  feature: FeatureKey,
): boolean {
  if (!ctx.enforced) return true; // pilot: nothing is hard-locked yet
  const plan = getPlan(ctx.effectivePlanKey);
  if (!plan) return false;
  if (!planIncludes(plan, feature)) return false;
  // Free features are always available; paid features need an active context.
  if (plan.accessState === "free") return true;
  return ctx.active;
}

/** The set of plan keys (for admin/debug surfaces). */
export function allPlanKeys(): string[] {
  return PRE_PAYMENT_PLANS.map((p) => p.slug);
}
