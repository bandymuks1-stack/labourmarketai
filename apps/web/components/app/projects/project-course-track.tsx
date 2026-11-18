import { getTranslations } from "next-intl/server";

import type { CourseStep, ProjectCourse } from "@/lib/projects/project-course";
import { formatUtcDate } from "@/lib/time/display";
import { cn } from "@/lib/utils";

/**
 * THE PROJECT COURSE — the team's shared route (Future Experience C). One
 * track of the project's real stages with "we are here", for the assigned
 * worker AND the manager (stage RLS admits both), so a brigade sees the same
 * goal and the same next step.
 *
 * State is a word in a shape, never colour alone:
 *   done      solid segment + check
 *   now       solid brand outline + "we are here" marker
 *   risk      amber outline + "behind its planned end" (dates only)
 *   blocked   warning diamond + the manager's own reason
 *   planned   hollow segment
 *   cancelled struck-through, not counted
 * Green is NOT used: a stage status is set by the project's manager, and
 * green means a second party confirmed someone's work.
 *
 * Sport principle, team-only: the course measures the PROJECT, never a
 * person — no names, no per-person figures, no ranking.
 */
export async function ProjectCourseTrack({
  course,
  locale,
}: {
  readonly course: ProjectCourse;
  readonly locale: string;
}) {
  if (course.kind === "none") return null;
  const t = await getTranslations("projectCourse");

  if (course.kind === "unknown") {
    return (
      <section aria-label={t("title")} data-testid="project-course" data-state="unknown" className="rounded-card border border-ink-600/70 bg-ink-800/50 p-4 sm:p-5">
        <p role="status" className="text-support text-text-secondary">
          {t("unknown")}
        </p>
      </section>
    );
  }

  const when = (iso: string | null) => (iso ? (formatUtcDate(iso, locale, { month: "short", day: "numeric" }) ?? null) : null);
  const stateWord = (s: CourseStep) =>
    s.edge === "done"
      ? t("state.done")
      : s.edge === "blocked"
        ? t("state.blocked")
        : s.edge === "risk"
          ? t("state.risk")
          : s.edge === "now"
            ? t("state.now")
            : s.edge === "cancelled"
              ? t("state.cancelled")
              : t("state.planned");

  const SEGMENT: Record<CourseStep["edge"], string> = {
    done: "bg-text-secondary border-text-secondary",
    now: "bg-ink-700 border-brand-blue",
    risk: "bg-ink-700 border-state-amber",
    blocked: "bg-ink-700 border-state-warning border-dashed",
    planned: "bg-transparent border-ink-500",
    cancelled: "bg-transparent border-ink-600 border-dotted",
  };

  return (
    <section aria-label={t("title")} data-testid="project-course" data-state="known" className="flex flex-col gap-4 rounded-card border border-ink-600/70 bg-ink-800/50 p-4 sm:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-body font-semibold tracking-tightest text-text-primary sm:text-title">{t("title")}</h2>
        <p className="font-mono text-meta tabular-nums text-text-secondary" data-testid="project-course-count">
          {t("count", { done: course.done, total: course.total })}
        </p>
      </header>

      {/* DESKTOP / TABLET — one track; the marker floats over "here". */}
      <ol className="hidden gap-1.5 sm:flex" data-testid="project-course-track">
        {course.steps.map((s, i) => (
          <li key={s.id} className="flex min-w-0 flex-1 flex-col gap-2" data-edge={s.edge}>
            <span className="h-5 text-meta font-semibold text-brand-blue">
              {course.here === i ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue px-2 py-0.5 text-text-on-brand" data-testid="project-course-here">
                  {t("here")}
                </span>
              ) : null}
            </span>
            <span aria-hidden className={cn("h-2.5 rounded-full border-2", SEGMENT[s.edge])} />
            <span className={cn("truncate text-support font-medium", s.edge === "cancelled" ? "text-text-muted line-through" : "text-text-primary")}>
              {s.name}
            </span>
            <span className="flex items-center gap-1.5 text-meta text-text-muted">
              <StepMark edge={s.edge} />
              {stateWord(s)}
              {s.plannedEnd && s.edge !== "done" ? <span className="tabular-nums">· {when(s.plannedEnd)}</span> : null}
            </span>
          </li>
        ))}
      </ol>

      {/* PHONE — the same steps as a rail, "here" said in words. */}
      <ol className="relative flex flex-col gap-3 pl-6 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-ink-600 sm:hidden" data-testid="project-course-rail">
        {course.steps.map((s, i) => (
          <li key={s.id} className="relative flex flex-col" data-edge={s.edge}>
            <span aria-hidden className={cn("absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2", SEGMENT[s.edge])} />
            <span className={cn("text-body font-medium", s.edge === "cancelled" ? "text-text-muted line-through" : "text-text-primary")}>
              {s.name}
              {course.here === i ? (
                <span className="ml-2 rounded-full bg-brand-blue px-2 py-0.5 text-meta font-semibold text-text-on-brand">{t("here")}</span>
              ) : null}
            </span>
            <span className="flex items-center gap-1.5 text-meta text-text-muted">
              <StepMark edge={s.edge} />
              {stateWord(s)}
              {s.plannedEnd && s.edge !== "done" ? <span className="tabular-nums">· {when(s.plannedEnd)}</span> : null}
            </span>
          </li>
        ))}
      </ol>

      {/* WHERE HELP IS NEEDED — the manager's own blocked reasons, verbatim. */}
      {course.steps.some((s) => s.blockedReason) ? (
        <ul className="flex flex-col gap-1.5 border-t border-ink-600/60 pt-3" data-testid="project-course-help">
          {course.steps
            .filter((s) => s.blockedReason)
            .map((s) => (
              <li key={s.id} className="flex gap-2 text-support text-text-primary">
                <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rotate-45 bg-state-warning" />
                <span className="min-w-0">
                  <span className="font-medium">{t("helpNeeded", { stage: s.name })}</span> {s.blockedReason}
                </span>
              </li>
            ))}
        </ul>
      ) : null}
    </section>
  );
}

function StepMark({ edge }: { readonly edge: CourseStep["edge"] }) {
  if (edge === "done") {
    return (
      <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-text-secondary">
        <path d="M2.5 6.5l2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (edge === "blocked") return <span aria-hidden className="h-2 w-2 shrink-0 rotate-45 bg-state-warning" />;
  if (edge === "risk") return <span aria-hidden className="h-2 w-2 shrink-0 rounded-full border-2 border-state-amber" />;
  if (edge === "now") return <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-brand-blue" />;
  return <span aria-hidden className="h-2 w-2 shrink-0 rounded-full border-2 border-ink-500" />;
}
