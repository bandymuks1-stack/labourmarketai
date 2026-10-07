/**
 * ASSIGNED PEOPLE - the ONE meaning of "who is assigned to this project" (WRK-6).
 *
 * A project's assigned people are the DISTINCT PERSONS in the union of
 *   (a) ACTIVE person assignments (`project_worker_assignments`, status active), and
 *   (b) the CURRENT members of every ACTIVELY assigned team (`team_assignments`,
 *       not ended), resolved AS OF NOW by the database
 *       (`list_team_assignment_members_v1` -> `team_member_at_v1`): a member who
 *       left the team is not counted, a member who joined later is, an ended or
 *       replaced team contributes nobody, a completed project is not special-cased
 *       here (completing it ends the roster the same way it always did).
 * A person who is BOTH individually and team assigned is counted ONCE and keeps
 * the individual assignment (`viaTeam: false`): the person assignment is the
 * stronger, directly editable fact. A team assignment of any scope (project,
 * work object, task) puts its members on the project's headcount - the calendar
 * treats a narrower scope as an undated window, but the people are still there.
 *
 * Every headcount / roster / "N assigned" surface routes through this module so a
 * project with one three-person team can never read "0 assigned". Where a surface
 * shows the distinction it says "N people (M via team)" from `countAssignedPeople`.
 * Nothing here writes: no per-person row is ever created for a team member.
 *
 * Pure functions on top, one thin server reader below (the SAME RPC the
 * commitments reader uses). A failed read yields an empty team side - never a
 * fabricated person.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AssignedPersonRow = {
  projectId: string;
  profileId: string | null;
  workerId: string | null;
};

export type TeamAssignedPersonRow = AssignedPersonRow & {
  assignmentId: string;
  teamOrgId: string | null;
  assignedAt: string | null;
  name: string | null;
};

/** The identity of a person: the profile when known, else the worker row. */
export function personKey(r: Pick<AssignedPersonRow, "profileId" | "workerId">): string | null {
  return r.profileId ?? r.workerId ?? null;
}

/**
 * Merge the person-assignment rows with the resolved team members: DISTINCT per
 * (project, person); a person already assigned individually keeps that row and
 * is `viaTeam: false`; a team-only person is `viaTeam: true`. Two teams on one
 * project, or one person in two teams, count once. Rows without any identity are
 * dropped (a headcount never counts an unknown).
 */
export function mergeAssignedPeople<P extends AssignedPersonRow, T extends AssignedPersonRow>(
  persons: readonly P[],
  teamMembers: readonly T[],
): Array<(P & { viaTeam: false }) | (T & { viaTeam: true })> {
  const out: Array<(P & { viaTeam: false }) | (T & { viaTeam: true })> = [];
  const seen = new Set<string>();
  const keyOf = (r: AssignedPersonRow) => {
    const k = personKey(r);
    return k === null ? null : `${r.projectId}:${k}`;
  };
  // A worker id and a profile id name the same person; index both so a person
  // row carrying only one and a team row carrying the other still collide.
  const seenWorker = new Set<string>();
  const seenProfile = new Set<string>();
  const remember = (r: AssignedPersonRow) => {
    if (r.workerId) seenWorker.add(`${r.projectId}:${r.workerId}`);
    if (r.profileId) seenProfile.add(`${r.projectId}:${r.profileId}`);
  };
  const known = (r: AssignedPersonRow) =>
    (r.workerId !== null && seenWorker.has(`${r.projectId}:${r.workerId}`)) ||
    (r.profileId !== null && seenProfile.has(`${r.projectId}:${r.profileId}`));
  for (const p of persons) {
    const k = keyOf(p);
    if (k === null || seen.has(k) || known(p)) continue;
    seen.add(k);
    remember(p);
    out.push({ ...p, viaTeam: false });
  }
  for (const t of teamMembers) {
    const k = keyOf(t);
    if (k === null || seen.has(k) || known(t)) continue;
    seen.add(k);
    remember(t);
    out.push({ ...t, viaTeam: true });
  }
  return out;
}

/** Headcount of one project (or all rows): distinct people, how many reach the
 *  project only through a team, how many are individually assigned. */
export function countAssignedPeople(
  merged: ReadonlyArray<{ projectId: string; viaTeam: boolean }>,
  projectId?: string,
): { total: number; viaTeam: number; individual: number } {
  const rows = projectId === undefined ? merged : merged.filter((r) => r.projectId === projectId);
  const viaTeam = rows.filter((r) => r.viaTeam).length;
  return { total: rows.length, viaTeam, individual: rows.length - viaTeam };
}

/** Distinct people per project, ready for a `projectId -> count` surface. */
export function assignedCountsByProject(
  merged: ReadonlyArray<{ projectId: string; viaTeam: boolean }>,
): Map<string, { total: number; viaTeam: number }> {
  const out = new Map<string, { total: number; viaTeam: number }>();
  for (const r of merged) {
    const c = out.get(r.projectId) ?? { total: 0, viaTeam: 0 };
    c.total += 1;
    if (r.viaTeam) c.viaTeam += 1;
    out.set(r.projectId, c);
  }
  return out;
}

const MEMBER_CHUNK = 100; // list_team_assignment_members_v1 reads at most 100 ids per call
const TEAM_READ_LIMIT = 500;

/**
 * The members of every ACTIVELY assigned team on the given projects (all
 * RLS-visible active team assignments when `projectIds` is omitted), as of now.
 * Runs as the caller: a manager reads the teams of projects/teams they manage; a
 * reader without authority gets nothing. Never throws; any failure (including
 * the relation not being provisioned yet) is an empty list.
 */
export async function readTeamAssignedPeople(
  supabase: Pick<SupabaseClient, "from" | "rpc">,
  projectIds?: readonly string[],
): Promise<TeamAssignedPersonRow[]> {
  try {
    if (projectIds && projectIds.length === 0) return [];
    let q = supabase
      .from("team_assignments" as never)
      .select("id, project_id, team_org_id, assigned_at")
      .is("ended_at", null)
      .limit(TEAM_READ_LIMIT);
    if (projectIds) q = q.in("project_id", [...projectIds]);
    const { data, error } = await q;
    if (error || !Array.isArray(data) || data.length === 0) return [];
    const assignments = data as unknown as {
      id: string;
      project_id: string;
      team_org_id: string | null;
      assigned_at: string | null;
    }[];
    const byId = new Map(assignments.map((a) => [a.id, a]));
    const out: TeamAssignedPersonRow[] = [];
    for (let i = 0; i < assignments.length; i += MEMBER_CHUNK) {
      const ids = assignments.slice(i, i + MEMBER_CHUNK).map((a) => a.id);
      const res = await supabase.rpc("list_team_assignment_members_v1" as never, {
        p_assignment_ids: ids,
      } as never);
      if (res.error || !Array.isArray(res.data)) continue;
      for (const m of res.data as {
        assignment_id: string;
        profile_id: string | null;
        worker_id: string | null;
        full_name: string | null;
      }[]) {
        const a = byId.get(m.assignment_id);
        if (!a) continue;
        out.push({
          projectId: a.project_id,
          profileId: m.profile_id ?? null,
          workerId: m.worker_id ?? null,
          assignmentId: a.id,
          teamOrgId: a.team_org_id ?? null,
          assignedAt: a.assigned_at ?? null,
          name: m.full_name ?? null,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}
