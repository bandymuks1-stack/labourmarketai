import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Work-task read service (control room PR D, capability gap map §3).
 *
 * Reads ONLY the new `work_tasks` table (migration proposed by the SEPARATE,
 * human-gated PR D2) with the caller's RLS-scoped client. RLS lets a row be
 * read by its creator, its assignee, admins, and — when project_id is set —
 * managers of that project (can_manage_project). This module additionally
 * narrows "my tasks" to assignee-or-creator = me so a project manager's
 * personal list never absorbs the whole project backlog.
 *
 * INTERNAL ONLY: this layer never sends anything anywhere — no email, no
 * SMS, no push, no Telegram, no webhook, no outbound call of any kind.
 *
 * Honest degradation: while the owner-gated migration is not applied the
 * reads see 42P01/42703 and report { status: "needs-migration" } — the tasks
 * page then shows the calm "not available yet" state and no task is faked.
 * The attention counts return zeros in that state so the notification spine
 * stays rollout-safe (never fabricates, never throws into the layout).
 */

import {
  OPEN_WORK_TASK_STATUSES,
  WORK_TASK_READ_LIMIT,
  ZERO_TASK_ATTENTION,
  deriveTaskAttention,
  isMigrationMissingCode,
  isValidWorkTaskEventAction,
  isValidWorkTaskPriority,
  isValidWorkTaskStatus,
  type MyTasksResult,
  type TaskAttentionCounts,
  type TaskBlocker,
  type WorkTask,
  type WorkTaskEvent,
} from "@/lib/tasks/task-model";

export type {
  MyTasksResult,
  TaskAttentionCounts,
  WorkTask,
} from "@/lib/tasks/task-model";

/** v2 columns include the train-D object pointer; while the v2 migration is
 *  unapplied the column is missing (42703) and the reads FALL BACK to the v1
 *  column set so the live surface never regresses (booking version-fallback
 *  precedent). */
const SELECT_COLUMNS_V2 =
  "id, project_id, object_id, title, description, status, priority, assignee_profile_id, created_by, due_at, created_at, resolved_at";
const SELECT_COLUMNS_V1 =
  "id, project_id, title, description, status, priority, assignee_profile_id, created_by, due_at, created_at, resolved_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

type Row = {
  id: string;
  project_id: string | null;
  object_id?: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_profile_id: string | null;
  created_by: string;
  due_at: string | null;
  created_at: string;
  resolved_at: string | null;
};

function toTask(r: Row): WorkTask | null {
  if (!isValidWorkTaskStatus(r.status)) return null;
  if (!isValidWorkTaskPriority(r.priority)) return null;
  return {
    id: r.id,
    projectId: r.project_id ?? null,
    objectId: r.object_id ?? null,
    title: r.title,
    description: r.description ?? null,
    status: r.status,
    priority: r.priority,
    assigneeProfileId: r.assignee_profile_id ?? null,
    createdBy: r.created_by,
    dueAt: r.due_at ?? null,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at ?? null,
  };
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UNDEFINED_COLUMN = "42703";

/** Bounded, deterministically ordered base query: nearest due date first
 *  (nulls last), then newest created. Never more than the read limit. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function orderedTaskQuery(supabase: SupabaseClient, columns: string): any {
  return asAny(supabase)
    .from("work_tasks")
    .select(columns)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(WORK_TASK_READ_LIMIT);
}

/** Run one bounded task query with the v2 columns, falling back to the v1
 *  columns when ONLY the new object column is missing (42703). */
async function runTaskQuery(
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  refine: (q: any) => any,
): Promise<{ error: { code?: string; message: string } | null; data: unknown }> {
  const v2 = await refine(orderedTaskQuery(supabase, SELECT_COLUMNS_V2));
  if (v2.error && v2.error.code === UNDEFINED_COLUMN) {
    return refine(orderedTaskQuery(supabase, SELECT_COLUMNS_V1));
  }
  return v2;
}

function mapResult(res: {
  error: { code?: string; message: string } | null;
  data: unknown;
}): MyTasksResult {
  if (res.error) {
    if (isMigrationMissingCode(res.error.code)) {
      return { status: "needs-migration" };
    }
    return { status: "ok", tasks: [], error: res.error.message };
  }
  const tasks = ((res.data ?? []) as Row[])
    .map(toTask)
    .filter((t): t is WorkTask => t !== null);
  return { status: "ok", tasks, error: null };
}

/** Tasks where I am the assignee OR the creator — the "my tasks" view. */
export async function listMyTasks(): Promise<MyTasksResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const res = await runTaskQuery(supabase, (q) =>
    q.or(`assignee_profile_id.eq.${user.id},created_by.eq.${user.id}`),
  );
  return mapResult(res);
}

/** Tasks linked to one project. RLS scopes rows to the project's managers
 *  (plus each row's creator/assignee) — a non-manager simply reads less. */
export async function listProjectTasks(
  projectId: string,
): Promise<MyTasksResult> {
  if (!UUID_RX.test(projectId)) {
    return { status: "ok", tasks: [], error: null };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "not-authed" };

  const res = await runTaskQuery(supabase, (q) => q.eq("project_id", projectId));
  return mapResult(res);
}

/**
 * Attention counts for the caller's open tasks (assignee or creator = me):
 * overdue + blocked, distinct total. Zeros on ANY missing-data state — this
 * feeds the notification spine, which must never fabricate and never throw.
 */
