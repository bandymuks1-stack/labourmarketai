/**
 * Pre-payment PLAN BOUNDARY — source of truth (Stage 8).
 *
 * Describes what each plan WILL include when payments are later switched on.
 * This sprint connects NO Stripe and collects NO money: every paid plan is in
 * a `payment_not_enabled` state and access is granted MANUALLY by an admin
 * (pilot access). The catalogue is the contract the later Stripe sprint wires.
 *
 * Honesty (guarded by lib/guards/no-live-payments.test.ts):
 *   - this file carries NO payments switch: whether billing is on is the
 *     resolved billing config (lib/billing/config-core.ts, env-armed), never a
 *     code constant here; nothing here implies an active subscription;
 *   - no plan auto-grants itself — `accessState` is explicit;
 *   - feature entitlements are limits/booleans only, never a charge.
 *
 * Pure data + types. No IO.
 */

/**
 * OWNER LAUNCH PRICING (approved 2026-09-05, corrected the same day):
 *   PERSON            €0   — core person / worker / learner participation
 *   ORGANIZATION FREE €0   — 1 concurrent active position / open workforce need
 *   ORGANIZATION      €99  — NO fixed limit on concurrent active positions
 *                            (owner decision 2026-10-06: the former ten-position
 *                            ceiling is removed and replaced by no other cap).
 * Prices live ONLY in `plans.price_eur_monthly` (see lib/marketing/plans.ts);
 * this registry carries the boundary (what a plan DOES), never a figure.
 * Deferred and NOT sold: ai_plus, vip_media, agency tiers, LMC top-ups,
 * priority visibility, media upsells, annual and enterprise pricing.
 */
export const FREE_ORGANIZATION_PLAN_KEY = "free_organization" as const;
/** The ONE paid organization plan key (historical slug kept for the
 *  subscription store, env price slot and admin grants — the label says
 *  "Organization"). */
export const ORGANIZATION_PLAN_KEY = "company_pilot" as const;


/** Plans that exist in the registry but are not offered at launch. */
export const DEFERRED_PLAN_KEYS = ["worker_plus", "agency_pilot"] as const;

// The boundary TYPES and the plan DATA now live in the canonical typed catalogue
// (lib/commercial/plan-catalogue.ts). Everything below is DERIVED from it with
// identical values; lib/commercial/plan-catalogue.test.ts proves byte-equality
// against a pre-change snapshot. Entitlement decisions stay in
// lib/billing/entitlements-v1.ts (the shared resolver).
import {
  PLAN_CATALOGUE,
  toBoundary,
  type PlanAudience,
  type PrePaymentPlan,
} from "@/lib/commercial/plan-catalogue";

export type {
  Entitlement,
  FeatureKey,
  PlanAccessState,
  PlanAudience,
  PlanCta,
  PrePaymentPlan,
} from "@/lib/commercial/plan-catalogue";

export const PRE_PAYMENT_PLANS: readonly PrePaymentPlan[] = PLAN_CATALOGUE.map(toBoundary);

export function getPlan(slug: string): PrePaymentPlan | null {
  return PRE_PAYMENT_PLANS.find((p) => p.slug === slug) ?? null;
}

/** The default free plan for an audience (the one a new user starts on). */
export function defaultPlanFor(audience: PlanAudience): PrePaymentPlan {
  if (audience === "admin") return getPlan("admin_internal")!;
  // One organization plan family for every organization capability.
  if (audience === "company" || audience === "agency") return getPlan(FREE_ORGANIZATION_PLAN_KEY)!;
  return getPlan("free_worker")!;
}

/** The plans a person or organization can actually buy at launch. */
export function isSellablePlan(plan: Pick<PrePaymentPlan, "accessState" | "launch">): boolean {
  return plan.accessState === "payment_not_enabled" && plan.launch === "sellable";
}
