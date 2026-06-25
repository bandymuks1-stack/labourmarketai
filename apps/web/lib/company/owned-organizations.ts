import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Multi-company read model (IA cleanup v2, correction #6).
 *
 * A person can own / manage MANY organizations — the schema already supports
 * this through `organizations` (one row per org, `owner_profile_id` = the
 * person) and `engagement_contexts` (relationship_slug = 'owner'). This helper
 * lists the organizations the current user OWNS so the UI can:
 *   - show the company NAME in company context (never the personal username);
 *   - list the companies the user owns (2, 3, or 50);
 *   - offer an "add company" action.
 *
 * Honesty / safety:
 *   - Reads go through the user-scoped client; RLS limits rows to the owner
 *     (organizations SELECT is owner-scoped). NO fake companies are ever
 *     synthesized — an empty list renders an honest empty state.
 *   - No schema change: this is a pure read over existing tables. Returns
 *     kind "needs-migration" if the `organizations` table is absent (graceful,
 *     mirrors getOwnCompany).
 */

const UNDEFINED_COLUMN_CODE = "42703";
const RELATION_NOT_FOUND_CODE = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export type OwnedOrganization = {
  id: string;
  /** Human label for the company context — display_name, else legal_name. */
  name: string;
  organizationType: "company" | "agency" | "other";
  /** The legacy companies.id this org mirrors, if any — used to deep-link the
   *  existing single-company channel at /dashboard/company. */
  legacyCompanyId: string | null;
};

export type OwnedOrganizationsResult =
  | { kind: "ok"; organizations: OwnedOrganization[] }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export async function getOwnedOrganizations(): Promise<OwnedOrganizationsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", organizations: [] };

  const { data, error } = await asAny(supabase)
    .from("organizations")
    .select("id, display_name, legal_name, organization_type, legacy_company_id")
    .eq("owner_profile_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    if (
      error.code === UNDEFINED_COLUMN_CODE ||
      error.code === RELATION_NOT_FOUND_CODE
    ) {
      return { kind: "needs-migration" };
    }
    return { kind: "error", message: error.message };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  const organizations: OwnedOrganization[] = rows.map((r) => ({
    id: r.id as string,
    name:
      (r.display_name as string | null)?.trim() ||
      (r.legal_name as string | null)?.trim() ||
      "—",
    organizationType:
      (r.organization_type as OwnedOrganization["organizationType"] | null) ??
      "other",
    legacyCompanyId: (r.legacy_company_id as string | null) ?? null,
  }));
  return { kind: "ok", organizations };
}
