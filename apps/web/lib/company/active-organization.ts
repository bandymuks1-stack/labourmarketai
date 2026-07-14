import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  getOwnedOrganizations,
  type OwnedOrganization,
} from "@/lib/company/owned-organizations";
import {
  resolveActiveOrganizationId,
  shouldOfferOrganizationSwitch,
} from "@/lib/company/organization-switch";

/**
 * Active-organization read model (Company Architecture Completion, Sprint
 * v2 §5). Resolves WHICH organization the current profile is acting as,
 * server-side, on top of the EXISTING membership model:
 *
 *   - memberships come from `getOwnedOrganizations()` (organizations RLS is
 *     owner-scoped, so v1 switching covers owned orgs; manager-level
 *     engagement memberships are a documented follow-up — the DB trigger
 *     already accepts them);
 *   - the stored pointer is `profiles.active_organization_id` (owner-gated
 *     migration 20260714210000). Until that migration is applied the column
 *     read fails with 42703 → we fall back to the first owned organization
 *     (exactly today's single-company behaviour) and report
 *     `pointerAvailable: false` so callers stay honest about persistence.
 *
 * The resolution itself is the pure, membership-validated
 * `resolveActiveOrganizationId` — a stale/foreign pointer can never win.
 */

const UNDEFINED_COLUMN_CODE = "42703";
const RELATION_NOT_FOUND_CODE = "42P01";

// The active_organization_id column ships in the owner-gated migration
// 20260714210000 — it is not in the generated DB types until applied
// (same pattern as lib/company/owned-organizations.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export interface ActiveOrganizationContext {
  /** Organizations the profile can act as (owner-scoped in v1). */
  readonly organizations: readonly OwnedOrganization[];
  /** Membership-validated active org id (null = no company yet). */
  readonly activeOrganizationId: string | null;
  /** The active org row, for header display. */
  readonly activeOrganization: OwnedOrganization | null;
  /** True when > 1 membership — the ONLY state that renders a switcher. */
  readonly canSwitch: boolean;
  /** False while migration 20260714210000 is unapplied — the pointer cannot
   *  be persisted yet and switching is honestly unavailable. */
  readonly pointerAvailable: boolean;
}

const EMPTY: ActiveOrganizationContext = {
  organizations: [],
  activeOrganizationId: null,
  activeOrganization: null,
  canSwitch: false,
  pointerAvailable: false,
};

export async function getActiveOrganizationContext(): Promise<ActiveOrganizationContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY;

  const owned = await getOwnedOrganizations();
  if (owned.kind !== "ok" || owned.organizations.length === 0) {
    // needs-migration / error / genuinely no orgs — an honest empty context;
    // callers keep their existing single-company fallbacks.
    return EMPTY;
  }

  // Stored pointer — feature-detected: 42703 (column not applied yet) and
  // 42P01 both degrade to "no pointer" without failing the shell.
  let storedId: string | null = null;
  let pointerAvailable = false;
  const { data, error } = await asAny(supabase)
    .from("profiles")
    .select("active_organization_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!error) {
    pointerAvailable = true;
    storedId =
      ((data as { active_organization_id?: string | null } | null)
        ?.active_organization_id as string | null) ?? null;
  } else if (
    error.code !== UNDEFINED_COLUMN_CODE &&
    error.code !== RELATION_NOT_FOUND_CODE
  ) {
    // Unexpected read failure — degrade like "no pointer" (first org wins);
    // never break the authenticated shell over a display pointer.
    pointerAvailable = false;
  }

  const activeOrganizationId = resolveActiveOrganizationId(
    owned.organizations,
    storedId,
  );
  const activeOrganization =
    owned.organizations.find((o) => o.id === activeOrganizationId) ?? null;

  return {
    organizations: owned.organizations,
    activeOrganizationId,
    activeOrganization,
    canSwitch:
      pointerAvailable && shouldOfferOrganizationSwitch(owned.organizations),
    pointerAvailable,
  };
}
