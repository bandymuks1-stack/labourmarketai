"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import {
  AGREEMENT_AMENDMENT_DESCRIPTION_MAX,
  AGREEMENT_COUNTERPARTY_MAX,
  AGREEMENT_EXTERNAL_REF_MAX,
  AGREEMENT_MANUAL_STATUS_TARGETS,
  AGREEMENT_ORG_NUMBER_MAX,
  AGREEMENT_SUCCESS_NOTICES,
  AGREEMENT_TITLE_MAX,
  AGREEMENT_TITLE_MIN,
  isAgreementMigrationMissingCode,
  isValidAgreementType,
  noticeForAgreementOutcome,
  type AgreementNotice,
} from "@/lib/agreements/agreements-model";
import { emitWorkflowStepPendingNotifications } from "@/lib/notifications/event-emitters";

/**
 * Agreement & Rights Engine write actions (v1).
 *
 * The ONLY write paths are the eight gated SECURITY DEFINER commands the
 * human-gated migration 20260817200000_agreements_v1 proposes:
 *
 *   create_agreement_v1 / update_agreement_v1 / set_agreement_status_v1 /
 *   submit_agreement_for_approval_v1 / sync_agreement_approval_v1 /
 *   add_agreement_amendment_v1 / attach_agreement_document_v1 /
 *   attach_agreement_signature_evidence_v1
 *
 * All eight re-check authorization server-side (org governance owner/admin
 * via org_owner_admin_v1), validate every enum and bound, and answer with
 * outcome strings. Direct table writes are REVOKEd — these actions never
 * insert/update/delete a row themselves. The acting organization is
 * resolved SERVER-SIDE from the active workspace — never from the form.
 *
 * LEGAL DOCTRINE: nothing here signs anything or claims legal effect.
 * Internal approval rides the EXISTING Workflow & Approval Engine — the
 * submit action first starts an instance through the engine's own
 * start_workflow_instance_v1, then flips the status MIRROR through the
 * gated submit command (which re-verifies the pending instance exists).
 *
 * NATIVE-NAV forms: each action always redirects back to the commercial
 * page with an honest `?agr=` outcome — feedback is the navigation itself
 * (the established bookings/tasks/finance pattern). While the migration is
 * unapplied the RPC is missing (42883 / PGRST202 / 42P01) and the notice
 * says so honestly — nothing pretends to have saved.
 *
 * INTERNAL ONLY: nothing here sends anything to anyone — no email, no SMS,
 * no push, no webhook, no outbound call. The only durable notification is
 * the workflow engine's own step-pending event, emitted through the
 * existing notification_events spine after a successful engine start.
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

function finish(locale: string, notice: AgreementNotice): never {
  if ((AGREEMENT_SUCCESS_NOTICES as readonly string[]).includes(notice)) {
    revalidatePath("/", "layout");
  }
  redirect(`/${locale}/dashboard/commercial?agr=${notice}#agreements`);
}

function noticeForRpcError(error: { code?: string }): AgreementNotice {
  if (isAgreementMigrationMissingCode(error.code)) return "needs_migration";
  if (error.code === "42501") return "not_allowed";
  return "error";
}

function optionalDate(formData: FormData, name: string): string | null | "invalid" {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw.length === 0) return null;
  if (!DATE_RX.test(raw)) return "invalid";
  return raw;
}

/** Load the agreement's org (RLS-scoped) and require it to be the ACTIVE
 *  workspace organization. The RPC re-checks authority on top. */
async function requireOwnOrgAgreement(
  supabase: SupabaseClient,
  agreementId: string,
  organizationId: string,
  locale: string,
): Promise<void> {
  const res = await asAny(supabase)
    .from("agreements")
    .select("id, organization_id")
    .eq("id", agreementId)
    .maybeSingle();
  if (res.error) {
    finish(
      locale,
      isAgreementMigrationMissingCode(res.error.code)
        ? "needs_migration"
        : "error",
    );
  }
  if (!res.data || res.data.organization_id !== organizationId) {
    finish(locale, "not_found");
  }
}

