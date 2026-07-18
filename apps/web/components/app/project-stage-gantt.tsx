"use client";

import { useTranslations } from "next-intl";

import type { StageGantt } from "@/lib/projects/stage-gantt";
import type { StageStatus } from "@/lib/projects/stages-model";

/**
 * Project stage Gantt (Wagon 6 slice) — a projection over project_stages.
 * Desktop: stage bars on one timeline with a today marker + overdue highlight.
 * Mobile: a structured list fallback (same real facts). No fabricated progress.
 */

const BAR_TONE: Record<StageStatus, string> = {
  planned: "bg-ink-500",
  in_progress: "bg-brand-blue",
  blocked: "bg-state-warning",
  done: "bg-state-success",
  cancelled: "bg-ink-600",
};

export function ProjectStageGantt({ gantt }: { gantt: StageGantt }) {
  const t = useTranslations("projectStages");

  if (!gantt.hasTimeline) {
    return (
      <section className="card-border flex flex-col gap-2 p-5" data-testid="project-gantt">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("ganttTitle")}
        </h2>
        <p className="text-sm text-text-muted" data-testid="project-gantt-empty">
          {t("ganttEmpty")}
        </p>
      </section>
    );
  }

  return (
    <section className="card-border flex flex-col gap-4 p-5" data-testid="project-gantt">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("ganttTitle")}
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {gantt.windowStart} → {gantt.windowEnd}
        </span>
      </header>

      {/* Desktop timeline (bars over the project window). */}
      <div className="relative hidden sm:block" data-testid="project-gantt-timeline">
        <div className="relative flex flex-col gap-2">
          {gantt.todayPct !== null && (
            <div
              className="pointer-events-none absolute inset-y-0 z-10 w-px bg-brand-blue/70"
              style={{ left: `${gantt.todayPct}%` }}
              aria-hidden
              data-testid="project-gantt-today"
            >
              <span className="absolute -top-4 -translate-x-1/2 font-mono text-[9px] uppercase tracking-label text-brand-blue">
                {t("ganttToday")}
              </span>
            </div>
          )}
          {gantt.bars.map((b) => (
            <div key={b.id} className="flex items-center gap-2">
              <span className="w-32 shrink-0 truncate text-xs text-text-secondary" title={b.name}>
                {b.name}
              </span>
              <div className="relative h-5 flex-1 rounded bg-ink-800">
                <div
                  className={`absolute inset-y-0 rounded ${BAR_TONE[b.status]} ${b.overdue ? "ring-1 ring-state-danger" : ""}`}
                  style={{ left: `${b.offsetPct}%`, width: `${b.widthPct}%` }}
                  data-testid="project-gantt-bar"
                  title={`${b.start} → ${b.end}`}
                />
              </div>
              {b.overdue && (
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-label text-state-danger">
                  {t("ganttOverdue")}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile structured list fallback. */}
      <ul className="flex flex-col gap-2 sm:hidden" data-testid="project-gantt-mobile">
        {gantt.bars.map((b) => (
          <li key={b.id} className="flex flex-col gap-1 rounded-md border border-ink-600 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm text-text-primary">{b.name}</span>
              <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {t(`statuses.${b.status}`)}
              </span>
            </div>
            <span className="font-mono text-[10px] text-text-muted">
              {b.start} → {b.end}
              {b.overdue ? ` · ${t("ganttOverdue")}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
