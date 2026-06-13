import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSuperadmin } from "@/lib/auth/superadmin";
import { getBillingConfig } from "@/lib/billing/config";
import {
  resolveEntitlements,
  entitlementAllows,
  type EntitlementContext,
} from "@/lib/billing/entitlements-v1";
import type { FeatureKey, PlanAudience } from "@/lib/billing/plans";
import type { SubStatus } from "@/lib/billing/webhook-core";

/**
 * Effective entitlements (Stripe sprint PR5) — the server read path. Joins the
 * billing config (is enforcement on?), the user's admin status, audience, and
 * their real (test) subscription / manual override into an EntitlementContext.
 * Degrades to free/permissive when the billing tables are absent (PR2 pending)
 * or billing is disabled — the existing pilot is never retroactively locked.
 */

const RELATION_ABSENT = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function pickAudience(roles: readonly string[]): PlanAudience {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("company")) return "company";
  if (roles.includes("agency")) return "agency";
  return "worker";
}

export interface EffectiveEntitlements extends EntitlementContext {
  readonly profileId: string | null;
}

export async function getEffectiveEntitlements(): Promise<EffectiveEntitlements> {
  const config = getBillingConfig();
  const billingActive = config.state === "stripe_test";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const ctx = resolveEntitlements({
      billingActive,
      isAdmin: false,
      audience: "worker",
      subscriptionPlanKey: null,
      subscriptionStatus: null,
      manualOverridePlanKey: null,
    });
    return { ...ctx, profileId: null };
  }

  const isAdmin = await isSuperadmin();

  const { data: roleRows } = await asAny(supabase)
    .from("profile_roles")
    .select("role")
    .eq("profile_id", user.id);
  const roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
  const audience = pickAudience(roles);

  // Real subscription + manual override (degrade if the billing tables are
  // not applied yet → null, i.e. free/permissive).
  let subscriptionPlanKey: string | null = null;
  let subscriptionStatus: SubStatus | null = null;
  let manualOverridePlanKey: string | null = null;
  const { data: subs, error } = await asAny(supabase)
    .from("billing_subscriptions")
    .select("plan_key, status, provider_subscription_id, updated_at")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });
  if (!error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (subs ?? []) as any[];
    const override = rows.find(
      (r) =>
        String(r.provider_subscription_id ?? "").startsWith("manual_") &&
        r.status === "active",
    );
    if (override) manualOverridePlanKey = override.plan_key ?? null;
    const real = rows.find(
      (r) => !String(r.provider_subscription_id ?? "").startsWith("manual_"),
    );
    if (real) {
      subscriptionPlanKey = real.plan_key ?? null;
      subscriptionStatus = (real.status as SubStatus) ?? null;
    }
  } else if (error.code !== RELATION_ABSENT) {
    // a non-absent error → stay free/permissive, never throw into a page
  }

  const ctx = resolveEntitlements({
    billingActive,
    isAdmin,
    audience,
    subscriptionPlanKey,
    subscriptionStatus,
    manualOverridePlanKey,
  });
  return { ...ctx, profileId: user.id };
}

/** Server enforcement helper for routes/actions (not just UI hiding). */
export async function hasFeature(feature: FeatureKey): Promise<boolean> {
  const ctx = await getEffectiveEntitlements();
  return entitlementAllows(ctx, feature);
}
