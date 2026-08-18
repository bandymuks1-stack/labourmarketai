"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  FINANCE_COUNTERPARTY_MAX,
  FINANCE_COUNTERPARTY_MIN,
  FINANCE_INVOICE_NUMBER_MAX,
  FINANCE_NOTE_MAX,
  FINANCE_TITLE_MAX,
  FINANCE_TITLE_MIN,
  financeApprovalContext,
  isMigrationMissingCode,
  isValidFinanceRecordStatus,
  isValidFinanceRecordType,
  parseAmountInputToCents,
} from "@/lib/finance/finance-model";
import { getFinanceRecordForApproval } from "@/lib/finance/finance";
import { emitWorkflowStepPendingNotifications } from "@/lib/notifications/event-emitters";

/**
 * Operational-finance write actions (control room PR I, capability gap map
 * §9).
 *
 * The ONLY write paths are the three gated SECURITY DEFINER RPCs the
 * SEPARATE, human-gated migration PR (I2) proposes:
 *
 *   - create_finance_record_v1(p_record_type, p_title, p_counterparty,
 *     p_amount_cents, p_status, p_due_date, p_project_id, p_company_id,
 *     p_note)
 *   - update_finance_record_v1(p_record_id, p_title, p_counterparty,
 *     p_amount_cents, p_due_date, p_note)
 *   - set_finance_record_status_v1(p_record_id, p_status)
 *
 * All three re-check authorization server-side (creator / admin / company
 * owner via owns_company; a project link additionally requires
 * can_manage_project), validate the honest status/type enums, bound every
 * length and the amount, stamp paid_at on 'paid' (and clear it on any other
 * status) and cap records per creator. Direct table writes are REVOKEd —
 * these actions never insert/update/delete a row themselves.
 *
 * Amounts travel as INTEGER CENTS in a decimal string ("12345") — the form
 * input is parsed by parseAmountInputToCents (pure integer math, two
 * decimals max, no floats anywhere).
 *
 * NATIVE-NAV forms: each action always redirects back to the finance page
 * with an honest `?notice=` outcome (created / updated / invalid /
 * needs_migration / not_authorized / not_found / limit_reached / error).
 * While the migration is unapplied the RPC is missing (42883 / PGRST202 /
 * 42P01) and the notice says so honestly — nothing pretends to have saved.
 *
 * NO MONEY MOVEMENT: recording an invoice or expense pays nobody, charges
 * nobody and contacts nobody — no payment provider, no email, no SMS, no
 * push, no Telegram, no webhook, no outbound call of any kind.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const LOCALE_RX = /^[a-z]{2}$/;

const TYPE_FILTERS = new Set(["invoice_issued", "invoice_received", "expense"]);
const STATUS_FILTERS = new Set([
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "cancelled",
  "overdue",
]);

type Notice =
  | "created"
  | "created_possible_duplicate"
  | "updated"
  | "invalid"
  | "needs_migration"
  | "not_authorized"
  | "not_found"
  | "limit_reached"
  | "approval_submitted"
  | "approval_approved"
  | "approval_rejected"
  | "approval_pending"
  | "approval_cleared"
  | "approval_none"
  | "no_template"
  | "no_approvers"
  | "error";

/** Rebuild the finance-page URL from VALIDATED parts only (never raw input). */
function financeUrl(
  locale: string,
  notice: Notice,
  type: string | null,
  status: string | null,
): string {
  const params = new URLSearchParams();
  if (type && TYPE_FILTERS.has(type)) params.set("type", type);
  if (status && STATUS_FILTERS.has(status)) params.set("status", status);
  params.set("notice", notice);
  return `/${locale}/dashboard/finance?${params.toString()}`;
}

type FormContext = {
  locale: string;
  type: string | null;
  status: string | null;
};

function readContext(formData: FormData): FormContext {
  const rawLocale = String(formData.get("locale") ?? "lt");
  return {
    locale: LOCALE_RX.test(rawLocale) ? rawLocale : "lt",
    type: String(formData.get("typeFilter") ?? "") || null,
    status: String(formData.get("statusFilter") ?? "") || null,
  };
}

function noticeForRpcError(error: { code?: string }): Notice {
  if (isMigrationMissingCode(error.code)) return "needs_migration";
  if (error.code === "42501") return "not_authorized";
  return "error";
}

function noticeForOutcome(outcome: string, okNotice: Notice): Notice {
  if (outcome === "created" || outcome === "updated") return okNotice;
  // Duplicate detection (finance invoice upgrades v1): the record IS
  // created; the notice is an honest warning, never a block.
  if (outcome === "created_possible_duplicate") {
    return "created_possible_duplicate";
  }
  if (outcome === "not_allowed") return "not_authorized";
  if (outcome === "not_found") return "not_found";
  if (outcome === "record_limit_reached") return "limit_reached";
  return "invalid";
}

const SUCCESS_NOTICES: readonly Notice[] = [
  "created",
  "created_possible_duplicate",
  "updated",
  "approval_submitted",
  "approval_approved",
  "approval_rejected",
  "approval_cleared",
];

