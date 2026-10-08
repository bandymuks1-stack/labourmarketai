"use server";

import "server-only";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isMigrationMissingCode } from "@/lib/finance/finance-model";
import { isKnownCurrency, parseMajorToMinor } from "@/lib/finance/invoice-currency";
import { parseSelectionKeys } from "@/lib/finance/project-invoice-model";
import { isTaxTreatment, validateTax } from "@/lib/finance/invoice-tax-model";

/**
 * Project-to-invoice write actions. The ONLY write paths are the SECURITY
 * DEFINER commands of 20261008150000_project_invoice_lifecycle_v1 (direct DML
 * is revoked). Each action validates the shape, calls ONE command, and
 * redirects back with an honest `?notice=<status>` - the status string is the
 * database's own answer, never a guess. Nothing here contacts anyone, moves
 * money or uploads a file: LabourMarket records and calculates; payment
 * happens elsewhere.
 *
 * TAX: treatment / rate / note come from the issuing user's form and are
 * passed through as typed. There is no default treatment, no country table and
 * no auto-selection; the database refuses to issue while any line has none.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const LOCALE_RX = /^[a-z]{2}$/;
const STATUS_RX = /^[a-z_]{1,48}$/;

function str(fd: FormData, key: string, max = 500): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function uuid(fd: FormData, key: string): string | null {
  const v = str(fd, key, 64);
  return UUID_RX.test(v) ? v : null;
}

function date(fd: FormData, key: string): string | null {
  const v = str(fd, key, 16);
  return DATE_RX.test(v) ? v : null;
}

function localeOf(fd: FormData): string {
  const v = str(fd, "locale", 8);
  return LOCALE_RX.test(v) ? v : "en";
}

function back(locale: string, projectId: string, invoiceId: string | null, notice: string): never {
  const base = `/${locale}/dashboard/projects/${projectId}/invoicing${invoiceId ? `/${invoiceId}` : ""}`;
  redirect(`${base}?notice=${encodeURIComponent(STATUS_RX.test(notice) ? notice : "error")}`);
}

type Rpc = { data: unknown; error: { code?: string } | null };

function statusOf(r: Rpc): string {
  if (r.error) return isMigrationMissingCode(r.error.code) || r.error.code === "PGRST202" ? "needs_migration" : "error";
  const d = r.data as { status?: unknown } | string | null;
  if (typeof d === "string") return d;
  return typeof d?.status === "string" ? d.status : "error";
}

async function call(name: string, args: Record<string, unknown>): Promise<{ status: string; data: Record<string, unknown> }> {
  const supabase = await createClient();
  const r = (await asAny(supabase).rpc(name, args)) as Rpc;
  if (r.error) console.error(`[project-invoice] ${name} failed:`, r.error.code);
  const data = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : {};
  return { status: statusOf(r), data };
}

function revalidate(locale: string, projectId: string) {
  revalidatePath(`/${locale}/dashboard/projects/${projectId}/invoicing`);
  revalidatePath(`/${locale}/dashboard/projects/${projectId}/operations`);
}

/** Agreed commercial basis (rate term). */
export async function addRateTermAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  const projectId = uuid(fd, "project_id");
  if (!projectId) redirect(`/${locale}/dashboard`);
  const basis = str(fd, "basis_type", 16);
  // Currency-neutral: the code is validated against the ISO 4217 list, the amount against that currency's own
  // minor-unit exponent (JPY 0 decimals, KWD 3). The database re-validates the code SHAPE.
  const currency = str(fd, "currency", 3).toUpperCase();
  const cents = isKnownCurrency(currency) ? parseMajorToMinor(str(fd, "rate", 24), currency) : null;
  const from = date(fd, "valid_from");
  const toRaw = str(fd, "valid_to", 16);
  const to = toRaw ? date(fd, "valid_to") : null;
  if (!from || (toRaw && !to) || cents == null) back(locale, projectId, null, "invalid");
  const { status } = await call("add_project_rate_term_v1", {
    p_project_id: projectId,
    p_basis_type: basis,
    p_unit: str(fd, "unit", 60) || null,
    p_rate_cents: cents,
    p_currency: currency,
    p_label: str(fd, "label", 160) || null,
    p_role_label: str(fd, "role_label", 120) || null,
    p_valid_from: from,
    p_valid_to: to,
    p_org_document_id: null,
    p_note: str(fd, "note", 1000) || null,
    p_issuer_org: uuid(fd, "issuer_org_id"),
  });
  revalidate(locale, projectId);
  back(locale, projectId, null, status === "created" ? "term_created" : status);
}

