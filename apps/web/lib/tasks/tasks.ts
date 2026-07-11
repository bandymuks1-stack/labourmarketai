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
  isValidWorkTaskPriority,
  isValidWorkTaskStatus,
  type MyTasksResult,
  type TaskAttentionCounts,
  type WorkTask,
} from "@/lib/tasks/task-model";

export type {
  MyTasksResult,
  TaskAttentionCounts,
  WorkTask,
} from "@/lib/tasks/task-model";

const SELECT_COLUMNS =
  "id, project_id, title, description, status, priority, assignee_profile_id, created_by, due_at, created_at, resolved_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

type Row = {
  id: string;
  project_id: string | null;
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

/** Bounded, deterministically ordered base query: nearest due date first
 *  (nulls last), then newest created. Never more than the read limit. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function orderedTaskQuery(supabase: SupabaseClient): any {
  return asAny(supabase)
    .from("work_tasks")
    .select(SELECT_COLUMNS)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(WORK_TASK_READ_LIMIT);
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

  const res = await orderedTaskQuery(supabase).or(
    `assignee_profile_id.eq.${user.id},created_by.eq.${user.id}`,
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

  const res = await orderedTaskQuery(supabase).eq("project_id", projectId);
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