/** Register an agreement record for the ACTIVE organization. */
export async function createAgreementAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const ctx = await requireEmployerCompany();
  if (!ctx.ok) finish(locale, "not_allowed");

  const type = String(formData.get("agreementType") ?? "").trim();
  if (!isValidAgreementType(type)) finish(locale, "invalid");
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < AGREEMENT_TITLE_MIN || title.length > AGREEMENT_TITLE_MAX) {
    finish(locale, "invalid");
  }
  const counterparty = String(formData.get("counterpartyName") ?? "").trim();
  if (counterparty.length === 0 || counterparty.length > AGREEMENT_COUNTERPARTY_MAX) {
    finish(locale, "invalid");
  }
  const orgNumber = String(formData.get("counterpartyOrgNumber") ?? "").trim();
  if (orgNumber.length > AGREEMENT_ORG_NUMBER_MAX) finish(locale, "invalid");
  const externalRef = String(formData.get("externalRef") ?? "").trim();
  if (externalRef.length > AGREEMENT_EXTERNAL_REF_MAX) finish(locale, "invalid");

  const workerId = String(formData.get("workerId") ?? "").trim();
  if (workerId.length > 0 && !UUID_RX.test(workerId)) finish(locale, "invalid");
  if (workerId.length > 0 && type !== "employment_related") {
    finish(locale, "invalid");
  }
  const responsible = String(formData.get("responsibleProfileId") ?? "").trim();
  if (responsible.length > 0 && !UUID_RX.test(responsible)) {
    finish(locale, "invalid");
  }
  const from = optionalDate(formData, "effectiveFrom");
  if (from === "invalid") finish(locale, "invalid");
  const to = optionalDate(formData, "effectiveTo");
  if (to === "invalid") finish(locale, "invalid");

  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc("create_agreement_v1", {
    p_organization_id: ctx.organizationId,
    p_agreement_type: type,
    p_title: title,
    p_counterparty_name: counterparty,
    p_counterparty_org_number: orgNumber.length > 0 ? orgNumber : null,
    p_worker_id: workerId.length > 0 ? workerId : null,
    p_responsible_profile_id: responsible.length > 0 ? responsible : null,
    p_effective_from: from,
    p_effective_to: to,
    p_external_ref: externalRef.length > 0 ? externalRef : null,
  });
  if (error) finish(locale, noticeForRpcError(error));
  finish(locale, noticeForAgreementOutcome(String(data ?? "")));
}

/** Bounded edits while the record is not terminal. */
export async function updateAgreementAction(formData: FormData): Promise<void> {
  const locale = readLocale(formData);
  const ctx = await requireEmployerCompany();
  if (!ctx.ok) finish(locale, "not_allowed");

  const agreementId = String(formData.get("agreementId") ?? "").trim();
  if (!UUID_RX.test(agreementId)) finish(locale, "invalid");

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < AGREEMENT_TITLE_MIN || title.length > AGREEMENT_TITLE_MAX) {
    finish(locale, "invalid");
  }
  const counterparty = String(formData.get("counterpartyName") ?? "").trim();
  if (counterparty.length === 0 || counterparty.length > AGREEMENT_COUNTERPARTY_MAX) {
    finish(locale, "invalid");
  }
  const orgNumber = String(formData.get("counterpartyOrgNumber") ?? "").trim();
  if (orgNumber.length > AGREEMENT_ORG_NUMBER_MAX) finish(locale, "invalid");
  const externalRef = String(formData.get("externalRef") ?? "").trim();
  if (externalRef.length > AGREEMENT_EXTERNAL_REF_MAX) finish(locale, "invalid");
  const responsible = String(formData.get("responsibleProfileId") ?? "").trim();
  if (responsible.length > 0 && !UUID_RX.test(responsible)) {
    finish(locale, "invalid");
  }
  const from = optionalDate(formData, "effectiveFrom");
  if (from === "invalid") finish(locale, "invalid");
  const to = optionalDate(formData, "effectiveTo");
  if (to === "invalid") finish(locale, "invalid");

  const supabase = await createClient();
  await requireOwnOrgAgreement(supabase, agreementId, ctx.organizationId, locale);

  const { data, error } = await asAny(supabase).rpc("update_agreement_v1", {
    p_agreement_id: agreementId,
    p_title: title,
    p_counterparty_name: counterparty,
    p_counterparty_org_number: orgNumber.length > 0 ? orgNumber : null,
    p_responsible_profile_id: responsible.length > 0 ? responsible : null,
    p_effective_from: from,
    p_effective_to: to,
    p_external_ref: externalRef.length > 0 ? externalRef : null,
  });
  if (error) finish(locale, noticeForRpcError(error));
  finish(locale, noticeForAgreementOutcome(String(data ?? "")));
}

