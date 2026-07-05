import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Teams / brigades minimum on the org spine (product-tree branch 13, §8.3).
 *
 * A team/brigade is an organizations ROW (organization_type='team', migration
 * 20260705220000) — NOT a new table and NOT a parallel org system. Membership
 * is the EXISTING engagement_contexts 'employee' relationship written by the
 * EXISTING canonical add_org_member RPC (20260530140000); this module adds NO
 * membership write of its own. The capability summary is derived read-only
 * from members' EXISTING worker_skills rows via the gated
 * get_team_capability_summary_v1 RPC — honest counts only, never a team
 * rating and never a fake team verification.
 *
 * Honest degradation: while the owner-gated migration is not applied, the
 * readiness probe sees 42883 (function missing) and reports
 * { applied: false } — the company room then keeps its existing honest
 * roster empty state and no team surface is faked.
 */

const RPC_NOT_FOUND_CODE = "42883";
const RELATION_NOT_FOUND_CODE = "42P01";
const UNDEFINED_COLUMN_CODE = "42703";

type DB = Awaited<ReturnType<typeof createClient>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

// Narrow, explicit cast for RPCs not yet in the generated Database type
// (the repo's existing pattern — see lib/operations/org-membership.ts).
function rpc(supabase: DB, name: string, args: Record<string, unknown>) {
  return (
    supabase.rpc as unknown as (
      n: string,
      a: Record<string, unknown>,
    ) => Promise<{
      data: unknown;
      error: { message: string; code?: string } | null;
    }>
  )(name, args);
}

export type TeamMember = {
  readonly engagementId: string;
  readonly profileId: string;
  readonly name: string;
};

export type TeamCapabilitySkill = {
  readonly slug: string;
  readonly membersDeclared: number;
  readonly membersConfirmed: number;
};

export type TeamBrigade = {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly members: readonly TeamMember[];
  /** Read-only honest counts from members' existing worker_skills; null when
   *  the summary RPC could not be read (never fabricated). */
  readonly capability: readonly TeamCapabilitySkill[] | null;
  /** Company-linked workers not yet members of THIS team. */
  readonly addable: readonly AddableTeamWorker[];
};

export type AddableTeamWorker = {
  readonly workerId: string;
  readonly profileId: string;
  readonly name: string;
};

export type TeamBrigadesData =
  | { readonly applied: false }
  | {
      readonly applied: true;
      readonly teams: readonly TeamBrigade[];
      readonly error: string | null;
    };

function nameOf(p: { full_name: string | null; email: string | null } | null): string {
  return p?.full_name ?? (p?.email ? p.email.split("@")[0] : "—");
}

