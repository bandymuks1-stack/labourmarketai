"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
import {
  ORG_DOCUMENT_DESCRIPTION_MAX,
  ORG_DOCUMENT_TITLE_MAX,
  ORG_DOCUMENT_TITLE_MIN,
  isDocumentFileAbsentCode,
  isValidOrgDocumentClassification,
  isValidOrgDocumentTypeSlug,
  noticeForDocumentRpcOutcome,
  type DocumentEngineNotice,
} from "@/lib/documents/document-file-model";
import { emitDocumentAckNotification } from "@/lib/notifications/event-emitters";

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

function finish(locale: string, notice: DocumentEngineNotice): never {
  if (
    notice === "created" ||
    notice === "archived" ||
    notice === "revoked" ||
    notice === "assigned"
  ) {
    revalidatePath("/", "layout");
  }
  redirect(`/${locale}/dashboard/documents?docNotice=${notice}`);
}

function noticeForRpcError(error: { code?: string }): DocumentEngineNotice {
  if (isDocumentFileAbsentCode(error.code)) return "needs_migration";
  if (error.code === "42501") return "not_allowed";
  return "error";
}

/** Create a register entry for the ACTIVE organization. */
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
  if (externalRef.length > 200) finish(locale, "invalid");

  const responsible = String(formData.get("responsibleProfileId") ?? "").trim();
  if (responsible && !UUID_RX.test(responsible)) finish(locale, "invalid");

  const supabase = await createClient();
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
