import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { readRosterHeldTime } from "@/lib/planning/roster-held-time";
import { reserveCapacity, type ReservationVerdict } from "@/lib/workforce/commitment-reservation";

/**
 * A WHOLE TEAM ONTO A PROJECT — J-COMPANY-EXECUTION step 4 (WRK-6), the
 * CONNECT half, on authority that already exists.
 *
 * WHAT A TEAM IS HERE. An `organizations` row of type `team`, owned by the
 * person who owns the company (`create_team_v1`), whose members are people
 * who ACCEPTED a `join_team` invitation and so hold an active `employee`
 * engagement to the team. Every member is, by construction of the invite
 * surface, someone the owner's company already manages.
 *
 * WHAT ASSIGNING THE TEAM MEANS. Each member is assigned to the project
 * through the ONE existing write, `assign_worker_to_project` — the same RPC,
 * the same two gates (the caller manages THIS project AND this worker is on
 * the caller's roster or holds a booking engagement for this exact project),
 * evaluated per person by the database. This module invents no authority: a
 * member the RPC refuses stays refused, and the refusal is reported for that
 * member by name. Nothing is atomic across members, on purpose — a brigade
 * is not a transaction, and a partial outcome is a true outcome the manager
 * must see rather than a rolled-back nothing.
 *
 * WORKER FREEDOM. "A brigade assignment must not silently create impossible
 * individual calendar states." So after the writes, every assigned member's
 * calendar is read ONCE (`readRosterHeldTime`) and each gets their OWN
 * reservation verdict for the project's window — collides / clear / unknown
 * — shown per person. The verdict warns, it never prohibits (SEP-2), and an
 * unread source is `unknown`, never `clear` (SEP-7).
 *
 * WHAT IS STILL MISSING, AND NOT PRETENDED HERE. The record that these
 * people were assigned AS A UNIT — a team↔project link a later surface could
 * end as a unit, or a brigade match could point at — does not exist. That is
 * a schema change (owner-gated) and is prepared separately. Until then the
 * product knows each assignment, and not the brigade behind it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const MISSING_OBJECT_CODES = new Set(["42P01", "42703", "PGRST205", "42883"]);
/** A brigade larger than this is a roster, not a team. */
const TEAM_MEMBER_LIMIT = 50;

export type MemberAssignOutcome =
  /** The RPC wrote (or re-activated) the assignment. */
  | "assigned"
  /** The database refused this person for this project (42501). */
  | "not_authorized"
  /** This person has no `workers` row yet, so cannot be assigned. */
  | "no_worker"
  /** Any other failure, named by code. */
  | "error";

export interface TeamMemberAssignment {
  readonly profileId: string;
  readonly workerId: string | null;
  readonly name: string;
  readonly outcome: MemberAssignOutcome;
  readonly errorCode?: string;
  /** Present for every ASSIGNED member: their own calendar truth for the
   *  project's window. Absent when the write did not happen. */
  readonly reservation?: ReservationVerdict;
}

export type TeamAssignmentResult =
  | {
      readonly status: "ok";
      readonly teamId: string;
      readonly projectId: string;
      readonly members: readonly TeamMemberAssignment[];
      readonly window: { readonly startDate: string | null; readonly endDate: string | null };
    }
  | { readonly status: "not_authed" }
  /** The team is not the caller's, or does not exist as a team. */
  | { readonly status: "no_such_team" }
  | { readonly status: "empty_team" }
  | { readonly status: "needs_migration" }
  | { readonly status: "unavailable"; readonly reason?: string };

export async function assignTeamToProject(input: {
  readonly teamId: string;
  readonly projectId: string;
}): Promise<TeamAssignmentResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not_authed" };

  // The team must be the caller's own brigade. RLS on `organizations` is the
  // authority; this filter only names which row we mean.
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
      : { status: "unavailable", reason: teamRes.error.code };
  }
  if (!teamRes.data) return { status: "no_such_team" };

  // Members: the canonical engagement rows, exactly as the team panel reads them.
  const ecRes = await asAny(supabase)
    .from("engagement_contexts")
    .select("profile_id, profiles(full_name)")
    .eq("organization_id", input.teamId)
    .eq("relationship_slug", "employee")
    .eq("status", "active")
    .limit(TEAM_MEMBER_LIMIT);
  if (ecRes.error) return { status: "unavailable", reason: ecRes.error.code };
  const memberRows = ((ecRes.data ?? []) as { profile_id: string | null; profiles: unknown }[]).filter(
    (r): r is { profile_id: string; profiles: unknown } => typeof r.profile_id === "string",
  );
  if (memberRows.length === 0) return { status: "empty_team" };

  const profileIds = memberRows.map((r) => r.profile_id);
  const [workersRes, projectRes] = await Promise.all([
    asAny(supabase).from("workers").select("id, profile_id").in("profile_id", profileIds).limit(TEAM_MEMBER_LIMIT),
    asAny(supabase).from("projects").select("start_date, end_date").eq("id", input.projectId).maybeSingle(),
  ]);
  const workerByProfile = new Map<string, string>();
  for (const w of (workersRes.error ? [] : (workersRes.data ?? [])) as { id: string; profile_id: string }[]) {
    workerByProfile.set(w.profile_id, w.id);
  }
  const window = {
    startDate: (projectRes.data?.start_date as string | null) ?? null,
    endDate: (projectRes.data?.end_date as string | null) ?? null,
  };

  // ONE write per member through the ONE existing RPC. Sequential, so the
  // database's own gates are evaluated per person and each outcome is named.
  const members: TeamMemberAssignment[] = [];
  for (const r of memberRows) {
    const name = nameOf(r.profiles) ?? r.profile_id.slice(0, 8);
    const workerId = workerByProfile.get(r.profile_id) ?? null;
    if (!workerId) {
      members.push({ profileId: r.profile_id, workerId: null, name, outcome: "no_worker" });
      continue;
    }
    const { error } = await asAny(supabase).rpc("assign_worker_to_project", {
      p_project_id: input.projectId,
      p_worker_profile_id: r.profile_id,
    });
    if (error) {
      if (MISSING_OBJECT_CODES.has(error.code ?? "")) return { status: "needs_migration" };
      members.push({
        profileId: r.profile_id,
        workerId,
        name,
        outcome: error.code === "42501" ? "not_authorized" : "error",
        errorCode: error.code ?? undefined,
      });
      continue;
    }
    members.push({ profileId: r.profile_id, workerId, name, outcome: "assigned" });
  }

  // Every assigned member's calendar, read once, judged per person.
  const assignedWorkerIds = members.filter((m) => m.outcome === "assigned" && m.workerId).map((m) => m.workerId!);
  if (assignedWorkerIds.length > 0) {
    const held = await readRosterHeldTime({ workerIds: assignedWorkerIds, projectId: input.projectId });
    for (let i = 0; i < members.length; i += 1) {
      const m = members[i];
      if (m.outcome !== "assigned" || !m.workerId) continue;
      members[i] = {
        ...m,
        reservation: reserveCapacity({
          window,
          held: held.heldByWorker.get(m.workerId) ?? [],
          unreadableSources: held.unreadableSources,
          // The assignment just written is not a collision with itself.
          exclude: [input.projectId],
        }),
      };
    }
  }

  return { status: "ok", teamId: input.teamId, projectId: input.projectId, members, window };
}

function nameOf(profiles: unknown): string | null {
  if (!profiles || typeof profiles !== "object") return null;
  const p = profiles as { full_name?: string | null };
  return p.full_name ?? null;
}
