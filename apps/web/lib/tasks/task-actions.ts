"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { emitWorkTaskAssignedNotification } from "@/lib/notifications/event-emitters";
import {
  WORK_TASK_DESCRIPTION_MAX,
  WORK_TASK_TITLE_MAX,
  WORK_TASK_TITLE_MIN,
  isMigrationMissingCode,
  isValidWorkTaskPriority,
  isValidWorkTaskStatus,
} from "@/lib/tasks/task-model";

/**
 * Work-task write actions (control room PR D; train D collaboration slice).
 *
 * The ONLY write paths are the gated SECURITY DEFINER RPCs. Train D adds the
 * v2 collaboration set (20260817151000):
 *
 *   - create_work_task_v2(…, p_object_id, p_assignee_profile_id) — returns
 *     the NEW TASK ID on success (soft failures stay outcome words);
 *   - assign_work_task_v1(p_task_id, p_assignee_profile_id) — managing
 *     roles assign any active org member / engaged worker; personal tasks
 *     stay self-assign-only;
 *   - update_work_task_v2(…, p_object_id);
 *   - set_work_task_status_v2 — forward transitions only (terminal states
 *     do not move here);
 *   - reopen_work_task_v1 — the ONE reopen path (done → in_progress,
 *     cancelled → todo), managing roles only;
 *   - add/remove_work_task_dependency_v1 — dependency edges with RPC-level
 *     CYCLE REJECTION.
 *
 * VERSION FALLBACK (the booking-actions precedent): while the LEAD has not
 * applied the v2 migration, the v2 RPCs are missing (42883/PGRST202). Plain
 * create/edit/status calls fall back to the APPLIED v1 RPCs so the live
 * surface never regresses; v2-ONLY capabilities (assign-to-other, object
 * link, dependencies) report `needs_migration` honestly instead.
 *
 * All RPCs re-check authorization server-side. After a successful
 * assign-to-other the durable work_task_assigned notification is emitted
 * FIRE-AND-FORGET with the admin client (recipient resolved from the task
 * row, never from caller input; self-assignment emits nothing).
 *
 * NATIVE-NAV forms: each action always redirects back to the tasks page
 * with an honest `?notice=` outcome — feedback is the navigation itself.
 *
 * INTERNAL ONLY: creating or updating a task sends nothing outside the
 * product — no email, no SMS, no push, no Telegram, no webhook.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const LOCALE_RX = /^[a-z]{2}$/;

type Notice =
  | "created"
  | "updated"
  | "invalid"
  | "needs_migration"
  | "not_authorized"
  | "not_found"
  | "limit_reached"
  | "cycle"
  | "error";

/** Rebuild the tasks-page URL from VALIDATED parts only (never raw input). */
function tasksUrl(
  locale: string,
  notice: Notice,
  view: string | null,
  project: string | null,
): string {
  const params = new URLSearchParams();
  if (view === "board") params.set("view", "board");
  if (project && UUID_RX.test(project)) params.set("project", project);
  params.set("notice", notice);
  return `/${locale}/dashboard/tasks?${params.toString()}`;
}

type FormContext = {
  locale: string;
  view: string | null;
  project: string | null;
};

function readContext(formData: FormData): FormContext {
  const rawLocale = String(formData.get("locale") ?? "lt");
  return {
    locale: LOCALE_RX.test(rawLocale) ? rawLocale : "lt",
    view: formData.get("view") === "board" ? "board" : null,
    project: String(formData.get("project") ?? "") || null,
  };
}

function noticeForRpcError(error: { code?: string }): Notice {
  if (isMigrationMissingCode(error.code)) return "needs_migration";
  if (error.code === "42501") return "not_authorized";
  return "error";
}

function noticeForOutcome(outcome: string, okNotice: Notice): Notice {
  if (outcome === "created" || outcome === "updated") return okNotice;
  if (UUID_RX.test(outcome)) return okNotice; // create v2 returns the id
  if (outcome === "not_allowed") return "not_authorized";
  if (outcome === "not_found") return "not_found";
  if (outcome === "task_limit_reached" || outcome === "limit_reached") {
    return "limit_reached";
  }
  if (outcome === "cycle") return "cycle";
  return "invalid";
}

function finish(ctx: FormContext, notice: Notice): never {
  if (notice === "created" || notice === "updated") {
    revalidatePath("/", "layout");
  }
  redirect(tasksUrl(ctx.locale, notice, ctx.view, ctx.project));
}

/** Create a work task through create_work_task_v2 (v1 fallback while the
 *  train-D migration is unapplied and no v2-only field is used). */
