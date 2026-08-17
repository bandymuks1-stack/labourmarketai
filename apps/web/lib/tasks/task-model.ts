/**
 * Pure work-task model (control room PR D, capability gap map §3) — shared by
 * the server read service, the server actions, the guard test and the tasks
 * page. No server-only imports, no IO.
 *
 * The model codes against the `public.work_tasks` contract the SEPARATE,
 * human-gated migration PR (D2) will propose. Until the owner applies that
 * migration the read/action layers degrade honestly (the established
 * follow-up-tasks / handover-passport pattern) — nothing here fakes a task.
 *
 * HONEST lifecycle only: todo / in_progress / blocked / done / cancelled.
 * "Attention" is DERIVED state (overdue or blocked among open tasks) — it
 * clears the moment the underlying task is resolved, exactly like the
 * pending-bookings spine signal. No urgency score, no fake escalation.
 */

export const WORK_TASK_STATUSES = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const;
export type WorkTaskStatus = (typeof WORK_TASK_STATUSES)[number];

/** Statuses that still need doing — everything except done/cancelled. */
export const OPEN_WORK_TASK_STATUSES = [
  "todo",
  "in_progress",
  "blocked",
] as const;

export const WORK_TASK_PRIORITIES = ["low", "normal", "high"] as const;
export type WorkTaskPriority = (typeof WORK_TASK_PRIORITIES)[number];

/** Bounded lengths — mirrored by the D2 RPC validation (single contract). */
export const WORK_TASK_TITLE_MIN = 3;
export const WORK_TASK_TITLE_MAX = 160;
export const WORK_TASK_DESCRIPTION_MAX = 2000;

/** Bounded reads everywhere — the task surfaces never stream unbounded rows. */
export const WORK_TASK_READ_LIMIT = 200;

/**
 * Postgres/PostgREST error codes that mean "the work_tasks migration is not
 * applied yet": missing relation, missing column, missing function, and the
 * PostgREST schema-cache miss for an RPC. The read layer and the actions map
 * ALL of these to the honest "not available yet" state — never a crash.
 */
export const MIGRATION_MISSING_ERROR_CODES = [
  "42P01",
  "42703",
  "42883",
  "PGRST202",
] as const;

export function isMigrationMissingCode(code: string | undefined): boolean {
  return (MIGRATION_MISSING_ERROR_CODES as readonly string[]).includes(
    code ?? "",
  );
}

export type WorkTask = {
  readonly id: string;
  /** Optional project linkage (RLS: managers of that project also see it). */
  readonly projectId: string | null;
  /** Optional object/site linkage (train D — work_objects; null until the
   *  v2 collaboration migration is applied, never fabricated). */
  readonly objectId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly status: WorkTaskStatus;
  readonly priority: WorkTaskPriority;
  readonly assigneeProfileId: string | null;
  readonly createdBy: string;
  readonly dueAt: string | null;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
};

/* ── Train D: task collaboration (v2 migration contract) ────────────────── */

/** Append-only history vocabulary — mirrors the work_task_events CHECK. */
export const WORK_TASK_EVENT_ACTIONS = [
  "created",
  "status_changed",
  "reopened",
  "assigned",
  "unassigned",
  "priority_changed",
  "due_changed",
  "object_changed",
  "dependency_added",
  "dependency_removed",
] as const;
export type WorkTaskEventAction = (typeof WORK_TASK_EVENT_ACTIONS)[number];

export function isValidWorkTaskEventAction(
  v: string,
): v is WorkTaskEventAction {
  return (WORK_TASK_EVENT_ACTIONS as readonly string[]).includes(v);
}

export type WorkTaskEvent = {
  readonly id: string;
  readonly taskId: string;
  readonly actorProfileId: string | null;
  readonly action: WorkTaskEventAction;
  readonly createdAt: string;
};

export type TaskDependency = {
  readonly id: string;
  readonly blockerTaskId: string;
  readonly blockedTaskId: string;
};

/** A dependency edge rendered on the blocked task's card. */
export type TaskBlocker = {
  readonly blockerTaskId: string;
  /** Null when the blocker row is not visible to the caller (RLS). */
  readonly title: string | null;
  readonly status: WorkTaskStatus | null;
};

/** Open blockers gate a task — done/cancelled blockers do not. */
export function isBlockingStatus(status: WorkTaskStatus | null): boolean {
  return status !== null && isOpenStatus(status);
}

function isOpenStatus(status: WorkTaskStatus): boolean {
  return (OPEN_WORK_TASK_STATUSES as readonly string[]).includes(status);
}

/** Read results — the bookings-page discriminant style ("needs-migration"
 *  is a calm product state, never an error surface). */
export type MyTasksResult =
  | { readonly status: "not-authed" }
  | { readonly status: "needs-migration" }
  | {
      readonly status: "ok";
      readonly tasks: readonly WorkTask[];
      readonly error: string | null;
    };

export type TaskAttentionCounts = {
  /** Open tasks whose due day has passed. */
  readonly overdue: number;
  /** Open tasks currently in the blocked state. */
  readonly blocked: number;
  /** Distinct open tasks needing attention (overdue OR blocked — a task that
   *  is both counts once). Feeds the open-task-attention spine signal. */
  readonly total: number;
};

export const ZERO_TASK_ATTENTION: TaskAttentionCounts = {
  overdue: 0,
  blocked: 0,
  total: 0,
};

export function isValidWorkTaskStatus(v: string): v is WorkTaskStatus {
  return (WORK_TASK_STATUSES as readonly string[]).includes(v);
}

export function isValidWorkTaskPriority(v: string): v is WorkTaskPriority {
  return (WORK_TASK_PRIORITIES as readonly string[]).includes(v);
}

export function isOpen(status: WorkTaskStatus): boolean {
  return (OPEN_WORK_TASK_STATUSES as readonly string[]).includes(status);
}

/** UTC day of an ISO timestamp — "YYYY-MM-DD", or null when unparseable. */
function utcDay(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Overdue = the due CALENDAR day (UTC) is before today (UTC). A task due
 * today is NOT overdue yet — the honest reading of a date-only due field.
 */
export function isOverdue(dueAt: string | null, now: Date): boolean {
  if (!dueAt) return false;
  const due = utcDay(dueAt);
  if (!due) return false;
  return due < now.toISOString().slice(0, 10);
}

/** Attention = an OPEN task that is overdue or blocked. Resolved tasks
 *  (done/cancelled) never demand attention — the signal clears itself. */
export function taskNeedsAttention(
  task: Pick<WorkTask, "status" | "dueAt">,
  now: Date,
): boolean {
  if (!isOpen(task.status)) return false;
  return task.status === "blocked" || isOverdue(task.dueAt, now);
}

/** Derive the attention counts from a bounded task list (pure). */
export function deriveTaskAttention(
  tasks: readonly Pick<WorkTask, "status" | "dueAt">[],
  now: Date,
): TaskAttentionCounts {
  let overdue = 0;
  let blocked = 0;
  let total = 0;
  for (const t of tasks) {
    if (!isOpen(t.status)) continue;
    const o = isOverdue(t.dueAt, now);
    const b = t.status === "blocked";
    if (o) overdue++;
    if (b) blocked++;
    if (o || b) total++;
  }
  return { overdue, blocked, total };
}

/** i18n leaf for a status label — one naming source for every surface. */
export function statusLabelKey(status: WorkTaskStatus): string {
  return `tasks.status.${status}`;
}

/** i18n leaf for a priority label. */
export function priorityLabelKey(priority: WorkTaskPriority): string {
  return `tasks.priority.${priority}`;
}
