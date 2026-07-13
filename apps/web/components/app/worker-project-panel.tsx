import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  CalendarDays,
  Images,
  MapPin,
  MessageSquare,
  NotebookPen,
} from "lucide-react";

import type { WorkerProjectView } from "@/lib/projects/worker-project-access";
import {
  deriveProjectLocation,
  formatProjectPlace,
} from "@/lib/projects/location";
import { ProjectWorkGallery } from "@/components/app/project-work-gallery";

/**
 * Worker/member project view (F11 / RC2). Shown when the visitor is a real
 * assigned worker on the project — only facts their session may read:
 * project card (live projects are RLS-readable), their OWN assignment, a
 * journal entry point and their own photo evidence on this project.
 *
 * Deliberately NO team list: pwa_select RLS gives a worker only their own
 * assignment row, and we never fake what we cannot read.
 */
export async function WorkerProjectPanel({
  locale,
  projectId,
  view,
}: {
  locale: string;
  projectId: string;
  view: WorkerProjectView;
}) {
  const t = await getTranslations("projectOps.workerView");

  const project = view.project;
  const location = deriveProjectLocation({
    city: project?.city ?? null,
    country: project?.country ?? null,
  });
  const place = formatProjectPlace(location);
  const active = view.assignment.status === "active";

  return (
    <div
      className="flex max-w-3xl flex-col gap-6"
      data-testid="worker-project-view"
    >
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-label text-brand-cyan">
          {t("eyebrow")}
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {project?.title ?? t("untitled")}
        </h1>
        <div className="flex flex-wrap gap-2">
          <span
            className={
              active
                ? "inline-flex items-center gap-1.5 rounded-full border border-state-success/40 bg-state-success/10 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-state-success"
                : "inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-text-secondary"
            }
            data-testid="worker-project-assignment-status"
          >
            {active ? t("assignmentActive") : t("assignmentEnded")}
          </span>
          {place ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-text-secondary">
              <MapPin className="h-3 w-3" aria-hidden />
              {place}
            </span>
          ) : null}
          {project?.startDate ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-text-secondary">
              <CalendarDays className="h-3 w-3" aria-hidden />
              {project.startDate}
              {project.endDate ? ` – ${project.endDate}` : ""}
            </span>
          ) : null}
        </div>
        {!project && (
          <p
            className="card-border p-4 text-sm text-text-secondary"
            data-testid="worker-project-restricted"
          >
            {t("projectRestricted")}
          </p>
        )}
      </header>

      {/* Direct actions — journal first: the worker's real lever on a project. */}
      <section className="flex flex-wrap gap-3">
        <Link
          href={`/${locale}/dashboard/journal`}
          data-testid="worker-project-journal-cta"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-5 py-3 text-sm font-semibold text-ink-900 transition-transform duration-fast ease-out hover:-translate-y-0.5"
        >
          <NotebookPen className="h-4 w-4" aria-hidden />
          {t("journalCta")}
        </Link>
        <Link
          href={`/${locale}/dashboard/communication`}
          data-testid="worker-project-chat-cta"
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-brand-blue/40 px-4 py-2.5 text-sm font-medium text-brand-blue transition-colors duration-fast hover:bg-brand-blue/10"
        >
          <MessageSquare className="h-4 w-4" aria-hidden />
          {t("chatCta")}
        </Link>
      </section>

      {/* Own photo evidence on this project — session RLS shows exactly the
          photos this worker attached to their own journal entries. */}
      <section className="flex flex-col gap-2" id="project-gallery">
        <h2 className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-text-muted">
          <Images className="h-3.5 w-3.5" aria-hidden />
          {t("galleryTitle")}
        </h2>
        <ProjectWorkGallery projectId={projectId} workerNames={new Map()} />
      </section>
    </div>
  );
}
