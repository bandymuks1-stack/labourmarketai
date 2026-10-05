import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { checkWorkerReservation } from "@/lib/planning/worker-reservation";
import {
  groupMembers,
  parseAssignResult,
  refusalOf,
  type TeamAssignOutcome,
  type TeamAssignRefusal,
  type TeamAssignmentRow,
  type TeamMemberCalendar,
} from "@/lib/projects/team-assignment-model";

/**
 * A TEAM ON A PROJECT / WORK OBJECT / TASK AS ONE RELATIONSHIP (WRK-6).
 *
 * The write is ONE RPC (`assign_team_to_work_v1`) that stores ONE
 * `team_assignments` row. It is NOT a fan-out: no per-person
 * `project_worker_assignments` row is created, so the product knows "team X is
 * on project Y" as a fact, and ending or replacing the team is one edit. The
 * database owns authority (can_manage_project AND manages the team) — nothing
 * is restated here.
 *
 * Members are RESOLVED through the relation by the database, as of an instant
 * (`list_team_assignment_members_v1`), from the team's own membership at that
 * time. Individual hours, journal entries and capability attribution stay with
 * the people who performed the work.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const READ_LIMIT = 200;

/** The caller a non-cookie door (the assistant / MCP capabilities) supplies: its
 *  OWN RLS-scoped client, already bound to the authenticated profile. Absent =
 *  the cookie session (the web UI). The write is the SAME RPC either way. */
export interface TeamAssignmentCaller {
  readonly supabase: SupabaseClient;
  /** The authenticated profile the client is bound to (never an argument of a tool). */
  readonly userId: string;
}

