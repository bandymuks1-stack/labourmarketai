import { getTranslations } from "next-intl/server";

import type { WeeklyGoal, WeeklyGoalTask } from "@/lib/projects/weekly-goal";
import { formatUtcDate } from "@/lib/time/display";
import { cn } from "@/lib/utils";

/**
 * THIS WEEK'S GOAL — the project's real tasks due this week as the week's
 * splits (Future Experience C). Progress is done / counted from the tasks'
 * own statuses; nothing is declared or invented (`deriveWeeklyGoal`).
 *
 * The title says whose tasks these are: the manager reads the whole
 * project's week, a worker only what their session may read (their own and
 * their team's) — never posed as the whole team's.
 *
 * State is a word in a shape (no colour alone, no green: a task status is
 * the team's own bookkeeping, green is a second party's confirmation).
 * No assignee is shown and nobody is compared.
 */
const SPLIT: Record<string, string> = {
  done: "bg-text-secondary border-text-secondary",
  in_progress: "bg-ink-700 border-brand-blue",
  blocked: "bg-ink-700 border-state-warning border-dashed",
  overdue: "bg-ink-700 border-state-amber",
  todo: "bg-transparent border-ink-500",
  cancelled: "bg-transparent border-ink-600 border-dotted",
};

const splitKey = (t: WeeklyGoalTask) => (t.overdue && t.status !== "blocked" ? "overdue" : t.status);

export async function ProjectWeekGoal({ goal, locale }: { readonly goal: WeeklyGoal; readonly locale: string }) {
  if (goal.kind === "none") return null;
  const t = await getTranslations("projectWeekGoal");
  if (goal.kind === "unknown") {
    return (
      <section aria-label={t("titleProject")} data-testid="project-week-goal" data-state="unknown" className="rounded-card border border-ink-600/70 bg-ink-800/50 p-4 sm:p-5">
        <p role="status" className="text-support text-text-secondary">
          {t("unknown")}
        </p>
      </section>
    );
  }
  const day = (iso: string) => formatUtcDate(iso, locale, { weekday: "short", day: "numeric" }) ?? iso;
  const title = goal.scope === "project" ? t("titleProject") : t("titleMine");
  const word = (task: WeeklyGoalTask) => (task.overdue && task.status !== "blocked" ? t("status.overdue") : t(`status.${task.status}`));

  return (
    <section aria-label={title} data-testid="project-week-goal" data-state="known" data-scope={goal.scope} className="flex flex-col gap-3 rounded-card border border-ink-600/70 bg-ink-800/50 p-4 sm:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-body font-semibold tracking-tightest text-text-primary sm:text-title">{title}</h2>
        <p className="font-mono text-meta tabular-nums text-text-secondary" data-testid="project-week-goal-count">
          {t("count", { done: goal.done, total: goal.total })}
        </p>
      </header>

      <div role="img" aria-label={t("count", { done: goal.done, total: goal.total })} className="flex gap-1" data-testid="project-week-goal-splits">
        {goal.tasks.map((task) => (
          <span key={task.id} className={cn("h-2.5 flex-1 rounded-full border-2", SPLIT[splitKey(task)])} />
        ))}
      </div>

      <ul className="flex flex-col divide-y divide-ink-600/60">
        {goal.tasks.map((task) => (
          <li key={task.id} className="flex items-baseline justify-between gap-3 py-2" data-status={splitKey(task)}>
            <span className={cn("min-w-0 text-support", task.status === "cancelled" ? "text-text-muted line-through" : "text-text-primary")}>
              {task.title}
            </span>
            <span className="shrink-0 text-meta text-text-muted">
              {word(task)} · <span className="tabular-nums">{day(task.dueDay)}</span>
            </span>
          </li>
        ))}
      </ul>
      {goal.scope === "mine" ? <p className="text-meta text-text-muted">{t("mineNote")}</p> : null}
    </section>
  );
}
