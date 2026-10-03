/**
 * Pure project-progress derivation (train D) — no IO, shared by the server
 * read, the guard test and any surface that renders progress.
 *
 * Progress is DERIVED, never stored: done work over countable work, from
 * the project's tasks and stages. Cancelled items are excluded from both
 * sides (cancelled work is neither done nor pending — it stopped existing
 * as a commitment). A project with nothing countable has NO percent — the
 * UI says "no measurable progress yet" instead of faking 0% or 100%.
 */

export type ProjectProgress = {
  readonly taskDone: number;
  readonly taskTotal: number;
  readonly stageDone: number;
  readonly stageTotal: number;
  /** 0..100 over (tasks + stages), or null when nothing is countable. */
  readonly percent: number | null;
};

export const EMPTY_PROJECT_PROGRESS: ProjectProgress = {
  taskDone: 0,
  taskTotal: 0,
  stageDone: 0,
  stageTotal: 0,
  percent: null,
};

/** Statuses that count toward the denominator (cancelled excluded). */
const COUNTABLE_TASK = new Set(["todo", "in_progress", "blocked", "done"]);
const COUNTABLE_STAGE = new Set(["planned", "in_progress", "blocked", "done"]);

/**
 * A task row with the optional hierarchy pointer (work_tasks.parent_task_id).
 * Rows from a database without the stage/subtask migration simply carry
 * parentTaskId null/undefined and are counted flat, exactly as before.
 */
export type ProgressTask = {
  readonly id?: string;
  readonly parentTaskId?: string | null;
  readonly status: string;
};

export type TaskTreeCounts = {
  readonly done: number;
  readonly total: number;
  /** Parents marked done while a countable child is still open: the parent
   *  is NOT counted done by itself; surfaced so the UI can say so. */
  readonly doneParentsWithOpenChildren: number;
};

/**
 * SUBTASK COUNTING RULE (derived only, nothing stored):
 *
 *  1. Cancelled work is excluded, and a cancelled parent excludes its whole
 *     subtree (the commitment stopped existing).
 *  2. A task with at least one countable (non-cancelled) child is a CONTAINER:
 *     it is NOT counted itself - its leaves carry the weight. So a parent and
 *     its subtasks are never double-counted, and a parent is never "done" by
 *     its own status while a child is still open.
 *  3. A task with no countable children is a LEAF and counts by its own status.
 *  4. Orphans (parent id not in the list: hidden by RLS / read limit) count as
 *     leaves - we never invent a parent we cannot see.
 */
export function collectCountableLeaves(tasks: readonly ProgressTask[]): {
  readonly leaves: readonly ProgressTask[];
  readonly doneParentsWithOpenChildren: number;
} {
  const byId = new Map<string, ProgressTask>();
  for (const t of tasks) if (t.id) byId.set(t.id, t);
  const kids = new Map<string, ProgressTask[]>();
  const roots: ProgressTask[] = [];
  for (const t of tasks) {
    const p = t.parentTaskId;
    if (p && p !== t.id && byId.has(p)) {
      const l = kids.get(p) ?? [];
      l.push(t);
      kids.set(p, l);
    } else {
      roots.push(t);
    }
  }
  const leaves: ProgressTask[] = [];
  let doneParentsWithOpenChildren = 0;
  const walk = (t: ProgressTask, guard: number) => {
    if (!COUNTABLE_TASK.has(t.status)) return; // cancelled → subtree excluded
    const countableKids =
      guard > 8
        ? []
        : (t.id ? (kids.get(t.id) ?? []) : []).filter((k) =>
            COUNTABLE_TASK.has(k.status),
          );
    if (countableKids.length === 0) {
      leaves.push(t);
      return;
    }
    if (t.status === "done" && countableKids.some((k) => k.status !== "done")) {
      doneParentsWithOpenChildren++;
    }
    for (const k of countableKids) walk(k, guard + 1);
  };
  for (const r of roots) walk(r, 0);
  return { leaves, doneParentsWithOpenChildren };
}

export function countTaskTree(tasks: readonly ProgressTask[]): TaskTreeCounts {
  const { leaves, doneParentsWithOpenChildren } = collectCountableLeaves(tasks);
  return {
    done: leaves.filter((t) => t.status === "done").length,
    total: leaves.length,
    doneParentsWithOpenChildren,
  };
}

export function deriveProjectProgress(
  taskStatuses: readonly (string | ProgressTask)[],
  stageStatuses: readonly string[],
): ProjectProgress {
  const { done: taskDone, total: taskTotal } = countTaskTree(
    taskStatuses.map((s) => (typeof s === "string" ? { status: s } : s)),
  );
  let stageDone = 0;
  let stageTotal = 0;
  for (const s of stageStatuses) {
    if (!COUNTABLE_STAGE.has(s)) continue;
    stageTotal++;
    if (s === "done") stageDone++;
  }
  const total = taskTotal + stageTotal;
  const done = taskDone + stageDone;
  return {
    taskDone,
    taskTotal,
    stageDone,
    stageTotal,
    percent: total === 0 ? null : Math.round((done / total) * 100),
  };
}
