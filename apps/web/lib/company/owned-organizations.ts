import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { DomainCaller } from "@/lib/domain/caller";
import {
  ORGANIZATION_ARCHIVED_COLUMN,
  isArchivedOrganizationRow,
} from "@/lib/company/archived-organizations";

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
  /**
   * Human label for the company context — display_name, else legal_name, else
   * THE EMPTY STRING.
   *
   * It used to be the literal em-dash `"—"`, and that one character was the
   * source of the "—" rows the owner audit found in the workspace switcher
   * and in the network page's company list. Five production organizations
   * carry neither name (all created 2026-05-21/22, before `saveCompanySetup`
   * began rejecting a name under 2 characters — the intake is already closed,
   * the rows remain), so this fallback was reached for real, by the owner's
   * own account, on every page load.
   *
   * A reader cannot tell a punctuation placeholder from a company actually
   * called "—", and a glyph chosen in a data module is a presentation
   * decision made in the wrong layer: it is not localizable and it silently
   * outvotes every caller's own fallback. The absence is now reported as
   * absence, and each render site says what it means in the reader's own
   * language.
   */
  name: string;
  organizationType: "company" | "agency" | "other";
  /** The legacy companies.id this org mirrors, if any — used to deep-link the
   *  existing single-company channel at /dashboard/company. */
  legacyCompanyId: string | null;
  /** The bound company's `company_type` (e.g. `staffing_agency`), read through
   *  the same `legacy_company_id` foreign key; null when unbound. A display
   *  fact for the workspace label — an agency is a company TYPE. */
  companyType: string | null;
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
  return readOwnedOrganizations({ supabase, userId: user.id });
}

/** THE owned-organizations read as an explicit caller (G4 bridge) — the
 *  transport-neutral core under `getOwnedOrganizations`. */
export async function readOwnedOrganizations(
  caller: DomainCaller,
): Promise<OwnedOrganizationsResult> {
  // ARCHIVED organizations (owner decision 2026-09-23) are not workspaces: the
  // archive column rides the same read, and an environment without it (42703)
  // re-reads without it — there nothing is archived. See archived-organizations.ts.
  // The bound company's `company_type` rides BOTH variants through the
  // legacy_company_id foreign key (the workspace label's display fact).
  const columns =
    "id, display_name, legal_name, organization_type, legacy_company_id, companies!organizations_legacy_company_id_fkey(company_type)";
  const read = (select: string) =>
    asAny(caller.supabase)
      .from("organizations")
      .select(select)
      .eq("owner_profile_id", caller.userId)
      .order("created_at", { ascending: true });
  let { data, error } = await read(`${columns}, ${ORGANIZATION_ARCHIVED_COLUMN}`);
  if (error?.code === UNDEFINED_COLUMN_CODE) ({ data, error } = await read(columns));

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
  const rows = ((data ?? []) as any[]).filter((r) => !isArchivedOrganizationRow(r));
  const organizations: OwnedOrganization[] = rows.map((r) => ({
    id: r.id as string,
    name:
      (r.display_name as string | null)?.trim() ||
      (r.legal_name as string | null)?.trim() ||
      "",
    organizationType:
      (r.organization_type as OwnedOrganization["organizationType"] | null) ??
      "other",
    legacyCompanyId: (r.legacy_company_id as string | null) ?? null,
    companyType:
      ((r.companies as { company_type?: string | null } | null)?.company_type as
        | string
        | null) ?? null,
  }));
  return { kind: "ok", organizations };
}
