"use server";

import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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

/**
 * OWNER-GRANTED ORGANIZATION VIP (#2474, migration 20261023170000; matrix 7.27).
 *
 * The pilot override above writes an org-less TEST-mode row, which a LIVE
 * organization workspace never reads. A VIP grant is keyed by the
 * ORGANIZATION and carries no Stripe mode, so the organization's workspace
 * resolves it in every billing state (lib/billing/organization-vip.ts).
 *
 * Written ONLY through the admin RPCs, through the admin's OWN session — not
 * the service role: `set_organization_vip_v1` / `revoke_organization_vip_v1`
 * check `is_admin()` for `auth.uid()` and record who granted / revoked, so the
 * database itself refuses a non-admin and the audit row names the deciding
 * admin. `isSuperadmin()` is the app-side gate in front of it. Before the
 * migration is applied the RPC is missing → `needs_migration`, nothing written.
 */
export type AdminVipResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_admin" | "invalid_input" | "unknown_organization" | "needs_migration" | "error";
    };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING_FUNCTION = new Set(["42883", "PGRST202"]);

function vipRpcFailure(code: string): AdminVipResult {
  if (MISSING_FUNCTION.has(code)) return { ok: false, reason: "needs_migration" };
  if (code === "42501") return { ok: false, reason: "not_admin" };
  if (code === "P0002") return { ok: false, reason: "unknown_organization" };
  if (code === "22023") return { ok: false, reason: "invalid_input" };
  return { ok: false, reason: "error" };
}

export async function grantOrganizationVipAction(input: {
  locale: string;
  organizationId: string;
  /** null = no fixed profile-view figure. */
  profileViews: number | null;
  note: string | null;
}): Promise<AdminVipResult> {
  if (!(await isSuperadmin())) return { ok: false, reason: "not_admin" };
  const organizationId = input.organizationId.trim();
  if (!UUID_RE.test(organizationId)) return { ok: false, reason: "invalid_input" };
  const views = input.profileViews;
  if (views !== null && (!Number.isInteger(views) || views < 1 || views > 100000)) {
    return { ok: false, reason: "invalid_input" };
  }
  const note = (input.note ?? "").trim();
  if (note.length > 500) return { ok: false, reason: "invalid_input" };

  const sb = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any).rpc("set_organization_vip_v1", {
    p_organization_id: organizationId,
    p_profile_views: views,
    p_note: note || null,
  });
  if (error) return vipRpcFailure(typeof error.code === "string" ? error.code : "");
  revalidatePath(`/${input.locale}/dashboard/admin/billing`);
  return { ok: true };
}

export async function revokeOrganizationVipAction(input: {
  locale: string;
  organizationId: string;
}): Promise<AdminVipResult> {
  if (!(await isSuperadmin())) return { ok: false, reason: "not_admin" };
  const organizationId = input.organizationId.trim();
  if (!UUID_RE.test(organizationId)) return { ok: false, reason: "invalid_input" };
  const sb = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any).rpc("revoke_organization_vip_v1", {
    p_organization_id: organizationId,
  });
  if (error) return vipRpcFailure(typeof error.code === "string" ? error.code : "");
  revalidatePath(`/${input.locale}/dashboard/admin/billing`);
  return { ok: true };
}
