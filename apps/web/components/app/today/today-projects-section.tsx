import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { getProjectGallery } from "@/lib/journal/project-gallery";
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
 *
 * DEPTH. The person's own work is the context behind the first project: when
 * THEIR OWN journal photo is linked to it (`getProjectGallery`, RLS-scoped to
 * entries they may read), it sits as a quiet, dimmed backdrop — present, never
 * competing with the names. No photo → a plain tonal surface; nothing is
 * stood in (marketing or sample photography is never used in the product).
 */
export async function TodayProjectsSection() {
  const [t, rows] = await Promise.all([
    getTranslations("todayScreen.home.projects"),
    listWorkerProjects().catch(() => []),
  ]);
  const active = rows.filter((r) => r.assignmentStatus === "active");
  if (active.length === 0) return null;
  const shown = active.slice(0, TODAY_PROJECTS_SHOWN);
  const gallery = await getProjectGallery(shown[0].projectId).catch(() => null);
  const backdrop = gallery?.photos.find((p) => p.signedUrl)?.signedUrl ?? null;

  return (
    <section
      aria-labelledby="today-projects-title"
      data-testid="today-projects"
      data-backdrop={backdrop ? "own-record-photo" : undefined}
      className="relative isolate flex flex-col gap-2 overflow-hidden rounded-3xl border border-ink-600/60 bg-ink-800/70 p-5 sm:p-6"
    >
      {backdrop ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={backdrop}
            alt=""
            aria-hidden
            loading="lazy"
            className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover opacity-30"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-ink-900 via-ink-900/80 to-ink-900/30"
          />
        </>
      ) : null}
      <h2 id="today-projects-title" className="text-support font-medium text-text-secondary">
        {t("title")}
      </h2>
      <ul className="flex flex-col">
        {shown.map((p) => (
          <li key={p.projectId}>
            <Link
              href={`/dashboard/projects/${p.projectId}` as "/dashboard"}
              data-testid={`today-project-${p.projectId}`}
              className="inline-flex min-h-11 items-center gap-2 font-display text-lg font-semibold tracking-tightest text-text-primary underline-offset-4 hover:text-brand-blue hover:underline"
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
