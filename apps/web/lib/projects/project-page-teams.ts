/**
 * THE TEAMS ON ONE PROJECT PAGE - a pure view of the team assignments the
 * existing reader already returns (`getProjectTeamAssignments`,
 * lib/projects/team-assignment.ts). Nothing here reads or writes.
 *
 * The project page showed the people and "N via team", but never WHICH team
 * (a kitchen shift, a care team, a crew): a manager with two teams on one
 * project could not tell them apart there. This answers two questions from the
 * same rows:
 *   - which teams work on the project, and who is in each now;
 *   - for one person on the page, which team(s) brought them.
 *
 * A team whose name the database did not return stays `name: null` - the page
 * says "team" for it; a name is never invented.
 */
import type { TeamAssignmentRow } from "@/lib/projects/team-assignment-model";

export interface ProjectPageTeam {
  /** The team (organization) id; one entry per team, however many assignments. */
  readonly teamOrgId: string;
  readonly name: string | null;
  /** Distinct members across this team's active assignments on the project. */
  readonly members: readonly { readonly key: string; readonly name: string | null }[];
}

function memberKey(m: { profileId: string; workerId: string | null }): string {
  return m.profileId || m.workerId || "";
}

/** One entry per team on the project (a team assigned to two tasks is ONE team),
 *  in first-assigned order, each with its distinct current members. */
export function projectPageTeams(rows: readonly TeamAssignmentRow[]): ProjectPageTeam[] {
  const byTeam = new Map<
    string,
    { name: string | null; members: Map<string, { key: string; name: string | null }> }
  >();
  for (const r of rows) {
    const team = byTeam.get(r.teamOrgId) ?? { name: null, members: new Map() };
    const name = r.teamName?.trim();
    if (!team.name && name) team.name = name;
    for (const m of r.members) {
      const key = memberKey(m);
      if (!key || team.members.has(key)) continue;
      team.members.set(key, { key, name: m.name?.trim() || null });
    }
    byTeam.set(r.teamOrgId, team);
  }
  return [...byTeam.entries()].map(([teamOrgId, t]) => ({
    teamOrgId,
    name: t.name,
    members: [...t.members.values()],
  }));
}

/**
 * Which team(s) each person on the project belongs to, keyed by BOTH the
 * profile id and the worker id (a page row may carry either). A person in two
 * teams gets both, in team order. `null` in the list is a team without a
 * readable name.
 */
export function teamsByPerson(
  rows: readonly TeamAssignmentRow[],
): Map<string, readonly (string | null)[]> {
  const out = new Map<string, (string | null)[]>();
  const seen = new Set<string>();
  const add = (person: string, teamOrgId: string, name: string | null) => {
    const mark = `${person}:${teamOrgId}`;
    if (seen.has(mark)) return;
    seen.add(mark);
    const list = out.get(person) ?? [];
    list.push(name);
    out.set(person, list);
  };
  const named = new Map(projectPageTeams(rows).map((t) => [t.teamOrgId, t.name]));
  for (const r of rows) {
    const name = named.get(r.teamOrgId) ?? null;
    for (const m of r.members) {
      if (m.profileId) add(m.profileId, r.teamOrgId, name);
      if (m.workerId) add(m.workerId, r.teamOrgId, name);
    }
  }
  return out;
}
