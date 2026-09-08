import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * W6 author/subject slice — the app-side mirror of `manages_organization()`.
 *
 * The SQL helper was membership-widened by 20260806180000 (APPLIED in
 * production): a person manages an organization when EITHER
 *   - an ACTIVE engagement_contexts row names them manager/owner/
 *     external_manager there (the 0013 arm), OR
 *   - an ACTIVE company_memberships row gives them owner/admin/manager/
 *     external_manager (the M-P0-4 arm).
 *
 * Before this helper existed, app surfaces that needed "which organizations
 * may I act for?" used `getOwnedOrganizations()` — OWNER-ONLY, strictly
 * narrower than the SQL truth. The experience entry point inherited that
 * mismatch: an admin/manager member could not see org-side invitations the
 * RPC would have accepted. This helper closes the gap by asking BOTH arms,
 * exactly like the SQL does.
 *
 * This is a UI-shaping read only — every write path re-derives authority
 * server-side in SQL (`manages_organization` inside the SECURITY DEFINER
 * RPCs). RLS lets a user read their own memberships and engagement rows, so
 * no service role and no new privilege is involved.
 *
 * Feature-detected: a stack without the memberships table (or without the
 * engagement columns) contributes nothing from that arm rather than
 * throwing — the result is then simply the narrower truth of that stack.
 */

const ABSENT_CODES = new Set(["42703", "42P01", "PGRST205"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/** Distinct organization ids the current user may act for (SQL-truth mirror).
 *  Empty array = manages nothing (or not signed in). */
export async function getManagedOrganizationIds(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const ids = new Set<string>();

  const [engagements, memberships] = await Promise.all([
    asAny(supabase)
      .from("engagement_contexts")
      .select("organization_id")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .in("relationship_slug", ["manager", "owner", "external_manager"])
      .limit(200),
    asAny(supabase)
      .from("company_memberships")
      .select("organization_id")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .in("role", ["owner", "admin", "manager", "external_manager"])
      .limit(200),
  ]);

  for (const arm of [engagements, memberships]) {
    if (arm.error) {
      if (ABSENT_CODES.has(arm.error.code ?? "")) continue;
      continue; // any other read failure degrades to the narrower truth
    }
    for (const row of (arm.data ?? []) as { organization_id?: string | null }[]) {
      if (typeof row.organization_id === "string" && row.organization_id) {
        ids.add(row.organization_id);
      }
    }
  }

  return [...ids];
}

export type GovernedOrganization = { id: string; name: string };

/**
 * Organizations the current user GOVERNS — the app-side mirror of
 * `membership_actor_role_v1` returning owner/admin (the authority the
 * workflow engine's authoring/install RPCs re-check server-side), widened
 * by `organizations.owner_profile_id` (which the owner-membership seed
 * mirrors into an owner membership).
 *
 * Deliberately NARROWER than `getManagedOrganizationIds`: manager /
 * external_manager may act operationally but may NOT author or install
 * approval templates, so surfacing governance panels on the managed set
 * would render buttons the server must refuse. UI-shaping only — every
 * write re-derives authority in SQL. Names come through the SAME
 * organizations join the membership RLS already allows; a missing name is
 * the empty string (absence reported as absence, localized by the render
 * site). Feature-detected like the read above.
 */
export async function getGovernedOrganizations(): Promise<
  GovernedOrganization[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const out = new Map<string, GovernedOrganization>();

  const [owned, memberships] = await Promise.all([
    asAny(supabase)
      .from("organizations")
      .select("id, display_name, legal_name")
      .eq("owner_profile_id", user.id)
      .limit(200),
    asAny(supabase)
      .from("company_memberships")
      .select("organization_id, organizations(display_name, legal_name)")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .in("role", ["owner", "admin"])
      .limit(200),
  ]);

  if (!owned.error) {
    for (const row of (owned.data ?? []) as {
      id?: string | null;
      display_name?: string | null;
      legal_name?: string | null;
    }[]) {
      if (typeof row.id === "string" && row.id) {
        out.set(row.id, {
          id: row.id,
          name: row.display_name?.trim() || row.legal_name?.trim() || "",
        });
      }
    }
  }
  if (!memberships.error) {
    for (const row of (memberships.data ?? []) as {
      organization_id?: string | null;
      organizations?: {
        display_name?: string | null;
        legal_name?: string | null;
      } | null;
    }[]) {
      const id = row.organization_id;
      if (typeof id !== "string" || !id || out.has(id)) continue;
      out.set(id, {
        id,
        name:
          row.organizations?.display_name?.trim() ||
          row.organizations?.legal_name?.trim() ||
          "",
      });
    }
  }
  return [...out.values()];
}
