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

export function deriveProjectProgress(
  taskStatuses: readonly string[],
  stageStatuses: readonly string[],
): ProjectProgress {
  let taskDone = 0;
  let taskTotal = 0;
  for (const s of taskStatuses) {
    if (!COUNTABLE_TASK.has(s)) continue;
    taskTotal++;
    if (s === "done") taskDone++;
  }
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
