"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import {
  ORG_DOCUMENT_COUNTERPARTY_MAX,
  ORG_DOCUMENT_COUNTERPARTY_REF_MAX,
  ORG_DOCUMENT_DESCRIPTION_MAX,
  ORG_DOCUMENT_EXTERNAL_REF_MAX,
  ORG_DOCUMENT_RETENTION_NOTE_MAX,
  ORG_DOCUMENT_TITLE_MAX,
  ORG_DOCUMENT_TITLE_MIN,
  isCorrespondenceSlug,
  isDocumentFileAbsentCode,
  isValidOrgDocumentClassification,
  isValidOrgDocumentTypeSlug,
  noticeForDocumentRpcOutcome,
  type DocumentEngineNotice,
} from "@/lib/documents/document-file-model";
import {
  emitDocumentAckNotification,
  emitWorkflowStepPendingNotifications,
} from "@/lib/notifications/event-emitters";

/**
 * Org document REGISTER write actions (Document & Evidence Engine v1).
 *
 * Every write is one of the gated SECURITY DEFINER RPCs — direct table
 * writes are REVOKEd. The acting organization is resolved SERVER-SIDE from
 * the active workspace (`requireEmployerCompany`) — an org id is never read
 * from the form — and the RPCs re-check owner/admin membership on top.
 *
 * NATIVE-NAV forms with honest `?docNotice=` outcomes (needs_migration
 * while the human-gated migration is unapplied — nothing fakes a save).
 *
 * INTERNAL ONLY: no email, no SMS, no push, no outbound anything — the only
 * notification is the durable in-app event store.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const LOCALE_RX = /^[a-z]{2}$/;

function readLocale(formData: FormData): string {
  const raw = String(formData.get("locale") ?? "lt");
  return LOCALE_RX.test(raw) ? raw : "lt";
}

const REVALIDATING_NOTICES: readonly DocumentEngineNotice[] = [
  "created",
  "archived",
  "revoked",
  "assigned",
  "updated",
  "submitted",
  "repaired_approved",
  "repaired_returned",
];

function finish(locale: string, notice: DocumentEngineNotice): never {
  if (REVALIDATING_NOTICES.includes(notice)) {
    revalidatePath("/", "layout");
  }
  redirect(`/${locale}/dashboard/documents?docNotice=${notice}#org-register`);
}

function noticeForRpcError(error: { code?: string }): DocumentEngineNotice {
  if (isDocumentFileAbsentCode(error.code)) return "needs_migration";
  if (error.code === "42501") return "not_allowed";
  return "error";
}

/**
 * Create a register entry for the ACTIVE organization.
 *
 * Calls `create_org_document_v2` (register delta, 20260817240000). Where
 * only train C is applied, v2 is absent and the action falls back to
 * `create_org_document_v1` — but ONLY when no v2-only field was supplied.
 * A supplied correspondence / object / retention value is NEVER silently
 * dropped: the action answers `needs_migration` and nothing is saved.
 */
