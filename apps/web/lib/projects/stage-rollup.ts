/**
 * Stage status SUGGESTION — derived, read-only, never auto-written.
 *
 * A stage's status is a human decision (update_project_stage_v1). This helper
 * only looks at the stage's tasks (leaf-counting rule of progress-model:
 * containers are not counted, cancelled excluded) and says what the work
 * suggests, so the UI can offer a one-tap confirmation. It never writes.
 *
 * Precedence (first match wins):
 *   open_work_in_done_stage  stage is `done` but countable leaves are still open → in_progress
 *   all_done                 every countable leaf is done, stage is not done      → done
 *   has_blocked              some leaf is blocked, stage is not blocked           → blocked
 *   work_started             a leaf is in progress/done, stage is `planned`       → in_progress
 * A stage with no countable tasks, or a cancelled stage, never gets a
 * suggestion — no tasks is not evidence of anything.
 */

import {
  collectCountableLeaves,
  type ProgressTask,
} from "@/lib/projects/progress-model";
import type { StageStatus } from "@/lib/projects/stages-model";

export type StageSuggestionReason =
  | "open_work_in_done_stage"
  | "all_done"
  | "has_blocked"
  | "work_started";

export type StageStatusSuggestion = {
  readonly suggested: StageStatus;
  readonly reason: StageSuggestionReason;
} | null;

export function suggestStageStatus(
  stageStatus: StageStatus,
  stageTasks: readonly ProgressTask[],
): StageStatusSuggestion {
  if (stageStatus === "cancelled") return null;
  const { leaves } = collectCountableLeaves(stageTasks);
  if (leaves.length === 0) return null;

  const allDone = leaves.every((t) => t.status === "done");
  if (stageStatus === "done") {
    return allDone
      ? null
      : { suggested: "in_progress", reason: "open_work_in_done_stage" };
  }
  if (allDone) return { suggested: "done", reason: "all_done" };
  if (stageStatus !== "blocked" && leaves.some((t) => t.status === "blocked")) {
    return { suggested: "blocked", reason: "has_blocked" };
  }
  if (
    stageStatus === "planned" &&
    leaves.some((t) => t.status === "in_progress" || t.status === "done")
  ) {
    return { suggested: "in_progress", reason: "work_started" };
  }
  return null;
}
