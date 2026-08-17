"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  PROCUREMENT_DESCRIPTION_MAX,
  PROCUREMENT_DESCRIPTION_MIN,
  PROCUREMENT_OFFER_NOTE_MAX,
  PROCUREMENT_ORDER_REFERENCE_MAX,
  PROCUREMENT_QUANTITY_MAX,
  PROCUREMENT_SUPPLIER_MAX,
  PROCUREMENT_SUPPLIER_MIN,
  isProcurementMigrationMissingCode,
  procurementNoticeForOutcome,
  type ProcurementNotice,
} from "@/lib/procurement/procurement-model";
import { parseAmountInputToCents } from "@/lib/finance/finance-model";
import { emitWorkflowStepPendingNotifications } from "@/lib/notifications/event-emitters";

/**
 * Procurement write actions (functional completion train V2).
 *
 * The ONLY procurement write paths are the nine gated SECURITY DEFINER
 * commands the human-gated migration 20260817221000_procurement_v1 proposes:
 *   create_procurement_inquiry_v1 / update_procurement_inquiry_v1 /
 *   submit_procurement_inquiry_v1 / add_procurement_offer_v1 /
 *   select_procurement_offer_v1 / set_procurement_status_v1 /
 *   set_procurement_finance_record_v1 / submit_procurement_approval_v1 /
 *   sync_procurement_approval_v1
 * All re-check authorization server-side; direct table writes are REVOKEd —
 * these actions never insert/update/delete a row themselves.
 *
 * ENGINE INTEGRATION, NOT RE-IMPLEMENTATION: requesting approval starts an
 * instance through the EXISTING Workflow & Approval Engine's own
 * `start_workflow_instance_v1` (context_entity_type='procurement',
 * context_entity_id = inquiry id). Decisions happen in the engine's
 * approvals UI; `sync_procurement_approval_v1` only copies the terminal
 * outcome back. If the org has no published procurement template the action
 * stops honestly (`no_template`) BEFORE any write. Approval is OPTIONAL —
 * nothing is hardcoded, no thresholds, no auto-routing.
 *
 * NATIVE-NAV forms: each action redirects back to the finance page's
 * procurement section with an honest `?proc=` outcome. While a migration is
 * unapplied the RPC is missing and the notice says so honestly.
 *
 * INTERNAL ONLY: recording an offer contacts no supplier; selecting an
 * offer orders nothing — no email, no SMS, no webhook, no outbound call of
 * any kind. Durable in-app notifications ride the EXISTING engine types.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE_RX = /^[a-z]{2}$/;

type FormContext = { locale: string };

function readContext(formData: FormData): FormContext {
  const rawLocale = String(formData.get("locale") ?? "lt");
  return { locale: LOCALE_RX.test(rawLocale) ? rawLocale : "lt" };
}

const SUCCESS_NOTICES: readonly ProcurementNotice[] = [
  "created",
  "updated",
  "submitted",
  "offer_added",
  "decided",
  "linked",
  "unlinked",
  "cancelled",
  "approval_submitted",
  "approval_approved",
  "approval_rejected",
  "approval_cleared",
];

function finish(ctx: FormContext, notice: ProcurementNotice): never {
  if ((SUCCESS_NOTICES as readonly string[]).includes(notice)) {
    revalidatePath("/", "layout");
  }
  redirect(`/${ctx.locale}/dashboard/finance?proc=${notice}#procurement`);
}

function noticeForRpcError(error: { code?: string }): ProcurementNotice {
  if (isProcurementMigrationMissingCode(error.code)) return "needs_migration";
  if (error.code === "42501") return "not_authorized";
  return "error";
}

async function requireUser(
  ctx: FormContext,
): Promise<{ supabase: SupabaseClient }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");
  return { supabase };
}

/** Shared bounded-field validation for create + update forms. */
function readInquiryFields(formData: FormData): {
  description: string;
  quantity: string;
  budgetCents: string;
} | null {
  const description = String(formData.get("itemDescription") ?? "").trim();
  if (
    description.length < PROCUREMENT_DESCRIPTION_MIN ||
    description.length > PROCUREMENT_DESCRIPTION_MAX
  ) {
    return null;
  }
  const quantity = String(formData.get("quantity") ?? "").trim();
  if (quantity.length > PROCUREMENT_QUANTITY_MAX) return null;
  const budgetInput = String(formData.get("estimatedBudget") ?? "").trim();
  let budgetCents = "";
  if (budgetInput) {
    const parsed = parseAmountInputToCents(budgetInput);
    if (parsed === null) return null;
    budgetCents = String(parsed);
  }
  return { description, quantity, budgetCents };
}