export async function createOrgDocumentAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);

  const ctx = await requireEmployerCompany();
  if (!ctx.ok) finish(locale, "not_allowed");

  const typeSlug = String(formData.get("typeSlug") ?? "").trim();
  if (!isValidOrgDocumentTypeSlug(typeSlug)) finish(locale, "invalid");

  const title = String(formData.get("title") ?? "").trim();
  if (
    title.length < ORG_DOCUMENT_TITLE_MIN ||
    title.length > ORG_DOCUMENT_TITLE_MAX
  ) {
    finish(locale, "invalid");
  }

  const description = String(formData.get("description") ?? "").trim();
  if (description.length > ORG_DOCUMENT_DESCRIPTION_MAX) finish(locale, "invalid");

  const classification = String(formData.get("classification") ?? "standard");
  if (!isValidOrgDocumentClassification(classification)) finish(locale, "invalid");

  const validFrom = String(formData.get("validFrom") ?? "").trim();
  if (validFrom && !DATE_RX.test(validFrom)) finish(locale, "invalid");
  const expiresOn = String(formData.get("expiresOn") ?? "").trim();
  if (expiresOn && !DATE_RX.test(expiresOn)) finish(locale, "invalid");

  const externalRef = String(formData.get("externalRef") ?? "").trim();
  if (externalRef.length > ORG_DOCUMENT_EXTERNAL_REF_MAX) finish(locale, "invalid");

  const responsible = String(formData.get("responsibleProfileId") ?? "").trim();
  if (responsible && !UUID_RX.test(responsible)) finish(locale, "invalid");

  // ── Register delta fields ────────────────────────────────────────────
  const objectId = String(formData.get("objectId") ?? "").trim();
  if (objectId && !UUID_RX.test(objectId)) finish(locale, "invalid");

  const counterpartyName = String(formData.get("counterpartyName") ?? "").trim();
  if (counterpartyName.length > ORG_DOCUMENT_COUNTERPARTY_MAX) {
    finish(locale, "invalid");
  }
  const correspondenceDate = String(
    formData.get("correspondenceDate") ?? "",
  ).trim();
  if (correspondenceDate && !DATE_RX.test(correspondenceDate)) {
    finish(locale, "invalid");
  }
  const counterpartyReference = String(
    formData.get("counterpartyReference") ?? "",
  ).trim();
  if (counterpartyReference.length > ORG_DOCUMENT_COUNTERPARTY_REF_MAX) {
    finish(locale, "invalid");
  }
  // Direction is derived from the slug; correspondence facts are meaningless
  // on any other type. The RPC refuses them too — one contract, two fences.
  if (
    !isCorrespondenceSlug(typeSlug) &&
    (counterpartyName || correspondenceDate || counterpartyReference)
  ) {
    finish(locale, "invalid");
  }

  const retentionUntil = String(formData.get("retentionUntil") ?? "").trim();
  if (retentionUntil && !DATE_RX.test(retentionUntil)) finish(locale, "invalid");
  const retentionNote = String(formData.get("retentionNote") ?? "").trim();
  if (retentionNote.length > ORG_DOCUMENT_RETENTION_NOTE_MAX) {
    finish(locale, "invalid");
  }

  const usesDeltaFields = Boolean(
    objectId ||
      counterpartyName ||
      correspondenceDate ||
      counterpartyReference ||
      retentionUntil ||
      retentionNote,
  );

  const supabase = await createClient();
  const v2 = await asAny(supabase).rpc("create_org_document_v2", {
    p_organization_id: ctx.organizationId,
    p_document_type_slug: typeSlug,
    p_title: title,
    p_description: description,
    p_classification: classification,
    p_worker_id: "",
    p_project_id: "",
    p_valid_from: validFrom,
    p_expires_on: expiresOn,
    p_external_ref: externalRef,
    p_responsible_profile_id: responsible,
    p_object_id: objectId,
    p_counterparty_name: counterpartyName,
    p_correspondence_date: correspondenceDate,
    p_counterparty_reference: counterpartyReference,
    p_retention_until: retentionUntil,
    p_retention_note: retentionNote,
  });
  if (!v2.error) {
    finish(
      locale,
      noticeForDocumentRpcOutcome(String(v2.data ?? ""), "created", "created"),
    );
  }
  if (!isDocumentFileAbsentCode(v2.error.code)) {
    finish(locale, noticeForRpcError(v2.error));
  }
  // v2 is absent here. Falling back would DROP the delta fields, so it is
  // only honest when the operator supplied none of them.
  if (usesDeltaFields) finish(locale, "needs_migration");

  const { data, error } = await asAny(supabase).rpc("create_org_document_v1", {
    p_organization_id: ctx.organizationId,
    p_document_type_slug: typeSlug,
    p_title: title,
    p_description: description,
    p_classification: classification,
    p_worker_id: "",
    p_project_id: "",
    p_valid_from: validFrom,
    p_expires_on: expiresOn,
    p_external_ref: externalRef,
    p_responsible_profile_id: responsible,
  });
  if (error) finish(locale, noticeForRpcError(error));
  finish(locale, noticeForDocumentRpcOutcome(String(data ?? ""), "created", "created"));
}

