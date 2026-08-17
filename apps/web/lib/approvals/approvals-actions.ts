"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  WORKFLOW_DEADLINE_HOURS_MAX,
  WORKFLOW_DEADLINE_HOURS_MIN,
  WORKFLOW_DETAILS_MAX,
  WORKFLOW_MAX_FORM_STEPS,
  WORKFLOW_NAME_MAX,
  WORKFLOW_NAME_MIN,
  WORKFLOW_REASON_MAX,
  WORKFLOW_STEP_NAME_MAX,
  WORKFLOW_STEP_NAME_MIN,
  WORKFLOW_TITLE_MAX,
  WORKFLOW_TITLE_MIN,
  isValidWorkflowApprovalMode,
  isValidWorkflowContextEntityType,
  isValidWorkflowDecision,
  isValidWorkflowFormRule,
  isWorkflowMigrationMissingCode,
  workflowSlugFromName,
  type WorkflowNotice,
} from "@/lib/approvals/approvals-model";
import {
  emitWorkflowDecidedNotification,
  emitWorkflowDelegatedNotification,
  emitWorkflowEscalatedNotifications,
  emitWorkflowStepPendingNotifications,
} from "@/lib/notifications/event-emitters";

/**
 * Workflow & Approval Engine write actions (canonical engine v1).
 *
 * The ONLY write paths are the eight gated SECURITY DEFINER commands the
 * human-gated migration 20260817130000_workflow_engine_v1 proposes:
 *
 *   create_workflow_definition_v1 / publish_workflow_version_v1 /
 *   start_workflow_instance_v1 / decide_workflow_step_v1 /
 *   delegate_workflow_step_v1 / withdraw_workflow_instance_v1 /
 *   cancel_workflow_instance_v1 / mark_overdue_workflow_steps_v1
 *
 * All eight re-check authorization server-side (governance owner/admin via
 * company_memberships for authoring/cancel/escalation; org boundary over
 * BOTH membership truths for requesters, named approvers and delegates),
 * validate every enum and bound, row-lock the instance for decisions, fill
 * each decision exactly once, and stay idempotent on repeat calls. Direct
 * table writes are REVOKEd — these actions never insert/update/delete a
 * row themselves.
 *
 * NATIVE-NAV forms: each action always redirects back to the network page
 * with an honest `?wf=` outcome — feedback is the navigation itself, the
 * established bookings/tasks/finance pattern. While the migration is
 * unapplied the RPC is missing (42883 / PGRST202 / 42P01) and the notice
 * says so honestly — nothing pretends to have saved.
 *
 * INTERNAL ONLY: nothing here sends anything to anyone — no email, no SMS,
 * no push, no webhook, no outbound call. Durable in-app notification events
 * are emitted AFTER a successful domain write, fire-and-forget, through the
 * existing notification_events spine.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE_RX = /^[a-z]{2}$/;
const EMAIL_RX = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

type FormContext = { locale: string };

function readContext(formData: FormData): FormContext {
  const rawLocale = String(formData.get("locale") ?? "lt");
  return { locale: LOCALE_RX.test(rawLocale) ? rawLocale : "lt" };
}

const SUCCESS_NOTICES: readonly WorkflowNotice[] = [
  "created",
  "published",
  "started",
  "approved",
  "rejected",
  "step_approved",
  "recorded",
  "delegated",
  "withdrawn",
  "cancelled",
  "marked_overdue",
];

function finish(ctx: FormContext, notice: WorkflowNotice): never {
  if ((SUCCESS_NOTICES as readonly string[]).includes(notice)) {
    revalidatePath("/", "layout");
  }
  redirect(`/${ctx.locale}/dashboard/network?wf=${notice}#approvals`);
}

function noticeForRpcError(error: { code?: string }): WorkflowNotice {
  if (isWorkflowMigrationMissingCode(error.code)) return "needs_migration";
  if (error.code === "42501") return "not_authorized";
  return "error";
}

/** Map the RPC outcome vocabulary onto the notice vocabulary (1:1 where the
 *  words already match; everything unknown is an honest "error"). */
function noticeForOutcome(outcome: string): WorkflowNotice {
  switch (outcome) {
    case "created":
    case "published":
    case "approved":
    case "rejected":
    case "step_approved":
    case "recorded":
    case "delegated":
    case "withdrawn":
    case "cancelled":
    case "already_pending":
    case "already_published":
    case "already_exists":
    case "already_decided":
    case "no_approvers":
    case "not_published":
    case "not_pending":
    case "invalid":
    case "invalid_delegate":
    case "not_authorized":
    case "not_found":
      return outcome;
    case "task_limit_reached":
    case "limit_reached":
      return "limit_reached";
    default:
      return "error";
  }
}