/** The authenticated profile: the supplied caller's, else the cookie session's. */
async function userIdOf(supabase: SupabaseClient, caller: TeamAssignmentCaller | undefined): Promise<string | null> {
  if (caller) return caller.userId;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function clientOf(caller: TeamAssignmentCaller | undefined): Promise<SupabaseClient> {
  return caller?.supabase ?? (await createClient());
}

export type TeamAssignResult =
  | {
      readonly status: "ok";
      readonly outcome: TeamAssignOutcome;
      readonly assignmentId: string;
      /** Advisory only, measured AFTER the write: members who already hold time on
       *  those dates, or whose dates could not be confirmed free. */
      readonly memberCalendar: readonly TeamMemberCalendar[];
    }
  | { readonly status: TeamAssignRefusal };

export async function assignTeamToWork(input: {
  readonly teamId: string;
  readonly projectId: string;
  readonly workObjectId?: string | null;
  readonly taskId?: string | null;
  readonly replaceAssignmentId?: string | null;
}, caller?: TeamAssignmentCaller): Promise<TeamAssignResult> {
  const supabase = await clientOf(caller);
  if (!(await userIdOf(supabase, caller))) return { status: "not_authed" };

  const { data, error } = await asAny(supabase).rpc("assign_team_to_work_v1", {
    p_team_org_id: input.teamId,
    p_project_id: input.projectId,
    p_work_object_id: input.workObjectId ?? null,
    p_task_id: input.taskId ?? null,
    p_replace_assignment_id: input.replaceAssignmentId ?? null,
  });
  if (error) return { status: refusalOf(error) };
  const parsed = parseAssignResult(data);
  if (!parsed) return { status: "error" };

  return {
    status: "ok",
    outcome: parsed.outcome,
    assignmentId: parsed.assignmentId,
    memberCalendar: await calendarAfterAssign(supabase, parsed.assignmentId, input.projectId, caller),
  };
}

export type EndTeamAssignmentResult =
  | { readonly status: "ok"; readonly outcome: "ended" | "already_ended" }
  | { readonly status: TeamAssignRefusal };

export async function endTeamAssignment(input: {
  readonly assignmentId: string;
  readonly reason?: string | null;
}, caller?: TeamAssignmentCaller): Promise<EndTeamAssignmentResult> {
  const supabase = await clientOf(caller);
  if (!(await userIdOf(supabase, caller))) return { status: "not_authed" };
  const { data, error } = await asAny(supabase).rpc("end_team_assignment_v1", {
    p_assignment_id: input.assignmentId,
    p_reason: input.reason ?? null,
  });
  if (error) return { status: refusalOf(error) };
  return { status: "ok", outcome: data === "already_ended" ? "already_ended" : "ended" };
}

/**
 * CAL-7 for a team, AFTER the write and advisory only (SEP-2): each resolved
 * member goes through the ONE existing reservation check, excluding this
 * project so the assignment just written is not reported against itself.
 * A member whose check could not run is `unknown`, never clear. Any failure
 * here yields an empty list: the assignment already happened.
 */
async function calendarAfterAssign(
  supabase: SupabaseClient,
  assignmentId: string,
  projectId: string,
  caller?: TeamAssignmentCaller,
): Promise<TeamMemberCalendar[]> {
  try {
    const [{ data: project }, { data: members }] = await Promise.all([
      asAny(supabase).from("projects").select("start_date, end_date").eq("id", projectId).maybeSingle(),
      asAny(supabase).rpc("list_team_assignment_members_v1", { p_assignment_ids: [assignmentId] }),
    ]);
    const window = {
      startDate: (project?.start_date as string | null) ?? null,
      endDate: (project?.end_date as string | null) ?? null,
    };
    const out: TeamMemberCalendar[] = [];
    for (const m of (members ?? []) as { profile_id: string; worker_id: string | null; full_name: string | null }[]) {
      if (!m.worker_id) continue;
      const verdict = await checkWorkerReservation({ workerId: m.worker_id, window, exclude: [projectId], caller });
      out.push({ profileId: m.profile_id, name: m.full_name, verdict });
    }
    return out;
  } catch (error) {
    console.error("[projects] team calendar check failed:", error);
    return [];
  }
}

/**
 * CAL-7 for a team BEFORE the write (the assistant's draft names the clash
 * verdict; advisory only, SEP-2 - it never blocks). The members come from the
 * database's resolver (list_team_members_now_v1 -> team_member_at_v1, the same
 * single source as list_team_assignment_members_v1); each one's worker goes through the SAME
 * reservation check the post-write advisory uses. A team whose members cannot
 * be read is reported as not known, and a member whose check could not run is
 * reported as unknown by the check itself - never as clear. Writes nothing.
 */
export async function previewTeamAssignmentCalendar(
  input: { readonly teamId: string; readonly projectId: string },
  caller?: TeamAssignmentCaller,
): Promise<{ readonly known: boolean; readonly members: readonly TeamMemberCalendar[] }> {
  try {
    const supabase = await clientOf(caller);
    const [{ data: project }, membersRes] = await Promise.all([
      asAny(supabase).from("projects").select("start_date, end_date").eq("id", input.projectId).maybeSingle(),
      asAny(supabase).rpc("list_team_members_now_v1", { p_team_org_id: input.teamId }),
    ]);
    if (membersRes.error || !Array.isArray(membersRes.data)) return { known: false, members: [] };
    const window = {
      startDate: (project?.start_date as string | null) ?? null,
      endDate: (project?.end_date as string | null) ?? null,
    };
    const out: TeamMemberCalendar[] = [];
    for (const m of membersRes.data as { profile_id: string; worker_id: string | null; full_name: string | null }[]) {
      if (!m.worker_id) continue;
      const verdict = await checkWorkerReservation({ workerId: m.worker_id, window, exclude: [input.projectId], caller });
      out.push({ profileId: m.profile_id, name: m.full_name, verdict });
    }
    return { known: true, members: out };
  } catch (error) {
    console.error("[projects] team calendar preview failed:", error);
    return { known: false, members: [] };
  }
}

export type ProjectTeamAssignmentsResult =
  | { readonly status: "ok"; readonly byProject: ReadonlyMap<string, readonly TeamAssignmentRow[]> }
  | { readonly status: "needs_migration" }
  | { readonly status: "unavailable" };

const MISSING = new Set(["42P01", "42703", "PGRST205", "42883", "PGRST202"]);

/**
 * The ACTIVE team assignments on these projects, each with the members the
 * database resolves now. Visibility is the database's (RLS + the member
 * function): a manager sees every member, a plain member only themselves.
 */
export async function getProjectTeamAssignments(
  projectIds: readonly string[],
): Promise<ProjectTeamAssignmentsResult> {
  if (projectIds.length === 0) return { status: "ok", byProject: new Map() };
  const supabase = await createClient();
  const rowsRes = await asAny(supabase)
    .from("team_assignments")
    .select("id, team_org_id, project_id, work_object_id, task_id, assigned_at")
    .in("project_id", projectIds.slice(0, READ_LIMIT))
    .is("ended_at", null)
    .order("assigned_at", { ascending: true })
    .limit(READ_LIMIT);
  if (rowsRes.error) {
    return MISSING.has(rowsRes.error.code ?? "") ? { status: "needs_migration" } : { status: "unavailable" };
  }
  const rows = (rowsRes.data ?? []) as {
    id: string;
    team_org_id: string;
    project_id: string;
    work_object_id: string | null;
    task_id: string | null;
    assigned_at: string;
  }[];
  if (rows.length === 0) return { status: "ok", byProject: new Map() };

  const [membersRes, teamsRes] = await Promise.all([
    asAny(supabase).rpc("list_team_assignment_members_v1", { p_assignment_ids: rows.map((r) => r.id) }),
    asAny(supabase)
      .from("organizations")
      .select("id, display_name")
      .in("id", [...new Set(rows.map((r) => r.team_org_id))])
      .limit(READ_LIMIT),
  ]);
  // Members that could not be read are NOT "no members": an unreadable list is unavailable.
  if (membersRes.error) {
    return MISSING.has(membersRes.error.code ?? "") ? { status: "needs_migration" } : { status: "unavailable" };
  }
  const names = new Map<string, string | null>();
  for (const t of (teamsRes.data ?? []) as { id: string; display_name: string | null }[]) {
    names.set(t.id, t.display_name);
  }
  const members = groupMembers(
    (membersRes.data ?? []) as {
      assignment_id: string;
      profile_id: string;
      worker_id: string | null;
      full_name: string | null;
    }[],
  );

  const byProject = new Map<string, TeamAssignmentRow[]>();
  for (const r of rows) {
    const list = byProject.get(r.project_id) ?? [];
    list.push({
      id: r.id,
      teamOrgId: r.team_org_id,
      teamName: names.get(r.team_org_id) ?? null,
      projectId: r.project_id,
      workObjectId: r.work_object_id,
      taskId: r.task_id,
      assignedAt: r.assigned_at,
      members: members.get(r.id) ?? [],
    });
    byProject.set(r.project_id, list);
  }
  return { status: "ok", byProject };
}

export interface AssignableTeam {
  readonly id: string;
  readonly name: string | null;
}

/**
 * The teams the caller MANAGES (an active owner / manager engagement on a
 * team organization). Authority is still decided by the RPC; this only avoids
 * offering a team the caller could never assign.
 */
export async function getAssignableTeams(): Promise<readonly AssignableTeam[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const ecRes = await asAny(supabase)
    .from("engagement_contexts")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .in("relationship_slug", ["owner", "manager", "external_manager"])
    .limit(READ_LIMIT);
  if (ecRes.error) return [];
  const ids = [
    ...new Set(
      ((ecRes.data ?? []) as { organization_id: string | null }[])
        .map((r) => r.organization_id)
        .filter((v): v is string => typeof v === "string"),
    ),
  ];
  if (ids.length === 0) return [];
  const orgRes = await asAny(supabase)
    .from("organizations")
    .select("id, display_name")
    .in("id", ids)
    .eq("organization_type", "team")
    .order("display_name", { ascending: true })
    .limit(50);
  if (orgRes.error) return [];
  return ((orgRes.data ?? []) as { id: string; display_name: string | null }[]).map((o) => ({
    id: o.id,
    name: o.display_name,
  }));
}

export interface AssignableTask {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
}

/** Open tasks of these projects, for the task scope of a team assignment. RLS decides what is visible. */
export async function getAssignableTasks(projectIds: readonly string[]): Promise<readonly AssignableTask[]> {
  if (projectIds.length === 0) return [];
  const supabase = await createClient();
  const res = await asAny(supabase)
    .from("work_tasks")
    .select("id, project_id, title")
    .in("project_id", projectIds.slice(0, READ_LIMIT))
    .in("status", ["todo", "in_progress", "blocked"])
    .order("created_at", { ascending: true })
    .limit(300);
  if (res.error) return [];
  return ((res.data ?? []) as { id: string; project_id: string; title: string }[]).map((t) => ({
    id: t.id,
    projectId: t.project_id,
    title: t.title,
  }));
}
