"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  FINANCE_COUNTERPARTY_MAX,
  FINANCE_COUNTERPARTY_MIN,
  FINANCE_NOTE_MAX,
  FINANCE_TITLE_MAX,
  FINANCE_TITLE_MIN,
  isMigrationMissingCode,
  isValidFinanceRecordStatus,
  isValidFinanceRecordType,
  parseAmountInputToCents,
} from "@/lib/finance/finance-model";

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
  | "updated"
  | "invalid"
  | "needs_migration"
  | "not_authorized"
  | "not_found"
  | "limit_reached"
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
  if (outcome === "not_allowed") return "not_authorized";
  if (outcome === "not_found") return "not_found";
  if (outcome === "record_limit_reached") return "limit_reached";
  return "invalid";
}

function finish(ctx: FormContext, notice: Notice): never {
  if (notice === "created" || notice === "updated") {
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
  return { title, counterparty, amountCents, dueDate, note };
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
    "create_finance_record_v1",
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
    "update_finance_record_v1",
    {
      p_record_id: recordId,
      p_title: fields.title,
      p_counterparty: fields.counterparty,
      p_amount_cents: String(fields.amountCents),
      p_due_date: fields.dueDate,
      p_note: fields.note,
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
