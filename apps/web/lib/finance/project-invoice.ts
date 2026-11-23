import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { isMigrationMissingCode } from "@/lib/finance/finance-model";
import type { TaxPreset, TaxTreatment } from "@/lib/finance/invoice-tax-model";
import { isTaxTreatment } from "@/lib/finance/invoice-tax-model";
import type {
  BasisType,
  ChainDocument,
  BillingPeriod,
  CurrencyTotal,
  InvoiceRecipient,
  RecipientSnapshot,
  SeriesConfig,
  EvidenceClass,
  InvoiceHeader,
  InvoiceKind,
  InvoiceLine,
  InvoiceLineSource,
  InvoiceView,
  PeriodChange,
  PeriodPreviewRow,
  RateTerm,
} from "@/lib/finance/project-invoice-model";
import {
  isBasisType,
  isEvidenceClass,
  toInt,
  toNum,
} from "@/lib/finance/project-invoice-model";

/**
 * Project-to-invoice READ layer. Every read is the caller's own RLS-scoped
 * client (no service role): rate terms and periods are visible to the
 * project's managers and the issuer's finance authority; invoices to their
 * creator / issuer finance authority and - for NON-draft rows only - to the
 * client organization's authorized representative; line sources (worker ids,
 * entry ids) to the issuer side only.
 *
 * Until the owner-gated migration is applied the tables are missing and every
 * reader reports `{ kind: "needs-migration" }` - nothing is faked.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type Read<T> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" };

const TERM_COLS =
  "id, project_id, organization_id, basis_type, unit, rate_cents, currency, label, role_label, valid_from, valid_to, agreed_at, note";
const PERIOD_COLS = "id, project_id, organization_id, period_start, period_end, status, locked_at";
const INVOICE_COLS =
  "id, title, counterparty_name, currency, status, invoice_kind, invoice_number, issued_at, replaces_id, correction_reason, correction_reference, corrected_by, corrected_at, credited_at, credited_by_id, due_date, paid_at, billing_period_id, supersedes_id, issuer_org_id, client_org_id, customer_vat_id, customer_address, tax_rounding, recipient_id, recipient_snapshot, number_series, number_year, number_seq, net_total_cents, tax_total_cents, gross_total_cents, tax_breakdown, note, project_id, created_at";
const LINE_COLS =
  "id, invoice_id, line_no, basis_type, description, rate_term_id, unit, quantity, unit_price_cents, net_cents, currency, evidence_class, qty_client_accepted, confirmed_at, tax_treatment, tax_rate_percent, tax_note, tax_cents, gross_cents, credits_line_id";

type Row = Record<string, unknown>;

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function mapTerm(r: Row): RateTerm | null {
  if (!isBasisType(r.basis_type)) return null;
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    organizationId: String(r.organization_id),
    basisType: r.basis_type,
    unit: s(r.unit),
    rateCents: toInt(r.rate_cents),
    currency: String(r.currency ?? "").trim(),
    label: s(r.label),
    roleLabel: s(r.role_label),
    validFrom: String(r.valid_from),
    validTo: s(r.valid_to),
    note: s(r.note),
  };
}

function mapPeriod(r: Row): BillingPeriod {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    organizationId: String(r.organization_id),
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    status: r.status === "invoiced" ? "invoiced" : r.status === "ready" ? "ready" : "open",
    lockedAt: s(r.locked_at),
  };
}

function mapInvoice(r: Row): InvoiceHeader {
  const kind: InvoiceKind = r.invoice_kind === "credit_note" ? "credit_note" : "invoice";
  return {
    id: String(r.id),
    projectId: s(r.project_id),
    kind,
    status: String(r.status),
    invoiceNumber: s(r.invoice_number),
    issuedAt: s(r.issued_at),
    replacesId: s(r.replaces_id),
    correctionReason: s(r.correction_reason),
    correctionReference: s(r.correction_reference),
    correctedBy: s(r.corrected_by),
    correctedAt: s(r.corrected_at),
    creditedAt: s(r.credited_at),
    creditedById: s(r.credited_by_id),
    customerName: String(r.counterparty_name ?? ""),
    customerVatId: s(r.customer_vat_id),
    customerAddress: s(r.customer_address),
    currency: String(r.currency ?? "").trim(),
    dueDate: s(r.due_date),
    paidAt: s(r.paid_at),
    billingPeriodId: s(r.billing_period_id),
    supersedesId: s(r.supersedes_id),
    issuerOrgId: s(r.issuer_org_id),
    clientOrgId: s(r.client_org_id),
    taxRounding: String(r.tax_rounding ?? "per_line"),
    recipientId: s(r.recipient_id),
    recipient: mapSnapshot(r.recipient_snapshot),
    numberSeries: r.number_series === "credit_note" ? "credit_note" : r.number_series === "invoice" ? "invoice" : null,
    numberYear: r.number_year == null ? null : toInt(r.number_year),
    numberSeq: r.number_seq == null ? null : toInt(r.number_seq),
    netTotalCents: r.net_total_cents == null ? null : toInt(r.net_total_cents),
    taxTotalCents: r.tax_total_cents == null ? null : toInt(r.tax_total_cents),
    grossTotalCents: r.gross_total_cents == null ? null : toInt(r.gross_total_cents),
    taxBreakdown: Array.isArray(r.tax_breakdown)
      ? (r.tax_breakdown as Row[]).flatMap((g) =>
          isTaxTreatment(g.treatment)
            ? [
                {
                  treatment: g.treatment as TaxTreatment,
                  ratePercent: toNum(g.rate_percent),
                  note: s(g.note),
                  netCents: toInt(g.net_cents),
                  taxCents: toInt(g.tax_cents),
                  grossCents: toInt(g.gross_cents),
                  lineCount: toInt(g.line_count),
                },
              ]
            : [],
        )
      : null,
    note: s(r.note),
    createdAt: String(r.created_at ?? ""),
  };
}

function mapLine(r: Row): InvoiceLine | null {
  if (!isBasisType(r.basis_type) || !isEvidenceClass(r.evidence_class, true)) return null;
  return {
    id: String(r.id),
    invoiceId: String(r.invoice_id),
    lineNo: toInt(r.line_no),
    basisType: r.basis_type as BasisType,
    description: s(r.description),
    rateTermId: s(r.rate_term_id),
    unit: s(r.unit),
    quantity: toNum(r.quantity),
    unitPriceCents: toInt(r.unit_price_cents),
    netCents: toInt(r.net_cents),
    currency: String(r.currency ?? "").trim(),
    evidenceClass: r.evidence_class as EvidenceClass | "agreed_basis",
    qtyClientAccepted: toNum(r.qty_client_accepted),
    taxTreatment: isTaxTreatment(r.tax_treatment) ? r.tax_treatment : null,
    taxRatePercent: r.tax_rate_percent == null ? null : toNum(r.tax_rate_percent),
    taxNote: s(r.tax_note),
    taxCents: r.tax_cents == null ? null : toInt(r.tax_cents),
    grossCents: r.gross_cents == null ? null : toInt(r.gross_cents),
    creditsLineId: s(r.credits_line_id),
  };
}

function mapChain(r: { data?: unknown; error?: unknown }): readonly ChainDocument[] {
  if (r.error) return [];
  const d = r.data as { status?: string; documents?: Row[] } | null;
  if (!d || d.status !== "ok") return [];
  return (d.documents ?? []).map((x) => ({
    id: String(x.id),
    kind: x.kind === "credit_note" ? ("credit_note" as const) : ("invoice" as const),
    number: s(x.number),
    status: String(x.status),
    issuedAt: s(x.issued_at),
    currency: String(x.currency ?? "").trim(),
    grossCents: x.gross_cents == null ? null : toInt(x.gross_cents),
    creditsId: s(x.credits_id),
    replacesId: s(x.replaces_id),
    creditedById: s(x.credited_by_id),
    reason: s(x.reason),
    reference: s(x.reference),
    actedBy: s(x.acted_by),
    actedAt: s(x.acted_at),
  }));
}

function mapSnapshot(v: unknown): RecipientSnapshot | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Row;
  if (typeof o.legal_name !== "string") return null;
  return {
    legalName: o.legal_name,
    address: s(o.address),
    country: s(o.country),
    taxId: s(o.tax_id),
    contactName: s(o.contact_name),
    contactEmail: s(o.contact_email),
    reference: s(o.reference),
  };
}

function failKind(code: string | undefined): "needs-migration" | "error" {
  return isMigrationMissingCode(code) || code === "PGRST205" ? "needs-migration" : "error";
}

export type ProjectInvoicing = {
  readonly recipients: readonly InvoiceRecipient[];
  readonly series: readonly SeriesConfig[];
  readonly totals: readonly CurrencyTotal[];
  readonly rateTerms: readonly RateTerm[];
  readonly periods: readonly BillingPeriod[];
  readonly invoices: readonly InvoiceHeader[];
  readonly presets: readonly TaxPreset[];
};

/** Rate terms, billing periods, invoices (+credit notes) and tax presets for one project. */
export async function getProjectInvoicing(
  projectId: string,
  organizationId: string | null,
  client?: SupabaseClient,
): Promise<Read<ProjectInvoicing>> {
  const supabase = client ?? (await createClient());
  const db = asAny(supabase);
  const [terms, periods, invoices] = await Promise.all([
    db.from("project_rate_terms").select(TERM_COLS).eq("project_id", projectId).order("valid_from", { ascending: false }).limit(200),
    db.from("billing_periods").select(PERIOD_COLS).eq("project_id", projectId).order("period_start", { ascending: false }).limit(200),
    db.from("finance_records").select(INVOICE_COLS).eq("project_id", projectId).eq("record_type", "invoice_issued").not("billing_period_id", "is", null).order("created_at", { ascending: false }).limit(200),
  ]);
  for (const r of [terms, periods, invoices]) {
    if (r.error) {
      const kind = failKind(r.error.code);
      if (kind === "error") console.error("[project-invoice] read failed:", r.error.code);
      return { kind };
    }
  }
  let presets: TaxPreset[] = [];
  if (organizationId) {
    const p = await db
      .from("organization_tax_presets")
      .select("id, label, treatment, rate_percent, note_text")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("label", { ascending: true })
      .limit(100);
    if (!p.error) {
      presets = ((p.data ?? []) as Row[]).flatMap((r) =>
        isTaxTreatment(r.treatment)
          ? [
              {
                id: String(r.id),
                label: String(r.label),
                treatment: r.treatment as TaxTreatment,
                ratePercent: r.rate_percent == null ? null : toNum(r.rate_percent),
                noteText: s(r.note_text),
              },
            ]
          : [],
      );
    }
  }
  let recipients: InvoiceRecipient[] = [];
  let series: SeriesConfig[] = [];
  if (organizationId) {
    const [rc, sc] = await Promise.all([
      db.from("invoice_recipients").select("id, legal_name, address, country, tax_id, contact_name, contact_email, reference, linked_organization_id").eq("issuer_org_id", organizationId).is("archived_at", null).order("legal_name", { ascending: true }).limit(500),
      db.from("invoice_series_configs").select("document_type, prefix, separator, pad, year_based").eq("organization_id", organizationId).limit(10),
    ]);
    if (!rc.error) {
      recipients = ((rc.data ?? []) as Row[]).map((r) => ({
        id: String(r.id),
        legalName: String(r.legal_name),
        address: s(r.address),
        country: s(r.country),
        taxId: s(r.tax_id),
        contactName: s(r.contact_name),
        contactEmail: s(r.contact_email),
        reference: s(r.reference),
        linkedOrganizationId: s(r.linked_organization_id),
      }));
    }
    if (!sc.error) {
      series = ((sc.data ?? []) as Row[]).flatMap((r) =>
        r.document_type === "invoice" || r.document_type === "credit_note"
          ? [{ documentType: r.document_type, prefix: String(r.prefix ?? ""), separator: String(r.separator ?? "-"), pad: toInt(r.pad), yearBased: r.year_based === true }]
          : [],
      );
    }
  }
  // Totals per (currency, kind) from the database: one row each, never summed across currencies.
  let totals: CurrencyTotal[] = [];
  const tr = await db.rpc("project_invoice_totals_v1", { p_project_id: projectId });
  if (!tr.error) {
    totals = ((tr.data ?? []) as Row[]).map((r) => ({
      currency: String(r.currency),
      kind: r.invoice_kind === "credit_note" ? ("credit_note" as const) : ("invoice" as const),
      documents: toInt(r.documents),
      netCents: toInt(r.net_cents),
      taxCents: toInt(r.tax_cents),
      grossCents: toInt(r.gross_cents),
    }));
  }
  return {
    kind: "ok",
    value: {
      recipients,
      series,
      totals,
      rateTerms: ((terms.data ?? []) as Row[]).flatMap((r) => mapTerm(r) ?? []),
      periods: ((periods.data ?? []) as Row[]).map(mapPeriod),
      invoices: ((invoices.data ?? []) as Row[]).map(mapInvoice),
      presets,
    },
  };
}

