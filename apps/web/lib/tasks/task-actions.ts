"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  WORK_TASK_DESCRIPTION_MAX,
  WORK_TASK_TITLE_MAX,
  WORK_TASK_TITLE_MIN,
  isMigrationMissingCode,
  isValidWorkTaskPriority,
  isValidWorkTaskStatus,
} from "@/lib/tasks/task-model";

/**
 * Work-task write actions (control room PR D, capability gap map §3).
 *
 * The ONLY write paths are the three gated SECURITY DEFINER RPCs the
 * SEPARATE, human-gated migration PR (D2) proposes:
 *
 *   - create_work_task_v1(p_title, p_description, p_priority, p_due_date,
 *     p_project_id, p_assign_to_self)
 *   - set_work_task_status_v1(p_task_id, p_status)
 *   - update_work_task_v1(p_task_id, p_title, p_description, p_priority,
 *     p_due_date)
 *
 * All three re-check authorization server-side (creator / assignee /
 * project manager via can_manage_project / admin), validate the honest
 * status + priority enums, bound every length, stamp resolved_at on
 * done/cancelled and cap open tasks per creator. Direct table writes are
 * REVOKEd — these actions never insert/update/delete a row themselves.
 *
 * NATIVE-NAV forms: each action always redirects back to the tasks page
 * with an honest `?notice=` outcome (created / updated / invalid /
 * needs_migration / not_authorized / not_found / limit_reached / error) —
 * feedback is the navigation itself, the established bookings-page pattern.
 * While the migration is unapplied the RPC is missing (42883 / PGRST202 /
 * 42P01) and the notice says so honestly — nothing pretends to have saved.
 *
 * INTERNAL ONLY: creating or updating a task sends nothing to anyone — no
 * email, no SMS, no push, no Telegram, no webhook, no outbound call.
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
  if (outcome === "not_allowed") return "not_authorized";
  if (outcome === "not_found") return "not_found";
  if (outcome === "task_limit_reached") return "limit_reached";
  return "invalid";
}

function finish(ctx: FormContext, notice: Notice): never {
  if (notice === "created" || notice === "updated") {
    revalidatePath("/", "layout");
  }
  redirect(tasksUrl(ctx.locale, notice, ctx.view, ctx.project));
}

/** Create a work task through create_work_task_v1 (RPC-only write). */
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

  const assignToSelf = formData.get("assignSelf") === "on";

  const { data, error } = await asAny(supabase).rpc("create_work_task_v1", {
    p_title: title,
    p_description: description,
    p_priority: priority,
    p_due_date: dueDate,
    p_project_id: projectId,
    p_assign_to_self: assignToSelf,
  });
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, noticeForOutcome(String(data ?? ""), "created"));
}

/** Move a task to another honest status through set_work_task_status_v1. */
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

  const { data, error } = await asAny(supabase).rpc("set_work_task_status_v1", {
    p_task_id: taskId,
    p_status: status,
  });
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, noticeForOutcome(String(data ?? ""), "updated"));
}

/** Edit bounded task fields through update_work_task_v1. */
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

  const { data, error } = await asAny(supabase).rpc("update_work_task_v1", {
    p_task_id: taskId,
    p_title: title,
    p_description: description,
    p_priority: priority,
    p_due_date: dueDate,
  });
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, noticeForOutcome(String(data ?? ""), "updated"));
}
