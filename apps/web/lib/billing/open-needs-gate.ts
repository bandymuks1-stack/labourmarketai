import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getEffectiveEntitlements, hasFeature } from "@/lib/billing/effective-entitlements";
import { entitlementAllows } from "@/lib/billing/entitlements-v1";
import { limitFor } from "@/lib/billing/entitlements";
import { FREE_ORGANIZATION_PLAN_KEY, OPEN_NEEDS_CONTACT_THRESHOLD, getPlan } from "@/lib/billing/plans";
import { DEMAND_KIND_OR_FILTER } from "@/lib/demand/market-direction";

/**
 * OPEN-NEEDS ENTITLEMENT SEAM (owner launch pricing 2026-09-05).
 *
 *   ORGANIZATION FREE  — 1 concurrent active position / open workforce need
 *   ORGANIZATION €99   — up to 10
 *   more than 10       — the individual-plan / contact path: never a silent
 *                        charge, never an automatic public tier.
 *
 * ONE place decides, for the ONE canonical demand creation path
 * (`submitDemandRequestCore` → `submit_demand_request_v2`): the organization's
 * effective plan (subscription-derived, server-resolved — never trusted from
 * the client) and the organization's REAL count of active open needs
 * (`customer_requests`, statuses that are neither draft nor closed), counted
 * under the caller's RLS. Permissive while billing is disabled (the pilot
 * stays as it is — the same rule the booking gate follows); enforced the
 * moment a Stripe adapter state is active.
 *
 * A NEED IS A NEED, AND AN OFFER IS NOT ONE (2026-09-06). The count used to
 * include every `customer_requests` row of every kind, so an agency's
 * `agency_offer` — "turime 20 suvirintojų ir ieškome jiems darbo", capacity it
 * HAS — consumed the employer's active-need allowance. Measured as a hard
 * block on production the same day: a FREE organisation holding one open need
 * could not state its capacity at all, and the supply door shipped in #1587
 * answered the sentence with an upgrade prompt.
 *
 * So the count is scoped to the DEMAND direction, through the same closed
 * allow-list every other surface uses. NOTHING ELSE MOVES: no price, no plan,
 * no limit, no enforcement rule — only WHICH rows are counted against a
 * ceiling whose own name is "open needs".
 *
 * The consequence is deliberate and stated rather than hidden: offered
 * capacity is currently UNMETERED. If supply is to be metered it needs its own
 * limit and its own unit — thirty offered workers are not thirty paid market
 * intents (owner window 7 §24) — not a borrowed seat in the demand ceiling.
 */
export const ACTIVE_OPEN_NEED_STATUSES = ["submitted", "in_review", "needs_followup", "approved"] as const;

export type OpenNeedsGate =
  | { readonly allowed: true; readonly enforced: boolean; readonly limit: number | null; readonly used: number }
  | {
      readonly allowed: false;
      readonly reason: "over_open_need_limit";
      readonly limit: number;
      readonly used: number;
      /** FREE → the €99 plan; €99 → the individual plan (contact us). */
      readonly next: "upgrade" | "individual_plan";
      readonly planKey: string;
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** The organization's active open needs — bounded count, never the rows. */
export async function countActiveOpenNeeds(
  supabase: SupabaseClient,
  organizationId: string,
  profileId: string,
): Promise<number | null> {
  // Rows stamped to the organization, plus the caller's own rows that predate
  // organization stamping (organization_id null) — both are the organization's
  // open needs in practice; neither is counted twice.
  // Two `or` groups: PostgREST ANDs repeated `or` params, so this reads as
  // "(mine or the organisation's) AND (a demand kind)".
  const { count, error } = await asAny(supabase)
    .from("customer_requests")
    .select("id", { count: "exact", head: true })
    .in("status", [...ACTIVE_OPEN_NEED_STATUSES])
    .or(`organization_id.eq.${organizationId},and(profile_id.eq.${profileId},organization_id.is.null)`)
    .or(DEMAND_KIND_OR_FILTER);
  if (error) return null;
  return typeof count === "number" ? count : 0;
}

export function decideOpenNeedsGate(input: {
  readonly enforced: boolean;
  readonly planKey: string;
  readonly limit: number | null;
  readonly used: number | null;
}): OpenNeedsGate {
  if (!input.enforced) return { allowed: true, enforced: false, limit: input.limit, used: input.used ?? 0 };
  // An unreadable count FAILS CLOSED once billing is enforced: a limit that
  // cannot be checked is not a limit.
  const used = input.used;
  if (used === null) {
    return { allowed: false, reason: "over_open_need_limit", limit: input.limit ?? 0, used: 0, next: nextStep(input.planKey), planKey: input.planKey };
  }
  if (input.limit !== null && used >= input.limit) {
    return { allowed: false, reason: "over_open_need_limit", limit: input.limit, used, next: nextStep(input.planKey), planKey: input.planKey };
  }
  return { allowed: true, enforced: true, limit: input.limit, used };
}

/** Past the paid plan's ceiling there is no next public tier — only a conversation. */
function nextStep(planKey: string): "upgrade" | "individual_plan" {
  const plan = getPlan(planKey);
  const limit = plan ? limitFor(plan, "company_create_needs") : null;
  if (planKey === FREE_ORGANIZATION_PLAN_KEY) return "upgrade";
  if (limit !== null && limit >= OPEN_NEEDS_CONTACT_THRESHOLD) return "individual_plan";
  return "upgrade";
}

export async function gateOpenNeeds(
  supabase: SupabaseClient,
  organizationId: string,
  profileId: string,
): Promise<OpenNeedsGate> {
  const ctx = await getEffectiveEntitlements();
  const plan = getPlan(ctx.effectivePlanKey);
  // The plan boundary itself — the SAME server seam every gated feature uses.
  const included = (await hasFeature("company_create_needs")) && entitlementAllows(ctx, "company_create_needs");
  const limit = plan ? limitFor(plan, "company_create_needs") : null;
  if (ctx.enforced && !included) {
    return { allowed: false, reason: "over_open_need_limit", limit: limit ?? 0, used: 0, next: nextStep(ctx.effectivePlanKey), planKey: ctx.effectivePlanKey };
  }
  const used = ctx.enforced ? await countActiveOpenNeeds(supabase, organizationId, profileId) : 0;
  return decideOpenNeedsGate({ enforced: ctx.enforced, planKey: ctx.effectivePlanKey, limit, used });
}