/**
 * Record (or clear) the retention decision for one register entry — the
 * FIRST writer of the train C `retention_until` / `retention_note` columns.
 *
 * RECORD-KEEPING ONLY: nothing here, and nothing anywhere in this product,
 * deletes a document or a file when the date passes. Destructive retention
 * enforcement stays an owner-gated act performed outside the product.
 */
export async function setOrgDocumentRetentionAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const orgDocumentId = String(formData.get("orgDocumentId") ?? "").trim();
  if (!UUID_RX.test(orgDocumentId)) finish(locale, "invalid");

  const retentionUntil = String(formData.get("retentionUntil") ?? "").trim();
  if (retentionUntil && !DATE_RX.test(retentionUntil)) finish(locale, "invalid");
  const retentionNote = String(formData.get("retentionNote") ?? "").trim();
  if (retentionNote.length > ORG_DOCUMENT_RETENTION_NOTE_MAX) {
    finish(locale, "invalid");
  }

  const ctx = await requireEmployerCompany();
  if (!ctx.ok) finish(locale, "not_allowed");

  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc(
    "set_org_document_retention_v1",
    {
      p_org_document_id: orgDocumentId,
      p_retention_until: retentionUntil,
      p_retention_note: retentionNote,
    },
  );
  if (error) finish(locale, noticeForRpcError(error));
  finish(locale, noticeForDocumentRpcOutcome(String(data ?? ""), "updated", "updated"));
}

/**
 * Submit a register entry for OPTIONAL internal approval.
 *
 * The decision mechanism is the EXISTING Workflow & Approval Engine: this
 * action starts an instance through the engine's OWN
 * `start_workflow_instance_v1` (context 'generic_request') and then asks
 * the gated mirror command to reflect it. Where the organization has no
 * published definition for that context nothing is faked — the register
 * entry simply keeps no approval state.
 */
export async function submitOrgDocumentForApprovalAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const orgDocumentId = String(formData.get("orgDocumentId") ?? "").trim();
  if (!UUID_RX.test(orgDocumentId)) finish(locale, "invalid");
  const definitionId = String(formData.get("definitionId") ?? "").trim();
  if (!UUID_RX.test(definitionId)) finish(locale, "no_approval_definition");

  const ctx = await requireEmployerCompany();
  if (!ctx.ok) finish(locale, "not_allowed");

  const supabase = await createClient();
  // RLS-scoped read of the row this org may see; the title makes the
  // instance honest in the approver's queue.
  const rowRes = await asAny(supabase)
    .from("org_documents")
    .select("title, status, organization_id")
    .eq("id", orgDocumentId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (rowRes.error) finish(locale, noticeForRpcError(rowRes.error));
  if (!rowRes.data) finish(locale, "not_found");
  if (rowRes.data.status !== "active") finish(locale, "invalid_state");

  const title = `Document: ${String(rowRes.data.title).slice(0, 140)}`;
  const start = await asAny(supabase).rpc("start_workflow_instance_v1", {
    p_definition_id: definitionId,
    p_title: title,
    p_payload: { orgDocumentId },
    p_context_entity_id: orgDocumentId,
  });
  if (start.error) finish(locale, noticeForRpcError(start.error));
  const outcome = String(start.data ?? "");
  if (!UUID_RX.test(outcome)) {
    if (outcome === "not_published" || outcome === "no_approvers") {
      finish(locale, "no_approval_definition");
    }
    if (outcome === "already_pending") {
      const converge = await asAny(supabase).rpc(
        "submit_org_document_for_approval_v1",
        { p_org_document_id: orgDocumentId },
      );
      if (converge.error) finish(locale, noticeForRpcError(converge.error));
      finish(
        locale,
        noticeForDocumentRpcOutcome(
          String(converge.data ?? ""),
          "submitted",
          "submitted",
        ),
      );
    }
    finish(locale, "error");
  }

  const mirror = await asAny(supabase).rpc(
    "submit_org_document_for_approval_v1",
    { p_org_document_id: orgDocumentId },
  );
  if (mirror.error) finish(locale, noticeForRpcError(mirror.error));
  const mirrorOutcome = String(mirror.data ?? "");
  if (mirrorOutcome === "submitted") {
    // Durable in-app fact for the step-1 approvers — the ENGINE's own
    // notification type, emitted after the domain write succeeded.
    await emitWorkflowStepPendingNotifications(outcome);
  }
  finish(
    locale,
    noticeForDocumentRpcOutcome(mirrorOutcome, "submitted", "submitted"),
  );
}

