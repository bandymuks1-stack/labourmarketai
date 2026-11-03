import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";

/**
 * THE PROJECT'S FIRST STEP — what a manager sees where the course (F4) or
 * this week's goal (F6) has nothing to draw yet. Not a decorative empty
 * screen: one sentence saying what is missing and the REAL door that adds it
 * — the existing stages panel on the operations page, the existing task form
 * pre-filled with this project. No new write path, no invented goal.
 */
export async function ProjectFirstStep({
  projectId,
  stagesMissing,
  tasksMissing,
}: {
  readonly projectId: string;
  readonly stagesMissing: boolean;
  readonly tasksMissing: boolean;
}) {
  if (!stagesMissing && !tasksMissing) return null;
  const t = await getTranslations("projectFirstStep");
  const stagesHref = `/dashboard/projects/${projectId}/operations#project-stages`;
  const tasksHref = `/dashboard/tasks?project=${projectId}&create=1#tasks-create`;
  const body = stagesMissing && tasksMissing ? t("both") : stagesMissing ? t("stages") : t("tasks");

  return (
    <section
      aria-label={t("title")}
      data-testid="project-first-step"
      data-missing={stagesMissing && tasksMissing ? "both" : stagesMissing ? "stages" : "tasks"}
      className="flex flex-col gap-3 rounded-card border border-dashed border-ink-500 bg-ink-800/40 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="font-display text-body font-semibold tracking-tightest text-text-primary">{t("title")}</h2>
        <p className="text-support text-text-secondary">{body}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {stagesMissing ? (
          <Link
            href={stagesHref as "/dashboard"}
            data-testid="project-first-step-stages"
            className="inline-flex min-h-11 items-center rounded-md bg-gradient-cta px-4 py-2.5 text-sm font-semibold text-text-on-brand"
          >
            {t("addStages")}
          </Link>
        ) : null}
        {tasksMissing ? (
          <Link
            href={tasksHref as "/dashboard"}
            data-testid="project-first-step-task"
            className={
              stagesMissing
                ? "inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 py-2.5 text-sm font-medium text-text-primary hover:border-brand-blue"
                : "inline-flex min-h-11 items-center rounded-md bg-gradient-cta px-4 py-2.5 text-sm font-semibold text-text-on-brand"
            }
          >
            {t("addTask")}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
