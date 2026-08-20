"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { emitWorkflowStepPendingNotifications } from "@/lib/notifications/event-emitters";
import {
  WORKFLOW_TITLE_MAX,
  WORKFLOW_TITLE_MIN,
  isWorkflowMigrationMissingCode,
} from "@/lib/approvals/approvals-model";

/**
 * Send a work task for approval (field-work audit v1, chain step B).
 *
 * This is a THIN caller of the canonical engine. The ONLY write path is the
 * existing gated RPC `start_workflow_instance_v1`, called with
 * `p_context_entity_id = <task id>` against a definition whose
 * `context_entity_type` is `work_task`. Everything that makes an approval an
 * approval — approver resolution, per-step deadlines, escalation, delegation,
 * the fill-once decision guard, the append-only transition log — is the
 * engine's, not this file's.
 *
 * Deliberately NOT here: no status column on `work_tasks`, no task-specific
 * decision table, no second notion of "approved". A task's approval IS its
 * workflow instance; if the instance says approved, the task is approved.
 *
 * The RPC is idempotent on an already-pending instance for the same context
 * entity, so a double submit cannot open two approvals on one task.
 *
 * NATIVE-NAV: redirects back to the tasks page with a validated `?notice=`.
 */

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE_RX = /^[a-z]{2}$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

type Notice =
  | "approval_requested"
  | "invalid"
  | "needs_migration"
  | "not_authorized"
  | "not_found"
  | "limit_reached"
  | "error";

type FormContext = { locale: string; view: string | null; project: string | null };

function readContext(formData: FormData): FormContext {
  const rawLocale = String(formData.get("locale") ?? "lt");
  return {
    locale: LOCALE_RX.test(rawLocale) ? rawLocale : "lt",
    view: formData.get("view") === "board" ? "board" : null,
    project: String(formData.get("project") ?? "") || null,
  };
}

function tasksUrl(ctx: FormContext, notice: Notice): string {
  const params = new URLSearchParams();
  if (ctx.view === "board") params.set("view", "board");
  if (ctx.project && UUID_RX.test(ctx.project)) params.set("project", ctx.project);
  params.set("notice", notice);
  return `/${ctx.locale}/dashboard/tasks?${params.toString()}`;
}

function finish(ctx: FormContext, notice: Notice): never {
  if (notice === "approval_requested") revalidatePath("/", "layout");
  redirect(tasksUrl(ctx, notice));
}

function noticeForRpcError(error: { code?: string }): Notice {
  if (isWorkflowMigrationMissingCode(error.code)) return "needs_migration";
  if (error.code === "42501") return "not_authorized";
  return "error";
}

/** Map the engine's outcome vocabulary onto the tasks page notices. */
function noticeForOutcome(outcome: string): Notice {
  if (UUID_RX.test(outcome)) return "approval_requested";
  switch (outcome) {
    // The engine refuses a second pending instance for the same context
    // entity and answers 'already_pending' (it does NOT return the existing
    // id). The world is already in the state the user asked for, so this
    // reads as success — reporting an error would be dishonest the other way.
    case "already_pending":
      return "approval_requested";
    case "not_found":
    case "not_published":
      return "not_found";
    case "not_allowed":
      return "not_authorized";
    case "limit_reached":
      return "limit_reached";
    default:
      return "invalid";
  }
}

export async function requestTaskApprovalAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");

  const taskId = String(formData.get("taskId") ?? "").trim();
  const definitionId = String(formData.get("definitionId") ?? "").trim();
  if (!UUID_RX.test(taskId) || !UUID_RX.test(definitionId)) {
    finish(ctx, "invalid");
  }

  // The approval's title is the task's OWN title, read from the database under
  // the caller's RLS — never a string the client posted.
  //
  // This used to take a hidden `taskTitle` form field. A review found that a
  // caller could post any text at all, and it would be stored on the instance
  // and read by the approvers. `20260820070000` now overrides the title inside
  // `start_workflow_instance_v1` for this context type, which is the real
  // boundary (the RPC is directly callable by `authenticated`); this read is
  // defence in depth and gives an honest error before the round trip.
  const taskRes = await asAny(supabase)
    .from("work_tasks")
    .select("id, title")
    .eq("id", taskId)
    .maybeSingle();
  // A task the caller cannot see reads exactly like one that does not exist.
  if (taskRes.error || !taskRes.data) finish(ctx, "not_found");
  const title = String(taskRes.data.title ?? "")
    .trim()
    .slice(0, WORKFLOW_TITLE_MAX);
  if (title.length < WORKFLOW_TITLE_MIN) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "start_workflow_instance_v1",
    {
      p_definition_id: definitionId,
      p_title: title,
      // The task id travels as the CONTEXT ENTITY, not as copied task fields:
      // the approval points at the task, it does not snapshot it.
      p_payload: {},
      p_context_entity_id: taskId,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));

  const outcome = String(data ?? "");
  if (UUID_RX.test(outcome)) {
    // Step-1 approvers durably hear that work awaits their decision.
    await emitWorkflowStepPendingNotifications(outcome);
  }
  finish(ctx, noticeForOutcome(outcome));
}