async function transitionOrgDocument(
  formData: FormData,
  rpc: "archive_org_document_v1" | "revoke_org_document_v1",
  okOutcome: "archived" | "revoked",
): Promise<void> {
  const locale = readLocale(formData);
  const orgDocumentId = String(formData.get("orgDocumentId") ?? "").trim();
  if (!UUID_RX.test(orgDocumentId)) finish(locale, "invalid");

  const ctx = await requireEmployerCompany();
  if (!ctx.ok) finish(locale, "not_allowed");

  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc(rpc, {
    p_org_document_id: orgDocumentId,
  });
  if (error) finish(locale, noticeForRpcError(error));
  finish(
    locale,
    noticeForDocumentRpcOutcome(String(data ?? ""), okOutcome, okOutcome),
  );
}

/** Archive (active → archived). Files and history are kept. */
export async function archiveOrgDocumentAction(
  formData: FormData,
): Promise<void> {
  return transitionOrgDocument(formData, "archive_org_document_v1", "archived");
}

/** Revoke (→ revoked). Every version is KEPT — deletion stays owner-gated. */
export async function revokeOrgDocumentAction(
  formData: FormData,
): Promise<void> {
  return transitionOrgDocument(formData, "revoke_org_document_v1", "revoked");
}

/** Assign a version-bound acknowledgement of the CURRENT file version to
 *  one org member (or the linked worker). Re-assignment after a new version
 *  is an explicit action — acks never carry over. */
export async function assignDocumentAckAction(
  formData: FormData,
): Promise<void> {
  const locale = readLocale(formData);
  const documentFileId = String(formData.get("documentFileId") ?? "").trim();
  if (!UUID_RX.test(documentFileId)) finish(locale, "invalid");
  const assignee = String(formData.get("assigneeProfileId") ?? "").trim();
  if (!UUID_RX.test(assignee)) finish(locale, "invalid");
  const requiredBy = String(formData.get("requiredBy") ?? "").trim();
  if (requiredBy && !DATE_RX.test(requiredBy)) finish(locale, "invalid");

  const ctx = await requireEmployerCompany();
  if (!ctx.ok) finish(locale, "not_allowed");

  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc(
    "assign_document_acknowledgement_v1",
    {
      p_document_file_id: documentFileId,
      p_assignee_profile_id: assignee,
      p_required_by: requiredBy,
    },
  );
  if (error) finish(locale, noticeForRpcError(error));
  const outcome = String(data ?? "");

  if (outcome === "assigned") {
    // Resolve the new ack row (assigner may read it under RLS) and emit the
    // durable "you were asked to confirm" fact for the ASSIGNEE.
    const ackRes = await asAny(supabase)
      .from("document_acknowledgements")
      .select("id")
      .eq("document_file_id", documentFileId)
      .eq("assignee_profile_id", assignee)
      .maybeSingle();
    const ackId = (ackRes.data?.id as string | undefined) ?? null;
    if (ackId) {
      void emitDocumentAckNotification(ackId, "document_ack_assigned");
    }
  }
  finish(locale, noticeForDocumentRpcOutcome(outcome, "assigned", "assigned"));
}
