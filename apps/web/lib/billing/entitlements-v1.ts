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
  ORGANIZATION_PLAN_KEY,
  PRE_PAYMENT_PLANS,
  isSellablePlan,
  type PrePaymentPlan,
  getPlan,
  type FeatureKey,
  type PlanAudience,
} from "@/lib/billing/plans";
import { planIncludes } from "@/lib/billing/entitlements";
import type { SubStatus } from "@/lib/billing/webhook-core";

export type EntitlementSource =
  | "admin"
  /** A permanent VIP organization (owner decision 2026-11-15): the highest
   *  organization plan, at no charge, with no end and no return to free. */
  | "vip"
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
  /** The organization acted for is a permanent VIP (lib/billing/vip-organizations.ts). */
  readonly vip?: boolean;
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

  // A permanent VIP organization holds the highest organization plan before any
  // subscription row is read: no status, no period end and no expired pilot pass
  // can move it to free (owner decision 2026-11-15).
  if (input.vip) {
    return {
      effectivePlanKey: highestOrganizationPlanKey(),
      source: "vip",
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

/** Weight of one entitlement when comparing plans: `true` (included, no
 *  ceiling) outranks any number; a number counts by its size; absent/false = 0. */
function entitlementWeight(e: boolean | number | undefined): number {
  if (e === true) return Number.POSITIVE_INFINITY;
  if (typeof e === "number") return e;
  return 0;
}

/** Whether plan `a` gives at least as much as plan `b` in every feature and more in one. */
function dominates(a: PrePaymentPlan, b: PrePaymentPlan): boolean {
  const keys = new Set([...Object.keys(a.entitlements), ...Object.keys(b.entitlements)]) as Set<keyof PrePaymentPlan["entitlements"]>;
  let more = false;
  for (const k of keys) {
    const wa = entitlementWeight(a.entitlements[k]);
    const wb = entitlementWeight(b.entitlements[k]);
    if (wa < wb) return false;
    if (wa > wb) more = true;
  }
  return more;
}

/**
 * THE HIGHEST ORGANIZATION PLAN that exists — what a permanent VIP organization
 * holds (owner decision 2026-11-15). Derived from the catalogue, never named, so
 * a higher organization plan added later is picked up with no change here:
 * among the organization plans that are sold (`sellable`), the one no other plan
 * dominates; on a tie the catalogue order decides. With no sellable plan at all
 * it is the one paid organization plan.
 */
export function highestOrganizationPlanKey(): string {
  const candidates = PRE_PAYMENT_PLANS.filter(
    (p) => (p.audience === "company" || p.audience === "agency") && isSellablePlan(p),
  );
  if (candidates.length === 0) return ORGANIZATION_PLAN_KEY;
  const top = candidates.find((c) => !candidates.some((o) => o !== c && dominates(o, c)));
  return (top ?? candidates[0]).slug;
}