export async function createWorkTaskAction(formData: FormData): Promise<void> {
  const ctx = readContext(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < WORK_TASK_TITLE_MIN || title.length > WORK_TASK_TITLE_MAX) {
    finish(ctx, "invalid");
  }

  const description = String(formData.get("description") ?? "").trim();
  if (description.length > WORK_TASK_DESCRIPTION_MAX) finish(ctx, "invalid");

  const priority = String(formData.get("priority") ?? "normal");
  if (!isValidWorkTaskPriority(priority)) finish(ctx, "invalid");

  const dueDate = String(formData.get("dueDate") ?? "").trim();
  if (dueDate && !DATE_RX.test(dueDate)) finish(ctx, "invalid");

  const projectId = String(formData.get("projectId") ?? "").trim();
  if (projectId && !UUID_RX.test(projectId)) finish(ctx, "invalid");

  const objectId = String(formData.get("objectId") ?? "").trim();
  if (objectId && !UUID_RX.test(objectId)) finish(ctx, "invalid");

  // The assign select posts a profile id; the plain checkbox posts "on"
  // (self-assign). An empty value means unassigned — exactly like v1.
  const assigneeRaw = String(formData.get("assigneeProfileId") ?? "").trim();
  const assignSelf = formData.get("assignSelf") === "on";
  const assignee = assigneeRaw || (assignSelf ? user!.id : "");
  if (assignee && !UUID_RX.test(assignee)) finish(ctx, "invalid");

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
    // v2 not applied yet. Plain creates fall back to the APPLIED v1 RPC;
    // v2-only capabilities report the honest pre-apply state instead.
    if (objectId || (assignee && assignee !== user!.id)) {
      finish(ctx, "needs_migration");
    }
    const v1 = await asAny(supabase).rpc("create_work_task_v1", {
      p_title: title,
      p_description: description,
      p_priority: priority,
      p_due_date: dueDate,
      p_project_id: projectId,
      p_assign_to_self: assignee === user!.id,
    });
    if (v1.error) finish(ctx, noticeForRpcError(v1.error));
    finish(ctx, noticeForOutcome(String(v1.data ?? ""), "created"));
  }
  if (error) finish(ctx, noticeForRpcError(error));

  const outcome = String(data ?? "");
  // Success returns the new task id — emit the durable assignment event for
  // assign-to-other. AWAITED, not detached: a `void`-detached insert is
  // killable the instant the serverless invocation returns (the mechanism
  // that made the live interest emitter deliver nothing). The emitter never
  // throws, so the create that already succeeded cannot fail on its bell.
  if (UUID_RX.test(outcome) && assignee && assignee !== user!.id) {
    await emitWorkTaskAssignedNotification(outcome, user!.id);
  }
  finish(ctx, noticeForOutcome(outcome, "created"));
}

/** Move a task along the honest forward transitions
 *  (set_work_task_status_v2; v1 fallback pre-apply). */
export async function setWorkTaskStatusAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");

  const taskId = String(formData.get("taskId") ?? "").trim();
  if (!UUID_RX.test(taskId)) finish(ctx, "invalid");
  const status = String(formData.get("status") ?? "").trim();
  if (!isValidWorkTaskStatus(status)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc("set_work_task_status_v2", {
    p_task_id: taskId,
    p_status: status,
  });
  if (error && isMigrationMissingCode(error.code)) {
    const v1 = await asAny(supabase).rpc("set_work_task_status_v1", {
      p_task_id: taskId,
      p_status: status,
    });
    if (v1.error) finish(ctx, noticeForRpcError(v1.error));
    finish(ctx, noticeForOutcome(String(v1.data ?? ""), "updated"));
  }
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, noticeForOutcome(String(data ?? ""), "updated"));
}

/** Edit bounded task fields through update_work_task_v2 (v1 fallback while
 *  unapplied and no object link is posted). */