async function requireUser(
  ctx: FormContext,
): Promise<{ supabase: SupabaseClient; userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");
  return { supabase, userId: user.id };
}

/** Create an approval template through create_workflow_definition_v1.
 *  The v1 form authors 1..3 steps; each step: name + mode + one of the two
 *  rule presets (org owners/admins, or the requester's managers). */
export async function createWorkflowDefinitionAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  if (!UUID_RX.test(organizationId)) finish(ctx, "invalid");

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < WORKFLOW_NAME_MIN || name.length > WORKFLOW_NAME_MAX) {
    finish(ctx, "invalid");
  }
  const slug = workflowSlugFromName(name);
  if (!slug) finish(ctx, "invalid");

  const contextEntityType = String(
    formData.get("contextEntityType") ?? "generic_request",
  );
  if (!isValidWorkflowContextEntityType(contextEntityType)) {
    finish(ctx, "invalid");
  }

  const steps: Record<string, unknown>[] = [];
  for (let i = 1; i <= WORKFLOW_MAX_FORM_STEPS; i++) {
    const stepName = String(formData.get(`step${i}Name`) ?? "").trim();
    if (i > 1 && stepName.length === 0) continue; // optional trailing steps
    if (
      stepName.length < WORKFLOW_STEP_NAME_MIN ||
      stepName.length > WORKFLOW_STEP_NAME_MAX
    ) {
      finish(ctx, "invalid");
    }
    const mode = String(formData.get(`step${i}Mode`) ?? "single");
    if (!isValidWorkflowApprovalMode(mode)) finish(ctx, "invalid");
    const rule = String(formData.get(`step${i}Rule`) ?? "owner_admin");
    if (!isValidWorkflowFormRule(rule)) finish(ctx, "invalid");
    const deadlineRaw = String(formData.get(`step${i}DeadlineHours`) ?? "").trim();
    let deadlineHours: number | null = null;
    if (deadlineRaw.length > 0) {
      if (!/^\d{1,4}$/.test(deadlineRaw)) finish(ctx, "invalid");
      deadlineHours = Number(deadlineRaw);
      if (
        deadlineHours < WORKFLOW_DEADLINE_HOURS_MIN ||
        deadlineHours > WORKFLOW_DEADLINE_HOURS_MAX
      ) {
        finish(ctx, "invalid");
      }
    }
    steps.push({
      name: stepName,
      approval_mode: mode,
      approver_rule:
        rule === "owner_admin"
          ? { kind: "org_role", roles: ["owner", "admin"] }
          : { kind: "requester_manager" },
      ...(deadlineHours !== null
        ? {
            deadline_hours: deadlineHours,
            // Escalation only ever MARKS + notifies. Never an approval.
            escalation_rule: {
              action: "mark_escalated",
              notify_roles: ["owner", "admin"],
            },
          }
        : {}),
    });
  }
  if (steps.length === 0) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "create_workflow_definition_v1",
    {
      p_organization_id: organizationId,
      p_name: name,
      p_slug: slug,
      p_context_entity_type: contextEntityType,
      p_steps: steps,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, noticeForOutcome(String(data ?? "")));
}

/** Publish (freeze) a template version through publish_workflow_version_v1. */
export async function publishWorkflowVersionAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const versionId = String(formData.get("versionId") ?? "").trim();
  if (!UUID_RX.test(versionId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "publish_workflow_version_v1",
    { p_version_id: versionId },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, noticeForOutcome(String(data ?? "")));
}

/** File a request through start_workflow_instance_v1. On success the RPC
 *  returns the new instance id (uuid shape); everything else is an outcome
 *  string. */
export async function startWorkflowRequestAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const definitionId = String(formData.get("definitionId") ?? "").trim();
  if (!UUID_RX.test(definitionId)) finish(ctx, "invalid");

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < WORKFLOW_TITLE_MIN || title.length > WORKFLOW_TITLE_MAX) {
    finish(ctx, "invalid");
  }
  const details = String(formData.get("details") ?? "").trim();
  if (details.length > WORKFLOW_DETAILS_MAX) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "start_workflow_instance_v1",
    {
      p_definition_id: definitionId,
      p_title: title,
      p_payload: details.length > 0 ? { details } : {},
      p_context_entity_id: null,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));

  const outcome = String(data ?? "");
  if (UUID_RX.test(outcome)) {
    // Success — the step-1 approvers durably hear a request awaits them.
    await emitWorkflowStepPendingNotifications(outcome);
    finish(ctx, "started");
  }
  finish(ctx, noticeForOutcome(outcome));
}