/** Manual record-state transition (honest vocabulary only). */
export async function setAgreementStatusAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const ctx = await requireEmployerCompany();
  if (!ctx.ok) finish(locale, "not_allowed");

  const agreementId = String(formData.get("agreementId") ?? "").trim();
  if (!UUID_RX.test(agreementId)) finish(locale, "invalid");
  const status = String(formData.get("status") ?? "").trim();
  if (!(AGREEMENT_MANUAL_STATUS_TARGETS as readonly string[]).includes(status)) {
    finish(locale, "invalid");
  }

  const supabase = await createClient();
  await requireOwnOrgAgreement(supabase, agreementId, ctx.organizationId, locale);

  const { data, error } = await asAny(supabase).rpc("set_agreement_status_v1", {
    p_agreement_id: agreementId,
    p_status: status,
  });
  if (error) finish(locale, noticeForRpcError(error));
  finish(locale, noticeForAgreementOutcome(String(data ?? "")));
}

/**
 * Submit for OPTIONAL internal approval: start a workflow instance through
 * the engine's own RPC (context 'agreement'), then flip the status mirror
 * through the gated submit command. If the org has no published agreement
 * workflow the record honestly stays 'draft' — no approval is faked.
 */
export async function submitAgreementForApprovalAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const ctx = await requireEmployerCompany();
  if (!ctx.ok) finish(locale, "not_allowed");

  const agreementId = String(formData.get("agreementId") ?? "").trim();
  if (!UUID_RX.test(agreementId)) finish(locale, "invalid");
  const definitionId = String(formData.get("definitionId") ?? "").trim();
  if (!UUID_RX.test(definitionId)) finish(locale, "no_approval_definition");

  const supabase = await createClient();
  await requireOwnOrgAgreement(supabase, agreementId, ctx.organizationId, locale);

  // Load the row title for an honest instance title (RLS-scoped read).
  const rowRes = await asAny(supabase)
    .from("agreements")
    .select("title, status")
    .eq("id", agreementId)
    .maybeSingle();
  if (rowRes.error || !rowRes.data) finish(locale, "not_found");
  if (rowRes.data.status !== "draft") finish(locale, "invalid_transition");

  // 1. Start the engine instance (the engine re-checks the definition's
  //    org, publication state and approver resolution).
  const title = `Agreement: ${String(rowRes.data.title).slice(0, 140)}`;
  const start = await asAny(supabase).rpc("start_workflow_instance_v1", {
    p_definition_id: definitionId,
    p_title: title,
    p_payload: { agreementId },
    p_context_entity_id: agreementId,
  });
  if (start.error) finish(locale, noticeForRpcError(start.error));
  const outcome = String(start.data ?? "");
  if (!UUID_RX.test(outcome)) {
    // Honest degradation: not_published / no_approvers / not_found …
    if (outcome === "not_published" || outcome === "no_approvers") {
      finish(locale, "no_approval_definition");
    }
    if (outcome === "already_pending") {
      // A pending instance already exists — converge the mirror.
      const mirror = await asAny(supabase).rpc(
        "submit_agreement_for_approval_v1",
        { p_agreement_id: agreementId },
      );
      if (mirror.error) finish(locale, noticeForRpcError(mirror.error));
      finish(locale, noticeForAgreementOutcome(String(mirror.data ?? "")));
    }
    finish(locale, "error");
  }

  // 2. Flip the mirror (the command re-verifies the pending instance).
  const mirror = await asAny(supabase).rpc("submit_agreement_for_approval_v1", {
    p_agreement_id: agreementId,
  });
  if (mirror.error) finish(locale, noticeForRpcError(mirror.error));
  const mirrorOutcome = String(mirror.data ?? "");
  if (mirrorOutcome === "submitted") {
    // Durable in-app fact for the step-1 approvers — the engine's own
    // notification type, after the domain write succeeded.
    await emitWorkflowStepPendingNotifications(outcome);
  }
  finish(locale, noticeForAgreementOutcome(mirrorOutcome));
}

