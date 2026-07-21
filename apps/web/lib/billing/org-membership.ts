import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { OrgBindingResult } from "@/lib/billing/checkout-core";

/**
 * Organization binding for company/agency plan checkout (Stripe TEST
 * subscriptions v1). Reuses the CANONICAL org model — `organizations` +
 * `engagement_contexts` (0013) — no new membership table.
 *
 * A caller may buy a company/agency plan ONLY for an organization where they
 * hold a purchase-grade membership:
 *   - `organizations.owner_profile_id = caller`, or
 *   - an ACTIVE `engagement_contexts` row with relationship owner/manager.
 *
 * Resolution is fail-closed and RLS-scoped (the caller's own session client):
 *   - explicit organizationId → verify membership, else "not_member";
 *   - no organizationId → default ONLY when the caller owns exactly one
 *     organization; zero or several → "missing" (must be explicit).
 */

const PURCHASE_RELATIONSHIPS = ["owner", "manager"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface ResolvedOrgBinding {
  binding: OrgBindingResult;
  organizationId: string | null;
}

export async function resolveOrganizationBinding(
  supabase: SupabaseClient,
  userId: string,
  requestedOrganizationId: string | null,
): Promise<ResolvedOrgBinding> {
  if (requestedOrganizationId) {
    const member = await hasPurchaseMembership(
      supabase,
      userId,
      requestedOrganizationId,
    );
    return member
      ? { binding: "verified", organizationId: requestedOrganizationId }
      : { binding: "not_member", organizationId: null };
  }

  // No explicit org — default only to an UNAMBIGUOUS owned organization.
  const { data, error } = await asAny(supabase)
    .from("organizations")
    .select("id")
    .eq("owner_profile_id", userId)
    .limit(2);
  if (error) return { binding: "missing", organizationId: null };
  const owned = (data ?? []) as { id: string }[];
  if (owned.length === 1) {
    return { binding: "verified", organizationId: owned[0].id };
  }
  return { binding: "missing", organizationId: null };
}

async function hasPurchaseMembership(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const { data: org, error: orgErr } = await asAny(supabase)
    .from("organizations")
    .select("id, owner_profile_id")
    .eq("id", organizationId)
    .maybeSingle();
  if (!orgErr && org?.owner_profile_id === userId) return true;

  const { data: ctx, error: ctxErr } = await asAny(supabase)
    .from("engagement_contexts")
    .select("id")
    .eq("profile_id", userId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("relationship_slug", [...PURCHASE_RELATIONSHIPS])
    .limit(1);
  if (ctxErr) return false;
  return ((ctx ?? []) as { id: string }[]).length > 0;
}
