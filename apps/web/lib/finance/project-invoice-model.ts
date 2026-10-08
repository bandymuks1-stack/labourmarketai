/**
 * Project-to-invoice VIEW MODEL + pure helpers (no IO, no locale, no country).
 *
 * EVIDENCE CLASSES stay distinct everywhere they are shown:
 *   internal_confirmed - an independent person of the ISSUING organization
 *                        approved the work report (employer review).
 *   client_accepted    - the CLIENT's authorized representative accepted it
 *                        through the counterparty path (decision 0018).
 *   agreed_basis       - a milestone / fixed amount confirmed by the issuer's
 *                        authorized representative against an agreed term.
 * Internal confirmation is NEVER presented as client acceptance. The only way
 * to obtain `client_accepted` is a recorded counterparty decision.
 */

import type { TaxTreatment } from "@/lib/finance/invoice-tax-model";
import { formatMinor, minorToDecimalString } from "@/lib/finance/invoice-currency";

export const BASIS_TYPES = ["hours", "quantity", "milestone", "fixed"] as const;
export type BasisType = (typeof BASIS_TYPES)[number];

export type EvidenceClass = "internal_confirmed" | "client_accepted";
export type LineEvidenceClass = EvidenceClass | "agreed_basis";

export type InvoiceKind = "invoice" | "credit_note";

export function isBasisType(v: unknown): v is BasisType {
  return typeof v === "string" && (BASIS_TYPES as readonly string[]).includes(v);
}

export function isEvidenceClass(v: unknown, allowAgreed = false): v is LineEvidenceClass {
  return v === "internal_confirmed" || v === "client_accepted" || (allowAgreed && v === "agreed_basis");
}

