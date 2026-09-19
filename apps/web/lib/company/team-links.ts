import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The person's OWN roster links — R-9 (2026-09-19 completion audit).
 *
 * A `company_workers` / `agency_workers` row is the relationship the person
 * accepted (since R-1 nothing else can create it). Until `end_roster_link_v1`
 * (owner-gated, 20260919150000) the person could see it nowhere and end it
 * nowhere. This read lists the ACTIVE links so the profile can offer the
 * withdrawal beside the organization-history withdrawal it already has.
 *
 * RLS-scoped (`company_workers_select` / `agency_workers_select` let the
 * worker read their own rows); bounded; read-only. A failed read is its own
 * kind — never "you are on no team".
 */

const RELATION_ABSENT = new Set(["42P01", "42703"]);
export const TEAM_LINKS_LIMIT = 50;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface TeamLink {
  readonly kind: "company" | "agency";
  /** The legacy company / agency id the RPC is keyed on. */
  readonly orgLegacyId: string;
  readonly workerId: string;
  readonly organizationName: string | null;
  readonly since: string;
}

export type TeamLinksResult =
  | { kind: "ok"; rows: readonly TeamLink[] }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export async function listMyTeamLinks(
  supabase: SupabaseClient,
  userId: string,
): Promise<TeamLinksResult> {
  const [cw, aw] = await Promise.all([
    asAny(supabase)
      .from("company_workers")
      .select("company_id, worker_id, status, created_at, companies(display_name, legal_name), workers!inner(profile_id)")
      .eq("workers.profile_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(TEAM_LINKS_LIMIT),
    asAny(supabase)
      .from("agency_workers")
      .select("agency_id, worker_id, status, created_at, agencies(legal_name), workers!inner(profile_id)")
      .eq("workers.profile_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(TEAM_LINKS_LIMIT),
  ]);

  for (const res of [cw, aw]) {
    if (res.error) {
      if (RELATION_ABSENT.has(res.error.code ?? "")) return { kind: "needs-migration" };
      return { kind: "error", message: res.error.message };
    }
  }

  type CwRow = {
    company_id: string | null;
    worker_id: string | null;
    created_at: string | null;
    companies: { display_name: string | null; legal_name: string | null } | null;
  };
  type AwRow = {
    agency_id: string | null;
    worker_id: string | null;
    created_at: string | null;
    agencies: { legal_name: string | null } | null;
  };

  const rows: TeamLink[] = [];
  for (const r of (cw.data ?? []) as CwRow[]) {
    if (!r.company_id || !r.worker_id || !r.created_at) continue;
    rows.push({
      kind: "company",
      orgLegacyId: r.company_id,
      workerId: r.worker_id,
      organizationName:
        r.companies?.display_name?.trim() || r.companies?.legal_name?.trim() || null,
      since: r.created_at,
    });
  }
  for (const r of (aw.data ?? []) as AwRow[]) {
    if (!r.agency_id || !r.worker_id || !r.created_at) continue;
    rows.push({
      kind: "agency",
      orgLegacyId: r.agency_id,
      workerId: r.worker_id,
      organizationName: r.agencies?.legal_name?.trim() || null,
      since: r.created_at,
    });
  }
  return { kind: "ok", rows };
}