/** Append an amendment record (history, never an edit). */
export async function addAgreementAmendmentAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const ctx = await requireEmployerCompany();
  if (!ctx.ok) finish(locale, "not_allowed");

  const agreementId = String(formData.get("agreementId") ?? "").trim();
  if (!UUID_RX.test(agreementId)) finish(locale, "invalid");
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < AGREEMENT_TITLE_MIN || title.length > AGREEMENT_TITLE_MAX) {
    finish(locale, "invalid");
  }
  const description = String(formData.get("description") ?? "").trim();
  if (description.length > AGREEMENT_AMENDMENT_DESCRIPTION_MAX) {
    finish(locale, "invalid");
  }
  const documentId = String(formData.get("documentId") ?? "").trim();
  if (documentId.length > 0 && !UUID_RX.test(documentId)) {
    finish(locale, "invalid");
  }
  const effectiveDate = optionalDate(formData, "effectiveDate");
  if (effectiveDate === "invalid") finish(locale, "invalid");

  const supabase = await createClient();
  await requireOwnOrgAgreement(supabase, agreementId, ctx.organizationId, locale);

  const { data, error } = await asAny(supabase).rpc(
    "add_agreement_amendment_v1",
    {
      p_agreement_id: agreementId,
      p_title: title,
      p_description: description.length > 0 ? description : null,
      p_document_id: documentId.length > 0 ? documentId : null,
      p_effective_date: effectiveDate,
    },
  );
  if (error) finish(locale, noticeForRpcError(error));
  finish(locale, noticeForAgreementOutcome(String(data ?? "")));
}

/** Point the base record at its text in the document engine. */
export async function attachAgreementDocumentAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const ctx = await requireEmployerCompany();
  if (!ctx.ok) finish(locale, "not_allowed");

  const agreementId = String(formData.get("agreementId") ?? "").trim();
  if (!UUID_RX.test(agreementId)) finish(locale, "invalid");
  const orgDocumentId = String(formData.get("orgDocumentId") ?? "").trim();
  if (!UUID_RX.test(orgDocumentId)) finish(locale, "invalid");

  const supabase = await createClient();
  await requireOwnOrgAgreement(supabase, agreementId, ctx.organizationId, locale);

  const { data, error } = await asAny(supabase).rpc(
    "attach_agreement_document_v1",
    {
      p_agreement_id: agreementId,
      p_org_document_id: orgDocumentId,
    },
  );
  if (error) finish(locale, noticeForRpcError(error));
  finish(locale, noticeForAgreementOutcome(String(data ?? "")));
}

/**
 * Attach signature EVIDENCE: a registered file version said to evidence a
 * signature made OUTSIDE the platform. Records evidence; claims nothing
 * about legal validity.
 */
export async function attachAgreementSignatureEvidenceAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const ctx = await requireEmployerCompany();
  if (!ctx.ok) finish(locale, "not_allowed");

  const agreementId = String(formData.get("agreementId") ?? "").trim();
  if (!UUID_RX.test(agreementId)) finish(locale, "invalid");
  const documentFileId = String(formData.get("documentFileId") ?? "").trim();
  if (!UUID_RX.test(documentFileId)) finish(locale, "invalid");

  const supabase = await createClient();
  await requireOwnOrgAgreement(supabase, agreementId, ctx.organizationId, locale);

  const { data, error } = await asAny(supabase).rpc(
    "attach_agreement_signature_evidence_v1",
    {
      p_agreement_id: agreementId,
      p_document_file_id: documentFileId,
    },
  );
  if (error) finish(locale, noticeForRpcError(error));
  finish(locale, noticeForAgreementOutcome(String(data ?? "")));
}