function finish(ctx: FormContext, notice: Notice): never {
  if ((SUCCESS_NOTICES as readonly string[]).includes(notice)) {
    revalidatePath("/", "layout");
  }
  redirect(financeUrl(ctx.locale, notice, ctx.type, ctx.status));
}

/** Shared bounded-field validation for create + update forms. Returns the
 *  cleaned values, or null when any field is invalid. */
function readBoundedFields(formData: FormData): {
  title: string;
  counterparty: string;
  amountCents: number;
  dueDate: string;
  note: string;
  invoiceNumber: string;
  /** Empty string = no VAT recorded (the RPC treats blank as null). */
  vatCents: string;
  orgDocumentId: string;
} | null {
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < FINANCE_TITLE_MIN || title.length > FINANCE_TITLE_MAX) {
    return null;
  }
  const counterparty = String(formData.get("counterparty") ?? "").trim();
  if (
    counterparty.length < FINANCE_COUNTERPARTY_MIN ||
    counterparty.length > FINANCE_COUNTERPARTY_MAX
  ) {
    return null;
  }
  const amountCents = parseAmountInputToCents(
    String(formData.get("amount") ?? ""),
  );
  if (amountCents === null) return null;
  const dueDate = String(formData.get("dueDate") ?? "").trim();
  if (dueDate && !DATE_RX.test(dueDate)) return null;
  const note = String(formData.get("note") ?? "").trim();
  if (note.length > FINANCE_NOTE_MAX) return null;
  const invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim();
  if (invoiceNumber.length > FINANCE_INVOICE_NUMBER_MAX) return null;
  const vatInput = String(formData.get("vatAmount") ?? "").trim();
  let vatCents = "";
  if (vatInput) {
    const parsed = parseAmountInputToCents(vatInput);
    if (parsed === null) return null;
    vatCents = String(parsed);
  }
  const orgDocumentId = String(formData.get("orgDocumentId") ?? "").trim();
  if (orgDocumentId && !UUID_RX.test(orgDocumentId)) return null;
  return {
    title,
    counterparty,
    amountCents,
    dueDate,
    note,
    invoiceNumber,
    vatCents,
    orgDocumentId,
  };
}

/** Record an invoice/expense through create_finance_record_v1 (RPC-only). */
export async function createFinanceRecordAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");

  const recordType = String(formData.get("recordType") ?? "");
  if (!isValidFinanceRecordType(recordType)) finish(ctx, "invalid");

  const fields = readBoundedFields(formData);
  if (!fields) finish(ctx, "invalid");

  const initialStatus = String(formData.get("initialStatus") ?? "draft");
  if (!isValidFinanceRecordStatus(initialStatus)) finish(ctx, "invalid");

  const projectId = String(formData.get("projectId") ?? "").trim();
  if (projectId && !UUID_RX.test(projectId)) finish(ctx, "invalid");

  // The company link is an opt-in checkbox over the caller's OWN company id
  // (RLS-read, and the RPC re-checks owns_company server-side regardless).
  const companyId = String(formData.get("companyId") ?? "").trim();
  const linkCompany = formData.get("linkCompany") === "on";
  if (companyId && !UUID_RX.test(companyId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "create_finance_record_v2",
    {
      p_record_type: recordType,
      p_title: fields.title,
      p_counterparty: fields.counterparty,
      p_amount_cents: String(fields.amountCents),
      p_status: initialStatus,
      p_due_date: fields.dueDate,
      p_project_id: projectId,
      p_company_id: linkCompany ? companyId : "",
      p_note: fields.note,
      p_invoice_number: fields.invoiceNumber,
      p_vat_amount_cents: fields.vatCents,
      p_org_document_id: fields.orgDocumentId,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, noticeForOutcome(String(data ?? ""), "created"));
}

/** Edit bounded record fields through update_finance_record_v1. */
export async function updateFinanceRecordAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");

  const recordId = String(formData.get("recordId") ?? "").trim();
  if (!UUID_RX.test(recordId)) finish(ctx, "invalid");

  const fields = readBoundedFields(formData);
  if (!fields) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "update_finance_record_v2",
    {
      p_record_id: recordId,
      p_title: fields.title,
      p_counterparty: fields.counterparty,
      p_amount_cents: String(fields.amountCents),
      p_due_date: fields.dueDate,
      p_note: fields.note,
      p_invoice_number: fields.invoiceNumber,
      p_vat_amount_cents: fields.vatCents,
      p_org_document_id: fields.orgDocumentId,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, noticeForOutcome(String(data ?? ""), "updated"));
}

/** Move a record to another honest status through
 *  set_finance_record_status_v1 (paid_at is stamped/cleared server-side). */
