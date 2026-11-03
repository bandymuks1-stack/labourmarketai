import type { MyTasksResult, WorkTask, WorkTaskStatus } from "@/lib/tasks/task-model";

/**
 * THE TEAM'S WEEKLY GOAL (Future Experience C, owner decision 2026-10-14):
 * "savaitės tikslas – konkrečių užduočių rinkinys, susietas su projektu ir
 * laikotarpiu; progresą skaičiuoti tik iš realių užduočių būsenų; neįvesti
 * naujų lentelių ar laukų".
 *
 * So the goal IS the project's existing `work_tasks` whose due day falls in
 * this week (Monday–Sunday of the viewer's own work day). Nothing is
 * declared, nothing is invented:
 *   - progress = done / (tasks this week that are not cancelled), from the
 *     task rows' own statuses;
 *   - a task without a due date belongs to no week and is never pulled in;
 *   - no task due this week → NONE (the view says nothing invented);
 *   - a failed read → UNKNOWN (never "0 of 0");
 *   - the scope is what the reader's RLS returned: a manager reads every
 *     task of the project, a worker only their own / their team's — the view
 *     names which (`scope`), so a partial list never poses as the team's.
 *
 * Splits, not scores: each task is one split of the week, in due order. No
 * person is named or compared; assignees are not shown here at all.
 *
 * Pure and deterministic: no IO, no `Date` (the week is passed in).
 */

export type WeeklyGoalTask = {
  readonly id: string;
  readonly title: string;
  readonly status: WorkTaskStatus;
  /** The task's due day (`YYYY-MM-DD`, UTC). */
  readonly dueDay: string;
  /** Due before today and still open. */
  readonly overdue: boolean;
};

export type WeeklyGoal =
  | {
      readonly kind: "known";
      readonly scope: "project" | "mine";
      readonly weekStart: string;
      readonly weekEnd: string;
      readonly tasks: readonly WeeklyGoalTask[];
      readonly done: number;
      /** Tasks that count (cancelled ones do not). */
      readonly total: number;
    }
  | { readonly kind: "none" }
  | { readonly kind: "unknown" };

const OPEN: ReadonlySet<WorkTaskStatus> = new Set(["todo", "in_progress", "blocked"] as WorkTaskStatus[]);

/** Monday and Sunday (UTC calendar days) of the week holding `todayIso`. */
export function weekOf(todayIso: string): { readonly start: string; readonly end: string } {
  const d = new Date(`${todayIso.slice(0, 10)}T00:00:00.000Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(d.getTime() - dow * 86_400_000);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function deriveWeeklyGoal(
  result: MyTasksResult | null,
  input: { readonly todayIso: string; readonly scope: "project" | "mine" },
): WeeklyGoal {
  if (result === null) return { kind: "unknown" };
  if (result.status === "not-authed") return { kind: "unknown" };
  if (result.status === "needs-migration") return { kind: "none" };
  if (result.error) return { kind: "unknown" };

  const { start, end } = weekOf(input.todayIso);
  const today = input.todayIso.slice(0, 10);
  const inWeek = (t: WorkTask) => {
    const day = t.dueAt ? t.dueAt.slice(0, 10) : null;
    return day !== null && day >= start && day <= end;
  };
  const tasks = result.tasks
    .filter(inWeek)
    .map(
      (t): WeeklyGoalTask => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dueDay: t.dueAt!.slice(0, 10),
        overdue: OPEN.has(t.status) && t.dueAt!.slice(0, 10) < today,
      }),
    )
    .sort((a, b) => a.dueDay.localeCompare(b.dueDay) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));

  const counted = tasks.filter((t) => t.status !== "cancelled");
  if (counted.length === 0) return { kind: "none" };
  return {
    kind: "known",
    scope: input.scope,
    weekStart: start,
    weekEnd: end,
    tasks,
    done: counted.filter((t) => t.status === "done").length,
    total: counted.length,
  };
}
