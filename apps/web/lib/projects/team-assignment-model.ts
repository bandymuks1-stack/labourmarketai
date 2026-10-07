import type { ReservationVerdict } from "@/lib/workforce/commitment-reservation";

/**
 * A TEAM ON A PROJECT / WORK OBJECT / TASK — the pure half (WRK-6).
 *
 * A team assignment is ONE relationship (`team_assignments`, migration
 * 20261003150600): a team (an `organizations` row of type `team`) bound to a
 * project and optionally to ONE work object OR ONE task of it. It writes no
 * per-person assignment rows. People are RESOLVED through the relation, as of
 * an instant, by the database (`list_team_assignment_members_v1`) — so a
 * person who left the team before the work is not credited, and individual
 * hours, journal entries and capability attribution stay per person.
 *
 * This file only names the shapes and turns the database's own words into
 * explicit statuses. It decides nothing about authority.
 */

export type TeamAssignmentScope = "project" | "work_object" | "task";

export interface TeamAssignmentMember {
  readonly profileId: string;
  /** Null for a member who has no worker record: they hold no worker-side hours. */
  readonly workerId: string | null;
  readonly name: string | null;
}

export interface TeamAssignmentRow {
  readonly id: string;
  readonly teamOrgId: string;
  readonly teamName: string | null;
  readonly projectId: string;
  readonly workObjectId: string | null;
  readonly taskId: string | null;
  readonly assignedAt: string;
  /** The members the database resolved for this assignment, as of now. */
  readonly members: readonly TeamAssignmentMember[];
}

export function scopeOf(row: {
  readonly workObjectId: string | null;
  readonly taskId: string | null;
}): TeamAssignmentScope {
  if (row.taskId) return "task";
  if (row.workObjectId) return "work_object";
  return "project";
}

/** The database's refusal words (22023) plus the authority / availability codes. */
export type TeamAssignRefusal =
  | "not_authorized"
  | "not_a_team"
  | "team_has_no_members"
  | "project_completed"
  | "task_not_assignable"
  | "object_not_assignable"
  | "one_scope_only"
  | "replace_target_not_active"
  | "team_and_project_required"
  | "needs_migration"
  | "not_authed"
  | "error";

const REFUSAL_WORDS: ReadonlySet<string> = new Set([
  "not_a_team",
  "team_has_no_members",
  "project_completed",
  "task_not_assignable",
  "object_not_assignable",
  "one_scope_only",
  "replace_target_not_active",
  "team_and_project_required",
]);

const MISSING_OBJECT_CODES = new Set(["42P01", "42703", "PGRST205", "42883", "PGRST202"]);

/** Map a Postgres/PostgREST error from the team RPCs to ONE explicit refusal. */
export function refusalOf(error: { code?: string | null; message?: string | null }): TeamAssignRefusal {
  const code = error.code ?? "";
  if (MISSING_OBJECT_CODES.has(code)) return "needs_migration";
  if (code === "42501") {
    return /authenticated/i.test(error.message ?? "") ? "not_authed" : "not_authorized";
  }
  const message = (error.message ?? "").trim();
  if (REFUSAL_WORDS.has(message)) return message as TeamAssignRefusal;
  return "error";
}

export type TeamAssignOutcome = "created" | "already_assigned" | "replaced";

/** Parse `{outcome, assignment_id}` from `assign_team_to_work_v1`. Anything else is null — never guessed. */
export function parseAssignResult(
  data: unknown,
): { readonly outcome: TeamAssignOutcome; readonly assignmentId: string } | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { outcome?: unknown; assignment_id?: unknown };
  if (d.outcome !== "created" && d.outcome !== "already_assigned" && d.outcome !== "replaced") return null;
  if (typeof d.assignment_id !== "string") return null;
  return { outcome: d.outcome, assignmentId: d.assignment_id };
}

/** One member's advisory calendar verdict after a team was assigned. */
export interface TeamMemberCalendar {
  readonly profileId: string;
  readonly name: string | null;
  readonly verdict: ReservationVerdict;
}

/**
 * Only members whose dates collide, or whose dates could NOT be confirmed
 * free, are worth telling the manager about; `clear` says nothing. Unknown is
 * never reported as clear (SEP-7).
 */
export function membersNeedingNotice(
  all: readonly TeamMemberCalendar[],
): { readonly conflicts: readonly TeamMemberCalendar[]; readonly unknown: readonly TeamMemberCalendar[] } {
  return {
    conflicts: all.filter((m) => m.verdict.state === "collides"),
    unknown: all.filter((m) => m.verdict.state === "unknown"),
  };
}

/** Group the database's member rows by assignment id (order preserved). */
export function groupMembers(
  rows: readonly {
    assignment_id: string;
    profile_id: string;
    worker_id: string | null;
    full_name: string | null;
  }[],
): Map<string, TeamAssignmentMember[]> {
  const out = new Map<string, TeamAssignmentMember[]>();
  for (const r of rows) {
    const list = out.get(r.assignment_id) ?? [];
    list.push({ profileId: r.profile_id, workerId: r.worker_id, name: r.full_name });
    out.set(r.assignment_id, list);
  }
  return out;
}
