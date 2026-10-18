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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("my_historical_organization_names_v1", {
      p_org_ids: missing.slice(0, 100),
    });
    if (error || !Array.isArray(data)) return rows;
    const byId = new Map<string, { display_name: string | null; legal_name: string | null }>();
    for (const r of data as { organization_id: string; display_name: string | null; legal_name: string | null }[]) {
      byId.set(r.organization_id, { display_name: r.display_name, legal_name: r.legal_name });
    }
    return rows.map((r) =>
      r.organization_id && !(r.organizations?.display_name || r.organizations?.legal_name) && byId.has(r.organization_id)
        ? { ...r, organizations: { ...(r.organizations ?? {}), ...byId.get(r.organization_id)! } }
        : r,
    );
  } catch {
    return rows;
  }
}
