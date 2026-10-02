"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/lib/i18n/navigation";
import type {
  ActivityTimeline,
  TimelineResponsible,
  TimelineRow,
} from "@/lib/projects/stage-gantt";

/**
 * Project activity timeline (Wagon 6 — Gantt, now a real VIEW) — a projection
 * over project_stages + this project's work_tasks. Columns: activity | status |
 * responsible | time bar. Every row opens its real context (stage panel, task
 * row, person). Stages without dates are listed ("no dates"), never dropped.
 * Tasks are drawn at their real due date only; tasks have no stage link yet so
 * they sit in an explicit "not assigned to a stage" group. No fabricated
 * progress. Mobile: the same facts as a stacked list (no horizontal scroll,
 * 44px touch targets).
 */

const TONE: Record<string, string> = {
  planned: "bg-ink-500",
  todo: "bg-ink-500",
  in_progress: "bg-brand-blue",
  blocked: "bg-state-warning",
  done: "bg-state-success",
  cancelled: "bg-ink-600",
};

const LINK_CLASS =
  "inline-flex min-h-11 min-w-0 items-center text-left text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";

function useStatusLabel() {
  const tStages = useTranslations("projectStages");
  const tTasks = useTranslations("tasks");
  return (row: TimelineRow): string =>
    row.kind === "stage"
      ? tStages(`statuses.${row.status}` as "statuses.planned")
      : tTasks(`status.${row.status}` as "status.todo");
}

function Responsible({ r }: { r: TimelineResponsible | null }) {
  const tTasks = useTranslations("tasks");
  if (r === null) return <span className="text-text-muted">—</span>;
  if (r.kind === "none") {
    return <span className="text-text-muted">{tTasks("assignee.unassigned")}</span>;
  }
  if (r.kind === "you") return <span>{tTasks("assignee.you")}</span>;
  if (r.kind === "member") return <span>{tTasks("assignee.member")}</span>;
  if (r.href) {
    return (
      <Link
        href={r.href as "/dashboard"}
        className={LINK_CLASS}
        data-testid="project-gantt-person-link"
      >
        <span className="truncate">{r.name}</span>
      </Link>
    );
  }
  return <span className="truncate">{r.name}</span>;
}

function TimeText({ row }: { row: TimelineRow }) {
  const t = useTranslations("projectStages");
  if (!row.hasDates) {
    return <span className="text-text-muted">{t("ganttNoDates")}</span>;
  }
  if (row.kind === "task") {
    return (
      <span>
        {t("ganttDue")}: {row.end}
      </span>
    );
  }
  return (
    <span>
      {row.start} → {row.end}
    </span>
  );
}

function Flags({ row }: { row: TimelineRow }) {
  const t = useTranslations("projectStages");
  const tTasks = useTranslations("tasks");
  return (
    <>
      {row.overdue && (
        <span className="font-mono text-meta uppercase tracking-label text-state-danger">
          {t("ganttOverdue")}
        </span>
      )}
      {row.waitingOn > 0 && (
        <span
          className="font-mono text-meta uppercase tracking-label text-state-warning"
          data-testid="project-gantt-waiting"
        >
          {tTasks("dependencies.waitingOn", { n: row.waitingOn })}
        </span>
      )}
    </>
  );
}

function DesktopRow({
  row,
  todayPct,
  indent,
}: {
  row: TimelineRow;
  todayPct: number | null;
  indent: boolean;
}) {
  const t = useTranslations("projectStages");
  const statusLabel = useStatusLabel();
  const isTask = row.kind === "task";
  return (
    <div
      role="row"
      className="grid grid-cols-[minmax(0,1.6fr)_7rem_minmax(0,1fr)_minmax(0,2fr)] items-center gap-3 border-t border-ink-700 py-0.5"
      data-testid={isTask ? "project-gantt-row-task" : "project-gantt-row-stage"}
    >
      <div role="cell" className={`min-w-0 ${indent ? "pl-4" : ""}`}>
        <Link
          href={row.href as "/dashboard"}
          className={`${LINK_CLASS} w-full text-sm`}
          data-testid="project-gantt-link"
          title={row.name}
        >
          <span className="truncate">{row.name}</span>
        </Link>
      </div>
      <div
        role="cell"
        className="font-mono text-meta uppercase tracking-label text-text-secondary"
        data-testid="project-gantt-status"
      >
        {statusLabel(row)}
      </div>
      <div role="cell" className="min-w-0 truncate text-xs text-text-secondary">
        <Responsible r={row.responsible} />
      </div>
      <div role="cell" className="flex min-w-0 flex-col gap-0.5">
        <Link
          href={row.href as "/dashboard"}
          className="relative block h-5 rounded bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          aria-label={`${row.name}: ${row.hasDates ? `${row.start} → ${row.end}` : t("ganttNoDates")}`}
        >
          {todayPct !== null && (
            <span
              className="pointer-events-none absolute inset-y-0 w-px bg-brand-blue/50"
              style={{ left: `${todayPct}%` }}
              aria-hidden
            />
          )}
          {row.hasDates && (
            <span
              className={`absolute inset-y-0 ${isTask ? "rounded-full" : "rounded"} ${TONE[row.status] ?? "bg-ink-500"} ${row.overdue ? "ring-1 ring-state-danger" : ""}`}
              style={{ left: `${row.offsetPct}%`, width: `${row.widthPct}%` }}
              data-testid={isTask ? "project-gantt-marker" : "project-gantt-bar"}
              title={`${row.start} → ${row.end}`}
            />
          )}
        </Link>
        <span className="flex flex-wrap items-center gap-2 text-meta text-text-muted">
          <TimeText row={row} />
          <Flags row={row} />
        </span>
      </div>
    </div>
  );
}

