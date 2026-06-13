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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any).from("billing_subscriptions").upsert(
    {
      owner_id: input.ownerId,
      plan_key: input.planKey,
      provider: "stripe",
      provider_subscription_id: `manual_${randomUUID()}`,
      status: "active",
      test_mode: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,plan_key,provider" },
  );
  if (error) {
    if (error.code === RELATION_ABSENT) return { ok: false, reason: "needs_migration" };
    return { ok: false, reason: "error" };
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