/** File a purchase inquiry through create_procurement_inquiry_v1. */
export async function createProcurementInquiryAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  if (!UUID_RX.test(organizationId)) finish(ctx, "invalid");
  const fields = readInquiryFields(formData);
  if (!fields) finish(ctx, "invalid");
  const projectId = String(formData.get("projectId") ?? "").trim();
  if (projectId && !UUID_RX.test(projectId)) finish(ctx, "invalid");
  const objectId = String(formData.get("objectId") ?? "").trim();
  if (objectId && !UUID_RX.test(objectId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "create_procurement_inquiry_v1",
    {
      p_organization_id: organizationId,
      p_item_description: fields.description,
      p_quantity: fields.quantity,
      p_estimated_budget_cents: fields.budgetCents,
      p_project_id: projectId,
      p_object_id: objectId,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  const outcome = String(data ?? "");
  finish(
    ctx,
    UUID_RX.test(outcome) ? "created" : procurementNoticeForOutcome(outcome),
  );
}

/** Edit a draft's bounded fields through update_procurement_inquiry_v1. */
export async function updateProcurementInquiryAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  if (!UUID_RX.test(inquiryId)) finish(ctx, "invalid");
  const fields = readInquiryFields(formData);
  if (!fields) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "update_procurement_inquiry_v1",
    {
      p_inquiry_id: inquiryId,
      p_item_description: fields.description,
      p_quantity: fields.quantity,
      p_estimated_budget_cents: fields.budgetCents,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, procurementNoticeForOutcome(String(data ?? "")));
}

/** Hand a draft to the org (draft → submitted). */
export async function submitProcurementInquiryAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  if (!UUID_RX.test(inquiryId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "submit_procurement_inquiry_v1",
    { p_inquiry_id: inquiryId },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, procurementNoticeForOutcome(String(data ?? "")));
}

/** Record a supplier offer manually (contacts nobody). */
export async function addProcurementOfferAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  if (!UUID_RX.test(inquiryId)) finish(ctx, "invalid");
  const supplier = String(formData.get("supplierName") ?? "").trim();
  if (
    supplier.length < PROCUREMENT_SUPPLIER_MIN ||
    supplier.length > PROCUREMENT_SUPPLIER_MAX
  ) {
    finish(ctx, "invalid");
  }
  const amountCents = parseAmountInputToCents(
    String(formData.get("amount") ?? ""),
  );
  if (amountCents === null) finish(ctx, "invalid");
  const note = String(formData.get("note") ?? "").trim();
  if (note.length > PROCUREMENT_OFFER_NOTE_MAX) finish(ctx, "invalid");
  const orgDocumentId = String(formData.get("orgDocumentId") ?? "").trim();
  if (orgDocumentId && !UUID_RX.test(orgDocumentId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "add_procurement_offer_v1",
    {
      p_inquiry_id: inquiryId,
      p_supplier_name: supplier,
      p_amount_cents: String(amountCents),
      p_note: note,
      p_org_document_id: orgDocumentId,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  const outcome = String(data ?? "");
  finish(
    ctx,
    UUID_RX.test(outcome)
      ? "offer_added"
      : procurementNoticeForOutcome(outcome),
  );
}

/** THE decision: pick one recorded offer (submitted → decided). */
export async function selectProcurementOfferAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  if (!UUID_RX.test(inquiryId)) finish(ctx, "invalid");
  const offerId = String(formData.get("offerId") ?? "").trim();
  if (!UUID_RX.test(offerId)) finish(ctx, "invalid");
  const orderReference = String(formData.get("orderReference") ?? "").trim();
  if (orderReference.length > PROCUREMENT_ORDER_REFERENCE_MAX) {
    finish(ctx, "invalid");
  }

  const { data, error } = await asAny(supabase).rpc(
    "select_procurement_offer_v1",
    {
      p_inquiry_id: inquiryId,
      p_offer_id: offerId,
      p_order_reference: orderReference,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, procurementNoticeForOutcome(String(data ?? "")));
}

/** Guarded transitions: cancel / mark ordered / close. */
export async function setProcurementStatusAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  if (!UUID_RX.test(inquiryId)) finish(ctx, "invalid");
  const status = String(formData.get("status") ?? "").trim();
  if (!["cancelled", "ordered", "closed"].includes(status)) {
    finish(ctx, "invalid");
  }
  const orderReference = String(formData.get("orderReference") ?? "").trim();
  if (orderReference.length > PROCUREMENT_ORDER_REFERENCE_MAX) {
    finish(ctx, "invalid");
  }

  const { data, error } = await asAny(supabase).rpc(
    "set_procurement_status_v1",
    {
      p_inquiry_id: inquiryId,
      p_status: status,
      p_order_reference: orderReference,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  const outcome = String(data ?? "");
  finish(
    ctx,
    outcome === "updated" && status === "cancelled"
      ? "cancelled"
      : procurementNoticeForOutcome(outcome),
  );
}

/** Point a decided/ordered/closed inquiry at the settling finance record. */
export async function setProcurementFinanceRecordAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  if (!UUID_RX.test(inquiryId)) finish(ctx, "invalid");
  // Empty = unlink (the RPC treats blank as null).
  const financeRecordId = String(formData.get("financeRecordId") ?? "").trim();
  if (financeRecordId && !UUID_RX.test(financeRecordId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "set_procurement_finance_record_v1",
    {
      p_inquiry_id: inquiryId,
      p_finance_record_id: financeRecordId,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, procurementNoticeForOutcome(String(data ?? "")));
}

/**
 * Request approval THROUGH THE ENGINE (the timesheets pattern): start an
 * instance via the engine's own start RPC, then flip the inquiry's MIRROR
 * to pending; withdraw the instance again if the flip fails (compensation).
 * Stops honestly BEFORE any write when no published template exists.
 */
export async function submitProcurementApprovalAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  if (!UUID_RX.test(inquiryId)) finish(ctx, "invalid");

  // The inquiry (RLS-scoped read; the RPCs re-check everything anyway).
  const inqRes = await asAny(supabase)
    .from("procurement_inquiries")
    .select("id, organization_id, item_description, status, approval_status")
    .eq("id", inquiryId)
    .maybeSingle();
  if (inqRes.error) finish(ctx, noticeForRpcError(inqRes.error));
  if (!inqRes.data) finish(ctx, "not_found");
  const inquiry = inqRes.data as {
    organization_id: string;
    item_description: string;
    status: string;
    approval_status: string | null;
  };
  if (inquiry.status !== "submitted") finish(ctx, "not_editable");
  if (inquiry.approval_status === "pending") finish(ctx, "approval_pending");

  // The org's ACTIVE procurement template with a PUBLISHED version.
  const defRes = await asAny(supabase)
    .from("workflow_definitions")
    .select("id, workflow_definition_versions(id, published_at)")
    .eq("organization_id", inquiry.organization_id)
    .eq("context_entity_type", "procurement")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(5);
  if (defRes.error) finish(ctx, noticeForRpcError(defRes.error));
  type DefRow = {
    id: string;
    workflow_definition_versions:
      | { id: string; published_at: string | null }[]
      | null;
  };
  const published = ((defRes.data ?? []) as DefRow[]).find((d) =>
    (d.workflow_definition_versions ?? []).some((v) => v.published_at !== null),
  );
  if (!published) finish(ctx, "no_template");

  const title = inquiry.item_description.slice(0, 160);
  const startRes = await asAny(supabase).rpc("start_workflow_instance_v1", {
    p_definition_id: published!.id,
    p_title: title.length >= 3 ? title : `Inquiry ${inquiryId.slice(0, 8)}`,
    p_payload: { inquiryId },
    p_context_entity_id: inquiryId,
  });
  if (startRes.error) finish(ctx, noticeForRpcError(startRes.error));
  const startOutcome = String(startRes.data ?? "");
  const instanceId = UUID_RX.test(startOutcome) ? startOutcome : null;
  if (!instanceId && startOutcome !== "already_pending") {
    if (startOutcome === "no_approvers") finish(ctx, "no_approvers");
    if (startOutcome === "not_published") finish(ctx, "no_template");
    finish(ctx, "error");
  }

  const submitRes = await asAny(supabase).rpc(
    "submit_procurement_approval_v1",
    { p_inquiry_id: inquiryId },
  );
  const submitOutcome = submitRes.error ? null : String(submitRes.data ?? "");
  if (submitOutcome !== "submitted" && submitOutcome !== "already_pending") {
    if (instanceId) {
      await asAny(supabase)
        .rpc("withdraw_workflow_instance_v1", {
          p_instance_id: instanceId,
          p_reason: "procurement approval submit failed",
        })
        .catch(() => undefined);
    }
    if (submitRes.error) finish(ctx, noticeForRpcError(submitRes.error));
    finish(ctx, "error");
  }

  if (instanceId) {
    await emitWorkflowStepPendingNotifications(instanceId);
  }
  finish(ctx, "approval_submitted");
}

/** Copy the engine's terminal outcome onto the mirror (never decides). */
export async function syncProcurementApprovalAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);
  const { supabase } = await requireUser(ctx);

  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  if (!UUID_RX.test(inquiryId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "sync_procurement_approval_v1",
    { p_inquiry_id: inquiryId },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  const outcome = String(data ?? "");
  if (outcome === "approved") finish(ctx, "approval_approved");
  if (outcome === "rejected") finish(ctx, "approval_rejected");
  if (outcome === "cleared") finish(ctx, "approval_cleared");
  if (outcome === "still_pending") finish(ctx, "approval_pending");
  if (outcome === "no_instance") finish(ctx, "approval_none");
  if (outcome === "not_found") finish(ctx, "not_found");
  finish(ctx, "error");
}
