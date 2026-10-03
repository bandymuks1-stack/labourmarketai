/**
 * Project stage Gantt — a PURE PROJECTION over the canonical project_stages
 * (Wagon 6 slice: Gantt). No new data, no stored Gantt events: bar positions
 * are computed from the real planned/actual dates on each stage. Deterministic
 * (today is passed in), so it is fully unit-tested. No fabricated completion
 * percentage — a bar reflects only real dates + real status.
 */

import type { ProjectStage, StageStatus } from "@/lib/projects/stages-model";

export interface GanttBar {
  readonly id: string;
  readonly name: string;
  readonly status: StageStatus;
  /** left edge, 0–100 (% of the project window) */
  readonly offsetPct: number;
  /** width, >0–100 */
  readonly widthPct: number;
  readonly start: string;
  readonly end: string;
  readonly overdue: boolean;
}

export type StageGantt =
  | { hasTimeline: false }
  | {
      hasTimeline: true;
      windowStart: string;
      windowEnd: string;
      /** today marker 0–100, or null when today is outside the window */
      todayPct: number | null;
      bars: GanttBar[];
    };

const DONE_STATES: ReadonlySet<StageStatus> = new Set(["done", "cancelled"]);

function toDay(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso.length > 10 ? iso.slice(0, 10) : iso);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86_400_000);
}

/** Effective [start, end] day pair for a stage — actual overrides planned; a
 *  stage with only a start renders as a minimal 1-day marker. Returns null when
 *  the stage has no usable date. */
function stageSpan(s: ProjectStage): { start: number; end: number } | null {
  const start = toDay(s.actualStart) ?? toDay(s.plannedStart);
  if (start === null) return null;
  const end =
    toDay(s.actualEnd) ?? toDay(s.plannedEnd) ?? start;
  return { start, end: Math.max(end, start) };
}

export function buildStageGantt(
  stages: readonly ProjectStage[],
  todayIso: string,
): StageGantt {
  const spans = stages
    .map((s) => ({ s, span: stageSpan(s) }))
    .filter((x): x is { s: ProjectStage; span: { start: number; end: number } } => x.span !== null);

  if (spans.length === 0) return { hasTimeline: false };

  const windowStart = Math.min(...spans.map((x) => x.span.start));
  const windowEndRaw = Math.max(...spans.map((x) => x.span.end));
  // Guarantee a non-zero span so a single-day project still renders.
  const windowEnd = Math.max(windowEndRaw, windowStart + 1);
  const total = windowEnd - windowStart;
  const today = toDay(todayIso);

  const bars: GanttBar[] = spans.map(({ s, span }) => {
    const offsetPct = ((span.start - windowStart) / total) * 100;
    const widthPct = Math.max(((span.end - span.start) / total) * 100, 1.5);
    const overdue =
      today !== null && span.end < today && !DONE_STATES.has(s.status);
    return {
      id: s.id,
      name: s.name,
      status: s.status,
      offsetPct: Math.min(Math.max(offsetPct, 0), 100),
      widthPct: Math.min(widthPct, 100 - Math.min(Math.max(offsetPct, 0), 100)) || widthPct,
      start: s.actualStart ?? s.plannedStart ?? "",
      end: s.actualEnd ?? s.plannedEnd ?? s.actualStart ?? s.plannedStart ?? "",
      overdue,
    };
  });

  const dayToIso = (day: number): string =>
    new Date(day * 86_400_000).toISOString().slice(0, 10);

  const todayPct =
    today !== null && today >= windowStart && today <= windowEnd
      ? ((today - windowStart) / total) * 100
      : null;

  return {
    hasTimeline: true,
    windowStart: dayToIso(windowStart),
    windowEnd: dayToIso(windowEnd),
    todayPct,
    bars,
  };
}

/* ------------------------------------------------------------------ */
/* Activity timeline — stages + tasks as one real, clickable view      */
/* ------------------------------------------------------------------ */
/*
 * Still a PURE PROJECTION: no stored progress, no new engine. Rows are the real
 * project_stages and the real work_tasks of this project. A stage with no usable
 * date is NOT dropped — it is listed with `hasDates: false` so the view says
 * "no dates" instead of silently losing it. A task is placed at its real
 * `due_at` (a marker, never an invented start). work_tasks has no stage_id yet,
 * so tasks sit in the explicit "not assigned to a stage" group; a task that does
 * carry a `stageId` (forward-compatible) nests under that stage.
 */