/** Approve or reject through decide_workflow_step_v1 (row-locked,
 *  fill-once, idempotent on repeats). */
export async function decideWorkflowStepAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const instanceId = String(formData.get("instanceId") ?? "").trim();
  if (!UUID_RX.test(instanceId)) finish(ctx, "invalid");
  const decision = String(formData.get("decision") ?? "").trim();
  if (!isValidWorkflowDecision(decision)) finish(ctx, "invalid");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length > WORKFLOW_REASON_MAX) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc("decide_workflow_step_v1", {
    p_instance_id: instanceId,
    p_decision: decision,
    p_reason: reason.length > 0 ? reason : null,
  });
  if (error) finish(ctx, noticeForRpcError(error));

  const outcome = String(data ?? "");
  if (outcome === "approved" || outcome === "rejected") {
    // Terminal — the requester durably hears the outcome.
    await emitWorkflowDecidedNotification(instanceId);
  } else if (outcome === "step_approved") {
    // The next step's approvers durably hear a request awaits them.
    await emitWorkflowStepPendingNotifications(instanceId);
  }
  finish(ctx, noticeForOutcome(outcome));
}

/** Delegate an undecided slot through delegate_workflow_step_v1 (colleague
 *  addressed by email; the RPC resolves and answers without an account
 *  oracle). */
export async function delegateWorkflowStepAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase, userId } = await requireUser(ctx);

  const instanceId = String(formData.get("instanceId") ?? "").trim();
  if (!UUID_RX.test(instanceId)) finish(ctx, "invalid");
  const toEmail = String(formData.get("toEmail") ?? "").trim();
  if (!EMAIL_RX.test(toEmail)) finish(ctx, "invalid");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length > WORKFLOW_REASON_MAX) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "delegate_workflow_step_v1",
    {
      p_instance_id: instanceId,
      p_to_email: toEmail,
      p_reason: reason.length > 0 ? reason : null,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));

  const outcome = String(data ?? "");
  if (outcome === "delegated") {
    await emitWorkflowDelegatedNotification(instanceId, userId);
  }
  finish(ctx, noticeForOutcome(outcome));
}

/** Withdraw an own pending request through withdraw_workflow_instance_v1. */
export async function withdrawWorkflowInstanceAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const instanceId = String(formData.get("instanceId") ?? "").trim();
  if (!UUID_RX.test(instanceId)) finish(ctx, "invalid");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length > WORKFLOW_REASON_MAX) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "withdraw_workflow_instance_v1",
    {
      p_instance_id: instanceId,
      p_reason: reason.length > 0 ? reason : null,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, noticeForOutcome(String(data ?? "")));
}

/** Cancel a pending request (governance owner/admin) through
 *  cancel_workflow_instance_v1. */
export async function cancelWorkflowInstanceAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const instanceId = String(formData.get("instanceId") ?? "").trim();
  if (!UUID_RX.test(instanceId)) finish(ctx, "invalid");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length > WORKFLOW_REASON_MAX) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "cancel_workflow_instance_v1",
    {
      p_instance_id: instanceId,
      p_reason: reason.length > 0 ? reason : null,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));

  const outcome = String(data ?? "");
  if (outcome === "cancelled") {
    await emitWorkflowDecidedNotification(instanceId);
  }
  finish(ctx, noticeForOutcome(outcome));
}

/** Flip past-deadline active steps to the SAFE escalated state through
 *  mark_overdue_workflow_steps_v1. Marks + notifies; NEVER approves. */
export async function markOverdueWorkflowStepsAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  if (!UUID_RX.test(organizationId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "mark_overdue_workflow_steps_v1",
    { p_organization_id: organizationId },
  );
  if (error) finish(ctx, noticeForRpcError(error));

  const rows = (data ?? []) as { instance_id?: string }[];
  const escalatedIds = [
    ...new Set(
      rows
        .map((r) => String(r.instance_id ?? ""))
        .filter((id) => UUID_RX.test(id)),
    ),
  ];
  for (const id of escalatedIds) {
    await emitWorkflowEscalatedNotifications(id);
  }
  finish(ctx, escalatedIds.length > 0 ? "marked_overdue" : "no_overdue");
}
