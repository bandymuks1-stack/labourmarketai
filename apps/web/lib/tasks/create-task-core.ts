import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { emitWorkTaskAssignedNotification } from "@/lib/notifications/event-emitters";
import {
  isMigrationMissingCode,
  isValidWorkTaskPriority,
  WORK_TASK_DESCRIPTION_MAX,
  WORK_TASK_TITLE_MAX,
  WORK_TASK_TITLE_MIN,
} from "@/lib/tasks/task-model";

/**
 * THE ONE work-task create (owner contract 2026-09-04 §5.5 — one backbone).
 *
 * Both entry points insert through this core: the tasks page's form action
 * (`createWorkTaskAction`, which redirects with a notice) and the chat's
 * `company.create-task` (which returns the outcome). Same validation, same
 * `create_work_task_v2` RPC with the v1 fallback, same awaited assignment
 * notification — never a second write path.
 */

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

export interface CreateWorkTaskInput {
  readonly title: string;
  readonly description?: string | null;
  readonly priority?: string | null;
  readonly dueDate?: string | null;
  readonly projectId?: string | null;
  readonly objectId?: string | null;
  readonly assigneeProfileId?: string | null;
  readonly assignSelf?: boolean;
}

export type CreateWorkTaskCoreResult =
  | { readonly kind: "created"; readonly id: string | null }
  | { readonly kind: "invalid" }
  | { readonly kind: "needs_migration" }
  | { readonly kind: "not_authorized" }
  | { readonly kind: "not_found" }
  | { readonly kind: "limit_reached" }
  | { readonly kind: "cycle" }
  | { readonly kind: "error" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function kindForRpcError(error: { code?: string }): CreateWorkTaskCoreResult {
  if (isMigrationMissingCode(error.code)) return { kind: "needs_migration" };
  if (error.code === "42501") return { kind: "not_authorized" };
  return { kind: "error" };
}

function kindForOutcome(outcome: string): CreateWorkTaskCoreResult {
  if (UUID_RX.test(outcome)) return { kind: "created", id: outcome };
  if (outcome === "created") return { kind: "created", id: null };
  if (outcome === "not_allowed") return { kind: "not_authorized" };
  if (outcome === "not_found") return { kind: "not_found" };
  if (outcome === "task_limit_reached" || outcome === "limit_reached") return { kind: "limit_reached" };
  if (outcome === "cycle") return { kind: "cycle" };
  return { kind: "invalid" };
}

export async function createWorkTaskCore(
  supabase: SupabaseClient,
  userId: string,
  input: CreateWorkTaskInput,
): Promise<CreateWorkTaskCoreResult> {
  const title = (input.title ?? "").trim();
  if (title.length < WORK_TASK_TITLE_MIN || title.length > WORK_TASK_TITLE_MAX) return { kind: "invalid" };
  const description = (input.description ?? "").trim();
  if (description.length > WORK_TASK_DESCRIPTION_MAX) return { kind: "invalid" };
  const priority = (input.priority ?? "normal").trim() || "normal";
  if (!isValidWorkTaskPriority(priority)) return { kind: "invalid" };
  const dueDate = (input.dueDate ?? "").trim();
  if (dueDate && !DATE_RX.test(dueDate)) return { kind: "invalid" };
  const projectId = (input.projectId ?? "").trim();
  if (projectId && !UUID_RX.test(projectId)) return { kind: "invalid" };
  const objectId = (input.objectId ?? "").trim();
  if (objectId && !UUID_RX.test(objectId)) return { kind: "invalid" };
  const assigneeRaw = (input.assigneeProfileId ?? "").trim();
  const assignee = assigneeRaw || (input.assignSelf ? userId : "");
  if (assignee && !UUID_RX.test(assignee)) return { kind: "invalid" };

  const { data, error } = await asAny(supabase).rpc("create_work_task_v2", {
    p_title: title,
    p_description: description,
    p_priority: priority,
    p_due_date: dueDate,
    p_project_id: projectId,
    p_object_id: objectId,
    p_assignee_profile_id: assignee,
  });

  if (error && isMigrationMissingCode(error.code)) {
    if (objectId || (assignee && assignee !== userId)) return { kind: "needs_migration" };
    const v1 = await asAny(supabase).rpc("create_work_task_v1", {
      p_title: title,
      p_description: description,
      p_priority: priority,
      p_due_date: dueDate,
      p_project_id: projectId,
      p_assign_to_self: assignee === userId,
    });
    if (v1.error) return kindForRpcError(v1.error);
    return kindForOutcome(String(v1.data ?? ""));
  }
  if (error) return kindForRpcError(error);

  const outcome = String(data ?? "");
  // Success returns the new task id — emit the durable assignment event for
  // assign-to-other. AWAITED, never detached (a detached insert dies with the
  // serverless invocation); the emitter never throws.
  if (UUID_RX.test(outcome) && assignee && assignee !== userId) {
    await emitWorkTaskAssignedNotification(outcome, userId);
  }
  return kindForOutcome(outcome);
}
