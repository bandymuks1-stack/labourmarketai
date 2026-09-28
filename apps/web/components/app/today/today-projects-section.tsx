import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { listWorkerProjects } from "@/lib/projects/worker-project-access";

/** At most this many projects are named on the home; the rest are one link away. */
export const TODAY_PROJECTS_SHOWN = 3;

/**
 * WHERE I WORK — the projects the person is assigned to right now, one tap
 * each to the SAME project page the list at /dashboard/projects opens
 * (production walk 2026-09-28: a worker assigned to a project had no path to
 * it from their home or navigation). The read is the worker project page's
 * own (`listWorkerProjects`, RLS-scoped to the caller's own assignments); no
 * second project surface. Absent when there is no active assignment
 * ("Tuščia = tvarkinga").
 */
export async function TodayProjectsSection() {
  const [t, rows] = await Promise.all([
    getTranslations("todayScreen.home.projects"),
    listWorkerProjects().catch(() => []),
  ]);
  const active = rows.filter((r) => r.assignmentStatus === "active");
  if (active.length === 0) return null;
  const shown = active.slice(0, TODAY_PROJECTS_SHOWN);

  return (
    <section
      aria-labelledby="today-projects-title"
      data-testid="today-projects"
      className="flex flex-col gap-2"
    >
      <h2
        id="today-projects-title"
        className="font-mono text-meta uppercase tracking-label text-text-muted"
      >
        {t("title")}
      </h2>
      <ul className="flex flex-col">
        {shown.map((p) => (
          <li key={p.projectId}>
            <Link
              href={`/dashboard/projects/${p.projectId}` as "/dashboard"}
              data-testid={`today-project-${p.projectId}`}
              className="inline-flex min-h-11 items-center gap-2 text-body text-text-primary underline-offset-4 hover:text-brand-blue hover:underline"
            >
              {p.title?.trim() || t("untitled")}
              {p.city ? (
                <span className="text-support text-text-secondary">
                  · {p.city}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      {active.length > shown.length ? (
        <Link
          href="/dashboard/projects"
          data-testid="today-projects-all"
          className="inline-flex min-h-11 items-center text-support text-text-secondary underline-offset-4 hover:text-brand-blue hover:underline"
        >
          {t("all", { count: active.length })}
        </Link>
      ) : null}
    </section>
  );
}
