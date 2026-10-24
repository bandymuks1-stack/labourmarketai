import "server-only";
import { effectivePilotPassStatus } from "@/lib/billing/pilot-pass-core";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperadmin, isSuperadminFor } from "@/lib/auth/superadmin";
import { getBillingConfigFor } from "@/lib/billing/config";
import {
  resolveEntitlements,
  entitlementAllows,
  type EntitlementContext,
} from "@/lib/billing/entitlements-v1";
import type { FeatureKey, PlanAudience } from "@/lib/billing/plans";
import type { SubStatus } from "@/lib/billing/webhook-core";
import { resolveBillingSubject, type BillingSubject } from "@/lib/billing/billing-subject";
import { activeVipGrant, vipOverridePlanKey, type ActiveVipGrant } from "@/lib/billing/organization-vip";

/**
 * Effective entitlements (Stripe sprint PR5) — the server read path. Joins the
 * billing config (is enforcement on?), the user's admin status, audience, and
 * their real (test) subscription / manual override into an EntitlementContext.
 * Degrades to free/permissive when the billing tables are absent (PR2 pending)
 * or billing is disabled — the existing pilot is never retroactively locked.
 */

const RELATION_ABSENT = "42P01";
const UNDEFINED_COLUMN = "42703";

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
  /** The provider subscription ends at the period end instead of renewing (cancelled in the portal). */
  readonly cancelAtPeriodEnd: boolean;
  /** End of the current paid period (ISO), as the provider reported it; null when unknown. */
  readonly currentPeriodEnd: string | null;
}

/**
 * An EXPLICIT caller (a bearer / agent transport such as the MCP door): its own
 * RLS-scoped client, its verified user id and the organization ITS OWN employer
 * gate resolved (`requireEmployerCompanyForCaller`). Such a request carries no
 * cookie session, so without this the resolver saw NO user and judged an
 * organization's action against the anonymous person plan (production defect
 * measured 2026-09-30: every assistant demand create/reopen refused as
 * over-limit while billing is live). Absent = the cookie session and the
 * cookie workspace — every existing web call site, unchanged.
 */
export type EntitlementCaller = {
  readonly supabase: SupabaseClient;
  readonly userId: string;
  readonly organizationId: string;
};

