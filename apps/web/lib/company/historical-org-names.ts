import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A person's OWN work history keeps naming the organization after the
 * relationship ends (owner decision 2026-09-29, migration 20260929090000).
 *
 * The normal read embeds `organizations(display_name, legal_name)` under
 * organizations_select, which admits a person only while their relationship
 * is ACTIVE — so an ended placement rendered as "(organizacija nerodoma)".
 * This fills ONLY the rows whose embed came back empty, through
 * `my_historical_organization_names_v1`: names only, only for organizations
 * the caller has their own engagement_contexts row with. It restores no
 * access and copies nothing; a failed read leaves the row as it was.
 */
type OrgEmbed = { display_name: string | null; legal_name: string | null } | null | undefined;

type OrgNames = { display_name: string | null; legal_name: string | null };
const MISSING_FN = new Set(["42883", "PGRST202"]);

/**
 * The names of organizations the caller worked for — an engagement context
 * (any status) or, since 20261020100000, a CLAIMED roster row. v2 first;
 * where it is not installed yet, v1 (engagement contexts only). Names only.
 */
export async function readHistoricalOrgNames(
  supabase: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, OrgNames>> {
  const out = new Map<string, OrgNames>();
  const want = [...new Set(ids)].slice(0, 100);
  if (want.length === 0) return out;
  for (const fn of ["my_historical_organization_names_v2", "my_historical_organization_names_v1"]) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(fn, { p_org_ids: want });
      if (error) {
        if (MISSING_FN.has(error.code ?? "")) continue;
        return out;
      }
      for (const r of (Array.isArray(data) ? data : []) as ({ organization_id: string } & OrgNames)[]) {
        out.set(r.organization_id, { display_name: r.display_name, legal_name: r.legal_name });
      }
      return out;
    } catch {
      return out;
    }
  }
  return out;
}

export async function withHistoricalOrgNames<
  T extends { organization_id?: string | null; organizations?: OrgEmbed },
>(supabase: SupabaseClient, rows: T[]): Promise<T[]> {
  const missing = [
    ...new Set(
      rows
        .filter((r) => r.organization_id && !(r.organizations?.display_name || r.organizations?.legal_name))
        .map((r) => r.organization_id as string),
    ),
  ];
  if (missing.length === 0) return rows;
  try {
    const byId = await readHistoricalOrgNames(supabase, missing);
    if (byId.size === 0) return rows;
    return rows.map((r) =>
      r.organization_id && !(r.organizations?.display_name || r.organizations?.legal_name) && byId.has(r.organization_id)
        ? { ...r, organizations: { ...(r.organizations ?? {}), ...byId.get(r.organization_id)! } }
        : r,
    );
  } catch {
    return rows;
  }
}
