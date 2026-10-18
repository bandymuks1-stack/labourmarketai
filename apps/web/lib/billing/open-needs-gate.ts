import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getEffectiveEntitlements } from "@/lib/billing/effective-entitlements";
import { entitlementAllows } from "@/lib/billing/entitlements-v1";
import { limitFor } from "@/lib/billing/entitlements";
import { getPlan } from "@/lib/billing/plans";
import { DEMAND_KIND_OR_FILTER } from "@/lib/demand/market-direction";

/**
 * OPEN-NEEDS ENTITLEMENT SEAM (owner launch pricing 2026-09-05).
 *
 *   ORGANIZATION FREE  — 1 concurrent active position / open workforce need
 *   ORGANIZATION €99   — NO fixed limit (owner decision 2026-10-06: the former
 *                        ten-position ceiling is removed, replaced by no other
 *                        commercial cap). The plan's `company_create_needs`
 *                        entitlement is boolean `true`: included, unmetered.
 *
 * An unlimited plan is never counted and never fails closed on a count: a
 * ceiling that does not exist cannot be unreadable. Abuse / security protections
 * (request rate limits, intake throttles) live elsewhere and are not an
 * entitlement.
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
      /**
       * FREE → the €99 plan. "individual_plan" is retained in the union for
       * callers' exhaustive handling but is no longer produced: no plan has a
       * paid ceiling to be exceeded.
       */
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
  // No numeric ceiling (the Organization plan): nothing to check, nothing to
  // fail closed on - an unreadable count cannot block an unlimited plan.
  if (input.limit === null) return { allowed: true, enforced: true, limit: null, used: input.used ?? 0 };
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

/** The only ceiling is the FREE plan's: the next step is always the Organization plan. */
function nextStep(_planKey: string): "upgrade" | "individual_plan" {
  return "upgrade";
}

export async function gateOpenNeeds(
  supabase: SupabaseClient,
  organizationId: string,
  profileId: string,
): Promise<OpenNeedsGate> {
  // The entitlement subject is THIS gate's own subject — the caller's client,
  // profile and the organization its employer gate proved — never the cookie
  // session, which a bearer (MCP) request does not carry. For a web caller the
  // two are the same user and workspace; for an assistant caller the cookie
  // read saw NO user and judged the organization against the anonymous person
  // plan, refusing every create/reopen while billing is live (2026-09-30).
  const ctx = await getEffectiveEntitlements({ supabase, userId: profileId, organizationId });
  const plan = getPlan(ctx.effectivePlanKey);
  // The plan boundary itself — the SAME predicate `hasFeature` applies.
  const included = entitlementAllows(ctx, "company_create_needs");
  const limit = plan ? limitFor(plan, "company_create_needs") : null;
  if (ctx.enforced && !included) {
    return { allowed: false, reason: "over_open_need_limit", limit: limit ?? 0, used: 0, next: nextStep(ctx.effectivePlanKey), planKey: ctx.effectivePlanKey };
  }
  // Unmetered plan (no numeric limit): skip the count entirely.
  const used = ctx.enforced && limit !== null ? await countActiveOpenNeeds(supabase, organizationId, profileId) : 0;
  return decideOpenNeedsGate({ enforced: ctx.enforced, planKey: ctx.effectivePlanKey, limit, used });
}
