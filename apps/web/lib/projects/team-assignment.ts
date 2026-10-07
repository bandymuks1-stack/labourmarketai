import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { assignWorkerToProjectAction } from "@/lib/projects/actions";
import { memberOutcomeOf, type TeamMemberResult } from "@/lib/projects/team-assignment-model";

/**
 * A WHOLE TEAM ONTO A PROJECT (WRK-6) — fan-out on authority that exists.
 *
 * A team is an `organizations` row of type `team` owned by the caller; its
 * members are the active `employee` engagements to it (accepted join_team
 * invitations). Each member goes through the SAME server action a single
 * assignment uses, so the RPC's own gates (the caller manages THIS project AND
 * the person is reachable by the caller), the funnel event, the calendar
 * verdict and the conflict alternatives are all the existing ones — nothing is
 * restated here. Not atomic, on purpose: a team is not a transaction.
 *
 * No team ↔ project record is written; the product knows each assignment, not
 * the team behind it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const MISSING_OBJECT_CODES = new Set(["42P01", "42703", "PGRST205", "42883"]);
/** A team larger than this is a roster, not a team. */
const TEAM_MEMBER_LIMIT = 50;

export type TeamAssignmentResult =
  | { readonly status: "ok"; readonly members: readonly TeamMemberResult[] }
  | { readonly status: "not_authed" }
  | { readonly status: "no_such_team" }
  | { readonly status: "empty_team" }
  | { readonly status: "needs_migration" }
  | { readonly status: "unavailable" };

export async function assignTeamToProject(input: {
  readonly teamId: string;
  readonly projectId: string;
}): Promise<TeamAssignmentResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not_authed" };

  const teamRes = await asAny(supabase)
    .from("organizations")
    .select("id")
    .eq("id", input.teamId)
    .eq("organization_type", "team")
    .eq("owner_profile_id", user.id)
    .maybeSingle();
  if (teamRes.error) {
    return MISSING_OBJECT_CODES.has(teamRes.error.code ?? "")
      ? { status: "needs_migration" }
      : { status: "unavailable" };
  }
  if (!teamRes.data) return { status: "no_such_team" };

  const ecRes = await asAny(supabase)
    .from("engagement_contexts")
    .select("profile_id, profiles(full_name)")
    .eq("organization_id", input.teamId)
    .eq("relationship_slug", "employee")
    .eq("status", "active")
    .limit(TEAM_MEMBER_LIMIT);
  if (ecRes.error) return { status: "unavailable" };
  const rows = ((ecRes.data ?? []) as { profile_id: string | null; profiles: unknown }[]).filter(
    (r): r is { profile_id: string; profiles: unknown } => typeof r.profile_id === "string",
  );
  if (rows.length === 0) return { status: "empty_team" };

  // ONE write per member through the ONE existing action, sequentially, so
  // each person's outcome is their own and named.
  const members: TeamMemberResult[] = [];
  for (const r of rows) {
    const name = nameOf(r.profiles) ?? r.profile_id.slice(0, 8);
    const fd = new FormData();
    fd.set("project_id", input.projectId);
    fd.set("worker_profile_id", r.profile_id);
    members.push(memberOutcomeOf(r.profile_id, name, await assignWorkerToProjectAction(null, fd)));
  }
  return { status: "ok", members };
}

function nameOf(profiles: unknown): string | null {
  if (!profiles || typeof profiles !== "object") return null;
  return (profiles as { full_name?: string | null }).full_name ?? null;
}