/** One invoice with its lines, sources (issuer side only) and the full correction chain. */
export async function getInvoiceView(invoiceId: string, client?: SupabaseClient): Promise<Read<InvoiceView | null>> {
  const supabase = client ?? (await createClient());
  const db = asAny(supabase);
  const inv = await db.from("finance_records").select(INVOICE_COLS).eq("id", invoiceId).maybeSingle();
  if (inv.error) {
    const kind = failKind(inv.error.code);
    if (kind === "error") console.error("[project-invoice] invoice read failed:", inv.error.code);
    return { kind };
  }
  if (!inv.data) return { kind: "ok", value: null };
  const header = mapInvoice(inv.data as Row);
  const [lines, sources, chain] = await Promise.all([
    db.from("finance_record_lines").select(LINE_COLS).eq("invoice_id", invoiceId).order("line_no", { ascending: true }).limit(500),
    db.from("finance_record_line_sources").select("line_id, journal_entry_id, source_key, work_day, unit, hours, quantity, evidence_class, internal_confirmation_id, client_confirmation_id, photo_ids").eq("invoice_id", invoiceId).order("work_day", { ascending: true }).limit(2000),
    db.rpc("invoice_correction_chain_v1", { p_invoice_id: invoiceId }),
  ]);
  if (lines.error) {
    const kind = failKind(lines.error.code);
    return { kind };
  }
  const srcRows: InvoiceLineSource[] = sources.error
    ? []
    : ((sources.data ?? []) as Row[]).flatMap((r) =>
        r.evidence_class === "client_accepted" || r.evidence_class === "internal_confirmed"
          ? [
              {
                lineId: String(r.line_id),
                journalEntryId: String(r.journal_entry_id),
                sourceKey: String(r.source_key),
                workDay: String(r.work_day),
                unit: s(r.unit),
                hours: r.hours == null ? null : toNum(r.hours),
                quantity: r.quantity == null ? null : toNum(r.quantity),
                evidenceClass: r.evidence_class as EvidenceClass,
                photoCount: Array.isArray(r.photo_ids) ? r.photo_ids.length : 0,
              },
            ]
          : [],
      );
  return {
    kind: "ok",
    value: {
      header,
      lines: ((lines.data ?? []) as Row[]).flatMap((r) => mapLine(r) ?? []),
      sources: srcRows,
      sourcesVisible: !sources.error,
      chain: mapChain(chain),
    },
  };
}