export function toInt(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type RateTerm = {
  readonly id: string;
  readonly projectId: string;
  readonly organizationId: string;
  readonly basisType: BasisType;
  readonly unit: string | null;
  readonly rateCents: number;
  readonly currency: string;
  readonly label: string | null;
  readonly roleLabel: string | null;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly note: string | null;
};

export type BillingPeriod = {
  readonly id: string;
  readonly projectId: string;
  readonly organizationId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: "open" | "ready" | "invoiced";
  readonly lockedAt: string | null;
};

export type TaxBreakdownRow = {
  readonly treatment: TaxTreatment;
  readonly ratePercent: number;
  readonly note: string | null;
  readonly netCents: number;
  readonly taxCents: number;
  readonly grossCents: number;
  readonly lineCount: number;
};

/** The recipient AS ISSUED: frozen with the invoice. Not a LabourMarket user record. */
export type RecipientSnapshot = {
  readonly legalName: string;
  readonly address: string | null;
  readonly country: string | null;
  readonly taxId: string | null;
  readonly contactName: string | null;
  readonly contactEmail: string | null;
  readonly reference: string | null;
};

/** One entry of the ISSUER's contact book (mutable; invoices keep their own snapshot). */
export type InvoiceRecipient = RecipientSnapshot & {
  readonly id: string;
  readonly linkedOrganizationId: string | null;
};

export type SeriesDocumentType = "invoice" | "credit_note";

export type SeriesConfig = {
  readonly documentType: SeriesDocumentType;
  readonly prefix: string;
  readonly separator: string;
  readonly pad: number;
  readonly yearBased: boolean;
};

/** Totals of issued documents of ONE project, one row per (currency, kind): never summed across currencies. */
export type CurrencyTotal = {
  readonly currency: string;
  readonly kind: InvoiceKind;
  readonly documents: number;
  readonly netCents: number;
  readonly taxCents: number;
  readonly grossCents: number;
};

/** Which currencies appear in a set of totals (a sum over them is meaningless, so none is offered). */
export function totalsByCurrency(rows: readonly CurrencyTotal[]): ReadonlyMap<string, readonly CurrencyTotal[]> {
  const out = new Map<string, CurrencyTotal[]>();
  for (const r of rows) out.set(r.currency, [...(out.get(r.currency) ?? []), r]);
  return out;
}

/** What an invoice number would look like for a series (preview only; the database allocates the real one). */
export function formatNumberPreview(cfg: SeriesConfig, year: number, seq: number): string {
  return [cfg.prefix || null, cfg.yearBased ? String(year) : null, String(seq).padStart(cfg.pad, "0")]
    .filter((p): p is string => p !== null)
    .join(cfg.separator);
}

/** Row key the issuer's explicit selection uses (entry + source). */
export function selectionKey(r: { entryId: string; sourceKey: string }): string {
  return `${r.entryId}|${r.sourceKey}`;
}

export function parseSelectionKeys(keys: readonly string[]): { entry_id: string; source_key: string }[] {
  return keys.flatMap((k) => {
    const i = k.indexOf("|");
    if (i <= 0) return [];
    return [{ entry_id: k.slice(0, i), source_key: k.slice(i + 1) }];
  });
}

export type InvoiceHeader = {
  readonly id: string;
  readonly projectId: string | null;
  readonly kind: InvoiceKind;
  readonly status: string;
  readonly invoiceNumber: string | null;
  readonly issuedAt: string | null;
  readonly replacesId: string | null;
  readonly correctionReason: string | null;
  readonly correctionReference: string | null;
  readonly correctedBy: string | null;
  readonly correctedAt: string | null;
  /** Set on an ORIGINAL once a credit note credits it (a one-way link; nothing else of it changes). */
  readonly creditedAt: string | null;
  readonly creditedById: string | null;
  readonly customerName: string;
  readonly customerVatId: string | null;
  readonly customerAddress: string | null;
  readonly currency: string;
  readonly dueDate: string | null;
  readonly paidAt: string | null;
  readonly billingPeriodId: string | null;
  readonly supersedesId: string | null;
  readonly issuerOrgId: string | null;
  readonly clientOrgId: string | null;
  readonly taxRounding: string;
  readonly recipientId: string | null;
  readonly recipient: RecipientSnapshot | null;
  readonly numberSeries: SeriesDocumentType | null;
  readonly numberYear: number | null;
  readonly numberSeq: number | null;
  readonly netTotalCents: number | null;
  readonly taxTotalCents: number | null;
  readonly grossTotalCents: number | null;
  readonly taxBreakdown: readonly TaxBreakdownRow[] | null;
  readonly note: string | null;
  readonly createdAt: string;
};

export type InvoiceLine = {
  readonly id: string;
  readonly invoiceId: string;
  readonly lineNo: number;
  readonly basisType: BasisType;
  readonly description: string | null;
  readonly rateTermId: string | null;
  readonly unit: string | null;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly netCents: number;
  readonly currency: string;
  readonly evidenceClass: LineEvidenceClass;
  /** Share of `quantity` backed by a CLIENT decision (0 unless the counterparty path recorded one). */
  readonly qtyClientAccepted: number;
  readonly taxTreatment: TaxTreatment | null;
  readonly taxRatePercent: number | null;
  readonly taxNote: string | null;
  readonly taxCents: number | null;
  readonly grossCents: number | null;
  readonly creditsLineId: string | null;
};

export type InvoiceLineSource = {
  readonly lineId: string;
  readonly journalEntryId: string;
  readonly sourceKey: string;
  readonly workDay: string;
  readonly unit: string | null;
  readonly hours: number | null;
  readonly quantity: number | null;
  readonly evidenceClass: EvidenceClass;
  readonly photoCount: number;
};

/** One document of a correction chain: original -> credit note -> replacement (readable from any member). */
export type ChainDocument = {
  readonly id: string;
  readonly kind: InvoiceKind;
  readonly number: string | null;
  readonly status: string;
  readonly issuedAt: string | null;
  readonly currency: string;
  readonly grossCents: number | null;
  readonly creditsId: string | null;
  readonly replacesId: string | null;
  readonly creditedById: string | null;
  readonly reason: string | null;
  readonly reference: string | null;
  readonly actedBy: string | null;
  readonly actedAt: string | null;
};

export type InvoiceView = {
  readonly header: InvoiceHeader;
  readonly lines: readonly InvoiceLine[];
  readonly sources: readonly InvoiceLineSource[];
  readonly sourcesVisible: boolean;
  readonly chain: readonly ChainDocument[];
};

export type PeriodPreviewRow = {
  readonly entryId: string;
  readonly workDay: string;
  readonly sourceKey: string;
  readonly kind: "hours" | "quantity";
  readonly unit: string | null;
  readonly hours: number | null;
  readonly quantity: number | null;
  readonly eligibility: "billable" | "not_confirmed" | "client_disputed" | "billed";
  readonly evidenceClass: EvidenceClass;
  readonly photoCount: number;
  readonly termId: string | null;
};

export type PeriodChange = {
  readonly kind: "new_evidence" | "changed" | "withdrawn" | "no_longer_confirmed";
  readonly entryId: string;
  readonly sourceKey: string;
  readonly workDay: string | null;
};

/** Summary of a preview: how much would be billed and why the rest is held back. */
export function summarizePreview(rows: readonly PeriodPreviewRow[]) {
  const out = {
    billableRows: 0,
    billableHours: 0,
    unpricedRows: 0,
    notConfirmed: 0,
    clientDisputed: 0,
    alreadyBilled: 0,
    clientAcceptedRows: 0,
  };
  for (const r of rows) {
    if (r.eligibility === "billable") {
      if (r.termId) {
        out.billableRows += 1;
        out.billableHours += r.hours ?? 0;
        if (r.evidenceClass === "client_accepted") out.clientAcceptedRows += 1;
      } else {
        out.unpricedRows += 1;
      }
    } else if (r.eligibility === "not_confirmed") out.notConfirmed += 1;
    else if (r.eligibility === "client_disputed") out.clientDisputed += 1;
    else out.alreadyBilled += 1;
  }
  out.billableHours = Math.round(out.billableHours * 100) / 100;
  return out;
}

// ── money formatting (integer MINOR units; exponent per currency, see invoice-currency.ts) ─────

/** Exact decimal string in the currency's own minor-unit exponent (JPY 0, KWD 3, most 2). */
export function centsToDecimalString(minor: number, currency: string): string {
  return minorToDecimalString(minor, currency);
}

export function formatMoney(minor: number, currency: string, locale: string): string {
  return formatMinor(minor, currency, locale);
}

export function formatQuantity(q: number): string {
  return Number.isInteger(q) ? String(q) : String(Math.round(q * 10_000) / 10_000);
}

// ── CSV export (generated, never uploaded) ────────────────────────────────

export type CsvLabels = {
  readonly kind: Readonly<Record<InvoiceKind, string>>;
  readonly basis: Readonly<Record<BasisType, string>>;
  readonly evidence: Readonly<Record<LineEvidenceClass, string>>;
  readonly treatment: Readonly<Record<TaxTreatment, string>>;
};

function csvCell(v: string | number | null | undefined): string {
  const t = v == null ? "" : String(v);
  // Defuse spreadsheet formula injection: a cell that starts with = + - @ is data, not a formula.
  const safe = /^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t) ? `'${t}` : t;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * One row per invoice line, repeated header fields (flat, import-friendly).
 * Columns are stable; tax columns are the stored SNAPSHOT, never recomputed.
 */
export function invoiceToCsv(view: InvoiceView, labels: CsvLabels): string {
  const h = view.header;
  const head = [
    "document_kind", "number", "status", "issued_at", "currency", "customer", "customer_vat_id", "customer_country", "customer_address",
    "line_no", "basis", "description", "quantity", "unit", "unit_price", "net", "tax_treatment",
    "tax_rate_percent", "tax", "gross", "evidence_class", "client_accepted_quantity", "tax_note",
  ];
  const rows: string[] = [head.join(",")];
  for (const l of view.lines) {
    rows.push(
      [
        labels.kind[h.kind], h.invoiceNumber, h.status, h.issuedAt, h.currency, h.customerName, h.customerVatId,
        h.recipient?.country ?? "", h.recipient?.address ?? h.customerAddress ?? "",
        l.lineNo, labels.basis[l.basisType], l.description, formatQuantity(l.quantity), l.unit,
        centsToDecimalString(l.unitPriceCents, h.currency), centsToDecimalString(l.netCents, h.currency),
        l.taxTreatment ? labels.treatment[l.taxTreatment] : "", l.taxRatePercent ?? "",
        l.taxCents == null ? "" : centsToDecimalString(l.taxCents, h.currency),
        l.grossCents == null ? "" : centsToDecimalString(l.grossCents, h.currency),
        labels.evidence[l.evidenceClass], formatQuantity(l.qtyClientAccepted), l.taxNote,
      ].map(csvCell).join(","),
    );
  }
  return rows.join("\r\n") + "\r\n";
}

// ── printable HTML export (generated, never uploaded) ─────────────────────

export type HtmlLabels = CsvLabels & {
  readonly title: Readonly<Record<InvoiceKind, string>>;
  readonly number: string;
  readonly issued: string;
  readonly customer: string;
  readonly vatId: string;
  readonly colDescription: string;
  readonly colQuantity: string;
  readonly colUnitPrice: string;
  readonly colNet: string;
  readonly colTax: string;
  readonly colGross: string;
  readonly colEvidence: string;
  readonly totalsHeading: string;
  readonly totalNet: string;
  readonly totalTax: string;
  readonly totalGross: string;
  readonly draftNotice: string;
  readonly taxDisclaimer: string;
  readonly noPaymentNotice: string;
};

export function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function invoiceToHtml(view: InvoiceView, labels: HtmlLabels, locale: string): string {
  const h = view.header;
  const money = (c: number | null) => (c == null ? "" : escapeHtml(formatMoney(c, h.currency, locale)));
  const lineRows = view.lines
    .map((l) => {
      const tax = l.taxTreatment
        ? `${escapeHtml(labels.treatment[l.taxTreatment])}${l.taxRatePercent ? ` ${l.taxRatePercent}%` : ""}`
        : "";
      const desc = escapeHtml(l.description ?? labels.basis[l.basisType]);
      const note = l.taxNote ? `<div class="note">${escapeHtml(l.taxNote)}</div>` : "";
      return `<tr><td>${l.lineNo}</td><td>${desc}<div class="sub">${escapeHtml(labels.basis[l.basisType])}${tax ? ` &middot; ${tax}` : ""}</div>${note}</td><td class="r">${escapeHtml(formatQuantity(l.quantity))}${l.unit ? ` ${escapeHtml(l.unit)}` : ""}</td><td class="r">${money(l.unitPriceCents)}</td><td class="r">${money(l.netCents)}</td><td class="r">${money(l.taxCents)}</td><td class="r">${money(l.grossCents)}</td><td>${escapeHtml(labels.evidence[l.evidenceClass])}</td></tr>`;
    })
    .join("");
  const groupRows = (h.taxBreakdown ?? [])
    .map(
      (g) =>
        `<tr><td>${escapeHtml(labels.treatment[g.treatment])}${g.ratePercent ? ` ${g.ratePercent}%` : ""}${g.note ? `<div class="note">${escapeHtml(g.note)}</div>` : ""}</td><td class="r">${money(g.netCents)}</td><td class="r">${money(g.taxCents)}</td><td class="r">${money(g.grossCents)}</td></tr>`,
    )
    .join("");
  const banner =
    h.status === "draft" ? `<p class="banner">${escapeHtml(labels.draftNotice)}</p>` : "";
  return `<!doctype html>
<html lang="${escapeHtml(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(labels.title[h.kind])} ${escapeHtml(h.invoiceNumber ?? "")}</title>
<style>
:root{color-scheme:light dark}body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:24px;background:Canvas;color:CanvasText}
main{max-width:960px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:16px 0}
th,td{padding:6px 8px;border-bottom:1px solid color-mix(in srgb,CanvasText 18%,transparent);text-align:left;vertical-align:top}
.r{text-align:right;font-variant-numeric:tabular-nums}.sub,.note,.small{opacity:.7;font-size:12px}.banner{padding:8px 12px;border:1px solid currentColor;border-radius:6px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:2px 16px}dt{opacity:.7}
@media print{body{padding:0}}
</style></head><body><main>
<h1>${escapeHtml(labels.title[h.kind])}${h.invoiceNumber ? ` ${escapeHtml(h.invoiceNumber)}` : ""}</h1>
${banner}
<dl><dt>${escapeHtml(labels.number)}</dt><dd>${escapeHtml(h.invoiceNumber ?? "-")}</dd>
<dt>${escapeHtml(labels.issued)}</dt><dd>${escapeHtml(h.issuedAt ? h.issuedAt.slice(0, 10) : "-")}</dd>
<dt>${escapeHtml(labels.customer)}</dt><dd>${escapeHtml(h.recipient?.legalName ?? h.customerName)}${(h.recipient?.address ?? h.customerAddress) ? `<div class="small">${escapeHtml(h.recipient?.address ?? h.customerAddress ?? "")}${h.recipient?.country ? `, ${escapeHtml(h.recipient.country)}` : ""}</div>` : ""}</dd>
${h.customerVatId ? `<dt>${escapeHtml(labels.vatId)}</dt><dd>${escapeHtml(h.customerVatId)}</dd>` : ""}</dl>
<table><thead><tr><th>#</th><th>${escapeHtml(labels.colDescription)}</th><th class="r">${escapeHtml(labels.colQuantity)}</th><th class="r">${escapeHtml(labels.colUnitPrice)}</th><th class="r">${escapeHtml(labels.colNet)}</th><th class="r">${escapeHtml(labels.colTax)}</th><th class="r">${escapeHtml(labels.colGross)}</th><th>${escapeHtml(labels.colEvidence)}</th></tr></thead><tbody>${lineRows}</tbody></table>
<h2>${escapeHtml(labels.totalsHeading)}</h2>
<table><thead><tr><th></th><th class="r">${escapeHtml(labels.totalNet)}</th><th class="r">${escapeHtml(labels.totalTax)}</th><th class="r">${escapeHtml(labels.totalGross)}</th></tr></thead><tbody>${groupRows}
<tr><th>&Sigma;</th><th class="r">${money(h.netTotalCents)}</th><th class="r">${money(h.taxTotalCents)}</th><th class="r">${money(h.grossTotalCents)}</th></tr></tbody></table>
<p class="small">${escapeHtml(labels.taxDisclaimer)}</p>
<p class="small">${escapeHtml(labels.noPaymentNotice)}</p>
</main></body></html>`;
}
