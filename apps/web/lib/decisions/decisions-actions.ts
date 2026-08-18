"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import {
  DECISION_SUCCESS_NOTICES,
  isDecisionMigrationMissingCode,
  noticeForDecisionOutcome,
  type DecisionNotice,
} from "@/lib/decisions/decisions-model";

/**
 * Management Decisions write actions (v1).
 *
 * The ONLY write paths into this module are the seven gated SECURITY
 * DEFINER commands the human-gated migration
 * 20260817232000_management_decisions_v1 proposes:
 *
 *   create_management_decision_v1 / update_management_decision_v1 /
 *   submit_management_decision_v1 / sync_management_decision_v1 /
 *   record_management_decision_result_v1 / attach_decision_document_v1 /
 *   link_decision_task_v1
 *
 * APPROVAL RIDES THE ENGINE. The submit action first starts a real instance
 * through the ENGINE'S OWN `start_workflow_instance_v1` and only then flips
 * the status MIRROR through the gated submit command, which re-verifies that
 * a real pending instance exists. The vote itself is the engine's step
 * (approval_mode 'all' = unanimous, 'any' = first decision carries) and is
 * cast on the approvals section — there is no decide action here, no ballot,
 * no tally.
 *
 * FOLLOW-UP TASKS are real `work_tasks` rows created through the EXISTING
 * task actions; `linkDecisionTaskAction` only stores the pointer.
 *
 * NATIVE-NAV forms: each action always redirects back to the network page
 * with an honest `?dec=` outcome.
 *
 * INTERNAL ONLY: nothing here sends anything to anyone. No AI.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE_RX = /^[a-z]{2}$/;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

function readLocale(formData: FormData): string {
  const raw = String(formData.get("locale") ?? "lt");
  return LOCALE_RX.test(raw) ? raw : "lt";
}

function finish(locale: string, notice: DecisionNotice): never {
  if ((DECISION_SUCCESS_NOTICES as readonly string[]).includes(notice)) {
    revalidatePath("/", "layout");
  }
  redirect(`/${locale}/dashboard/network?dec=${notice}#decisions`);
}

function noticeForRpcError(error: { code?: string }): DecisionNotice {
  if (isDecisionMigrationMissingCode(error.code)) return "needs_migration";
  if (error.code === "42501") return "not_authorized";
  return "error";
}

function optionalDate(formData: FormData, name: string): string | null | "invalid" {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw.length === 0) return null;
  if (!DATE_RX.test(raw)) return "invalid";
  return raw;
}

async function callRpc(
  locale: string,
  name: string,
  args: Record<string, unknown>,
): Promise<never> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc(name, args);
  if (error) finish(locale, noticeForRpcError(error));
  finish(locale, noticeForDecisionOutcome(String(data ?? "")));
}

/** Org owner/admin opens the decision record. */
export async function createManagementDecisionAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const org = await requireEmployerCompany();
  if (!org.ok) finish(locale, "not_authorized");

  const title = String(formData.get("title") ?? "").trim();
  const agenda = String(formData.get("agenda") ?? "").trim();
  const responsible = String(formData.get("responsibleEmail") ?? "").trim();
  if (responsible.length > 320) finish(locale, "invalid");
  const deadline = optionalDate(formData, "deadline");
  if (deadline === "invalid") finish(locale, "invalid");

  await callRpc(locale, "create_management_decision_v1", {
    p_organization_id: org.organizationId,
    p_title: title,
    p_agenda: agenda,
    p_responsible_email: responsible.length > 0 ? responsible : null,
    p_deadline: deadline,
  });
}

/** Org owner/admin edits it while it is still a draft. */
export async function updateManagementDecisionAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const decisionId = String(formData.get("decisionId") ?? "").trim();
  if (!UUID_RX.test(decisionId)) finish(locale, "invalid");
  const title = String(formData.get("title") ?? "").trim();
  const agenda = String(formData.get("agenda") ?? "").trim();
  const responsible = String(formData.get("responsibleEmail") ?? "").trim();
  if (responsible.length > 320) finish(locale, "invalid");
  const deadline = optionalDate(formData, "deadline");
  if (deadline === "invalid") finish(locale, "invalid");

  await callRpc(locale, "update_management_decision_v1", {
    p_decision_id: decisionId,
    p_title: title.length > 0 ? title : null,
    p_agenda: agenda.length > 0 ? agenda : null,
    p_responsible_email: responsible.length > 0 ? responsible : null,
    p_deadline: deadline,
  });
}

/**
 * Puts the decision to the approval chain. Two steps, in this order:
 *   1. the ENGINE'S OWN start_workflow_instance_v1 creates the real
 *      instance against a PUBLISHED 'management_decision' definition;
 *   2. the gated submit command flips the mirror — and refuses unless that
 *      instance genuinely exists and is pending.
 * If step 1 does not return an instance id, nothing is mirrored and the
 * honest engine outcome is reported instead.
 */
export async function submitManagementDecisionAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const decisionId = String(formData.get("decisionId") ?? "").trim();
  const definitionId = String(formData.get("definitionId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!UUID_RX.test(decisionId) || !UUID_RX.test(definitionId)) {
    finish(locale, "invalid");
  }

  const supabase = await createClient();
  const started = await asAny(supabase).rpc("start_workflow_instance_v1", {
    p_definition_id: definitionId,
    p_title: title.length >= 3 ? title : "Management decision",
    p_payload: {},
    p_context_entity_id: decisionId,
  });
  if (started.error) finish(locale, noticeForRpcError(started.error));
  const outcome = String(started.data ?? "");
  // The engine returns the new instance id on success, an outcome string
  // otherwise. Anything that is not an id means no instance was created.
  if (!UUID_RX.test(outcome)) finish(locale, "no_instance");

  await callRpc(locale, "submit_management_decision_v1", {
    p_decision_id: decisionId,
  });
}

/** Records WHAT was decided — only after the engine actually approved it. */
export async function recordDecisionResultAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const decisionId = String(formData.get("decisionId") ?? "").trim();
  if (!UUID_RX.test(decisionId)) finish(locale, "invalid");
  const result = String(formData.get("decisionResult") ?? "").trim();
  if (result.length === 0) finish(locale, "invalid");

  await callRpc(locale, "record_management_decision_result_v1", {
    p_decision_id: decisionId,
    p_result: result,
  });
}

/** Links an EXISTING same-org register document (agenda, minutes, ...). */
export async function attachDecisionDocumentAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const decisionId = String(formData.get("decisionId") ?? "").trim();
  const documentId = String(formData.get("orgDocumentId") ?? "").trim();
  if (!UUID_RX.test(decisionId) || !UUID_RX.test(documentId)) {
    finish(locale, "invalid");
  }

  await callRpc(locale, "attach_decision_document_v1", {
    p_decision_id: decisionId,
    p_org_document_id: documentId,
  });
}

/** Links a REAL work_tasks row the caller already created via the task RPCs. */
export async function linkDecisionTaskAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const decisionId = String(formData.get("decisionId") ?? "").trim();
  const taskId = String(formData.get("workTaskId") ?? "").trim();
  if (!UUID_RX.test(decisionId) || !UUID_RX.test(taskId)) finish(locale, "invalid");

  await callRpc(locale, "link_decision_task_v1", {
    p_decision_id: decisionId,
    p_work_task_id: taskId,
  });
}