export async function endRateTermAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  const projectId = uuid(fd, "project_id");
  const termId = uuid(fd, "term_id");
  const to = date(fd, "valid_to");
  if (!projectId) redirect(`/${locale}/dashboard`);
  if (!termId || !to) back(locale, projectId, null, "invalid");
  const { status } = await call("end_project_rate_term_v1", { p_term_id: termId, p_valid_to: to });
  revalidate(locale, projectId);
  back(locale, projectId, null, status === "ended" ? "term_ended" : status);
}

export async function createPeriodAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  const projectId = uuid(fd, "project_id");
  if (!projectId) redirect(`/${locale}/dashboard`);
  const start = date(fd, "period_start");
  const end = date(fd, "period_end");
  if (!start || !end) back(locale, projectId, null, "invalid");
  const { status } = await call("create_billing_period_v1", {
    p_project_id: projectId,
    p_start: start,
    p_end: end,
    p_issuer_org: uuid(fd, "issuer_org_id"),
  });
  revalidate(locale, projectId);
  back(locale, projectId, null, status === "created" ? "period_created" : status);
}

export async function createInvoiceDraftAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  const projectId = uuid(fd, "project_id");
  const periodId = uuid(fd, "period_id");
  if (!projectId) redirect(`/${locale}/dashboard`);
  if (!periodId) back(locale, projectId, null, "invalid");
  const due = str(fd, "due_date", 16);
  // EXPLICIT SELECTION: the issuer ticks the approved work evidence to bill. `explicit=1` means the list
  // (possibly empty) is the selection; the database refuses rows that are not billable.
  const picks = fd.getAll("pick").filter((v): v is string => typeof v === "string").slice(0, 5000);
  const selection = str(fd, "explicit", 2) === "1" ? parseSelectionKeys(picks) : null;
  const { status, data } = await call("create_invoice_draft_from_period_v1", {
    p_period_id: periodId,
    p_customer_name: null,
    p_client_org_id: null,
    p_customer_vat_id: null,
    p_customer_address: null,
    p_due_date: DATE_RX.test(due) ? due : null,
    p_note: str(fd, "note", 1000) || null,
    p_replaces_id: uuid(fd, "replaces_id"),
    p_recipient_id: uuid(fd, "recipient_id"),
    p_selection: selection,
  });
  revalidate(locale, projectId);
  const id = typeof data.invoice_id === "string" && UUID_RX.test(data.invoice_id) ? data.invoice_id : null;
  if (status === "created" && id) back(locale, projectId, id, "draft_created");
  back(locale, projectId, null, status);
}

/** Create or update an entry of the ISSUER's contact book. Not a LabourMarket account. */
export async function saveRecipientAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  const projectId = uuid(fd, "project_id");
  const orgId = uuid(fd, "organization_id");
  if (!projectId) redirect(`/${locale}/dashboard`);
  if (!orgId) back(locale, projectId, null, "invalid");
  const invoiceId = uuid(fd, "invoice_id");
  const country = str(fd, "country", 2).toUpperCase();
  const { status, data } = await call("save_invoice_recipient_v1", {
    p_issuer_org: orgId,
    p_recipient_id: uuid(fd, "recipient_id"),
    p_legal_name: str(fd, "legal_name", 160),
    p_address: str(fd, "address", 400) || null,
    p_country: country || null,
    p_tax_id: str(fd, "tax_id", 60) || null,
    p_contact_name: str(fd, "contact_name", 160) || null,
    p_contact_email: str(fd, "contact_email", 200) || null,
    p_reference: str(fd, "reference", 200) || null,
    p_linked_org: uuid(fd, "linked_org_id"),
    p_linked_profile: null,
  });
  revalidate(locale, projectId);
  // creating the contact from an open draft attaches it to that draft
  const newId = typeof data.id === "string" && UUID_RX.test(data.id) ? data.id : null;
  if (status === "saved" && invoiceId && newId) {
    const attach = await call("set_invoice_recipient_v1", { p_invoice_id: invoiceId, p_recipient_id: newId });
    back(locale, projectId, invoiceId, attach.status === "updated" ? "recipient_saved" : attach.status);
  }
  back(locale, projectId, invoiceId, status === "saved" ? "recipient_saved" : status);
}

