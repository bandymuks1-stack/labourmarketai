/**
 * JOURNAL PROJECT ATTRIBUTION — which project a journal entry's hours belong
 * to (handoff 2026-10-02 §7, JOURNAL_PROJECT_ATTRIBUTION_AMBIGUOUS).
 *
 * The database rule (`create_journal_entry_full`, 20261002120000):
 *   0 active projects  → a legitimate non-project entry, no question to ask;
 *   1 active project   → the DB auto-selects it (safe, unambiguous);
 *   2+ active projects → the WORKER must say which (or "not project work").
 *                        Guessing is what silently dropped hours before.
 *
 * Pure on purpose: the composer, the page and the write core agree on the
 * three cases through this one module, and it is unit-testable without a DB.
 */

export type AssignedProject = {
  id: string;
  label: string;
  /** Set when the worker reaches this project ONLY through an actively
   *  assigned team (20261003150700): the team name(s), shown as "via team ...".
   *  A person on the project roster never carries it. */
  viaTeam?: string | null;
};

/** What the composer / picker shows for a project: its title, plus the team it
 *  is reached through when it is a team context ("via team ..."). The caller
 *  passes its own translator for the localized "via team" text. */
export function projectDisplayLabel(
  p: AssignedProject,
  viaTeamText: (vars: { project: string; team: string }) => string,
): string {
  return p.viaTeam ? viaTeamText({ project: p.label, team: p.viaTeam }) : p.label;
}

/** The three things the form can say about the project, as posted. */
export type ProjectChoice =
  | { kind: "absent" } // field not posted → DB auto-link rule applies
  | { kind: "none" } // explicit: not project work
  | { kind: "project"; projectId: string };

export const PROJECT_FIELD_NONE = "none";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parse the posted `project_id` form value. Anything unrecognised is treated
 *  as absent (never as a guess) — the DB still validates a real id. */
export function parseProjectChoice(raw: string | null | undefined): ProjectChoice {
  const v = (raw ?? "").trim();
  if (v === PROJECT_FIELD_NONE) return { kind: "none" };
  if (UUID_RE.test(v)) return { kind: "project", projectId: v };
  return { kind: "absent" };
}

/** What the RPC receives for a given choice. */
export function rpcProjectParams(choice: ProjectChoice): {
  p_project_id: string | null;
  p_project_explicit: boolean;
} {
  if (choice.kind === "project")
    return { p_project_id: choice.projectId, p_project_explicit: true };
  if (choice.kind === "none")
    return { p_project_id: null, p_project_explicit: true };
  return { p_project_id: null, p_project_explicit: false };
}

export type ProjectPrompt = "none" | "auto" | "ask";

/** What the UI must do for the projects the worker is actively assigned to. */
export function projectPromptFor(projects: readonly AssignedProject[]): ProjectPrompt {
  if (projects.length >= 2) return "ask";
  if (projects.length === 1) return "auto";
  return "none";
}

/** The choice is acceptable to save: either no question is open, or it was
 *  answered with a project the worker really has (or "not project work"). */
export function projectChoiceIsSatisfied(
  projects: readonly AssignedProject[],
  chosen: string,
): boolean {
  if (projectPromptFor(projects) !== "ask") return true;
  return chosen === PROJECT_FIELD_NONE || projects.some((p) => p.id === chosen);
}

type AssignmentRow = {
  project_id: string;
  projects: {
    id: string;
    title: string | null;
    organization_id: string | null;
  } | null;
};

/** Group the worker's ACTIVE assignment rows by the organization of the
 *  project, so each engagement context gets exactly its own organization's
 *  projects (the DB checks the same equality). */
export function groupProjectsByOrganization(
  rows: readonly AssignmentRow[],
): Map<string, AssignedProject[]> {
  const out = new Map<string, AssignedProject[]>();
  for (const r of rows) {
    const p = r.projects;
    if (!p?.organization_id) continue;
    const list = out.get(p.organization_id) ?? [];
    if (list.some((x) => x.id === p.id)) continue;
    list.push({ id: p.id, label: p.title?.trim() || "" });
    out.set(p.organization_id, list);
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.label.localeCompare(b.label));
  }
  return out;
}

type TeamContextRow = {
  team_org_id: string;
  team_name: string | null;
  project_id: string;
  project_title: string | null;
  project_org_id: string | null;
};

/** Add the projects the worker reaches through an ACTIVELY assigned team to the
 *  per-organization map. The database accepts an entry context whose
 *  organization is the project's organization OR the team's own organization
 *  (the member's employment context), so a team project is listed under both.
 *  A project the worker is also assigned to as a PERSON stays unlabelled
 *  (the person assignment wins); a project reached through several teams
 *  carries every team name. Mutates and returns `out`. */
export function addTeamProjects(
  out: Map<string, AssignedProject[]>,
  rows: readonly TeamContextRow[],
): Map<string, AssignedProject[]> {
  const names = new Map<string, string[]>();
  for (const r of rows) {
    const n = r.team_name?.trim();
    if (!n) continue;
    const list = names.get(r.project_id) ?? [];
    if (!list.includes(n)) list.push(n);
    names.set(r.project_id, list);
  }
  for (const r of rows) {
    const orgs = new Set<string>();
    if (r.project_org_id) orgs.add(r.project_org_id);
    if (r.team_org_id) orgs.add(r.team_org_id);
    const via = [...(names.get(r.project_id) ?? [])]
      .sort((a, b) => a.localeCompare(b))
      .join(", ");
    for (const org of orgs) {
      const list = out.get(org) ?? [];
      if (!list.some((x) => x.id === r.project_id)) {
        list.push({
          id: r.project_id,
          label: r.project_title?.trim() || "",
          viaTeam: via || null,
        });
        out.set(org, list);
      }
    }
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.label.localeCompare(b.label));
  }
  return out;
}
