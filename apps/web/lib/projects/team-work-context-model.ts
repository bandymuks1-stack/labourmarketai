/**
 * TEAM WORK CONTEXT — pure model (20261003150700).
 *
 * A team that is ACTIVELY assigned to a project / work object / task is a work
 * context for every current member: the database (`team_work_context_v1`,
 * `is_assigned_to_project`, `create_journal_entry_full`, …) resolves it through
 * `team_assignments` + `team_member_at_v1`, never through per-person
 * `project_worker_assignments` rows. This module is the app's mirror of the
 * rows `my_team_work_contexts_v1()` returns — one place that decides how those
 * rows become "the projects I can work on" and how they are labelled
 * ("via team <name>") so the journal composer, the worker's project list and
 * the planner all say the same thing.
 *
 * Pure on purpose: unit-testable without a database.
 */

export type TeamWorkContextRow = {
  assignment_id: string;
  team_org_id: string;
  team_name: string | null;
  project_id: string;
  project_title: string | null;
  project_org_id: string | null;
  work_object_id: string | null;
  task_id: string | null;
  assigned_at: string | null;
};

export type TeamScope = "project" | "work_object" | "task";

export function teamScopeOf(row: Pick<TeamWorkContextRow, "work_object_id" | "task_id">): TeamScope {
  if (row.task_id) return "task";
  if (row.work_object_id) return "work_object";
  return "project";
}

/** One project the caller works on through one or more teams. */
export type TeamProject = {
  projectId: string;
  /** The (earliest) team assignment through which the project is reached. */
  assignmentId: string;
  assignedAt: string | null;
  title: string | null;
  projectOrgId: string | null;
  teamOrgIds: string[];
  /** Display names of the teams (de-duplicated, sorted); empty when unnamed. */
  teamNames: string[];
};

/** Collapse the per-assignment rows into one entry per project. */
export function teamProjectsFromRows(rows: readonly TeamWorkContextRow[]): TeamProject[] {
  const byProject = new Map<string, TeamProject>();
  for (const r of rows) {
    if (!r.project_id) continue;
    const p =
      byProject.get(r.project_id) ??
      {
        projectId: r.project_id,
        assignmentId: r.assignment_id,
        assignedAt: r.assigned_at ?? null,
        title: r.project_title ?? null,
        projectOrgId: r.project_org_id ?? null,
        teamOrgIds: [],
        teamNames: [],
      };
    if (r.assigned_at && (!p.assignedAt || r.assigned_at < p.assignedAt)) {
      p.assignedAt = r.assigned_at;
      p.assignmentId = r.assignment_id;
    }
    if (r.team_org_id && !p.teamOrgIds.includes(r.team_org_id)) p.teamOrgIds.push(r.team_org_id);
    const name = r.team_name?.trim();
    if (name && !p.teamNames.includes(name)) p.teamNames.push(name);
    byProject.set(r.project_id, p);
  }
  for (const p of byProject.values()) p.teamNames.sort((a, b) => a.localeCompare(b));
  return [...byProject.values()].sort((a, b) =>
    (a.title ?? "").localeCompare(b.title ?? ""),
  );
}

/** "Team A" or "Team A, Team B" — the text after "via team". */
export function viaTeamLabel(names: readonly string[]): string | null {
  const n = names.map((x) => x.trim()).filter(Boolean);
  return n.length > 0 ? n.join(", ") : null;
}