function MobileRow({ row }: { row: TimelineRow }) {
  const statusLabel = useStatusLabel();
  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-ink-600 px-2"
      data-testid={row.kind === "task" ? "project-gantt-mobile-task" : "project-gantt-mobile-stage"}
    >
      <div className="flex items-center justify-between gap-2">
        <Link
          href={row.href as "/dashboard"}
          className={`${LINK_CLASS} text-sm`}
          data-testid="project-gantt-link"
        >
          <span className="break-words">{row.name}</span>
        </Link>
        <span className="shrink-0 font-mono text-meta uppercase tracking-label text-text-muted">
          {statusLabel(row)}
        </span>
      </div>
      {row.responsible !== null && (
        <div className="min-w-0 text-xs text-text-secondary">
          <Responsible r={row.responsible} />
        </div>
      )}
      <span className="flex flex-wrap items-center gap-2 pb-2 font-mono text-meta text-text-muted">
        <TimeText row={row} />
        <Flags row={row} />
      </span>
    </li>
  );
}

export function ProjectStageGantt({ timeline }: { timeline: ActivityTimeline }) {
  const t = useTranslations("projectStages");
  const empty = timeline.stages.length === 0 && timeline.unstagedTasks.length === 0;

  if (empty) {
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

  const todayPct = timeline.window?.todayPct ?? null;

  return (
    <section className="card-border flex flex-col gap-4 p-5" data-testid="project-gantt">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("ganttTitle")}
        </h2>
        {timeline.window ? (
          <span className="font-mono text-meta uppercase tracking-label text-text-muted">
            {timeline.window.start} → {timeline.window.end}
            {todayPct !== null ? ` · ${t("ganttToday")}` : ""}
          </span>
        ) : (
          <span className="text-meta text-text-muted" data-testid="project-gantt-nodates">
            {t("ganttNoWindow")}
          </span>
        )}
      </header>

      {/* Desktop: activity | status | responsible | time bar. */}
      <div
        role="table"
        aria-label={t("ganttTitle")}
        className="hidden flex-col sm:flex"
        data-testid="project-gantt-timeline"
      >
        <div
          role="row"
          className="grid grid-cols-[minmax(0,1.6fr)_7rem_minmax(0,1fr)_minmax(0,2fr)] gap-3 pb-1 font-mono text-meta uppercase tracking-label text-text-muted"
        >
          <span role="columnheader">{t("ganttColActivity")}</span>
          <span role="columnheader">{t("ganttColStatus")}</span>
          <span role="columnheader">{t("ganttColResponsible")}</span>
          <span role="columnheader">{t("ganttColTime")}</span>
        </div>
        {timeline.stages.map((s) => (
          <div key={s.id} role="rowgroup">
            <DesktopRow row={s} todayPct={todayPct} indent={false} />
            {s.tasks.map((task) => (
              <DesktopRow key={task.id} row={task} todayPct={todayPct} indent />
            ))}
          </div>
        ))}
        {timeline.unstagedTasks.length > 0 && (
          <div role="rowgroup" data-testid="project-gantt-unstaged">
            <p className="border-t border-ink-700 pb-1 pt-3 font-mono text-meta uppercase tracking-label text-text-secondary">
              {t("ganttNoStageGroup")}
            </p>
            {timeline.unstagedTasks.map((task) => (
              <DesktopRow key={task.id} row={task} todayPct={todayPct} indent={false} />
            ))}
          </div>
        )}
      </div>

      {/* Mobile: the same real facts as a stacked list. */}
      <div className="flex min-w-0 flex-col gap-3 sm:hidden" data-testid="project-gantt-mobile">
        <ul className="flex flex-col gap-2">
          {timeline.stages.map((s) => (
            <Fragment key={s.id}>
              <MobileRow row={s} />
              {s.tasks.map((task) => (
                <MobileRow key={task.id} row={task} />
              ))}
            </Fragment>
          ))}
        </ul>
        {timeline.unstagedTasks.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="font-mono text-meta uppercase tracking-label text-text-secondary">
              {t("ganttNoStageGroup")}
            </p>
            <ul className="flex flex-col gap-2">
              {timeline.unstagedTasks.map((task) => (
                <MobileRow key={task.id} row={task} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