export async function getTaskAttentionCounts(): Promise<TaskAttentionCounts> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return ZERO_TASK_ATTENTION;

  const res = await asAny(supabase)
    .from("work_tasks")
    .select("status, due_at")
    .or(`assignee_profile_id.eq.${user.id},created_by.eq.${user.id}`)
    .in("status", [...OPEN_WORK_TASK_STATUSES])
    .limit(WORK_TASK_READ_LIMIT);

  if (res.error) return ZERO_TASK_ATTENTION;

  type SlimRow = { status: string; due_at: string | null };
  const rows = ((res.data ?? []) as SlimRow[])
    .filter((r) => isValidWorkTaskStatus(r.status))
    .map((r) => ({
      status: r.status as WorkTask["status"],
      dueAt: r.due_at ?? null,
    }));
  return deriveTaskAttention(rows, new Date());
}

/* ── Train D: collaboration reads (v2 migration; honest degradation) ─────── */

/**
 * Dependencies + append-only history for a bounded set of listed tasks —
 * ONE query per store, never per task. While the v2 collaboration migration
 * is unapplied the stores are absent (42P01/PGRST205) and `available` is
 * false — the page then simply omits the history/dependency sections
 * (nothing faked, nothing broken).
 */
export type TaskCollaborationRead = {
  readonly available: boolean;
  /** blocked task id → its blocker edges (title/status null when the
   *  blocker row is not visible to the caller under RLS). */
  readonly blockersByTask: Readonly<Record<string, readonly TaskBlocker[]>>;
  /** task id → newest-first bounded history rows. */
  readonly eventsByTask: Readonly<Record<string, readonly WorkTaskEvent[]>>;
};

const EMPTY_COLLABORATION: TaskCollaborationRead = {
  available: false,
  blockersByTask: {},
  eventsByTask: {},
};

const COLLABORATION_EVENT_LIMIT = 400;
const COLLABORATION_EVENTS_PER_TASK = 10;

export async function getTaskCollaboration(
  taskIds: readonly string[],
): Promise<TaskCollaborationRead> {
  const ids = taskIds.filter((id) => UUID_RX.test(id)).slice(0, WORK_TASK_READ_LIMIT);
  if (ids.length === 0) {
    return { available: true, blockersByTask: {}, eventsByTask: {} };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY_COLLABORATION;

  const [depsRes, eventsRes] = await Promise.all([
    asAny(supabase)
      .from("task_dependencies")
      .select("id, blocker_task_id, blocked_task_id")
      .in("blocked_task_id", ids)
      .limit(WORK_TASK_READ_LIMIT * 2),
    asAny(supabase)
      .from("work_task_events")
      .select("id, task_id, actor_profile_id, action, created_at")
      .in("task_id", ids)
      .order("created_at", { ascending: false })
      .limit(COLLABORATION_EVENT_LIMIT),
  ]);

  if (depsRes.error || eventsRes.error) {
    const code = depsRes.error?.code ?? eventsRes.error?.code;
    if (isMigrationMissingCode(code) || code === "PGRST205") {
      return EMPTY_COLLABORATION;
    }
    return EMPTY_COLLABORATION;
  }

  type DepRow = { id: string; blocker_task_id: string; blocked_task_id: string };
  const depRows = (depsRes.data ?? []) as DepRow[];

  // Blocker titles/statuses in ONE bounded read; rows RLS hides stay null.
  const blockerIds = [...new Set(depRows.map((d) => d.blocker_task_id))].slice(
    0,
    WORK_TASK_READ_LIMIT,
  );
  const blockerMeta = new Map<string, { title: string; status: WorkTask["status"] }>();
  if (blockerIds.length > 0) {
    const blockersRes = await asAny(supabase)
      .from("work_tasks")
      .select("id, title, status")
      .in("id", blockerIds)
      .limit(WORK_TASK_READ_LIMIT);
    if (!blockersRes.error) {
      type SlimRow = { id: string; title: string; status: string };
      for (const r of (blockersRes.data ?? []) as SlimRow[]) {
        if (isValidWorkTaskStatus(r.status)) {
          blockerMeta.set(r.id, { title: r.title, status: r.status });
        }
      }
    }
  }

  const blockersByTask: Record<string, TaskBlocker[]> = {};
  for (const d of depRows) {
    const meta = blockerMeta.get(d.blocker_task_id) ?? null;
    (blockersByTask[d.blocked_task_id] ??= []).push({
      blockerTaskId: d.blocker_task_id,
      title: meta?.title ?? null,
      status: meta?.status ?? null,
    });
  }

  type EventRow = {
    id: string;
    task_id: string;
    actor_profile_id: string | null;
    action: string;
    created_at: string;
  };
  const eventsByTask: Record<string, WorkTaskEvent[]> = {};
  for (const r of (eventsRes.data ?? []) as EventRow[]) {
    if (!isValidWorkTaskEventAction(r.action)) continue;
    const list = (eventsByTask[r.task_id] ??= []);
    if (list.length >= COLLABORATION_EVENTS_PER_TASK) continue;
    list.push({
      id: r.id,
      taskId: r.task_id,
      actorProfileId: r.actor_profile_id ?? null,
      action: r.action,
      createdAt: r.created_at,
    });
  }

  return { available: true, blockersByTask, eventsByTask };
}