export async function archiveRecipientAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  const projectId = uuid(fd, "project_id");
  const recipientId = uuid(fd, "recipient_id");
  if (!projectId) redirect(`/${locale}/dashboard`);
  if (!recipientId) back(locale, projectId, null, "invalid");
  const { status } = await call("archive_invoice_recipient_v1", { p_recipient_id: recipientId });
  revalidate(locale, projectId);
  back(locale, projectId, null, status === "archived" ? "recipient_archived" : status);
}

export async function setInvoiceRecipientAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  const projectId = uuid(fd, "project_id");
  const invoiceId = uuid(fd, "invoice_id");
  const recipientId = uuid(fd, "recipient_id");
  if (!projectId) redirect(`/${locale}/dashboard`);
  if (!invoiceId || !recipientId) back(locale, projectId, invoiceId, "invalid");
  const { status } = await call("set_invoice_recipient_v1", { p_invoice_id: invoiceId, p_recipient_id: recipientId });
  revalidate(locale, projectId);
  back(locale, projectId, invoiceId, status === "updated" ? "recipient_saved" : status);
}

/** Numbering: prefix / separator / padding / optional year-based reset, per document type of the ISSUING org. */
export async function configureSeriesAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  const projectId = uuid(fd, "project_id");
  const orgId = uuid(fd, "organization_id");
  if (!projectId) redirect(`/${locale}/dashboard`);
  if (!orgId) back(locale, projectId, null, "invalid");
  const pad = Number(str(fd, "pad", 3));
  const { status } = await call("configure_invoice_series_v1", {
    p_org: orgId,
    p_document_type: str(fd, "document_type", 16),
    p_prefix: str(fd, "prefix", 20),
    p_separator: str(fd, "separator", 3),
    p_pad: Number.isInteger(pad) ? pad : 0,
    p_year_based: str(fd, "year_based", 4) === "yes",
  });
  revalidate(locale, projectId);
  back(locale, projectId, null, status === "saved" ? "series_saved" : status);
}

export async function addBasisLineAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  const projectId = uuid(fd, "project_id");
  const invoiceId = uuid(fd, "invoice_id");
  const termId = uuid(fd, "term_id");
  if (!projectId) redirect(`/${locale}/dashboard`);
  if (!invoiceId || !termId) back(locale, projectId, null, "invalid");
  const q = Number(str(fd, "quantity", 12) || "1");
  const { status } = await call("add_invoice_basis_line_v1", {
    p_invoice_id: invoiceId,
    p_rate_term_id: termId,
    p_quantity: Number.isFinite(q) ? q : 1,
    p_description: str(fd, "description", 300) || null,
  });
  revalidate(locale, projectId);
  back(locale, projectId, invoiceId, status === "added" ? "line_added" : status);
}

/** Set tax on ONE line (`line_id`) or on every unset line (`scope=unset`) / all lines (`scope=all`). */
export async function setTaxAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  const projectId = uuid(fd, "project_id");
  const invoiceId = uuid(fd, "invoice_id");
  if (!projectId) redirect(`/${locale}/dashboard`);
  if (!invoiceId) back(locale, projectId, null, "invalid");
  const treatment = str(fd, "treatment", 32);
  const rateRaw = str(fd, "rate_percent", 12).replace(",", ".");
  const rate = rateRaw === "" ? null : Number(rateRaw);
  const check = validateTax({ treatment, ratePercent: rate });
  if (!isTaxTreatment(treatment) || !check.ok) back(locale, projectId, invoiceId, "invalid_tax");
  const note = str(fd, "tax_note", 500) || null;
  const lineId = uuid(fd, "line_id");
  const { status } = lineId
    ? await call("set_invoice_line_tax_v1", {
        p_line_id: lineId,
        p_treatment: treatment,
        p_rate_percent: check.ok ? check.ratePercent : null,
        p_note: note,
      })
    : await call("set_invoice_tax_v1", {
        p_invoice_id: invoiceId,
        p_treatment: treatment,
        p_rate_percent: check.ok ? check.ratePercent : null,
        p_note: note,
        p_only_unset: str(fd, "scope", 8) !== "all",
      });
  revalidate(locale, projectId);
  back(locale, projectId, invoiceId, status === "updated" ? "tax_saved" : status);
}