export async function getEffectiveEntitlements(caller?: EntitlementCaller): Promise<EffectiveEntitlements> {
  // Enforcement is on under either active adapter state (test, or owner-armed live)
  // — and, under a pilot list, only for a listed organization: the config is
  // re-read for the resolved subject below. A person / signed-out reader is never
  // in a pilot (only the organization plan is sold).
  let config = getBillingConfigFor(null);
  let billingActive = config.state === "stripe_test" || config.state === "stripe_live";

  const supabase = caller?.supabase ?? (await createClient());
  const user = caller
    ? { id: caller.userId }
    : (await supabase.auth.getUser()).data.user;

  if (!user) {
    const ctx = resolveEntitlements({
      billingActive,
      isAdmin: false,
      audience: "worker",
      subscriptionPlanKey: null,
      subscriptionStatus: null,
      manualOverridePlanKey: null,
    });
    return { ...ctx, profileId: null, cancelAtPeriodEnd: false, currentPeriodEnd: null };
  }

  const isAdmin = caller ? await isSuperadminFor(supabase, user.id) : await isSuperadmin();

  const { data: roleRows } = await asAny(supabase)
    .from("profile_roles")
    .select("role")
    .eq("profile_id", user.id);
  const roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
  const heldAudience = pickAudience(roles);

  // M-P0-7: the ENTITLEMENT SUBJECT is the active workspace's billing
  // subject — an organization workspace reads ONLY that organization's
  // subscription rows; the personal workspace reads ONLY personal rows.
  // NO ENTITLEMENT TRANSFER on workspace switch: a personal plan never
  // empowers an organization surface and organization A's plan never leaks
  // into B or into Personal. Feature-detected: until the owner-gated
  // multi-subject schema (PR #844's `organization_id` /
  // `origin_organization_id`) applies, an organization subject has no rows
  // (→ free, which `entitlementAllows` keeps permissive while billing is
  // inactive) and the personal query falls back to the legacy owner-only
  // shape.
  // A caller's organization was proven by its own employer gate — the same
  // proof `resolveBillingSubject` takes from the cookie workspace.
  const subject: BillingSubject | null = caller
    ? { type: "organization", id: caller.organizationId }
    : (await resolveBillingSubject()).subject;
  config = getBillingConfigFor(subject?.type === "organization" ? subject.id : null);
  billingActive = config.state === "stripe_test" || config.state === "stripe_live";

  // THE ORGANIZATION'S CAPABILITY, NOT THE PERSON'S LEGACY ROLE ROW. An
  // organization subject was proven from the caller's own active governance
  // membership; the organization's free fallback is ORGANIZATION FREE whatever
  // `profile_roles` happens to hold. A member (for instance an invited
  // owner/admin) whose rows carry only `worker` would otherwise resolve to the
  // PERSON plan (`free_worker`, which has no `company_create_needs`) and be
  // refused every need while billing is live. Roles still pick the audience
  // for the personal workspace. This changes the FALLBACK plan only - never
  // access: the employer gate / membership proof is decided before this read.
  const audience: PlanAudience =
    subject?.type === "organization" && heldAudience === "worker" ? "company" : heldAudience;

  // Real subscription + manual override (degrade if the billing tables are
  // not applied yet → null, i.e. free/permissive).
  let subscriptionPlanKey: string | null = null;
  let subscriptionStatus: SubStatus | null = null;
  let cancelAtPeriodEnd = false;
  let currentPeriodEnd: string | null = null;
  let manualOverridePlanKey: string | null = null;
  // Owner-granted organization VIP (#2474) — read only for an organization subject.
  let vipGrant: ActiveVipGrant | null = null;
  // MODE SCOPE (production defect measured 2026-09-22): admission
  // (`findScopedSubscription`) and the customer lookup filter by the
  // adapter's mode, this read did not — a TEST-mode row (test_mode=true,
  // the column's default) could entitle a LIVE workspace and vice versa.
  // Every query below carries `.eq("test_mode", config.testMode)`.
  let subsQueryResult;
  if (subject && subject.type === "organization") {
    // ORGANIZATION SUBJECT — read through the service-role client, scoped by
    // the SERVER-RESOLVED subject. Why (production defect measured
    // 2026-09-22): `billing_subscriptions` carries ONE SELECT policy,
    // `owner_id = auth.uid() or is_admin()` (20260613200000). Through the
    // user client an organization's row was therefore visible ONLY to the
    // profile that paid; a co-manager holding `manage-billing`, or any other
    // governance-role member acting inside the same organization workspace,
    // read zero rows and resolved as free — the purchaser alone got the
    // 10-position limit. The entitlement belongs to the ORGANIZATION
    // (M-P0-7), not to the payer, so the read must not depend on who paid.
    // AUTHORITY: `subject.id` comes from `resolveBillingSubject` →
    // `resolveEmployerCompanyContext`, which proves the caller's governance
    // role from THEIR OWN active `company_memberships` row (or the creator
    // compatibility arm) through the RLS-scoped session — never from a
    // client value, a cookie alone or a query parameter. The service key
    // opens the table; the proven membership is the authorisation — the
    // same subject the checkout route binds a session to. The projection is
    // plan_key / status / provider_subscription_id / updated_at — no payer
    // identity, no customer id, no amounts — and this path writes nothing
    // (P7 guard). No RLS change: the policy stays owner-or-admin.
    // Personal subjects keep the user-scoped read below: `owner_id =
    // auth.uid()` IS the policy, so RLS already answers correctly there.
    // Without a service key (local/preview without SUPABASE_SERVICE_ROLE_KEY)
    // the read falls back to the user client — the purchaser still resolves,
    // exactly the pre-fix floor — instead of throwing into a page.
    let reader: SupabaseClient = supabase;
    try {
      reader = createAdminClient() as unknown as SupabaseClient;
    } catch {
      reader = supabase;
    }
    subsQueryResult = await asAny(reader)
      .from("billing_subscriptions")
      .select("plan_key, status, provider_subscription_id, updated_at, cancel_at_period_end, current_period_end")
      .eq("organization_id", subject.id)
      .eq("test_mode", config.testMode)
      .order("updated_at", { ascending: false });
    if (subsQueryResult.error?.code === UNDEFINED_COLUMN) {
      // multi-subject schema unapplied — an org subject has no rows yet
      subsQueryResult = { data: [], error: null };
    }
    // OWNER-GRANTED VIP (#2474, matrix 7.27). The admin pilot override above is
    // an org-less TEST-mode row, so a LIVE organization workspace never saw it.
    // A VIP grant is keyed by THIS organization and is not a payment: it carries
    // no Stripe mode, so it is read without the test_mode filter, scoped by the
    // same server-resolved subject, through the same reader. Absent table
    // (migration 20261023170000 not applied) or any error → no grant, never a
    // throw into a page.
    try {
      const grantRead = await asAny(reader)
        .from("organization_access_grants")
        .select("organization_id, grant_kind, scope, revoked_at")
        .eq("organization_id", subject.id)
        .eq("grant_kind", "vip")
        .is("revoked_at", null);
      if (grantRead && !grantRead.error) vipGrant = activeVipGrant(grantRead.data, subject.id);
    } catch {
      vipGrant = null;
    }
  } else {
    subsQueryResult = await asAny(supabase)
      .from("billing_subscriptions")
      .select("plan_key, status, provider_subscription_id, updated_at, cancel_at_period_end, current_period_end, origin_organization_id")
      .eq("owner_id", user.id)
      .eq("test_mode", config.testMode)
      .is("origin_organization_id", null)
      .order("updated_at", { ascending: false });
    if (subsQueryResult.error?.code === UNDEFINED_COLUMN) {
      // legacy schema — every row is personal by definition
      subsQueryResult = await asAny(supabase)
        .from("billing_subscriptions")
        .select("plan_key, status, provider_subscription_id, updated_at, cancel_at_period_end, current_period_end")
        .eq("owner_id", user.id)
        .eq("test_mode", config.testMode)
        .order("updated_at", { ascending: false });
    }
  }
  const { data: subs, error } = subsQueryResult;
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
      // A pilot pass past its end reads `expired` (nothing renews it and no
      // provider event will arrive to end it — pilot-pass-core).
      subscriptionStatus = (effectivePilotPassStatus(real, new Date()) as SubStatus) ?? null;
      cancelAtPeriodEnd = real.cancel_at_period_end === true;
      currentPeriodEnd = typeof real.current_period_end === "string" ? real.current_period_end : null;
    }
  } else if (error.code !== RELATION_ABSENT) {
    // a non-absent error → stay free/permissive, never throw into a page
  }

  // A VIP grant is the organization plan for free, as an explicit override: a
  // real subscription still wins (resolveEntitlements), and the source stays
  // `manual_override` — nothing was paid.
  manualOverridePlanKey = manualOverridePlanKey ?? vipOverridePlanKey(vipGrant);

  const ctx = resolveEntitlements({
    billingActive,
    isAdmin,
    audience,
    subscriptionPlanKey,
    subscriptionStatus,
    manualOverridePlanKey,
  });
  return { ...ctx, profileId: user.id, cancelAtPeriodEnd, currentPeriodEnd };
}

/** Server enforcement helper for routes/actions (not just UI hiding). */
export async function hasFeature(feature: FeatureKey): Promise<boolean> {
  const ctx = await getEffectiveEntitlements();
  return entitlementAllows(ctx, feature);
}
