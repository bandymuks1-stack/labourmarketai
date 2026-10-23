/**
 * OWNER-GRANTED ORGANIZATION VIP — PURE core (owner directive 2026-10-18, #2474,
 * migration 20261023170000_employer_profile_views_v1).
 *
 * The owner (a platform admin) may grant one specific ORGANIZATION free access.
 * The grant lives in `organization_access_grants`, written only by the admin
 * RPCs `set_organization_vip_v1` / `revoke_organization_vip_v1`; the
 * organization can read its own row and never write it.
 *
 * Why a grant and not a `manual_` billing row (production defect, matrix 7.27):
 * the admin pilot override writes an ORG-LESS, TEST-MODE `billing_subscriptions`
 * row, and the organization-workspace entitlement read filters by
 * `organization_id` and by the adapter's mode — a live organization workspace
 * therefore never saw it. A VIP grant is keyed by the organization and is not a
 * payment, so it carries no Stripe mode: the same grant entitles the
 * organization's workspace under `stripe_live`, `stripe_test` or with billing
 * off, and never a personal workspace or another organization.
 *
 * What it confers: the paid Organization plan (`ORGANIZATION_PLAN_KEY`) as an
 * explicit override (source `manual_override`, never `subscription` — nothing
 * was paid), and the profile-view figure of the grant's scope, decided in SQL
 * (`organization_profile_view_plan_v1`). No grant ever bypasses a worker's
 * consent.
 */

import { ORGANIZATION_PLAN_KEY } from "@/lib/billing/plans";

/** The row shape the entitlement read selects (no admin identity leaves the table read). */
export interface OrganizationAccessGrantRow {
  readonly organization_id?: unknown;
  readonly grant_kind?: unknown;
  readonly scope?: unknown;
  readonly revoked_at?: unknown;
}

export interface ActiveVipGrant {
  /** null = no fixed profile-view figure (the SQL default for a VIP grant). */
  readonly profileViews: number | null;
}

/**
 * The organization's ACTIVE VIP grant among `rows`, or null. A row counts only
 * when it is a `vip` grant OF THIS organization and not revoked — a row of
 * another organization (whatever the reader returned) never entitles this one.
 */
export function activeVipGrant(
  rows: readonly OrganizationAccessGrantRow[] | null | undefined,
  organizationId: string,
): ActiveVipGrant | null {
  if (!organizationId || !Array.isArray(rows)) return null;
  const row = rows.find(
    (r) =>
      r &&
      r.organization_id === organizationId &&
      r.grant_kind === "vip" &&
      (r.revoked_at === null || r.revoked_at === undefined),
  );
  if (!row) return null;
  const scope =
    row.scope && typeof row.scope === "object"
      ? (row.scope as Record<string, unknown>)
      : {};
  const views = scope.profile_views;
  return {
    profileViews:
      typeof views === "number" && Number.isInteger(views) && views > 0
        ? views
        : null,
  };
}

/** The plan an active VIP grant confers (an override, never a paid subscription). */
export function vipOverridePlanKey(
  grant: ActiveVipGrant | null,
): string | null {
  return grant ? ORGANIZATION_PLAN_KEY : null;
}