export async function updateWorkTaskAction(formData: FormData): Promise<void> {
  const ctx = readContext(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");

  const taskId = String(formData.get("taskId") ?? "").trim();
  if (!UUID_RX.test(taskId)) finish(ctx, "invalid");

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < WORK_TASK_TITLE_MIN || title.length > WORK_TASK_TITLE_MAX) {
    finish(ctx, "invalid");
  }

  const description = String(formData.get("description") ?? "").trim();
  if (description.length > WORK_TASK_DESCRIPTION_MAX) finish(ctx, "invalid");

  const priority = String(formData.get("priority") ?? "normal");
  if (!isValidWorkTaskPriority(priority)) finish(ctx, "invalid");

  const dueDate = String(formData.get("dueDate") ?? "").trim();
  if (dueDate && !DATE_RX.test(dueDate)) finish(ctx, "invalid");

  const objectId = String(formData.get("objectId") ?? "").trim();
  if (objectId && !UUID_RX.test(objectId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc("update_work_task_v2", {
    p_task_id: taskId,
    p_title: title,
    p_description: description,
    p_priority: priority,
    p_due_date: dueDate,
    p_object_id: objectId,
  });
  if (error && isMigrationMissingCode(error.code)) {
    if (objectId) finish(ctx, "needs_migration");
    const v1 = await asAny(supabase).rpc("update_work_task_v1", {
      p_task_id: taskId,
      p_title: title,
      p_description: description,
      p_priority: priority,
      p_due_date: dueDate,
    });
    if (v1.error) finish(ctx, noticeForRpcError(v1.error));
    finish(ctx, noticeForOutcome(String(v1.data ?? ""), "updated"));
  }
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, noticeForOutcome(String(data ?? ""), "updated"));
}

/** Assign / unassign a task (assign_work_task_v1 — managing roles; a
 *  personal task stays self-assign-only). v2-ONLY: no v1 fallback exists,
 *  the pre-apply notice is the honest `needs_migration`. */
export async function assignWorkTaskAction(formData: FormData): Promise<void> {
  const ctx = readContext(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");

  const taskId = String(formData.get("taskId") ?? "").trim();
  if (!UUID_RX.test(taskId)) finish(ctx, "invalid");
  const assignee = String(formData.get("assigneeProfileId") ?? "").trim();
  if (assignee && !UUID_RX.test(assignee)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc("assign_work_task_v1", {
    p_task_id: taskId,
    p_assignee_profile_id: assignee,
  });
  if (error) finish(ctx, noticeForRpcError(error));

  const outcome = String(data ?? "");
  if (outcome === "updated" && assignee && assignee !== user!.id) {
    // AWAITED — survives the serverless freeze; never throws.
    await emitWorkTaskAssignedNotification(taskId, user!.id);
  }
  finish(ctx, noticeForOutcome(outcome, "updated"));
}

/** Reopen finished work (reopen_work_task_v1 — managing roles; done →
 *  in_progress, cancelled → todo). Pre-apply the v1 status RPC still
 *  honours the same request so the existing control never dies. */
export async function reopenWorkTaskAction(formData: FormData): Promise<void> {
  const ctx = readContext(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");

  const taskId = String(formData.get("taskId") ?? "").trim();
  if (!UUID_RX.test(taskId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc("reopen_work_task_v1", {
    p_task_id: taskId,
  });
  if (error && isMigrationMissingCode(error.code)) {
    // Pre-apply fallback: the applied v1 status RPC performs the same
    // transition under its (looser) v1 authority — the behaviour the page
    // shipped with. Once v2 applies, the gated path above takes over.
    const v1 = await asAny(supabase).rpc("set_work_task_status_v1", {
      p_task_id: taskId,
      p_status: "todo",
    });
    if (v1.error) finish(ctx, noticeForRpcError(v1.error));
    finish(ctx, noticeForOutcome(String(v1.data ?? ""), "updated"));
  }
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, noticeForOutcome(String(data ?? ""), "updated"));
}

/** Add one dependency edge (add_work_task_dependency_v1 — cycle-rejecting).
 *  v2-ONLY: pre-apply reports `needs_migration`. */
export async function addTaskDependencyAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");

  const blockedTaskId = String(formData.get("taskId") ?? "").trim();
  const blockerTaskId = String(formData.get("blockerTaskId") ?? "").trim();
  if (!UUID_RX.test(blockedTaskId) || !UUID_RX.test(blockerTaskId)) {
    finish(ctx, "invalid");
  }

  const { data, error } = await asAny(supabase).rpc(
    "add_work_task_dependency_v1",
    {
      p_blocker_task_id: blockerTaskId,
      p_blocked_task_id: blockedTaskId,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, noticeForOutcome(String(data ?? ""), "updated"));
}

/** Remove one dependency edge. v2-ONLY: pre-apply reports `needs_migration`. */
export async function removeTaskDependencyAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");

  const blockedTaskId = String(formData.get("taskId") ?? "").trim();
  const blockerTaskId = String(formData.get("blockerTaskId") ?? "").trim();
  if (!UUID_RX.test(blockedTaskId) || !UUID_RX.test(blockerTaskId)) {
    finish(ctx, "invalid");
  }

  const { data, error } = await asAny(supabase).rpc(
    "remove_work_task_dependency_v1",
    {
      p_blocker_task_id: blockerTaskId,
      p_blocked_task_id: blockedTaskId,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, noticeForOutcome(String(data ?? ""), "updated"));
}