/** The server-side evidence preview of a period: what can be billed and why the rest cannot. */
export async function getPeriodPreview(periodId: string, client?: SupabaseClient): Promise<Read<readonly PeriodPreviewRow[]>> {
  const supabase = client ?? (await createClient());
  const r = await asAny(supabase).rpc("billing_period_preview_v1", { p_period_id: periodId });
  if (r.error) {
    const kind = failKind(r.error.code);
    if (kind === "error") console.error("[project-invoice] preview failed:", r.error.code);
    return { kind };
  }
  const data = r.data as { status?: string; rows?: Row[] } | null;
  if (!data || data.status !== "ok") return { kind: "error" };
  return {
    kind: "ok",
    value: (data.rows ?? []).map((x) => ({
      entryId: String(x.entry_id),
      workDay: String(x.work_day),
      sourceKey: String(x.source_key),
      kind: x.kind === "quantity" ? "quantity" : "hours",
      unit: s(x.unit),
      hours: x.hours == null ? null : toNum(x.hours),
      quantity: x.quantity == null ? null : toNum(x.quantity),
      eligibility: String(x.eligibility) as PeriodPreviewRow["eligibility"],
      evidenceClass: x.evidence_class === "client_accepted" ? "client_accepted" : "internal_confirmed",
      photoCount: toInt(x.photo_count),
      termId: s(x.term_id),
    })),
  };
}

