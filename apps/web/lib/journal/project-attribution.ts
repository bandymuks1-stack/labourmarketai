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

export type AssignedProject = { id: string; label: string };

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
