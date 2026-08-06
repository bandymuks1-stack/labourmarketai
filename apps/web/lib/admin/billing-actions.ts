"use server";

import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperadmin } from "@/lib/auth/superadmin";
import { revalidatePath } from "next/cache";
import { PRE_PAYMENT_PLANS } from "@/lib/billing/plans";

/**
 * Admin manual pilot-access override (Stripe sprint PR6). An admin can grant /
 * revoke a TEST pilot entitlement without a Stripe subscription. Stored as a
 * billing_subscriptions row marked `manual_…` (test_mode=true) so it is clearly
 * an override, not a real payment. Admin-gated; uses the service-role client
 * because billing tables carry no authenticated write policy by design.
 * NEVER enables live payments. Degrades when the PR2 tables are absent.
 */

const RELATION_ABSENT = "42P01";
const UNIQUE_VIOLATION = "23505";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  return createAdminClient();
}

export type AdminBillingResult =
  | { ok: true }
  | { ok: false; reason: "not_admin" | "invalid_plan" | "needs_migration" | "error" };

function isPaidPlan(planKey: string): boolean {
  const p = PRE_PAYMENT_PLANS.find((x) => x.slug === planKey);
  return Boolean(p && p.accessState === "payment_not_enabled");
}

export async function grantPilotAccessAction(input: {
  locale: string;
  ownerId: string;
  planKey: string;
}): Promise<AdminBillingResult> {
  if (!(await isSuperadmin())) return { ok: false, reason: "not_admin" };
  if (!isPaidPlan(input.planKey)) return { ok: false, reason: "invalid_plan" };

  const sb: SupabaseClient = admin();
  // Manual pilot grants are org-less (organization_id NULL) personal rows.
  // We CANNOT upsert against the dropped (owner, plan, provider) conflict
  // target: the Stripe TEST subscriptions v1 migration replaces that constraint
  // with a PARTIAL unique index (…WHERE origin_organization_id IS NULL), and
  // PostgreSQL cannot infer a partial index as a conflict arbiter without its
  // predicate — which supabase-js cannot supply. So find-then-write instead:
  // reuse an existing manual grant for this (owner, plan) or insert a fresh one.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as any;
  const { data: existing, error: selErr } = await sbAny
    .from("billing_subscriptions")
    .select("id")
    .eq("owner_id", input.ownerId)
    .eq("plan_key", input.planKey)
    .eq("provider", "stripe")
    .is("organization_id", null)
    .like("provider_subscription_id", "manual_%")
    .maybeSingle();
  if (selErr) {
    if (selErr.code === RELATION_ABSENT) return { ok: false, reason: "needs_migration" };
    return { ok: false, reason: "error" };
  }

  if (existing) {
    const { error } = await sbAny
      .from("billing_subscriptions")
      .update({ status: "active", test_mode: true, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) {
      if (error.code === RELATION_ABSENT) return { ok: false, reason: "needs_migration" };
      return { ok: false, reason: "error" };
    }
  } else {
    const { error } = await sbAny.from("billing_subscriptions").insert({
      owner_id: input.ownerId,
      plan_key: input.planKey,
      provider: "stripe",
      provider_subscription_id: `manual_${randomUUID()}`,
      status: "active",
      test_mode: true,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      if (error.code === RELATION_ABSENT) return { ok: false, reason: "needs_migration" };
      // A concurrent grant for the same (owner, plan) races into the personal
      // partial unique index — treat the duplicate as success (grant exists).
      if (error.code === UNIQUE_VIOLATION) return { ok: true };
      return { ok: false, reason: "error" };
    }
  }
  revalidatePath(`/${input.locale}/dashboard/admin/billing`);
  return { ok: true };
}

export async function revokePilotAccessAction(input: {
  locale: string;
  ownerId: string;
  planKey: string;
}): Promise<AdminBillingResult> {
  if (!(await isSuperadmin())) return { ok: false, reason: "not_admin" };
  const sb: SupabaseClient = admin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any)
    .from("billing_subscriptions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("owner_id", input.ownerId)
    .eq("plan_key", input.planKey)
    .like("provider_subscription_id", "manual_%");
  if (error) {
    if (error.code === RELATION_ABSENT) return { ok: false, reason: "needs_migration" };
    return { ok: false, reason: "error" };
  }
  revalidatePath(`/${input.locale}/dashboard/admin/billing`);
  return { ok: true };
}