export async function setFinanceRecordStatusAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");

  const recordId = String(formData.get("recordId") ?? "").trim();
  if (!UUID_RX.test(recordId)) finish(ctx, "invalid");
  const status = String(formData.get("status") ?? "").trim();
  if (!isValidFinanceRecordStatus(status)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "set_finance_record_status_v1",
    {
      p_record_id: recordId,
      p_status: status,
    },
  );
  if (error) finish(ctx, noticeForRpcError(error));
  finish(ctx, noticeForOutcome(String(data ?? ""), "updated"));
}

/**
 * Submit a record for approval THROUGH THE ENGINE (the timesheets pattern —
 * nothing re-implemented): find the bridged organization's ACTIVE, PUBLISHED
 * template for this record's context ('expense'/'invoice'), start an
 * instance via the engine's own start RPC (context id = record id), then
 * flip the record's MIRROR to pending. If flipping fails after the instance
 * started, the instance is withdrawn again (compensation). Only company-
 * linked records can route: without an organization there is no approver
 * set, and the action stops honestly BEFORE any write.
 */
export async function submitFinanceApprovalAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");

  const recordId = String(formData.get("recordId") ?? "").trim();
  if (!UUID_RX.test(recordId)) finish(ctx, "invalid");

  // The record (RLS-scoped read via the ONE finance read module; the RPCs
  // re-check everything anyway).
  const recRes = await getFinanceRecordForApproval(recordId);
  if (recRes.status === "not-authed") finish(ctx, "not_authorized");
  if (recRes.status === "needs-migration") finish(ctx, "needs_migration");
  if (recRes.status === "not-found") finish(ctx, "not_found");
  const record = recRes.record;
  if (record.approvalStatus === "pending") finish(ctx, "approval_pending");
  if (!record.companyId) finish(ctx, "no_template");

  // The organization bridged from the company link (RLS-scoped read).
  const orgRes = await asAny(supabase)
    .from("organizations")
    .select("id")
    .eq("legacy_company_id", record.companyId)
    .limit(1)
    .maybeSingle();
  if (orgRes.error || !orgRes.data) finish(ctx, "no_template");
  const organizationId = String((orgRes.data as { id: string }).id);

  // The org's ACTIVE template with a PUBLISHED version for this context —
  // the honest-degradation seam. No template → no submit, clearly said.
  const context = financeApprovalContext(record.recordType);
  const defRes = await asAny(supabase)
    .from("workflow_definitions")
    .select("id, workflow_definition_versions(id, published_at)")
    .eq("organization_id", organizationId)
    .eq("context_entity_type", context)
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

  // 1. Start the approval instance THROUGH THE ENGINE (idempotent on the
  //    context entity).
  const title = record.title.slice(0, 160);
  // (record.recordType/title come from the RLS-scoped read above.)
  const startRes = await asAny(supabase).rpc("start_workflow_instance_v1", {
    p_definition_id: published!.id,
    p_title: title.length >= 3 ? title : `Record ${recordId.slice(0, 8)}`,
    p_payload: { recordId, recordType: record.recordType },
    p_context_entity_id: recordId,
  });
  if (startRes.error) finish(ctx, noticeForRpcError(startRes.error));
  const startOutcome = String(startRes.data ?? "");
  const instanceId = UUID_RX.test(startOutcome) ? startOutcome : null;
  if (!instanceId && startOutcome !== "already_pending") {
    if (startOutcome === "no_approvers") finish(ctx, "no_approvers");
    if (startOutcome === "not_published") finish(ctx, "no_template");
    finish(ctx, "error");
  }

  // 2. Flip the MIRROR to pending.
  const submitRes = await asAny(supabase).rpc(
    "submit_finance_record_approval_v1",
    { p_record_id: recordId },
  );
  const submitOutcome = submitRes.error ? null : String(submitRes.data ?? "");
  if (submitOutcome !== "submitted" && submitOutcome !== "already_pending") {
    // Compensation: withdraw the instance this call just started so no
    // orphaned approval request lingers. (A pre-existing already_pending
    // instance is left alone: it belongs to a prior submit.)
    if (instanceId) {
      await asAny(supabase)
        .rpc("withdraw_workflow_instance_v1", {
          p_instance_id: instanceId,
          p_reason: "finance approval submit failed",
        })
        .catch(() => undefined);
    }
    if (submitRes.error) finish(ctx, noticeForRpcError(submitRes.error));
    finish(ctx, "error");
  }

  // 3. The step-1 approvers durably hear a request awaits them (EXISTING
  //    engine notification type; fire-and-forget).
  if (instanceId) {
    await emitWorkflowStepPendingNotifications(instanceId);
  }
  finish(ctx, "approval_submitted");
}

/** Copy the engine's terminal outcome onto the record's mirror (the RPC
 *  never decides anything — see the migration header). */
export async function syncFinanceApprovalAction(
  formData: FormData,
): Promise<void> {
  const ctx = readContext(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) finish(ctx, "not_authorized");

  const recordId = String(formData.get("recordId") ?? "").trim();
  if (!UUID_RX.test(recordId)) finish(ctx, "invalid");

  const { data, error } = await asAny(supabase).rpc(
    "sync_finance_record_approval_v1",
    { p_record_id: recordId },
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