/** "Changes since invoice" for a locked period (derived live from the evidence, never a stale flag). */
export async function getPeriodChanges(periodId: string, client?: SupabaseClient): Promise<Read<readonly PeriodChange[]>> {
  const supabase = client ?? (await createClient());
  const r = await asAny(supabase).rpc("billing_period_changes_v1", { p_period_id: periodId });
  if (r.error) {
    const kind = failKind(r.error.code);
    if (kind === "error") console.error("[project-invoice] changes failed:", r.error.code);
    return { kind };
  }
  const data = r.data as { status?: string; changes?: Row[] } | null;
  if (!data) return { kind: "error" };
  return {
    kind: "ok",
    value: (data.changes ?? []).map((x) => ({
      kind: String(x.kind) as PeriodChange["kind"],
      entryId: String(x.entry_id),
      sourceKey: String(x.source_key),
      workDay: s(x.work_day),
    })),
  };
}

/**
 * Journal entries by this organization's people that name NO project: they can
 * never reach an invoice. A count only (no text), RLS-scoped; null = unreadable.
 */
export async function countUnattributedEntries(organizationId: string, client?: SupabaseClient): Promise<number | null> {
  const supabase = client ?? (await createClient());
  const r = await asAny(supabase)
    .from("journal_entries")
    .select("id, engagement_contexts!inner(organization_id)", { count: "exact", head: true })
    .is("project_id", null)
    .is("deleted_at", null)
    .is("superseded_by", null)
    .eq("engagement_contexts.organization_id", organizationId);
  if (r.error) return null;
  return typeof r.count === "number" ? r.count : null;
}