export type TimelineTaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "done"
  | "cancelled";

export interface TimelineTaskInput {
  readonly id: string;
  readonly title: string;
  readonly status: TimelineTaskStatus;
  readonly dueAt: string | null;
  readonly assigneeProfileId: string | null;
  /** Not on work_tasks yet — honoured when present, never fabricated. */
  readonly stageId?: string | null;
}

/** A person who may be opened (a worker on this project). */
export interface TimelinePerson {
  readonly profileId: string;
  readonly name: string;
  /** workers.id — the person route key; null → plain text, never a link. */
  readonly workerId: string | null;
}

export type TimelineResponsible =
  | { readonly kind: "none" }
  | { readonly kind: "you" }
  | { readonly kind: "named"; readonly name: string; readonly href: string | null }
  | { readonly kind: "member" };

export interface TimelineRow {
  readonly kind: "stage" | "task";
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly hasDates: boolean;
  readonly offsetPct: number;
  readonly widthPct: number;
  readonly start: string;
  readonly end: string;
  readonly overdue: boolean;
  /** open blocker count ("waiting on N"); 0 for stages */
  readonly waitingOn: number;
  /** Tasks: the assignee. Stages: the responsible engagement's readable name
   *  (null = nobody named, or not readable → the dash). */
  readonly responsible: TimelineResponsible | null;
  readonly href: string;
  readonly anchorId: string;
}

export interface TimelineStageRow extends TimelineRow {
  readonly kind: "stage";
  readonly tasks: readonly TimelineRow[];
}

export interface ActivityTimeline {
  readonly window: {
    readonly start: string;
    readonly end: string;
    readonly todayPct: number | null;
  } | null;
  readonly stages: readonly TimelineStageRow[];
  /** Tasks with no stage — the explicit "Not assigned to a stage" group. */
  readonly unstagedTasks: readonly TimelineRow[];
}

export const stageAnchorId = (stageId: string): string => `stage-${stageId}`;
export const taskAnchorId = (taskId: string): string => `task-${taskId}`;

/** Stage → its panel on the operations page. */
export function stageTimelineHref(projectId: string, stageId: string): string {
  return `/dashboard/projects/${projectId}/operations#${stageAnchorId(stageId)}`;
}

/** Task → the tasks page, scoped to the project, scrolled to the task row. */
export function taskTimelineHref(projectId: string, taskId: string): string {
  return `/dashboard/tasks?project=${projectId}&task=${taskId}#${taskAnchorId(taskId)}`;
}

/** Person → their existing route; only for a worker on this project. */
export function personTimelineHref(workerId: string | null): string | null {
  return workerId ? `/dashboard/people/${workerId}` : null;
}

const TASK_CLOSED: ReadonlySet<TimelineTaskStatus> = new Set(["done", "cancelled"]);

function resolveResponsible(
  assigneeProfileId: string | null,
  meProfileId: string | null,
  people: readonly TimelinePerson[],
  memberNameByProfileId: ReadonlyMap<string, string>,
): TimelineResponsible {
  if (!assigneeProfileId) return { kind: "none" };
  if (assigneeProfileId === meProfileId) return { kind: "you" };
  const person = people.find((p) => p.profileId === assigneeProfileId);
  if (person) {
    return { kind: "named", name: person.name, href: personTimelineHref(person.workerId) };
  }
  const memberName = memberNameByProfileId.get(assigneeProfileId);
  if (memberName) return { kind: "named", name: memberName, href: null };
  return { kind: "member" };
}

function stageResponsible(
  engagementId: string | null | undefined,
  names: ReadonlyMap<string, string> | undefined,
): TimelineResponsible | null {
  if (!engagementId) return null;
  const name = names?.get(engagementId);
  return name ? { kind: "named", name, href: null } : null;
}