export async function discardDraftAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  const projectId = uuid(fd, "project_id");
  const invoiceId = uuid(fd, "invoice_id");
  if (!projectId) redirect(`/${locale}/dashboard`);
  if (!invoiceId) back(locale, projectId, null, "invalid");
  const { status } = await call("discard_invoice_draft_v1", { p_invoice_id: invoiceId });
  revalidate(locale, projectId);
  back(locale, projectId, null, status === "discarded" ? "draft_discarded" : status);
}

/** Issue: the user must tick the explicit tax confirmation - it is passed through, never defaulted. */
export async function issueInvoiceAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  const projectId = uuid(fd, "project_id");
  const invoiceId = uuid(fd, "invoice_id");
  if (!projectId) redirect(`/${locale}/dashboard`);
  if (!invoiceId) back(locale, projectId, null, "invalid");
  const confirmed = str(fd, "tax_confirmed", 8) === "yes";
  const { status } = await call("issue_invoice_v1", { p_invoice_id: invoiceId, p_tax_confirmed: confirmed });
  revalidate(locale, projectId);
  back(locale, projectId, invoiceId, status === "issued" ? "invoice_issued" : status);
}

/**
 * CORRECTION = an accounting/document lifecycle action of the AUTHORIZED ISSUER. It issues a full credit note
 * linked to the original (reason, reference, actor and time stored) and never edits the original. It does not
 * depend on, wait for or ask the client; nothing here is an invoice acceptance or approval of any kind.
 */
export async function correctInvoiceAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  const projectId = uuid(fd, "project_id");
  const invoiceId = uuid(fd, "invoice_id");
  if (!projectId) redirect(`/${locale}/dashboard`);
  if (!invoiceId) back(locale, projectId, null, "invalid");
  const { status, data } = await call("correct_invoice_v1", {
    p_invoice_id: invoiceId,
    p_reason: str(fd, "reason", 500),
    p_reference: str(fd, "reference", 200) || null,
    p_lines: null, // pilot UI = full credit of what remains; the RPC also accepts [{line_id, quantity?, net_cents?}]
  });
  revalidate(locale, projectId);
  const cn = typeof data.credit_note_id === "string" && UUID_RX.test(data.credit_note_id) ? data.credit_note_id : null;
  if (status === "corrected" && cn) back(locale, projectId, cn, "corrected");
  back(locale, projectId, invoiceId, status);
}

/** Save an organization tax PRESET - a form pre-fill only; it never decides a line. */
export async function saveTaxPresetAction(fd: FormData): Promise<void> {
  const locale = localeOf(fd);
  const projectId = uuid(fd, "project_id");
  const orgId = uuid(fd, "organization_id");
  if (!projectId) redirect(`/${locale}/dashboard`);
  if (!orgId) back(locale, projectId, null, "invalid");
  const treatment = str(fd, "treatment", 32);
  const rateRaw = str(fd, "rate_percent", 12).replace(",", ".");
  const rate = rateRaw === "" ? null : Number(rateRaw);
  const check = validateTax({ treatment, ratePercent: rate });
  if (!check.ok) back(locale, projectId, null, "invalid_tax");
  const { status } = await call("save_org_tax_preset_v1", {
    p_org_id: orgId,
    p_label: str(fd, "label", 80),
    p_treatment: treatment,
    p_rate_percent: check.ratePercent,
    p_note_text: str(fd, "note_text", 500) || null,
    p_active: true,
  });
  revalidate(locale, projectId);
  back(locale, projectId, null, status === "saved" ? "preset_saved" : status);
}
