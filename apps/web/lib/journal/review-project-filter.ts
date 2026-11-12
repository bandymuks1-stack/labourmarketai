/**
 * THE REVIEW QUEUE BY PROJECT - pure. A company reviewing its project's work
 * reports could not narrow the queue to one project: every entry of the
 * organization sat in one list. This derives the choices and the narrowed rows
 * from the queue rows themselves; it reads nothing and decides no authority
 * (the rows are already the caller's reviewable set).
 *
 * An entry recorded without a project is its own choice ("no project"), never
 * hidden and never attached to a project by guess. A project whose title the
 * reader may not see keeps `name: null`; the screen says so in words.
 */

/** URL value for "entries with no project". A uuid never equals it. */
export const NO_PROJECT = "none";

export type ProjectChoice = {
  /** A project id, or `NO_PROJECT`. */
  readonly value: string;
  /** Null: the entry has no project (`NO_PROJECT`) or the title is unreadable. */
  readonly name: string | null;
  readonly count: number;
};

type Row = { readonly projectId: string | null; readonly projectName: string | null };

/** One choice per project in the queue (first-seen order), then "no project"
 *  when any entry has none. Counts are the rows, nothing estimated. */
export function projectChoices(rows: readonly Row[]): ProjectChoice[] {
  const byProject = new Map<string, { name: string | null; count: number }>();
  let none = 0;
  for (const r of rows) {
    if (!r.projectId) {
      none += 1;
      continue;
    }
    const c = byProject.get(r.projectId) ?? { name: null, count: 0 };
    c.count += 1;
    if (!c.name && r.projectName?.trim()) c.name = r.projectName.trim();
    byProject.set(r.projectId, c);
  }
  const out: ProjectChoice[] = [...byProject].map(([value, c]) => ({ value, name: c.name, count: c.count }));
  if (none > 0) out.push({ value: NO_PROJECT, name: null, count: none });
  return out;
}

/** The chosen value when it names something in THIS queue, else null (all).
 *  A stale or foreign id in the URL therefore shows everything, never an
 *  empty list that reads as "nothing to review". */
export function chosenProject(raw: string | string[] | undefined, choices: readonly ProjectChoice[]): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && choices.some((c) => c.value === v) ? v : null;
}

export function rowsForProject<R extends Row>(rows: readonly R[], chosen: string | null): readonly R[] {
  if (chosen === null) return rows;
  if (chosen === NO_PROJECT) return rows.filter((r) => !r.projectId);
  return rows.filter((r) => r.projectId === chosen);
}