export function buildActivityTimeline(input: {
  /** engagement_contexts.id → readable name (see lib/projects/stage-responsible). */
  stageResponsibleNames?: ReadonlyMap<string, string>;
  projectId: string;
  stages: readonly ProjectStage[];
  tasks: readonly TimelineTaskInput[];
  /** open blocker count per task id */
  waitingOnByTask: Readonly<Record<string, number>>;
  meProfileId: string | null;
  people: readonly TimelinePerson[];
  memberNameByProfileId: ReadonlyMap<string, string>;
  todayIso: string;
}): ActivityTimeline {
  const today = toDay(input.todayIso);

  // One shared window over every dated stage and every task due day.
  const days: number[] = [];
  const stageSpans = new Map<string, { start: number; end: number } | null>();
  for (const s of input.stages) {
    const sp = stageSpan(s);
    stageSpans.set(s.id, sp);
    if (sp) days.push(sp.start, sp.end);
  }
  const taskDue = new Map<string, number | null>();
  for (const t of input.tasks) {
    const d = toDay(t.dueAt);
    taskDue.set(t.id, d);
    if (d !== null) days.push(d);
  }

  const hasWindow = days.length > 0;
  const winStart = hasWindow ? Math.min(...days) : 0;
  const winEnd = hasWindow ? Math.max(Math.max(...days), winStart + 1) : 1;
  const total = winEnd - winStart;
  const pct = (day: number): number =>
    Math.min(Math.max(((day - winStart) / total) * 100, 0), 100);
  const dayToIso = (day: number): string =>
    new Date(day * 86_400_000).toISOString().slice(0, 10);

  const taskRow = (t: TimelineTaskInput): TimelineRow => {
    const due = taskDue.get(t.id) ?? null;
    const dated = due !== null && hasWindow;
    return {
      kind: "task",
      id: t.id,
      name: t.title,
      status: t.status,
      hasDates: dated,
      // A due marker: a thin tick ending AT the due day, never a made-up span.
      offsetPct: dated ? Math.min(pct(due as number), 98.5) : 0,
      widthPct: dated ? 1.5 : 0,
      start: dated ? dayToIso(due as number) : "",
      end: dated ? dayToIso(due as number) : "",
      overdue:
        dated && today !== null && (due as number) < today && !TASK_CLOSED.has(t.status),
      waitingOn: input.waitingOnByTask[t.id] ?? 0,
      responsible: resolveResponsible(
        t.assigneeProfileId,
        input.meProfileId,
        input.people,
        input.memberNameByProfileId,
      ),
      href: taskTimelineHref(input.projectId, t.id),
      anchorId: taskAnchorId(t.id),
    };
  };

  const stageIds = new Set(input.stages.map((s) => s.id));
  const tasksByStage = new Map<string, TimelineRow[]>();
  const unstaged: TimelineRow[] = [];
  for (const t of input.tasks) {
    const row = taskRow(t);
    if (t.stageId && stageIds.has(t.stageId)) {
      const list = tasksByStage.get(t.stageId) ?? [];
      list.push(row);
      tasksByStage.set(t.stageId, list);
    } else {
      unstaged.push(row);
    }
  }

  const stageRows: TimelineStageRow[] = input.stages.map((s) => {
    const sp = stageSpans.get(s.id) ?? null;
    const dated = sp !== null && hasWindow;
    const offset = sp ? pct(sp.start) : 0;
    const width = sp
      ? Math.min(Math.max(((sp.end - sp.start) / total) * 100, 1.5), 100 - offset)
      : 0;
    return {
      kind: "stage",
      id: s.id,
      name: s.name,
      status: s.status,
      hasDates: dated,
      offsetPct: offset,
      widthPct: width > 0 ? width : sp ? 1.5 : 0,
      start: s.actualStart ?? s.plannedStart ?? "",
      end: s.actualEnd ?? s.plannedEnd ?? s.actualStart ?? s.plannedStart ?? "",
      overdue: dated && today !== null && sp !== null && sp.end < today && !DONE_STATES.has(s.status),
      waitingOn: 0,
      // The stage's responsible engagement → readable name (plain text; no
      // person route exists for an engagement). Unreadable/unset → null, which
      // renders the dash — never a guess.
      responsible: stageResponsible(s.responsibleEngagementId, input.stageResponsibleNames),
      href: stageTimelineHref(input.projectId, s.id),
      anchorId: stageAnchorId(s.id),
      tasks: tasksByStage.get(s.id) ?? [],
    };
  });

  return {
    window: hasWindow
      ? {
          start: dayToIso(winStart),
          end: dayToIso(winEnd),
          todayPct:
            today !== null && today >= winStart && today <= winEnd
              ? ((today - winStart) / total) * 100
              : null,
        }
      : null,
    stages: stageRows,
    unstagedTasks: unstaged,
  };
}