// Supabase may type a to-one embed as object or single-element array; normalize.
function profName(v: unknown): string {
  const p = (Array.isArray(v) ? v[0] : v) as
    | { full_name: string | null; email: string | null }
    | null
    | undefined;
  return nameOf(p ?? null);
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Readiness probe: the capability RPC only exists once the owner applied
 * 20260705220000. A nil-uuid call is a cheap no-op that returns an empty set
 * when applied and 42883 when not.
 */
async function isTeamModelApplied(supabase: DB): Promise<boolean> {
  const { error } = await rpc(supabase, "get_team_capability_summary_v1", {
    p_org_id: NIL_UUID,
  });
  if (!error) return true;
  return error.code !== RPC_NOT_FOUND_CODE;
}

/**
 * Company-room read model: the caller's own team/brigade orgs (RLS-scoped
 * owner read on the EXISTING organizations table), their members (RLS-scoped
 * engagement_contexts read — manages_organization covers the team owner via
 * the 0035 'owner' engagement) and the read-only capability summary.
 */
export async function getTeamBrigadesData(): Promise<TeamBrigadesData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { applied: false };

  if (!(await isTeamModelApplied(supabase))) return { applied: false };

  const { data: orgRows, error: orgError } = await asAny(supabase)
    .from("organizations")
    .select("id, display_name, legal_name, created_at")
    .eq("owner_profile_id", user.id)
    .eq("organization_type", "team")
    .order("created_at", { ascending: true })
    .limit(20);
  if (orgError) {
    if (
      orgError.code === RELATION_NOT_FOUND_CODE ||
      orgError.code === UNDEFINED_COLUMN_CODE
    ) {
      return { applied: false };
    }
    return { applied: true, teams: [], error: orgError.message };
  }

  const teamRows = (orgRows ?? []) as {
    id: string;
    display_name: string | null;
    legal_name: string | null;
    created_at: string;
  }[];
  if (teamRows.length === 0) return { applied: true, teams: [], error: null };

  const teamIds = teamRows.map((t) => t.id);

  // Members: the EXISTING canonical engagement rows — nothing else.
  const { data: ecRows } = await asAny(supabase)
    .from("engagement_contexts")
    .select("id, organization_id, profile_id, profiles(full_name, email)")
    .in("organization_id", teamIds)
    .eq("relationship_slug", "employee")
    .eq("status", "active");
  const membersByTeam = new Map<string, TeamMember[]>();
  for (const r of (ecRows ?? []) as {
    id: string;
    organization_id: string | null;
    profile_id: string | null;
    profiles: unknown;
  }[]) {
    if (!r.organization_id || !r.profile_id) continue;
    const list = membersByTeam.get(r.organization_id) ?? [];
    list.push({
      engagementId: r.id,
      profileId: r.profile_id,
      name: profName(r.profiles),
    });
    membersByTeam.set(r.organization_id, list);
  }

  // Addable pool: workers ALREADY linked to the caller's company via the
  // existing invite/accept flow (company_workers, RLS owns_company). We never
  // enumerate strangers — same rule as lib/operations/org-members.ts.
  const { data: linkRows } = await asAny(supabase)
    .from("company_workers")
    .select("worker_id, workers(profile_id, profiles(full_name, email))")
    .eq("status", "active");
  const pool: AddableTeamWorker[] = ((linkRows ?? []) as {
    worker_id: string | null;
    workers: unknown;
  }[])
    .map((r) => {
      const w = (Array.isArray(r.workers) ? r.workers[0] : r.workers) as
        | { profile_id: string | null; profiles: unknown }
        | null;
      if (!r.worker_id || !w?.profile_id) return null;
      return {
        workerId: r.worker_id,
        profileId: w.profile_id,
        name: profName(w.profiles),
      };
    })
    .filter((x): x is AddableTeamWorker => x !== null);

  const teams: TeamBrigade[] = [];
  for (const t of teamRows) {
    const members = membersByTeam.get(t.id) ?? [];
    const memberProfileIds = new Set(members.map((m) => m.profileId));

    // Capability summary: read-only gated RPC over members' existing
    // worker_skills. Errors → null (never a fabricated summary).
    let capability: TeamCapabilitySkill[] | null = null;
    const { data: capRows, error: capError } = await rpc(
      supabase,
      "get_team_capability_summary_v1",
      { p_org_id: t.id },
    );
    if (!capError && Array.isArray(capRows)) {
      capability = (capRows as {
        skill_slug: string | null;
        members_declared: number | null;
        members_confirmed: number | null;
      }[])
        .filter((r) => typeof r.skill_slug === "string" && r.skill_slug.length > 0)
        .map((r) => ({
          slug: r.skill_slug as string,
          membersDeclared: r.members_declared ?? 0,
          membersConfirmed: r.members_confirmed ?? 0,
        }));
    }

    teams.push({
      id: t.id,
      name:
        (t.display_name ?? "").trim() ||
        (t.legal_name ?? "").trim() ||
        "—",
      createdAt: t.created_at,
      members,
      capability,
      addable: pool.filter((w) => !memberProfileIds.has(w.profileId)),
    });
  }

  return { applied: true, teams, error: null };
}

export type CreateTeamOutcome =
  | "created"
  | "invalid_team_name"
  | "not_allowed"
  | "team_limit_reached"
  | "needs_migration"
  | "error";

/** Create a team/brigade org row via the gated create_team_v1 RPC. */
export async function createTeamBrigade(
  name: string,
): Promise<{ outcome: CreateTeamOutcome; message?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { outcome: "error", message: "Not authenticated" };

  const { data, error } = await rpc(supabase, "create_team_v1", {
    p_team_name: name,
  });
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE) return { outcome: "needs_migration" };
    return { outcome: "error", message: error.message };
  }
  const code = String(data ?? "");
  if (
    code === "created" ||
    code === "invalid_team_name" ||
    code === "not_allowed" ||
    code === "team_limit_reached"
  ) {
    return { outcome: code };
  }
  return { outcome: "error", message: code || "unknown" };
}
