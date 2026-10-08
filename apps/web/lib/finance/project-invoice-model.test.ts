import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  invoiceToCsv,
  invoiceToHtml,
  summarizePreview,
  type CsvLabels,
  type HtmlLabels,
  type InvoiceView,
  type PeriodPreviewRow,
} from "@/lib/finance/project-invoice-model";

const csvLabels: CsvLabels = {
  kind: { invoice: "Invoice", credit_note: "Credit note" },
  basis: { hours: "Hours", quantity: "Quantity", milestone: "Milestone", fixed: "Fixed" },
  evidence: { internal_confirmed: "Internally confirmed", client_accepted: "Work accepted by client", agreed_basis: "Agreed basis" },
  treatment: { standard: "Standard", reduced: "Reduced", zero_rated: "Zero rated", reverse_charge: "Reverse charge", exempt: "Exempt", outside_scope: "Outside scope" },
};
const htmlLabels: HtmlLabels = {
  ...csvLabels,
  title: { invoice: "Invoice", credit_note: "Credit note" },
  number: "Number", issued: "Issued", customer: "Customer", vatId: "Tax ID", colDescription: "Description", colQuantity: "Qty",
  colUnitPrice: "Unit", colNet: "Net", colTax: "Tax", colGross: "Total", colEvidence: "Evidence", totalsHeading: "Totals",
  totalNet: "Net", totalTax: "Tax", totalGross: "Total", draftNotice: "DRAFT", taxDisclaimer: "to be confirmed by your accountant",
  noPaymentNotice: "no payment processing",
};

function view(currency: string, over: Partial<InvoiceView["header"]> = {}): InvoiceView {
  return {
    header: {
      id: "i1", projectId: "p1", kind: "invoice", status: "issued", invoiceNumber: "0001", issuedAt: "2026-10-01T10:00:00Z",
      replacesId: null, correctionReason: null, correctionReference: null, correctedBy: null, correctedAt: null, creditedAt: null, creditedById: null,
      customerName: '=HYPERLINK("http://x")', customerVatId: null, customerAddress: null, currency, dueDate: null, paidAt: null,
      billingPeriodId: "bp", supersedesId: null, issuerOrgId: "o", clientOrgId: null, taxRounding: "per_line",
      netTotalCents: 15_000, taxTotalCents: 3_750, grossTotalCents: 18_750,
      taxBreakdown: [{ treatment: "standard", ratePercent: 25, note: "<b>note</b>", netCents: 15_000, taxCents: 3_750, grossCents: 18_750, lineCount: 1 }],
      note: null, createdAt: "2026-10-01T10:00:00Z", supersedesId_: undefined, ...over,
    } as never,
    lines: [{
      id: "l1", invoiceId: "i1", lineNo: 1, basisType: "hours", description: "Work", rateTermId: null, unit: "hours", quantity: 3,
      unitPriceCents: 5_000, netCents: 15_000, currency, evidenceClass: "internal_confirmed", qtyClientAccepted: 0,
      taxTreatment: "standard", taxRatePercent: 25, taxNote: "<b>note</b>", taxCents: 3_750, grossCents: 18_750, creditsLineId: null,
    }],
    sources: [], sourcesVisible: true, chain: [],
  };
}

describe("invoice export (generated, never uploaded)", () => {
  it("CSV uses the currency's own exponent and neutralises spreadsheet formulas", () => {
    const jpy = invoiceToCsv(view("JPY"), csvLabels);
    expect(jpy).toContain("50"); // unit price 5000 minor = 5000 JPY, no decimals
    expect(jpy).toContain("5000");
    expect(jpy).not.toContain("50.00");
    const kwd = invoiceToCsv(view("KWD"), csvLabels);
    expect(kwd).toContain("5.000"); // 5000 minor, 3 decimals
    expect(kwd).toContain("'=HYPERLINK"); // formula defused
    expect(kwd.split("\r\n")[0]).toContain("tax_treatment");
  });

  it("CSV carries the stored tax snapshot and the work-acceptance class, not an invoice state", () => {
    const csv = invoiceToCsv(view("SEK"), csvLabels);
    expect(csv).toContain("Standard");
    expect(csv).toContain("Internally confirmed");
    expect(csv).not.toMatch(/accepted invoice|invoice accepted/i);
  });

  it("HTML escapes stored text and states the tax disclaimer and no-payment note", () => {
    const html = invoiceToHtml(view("PLN"), htmlLabels, "en");
    expect(html).toContain("&lt;b&gt;note&lt;/b&gt;");
    expect(html).not.toContain("<b>note</b>");
    expect(html).toContain("to be confirmed by your accountant");
    expect(html).toContain("no payment processing");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
  });

  it("a draft is exported with a visible DRAFT banner", () => {
    expect(invoiceToHtml(view("EUR", { status: "draft", invoiceNumber: null }), htmlLabels, "en")).toContain("DRAFT");
  });

  it("escapeHtml covers the five characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("period preview summary", () => {
  const row = (over: Partial<PeriodPreviewRow>): PeriodPreviewRow => ({
    entryId: "e", workDay: "2026-09-01", sourceKey: "e", kind: "hours", unit: "hours", hours: 2, quantity: null,
    eligibility: "billable", evidenceClass: "internal_confirmed", photoCount: 0, termId: "t", ...over,
  });
  it("counts what is billed and why the rest is held back", () => {
    const s = summarizePreview([
      row({}), row({ hours: 1.5, evidenceClass: "client_accepted" }), row({ termId: null }), row({ eligibility: "not_confirmed" }),
      row({ eligibility: "client_disputed" }), row({ eligibility: "billed" }),
    ]);
    expect(s).toEqual({ billableRows: 2, billableHours: 3.5, unpricedRows: 1, notConfirmed: 1, clientDisputed: 1, alreadyBilled: 1, clientAcceptedRows: 1 });
  });
});

import { deriveFinanceSummary } from "@/lib/finance/finance-model";
import {
  formatNumberPreview,
  parseSelectionKeys,
  selectionKey,
  totalsByCurrency,
  type CurrencyTotal,
} from "@/lib/finance/project-invoice-model";

describe("totals are grouped per currency, never summed across currencies", () => {
  const rows: CurrencyTotal[] = [
    { currency: "SEK", kind: "invoice", documents: 1, netCents: 135000, taxCents: 33750, grossCents: 168750 },
    { currency: "SEK", kind: "credit_note", documents: 1, netCents: 10000, taxCents: 2500, grossCents: 12500 },
    { currency: "JPY", kind: "invoice", documents: 1, netCents: 15000, taxCents: 3750, grossCents: 18750 },
  ];
  it("groups by currency and keeps kinds apart", () => {
    const g = totalsByCurrency(rows);
    expect([...g.keys()].sort()).toEqual(["JPY", "SEK"]);
    expect(g.get("SEK")?.map((r) => r.kind)).toEqual(["invoice", "credit_note"]);
  });
  it("the legacy summary refuses to add EUR and SEK", () => {
    const base = { recordType: "invoice_issued" as const, status: "issued" as const, dueDate: null, projectId: null };
    expect(() => deriveFinanceSummary([{ ...base, amountCents: 1, currency: "EUR" }, { ...base, amountCents: 2, currency: "SEK" }], new Date())).toThrow(/refusing to sum across currencies/);
    expect(deriveFinanceSummary([{ ...base, amountCents: 1, currency: "EUR" }, { ...base, amountCents: 2, currency: "EUR" }], new Date()).issuedInvoiceCents).toBe(3);
  });
});

describe("numbering preview and selection keys", () => {
  it("formats prefix / year / padded sequence with the configured separator", () => {
    expect(formatNumberPreview({ documentType: "invoice", prefix: "FA", separator: "/", pad: 5, yearBased: true }, 2026, 1)).toBe("FA/2026/00001");
    expect(formatNumberPreview({ documentType: "invoice", prefix: "", separator: "-", pad: 4, yearBased: false }, 2026, 7)).toBe("0007");
    expect(formatNumberPreview({ documentType: "credit_note", prefix: "XX", separator: ".", pad: 6, yearBased: false }, 2026, 3)).toBe("XX.000003");
  });
  it("selection keys round-trip entry + source and drop malformed keys", () => {
    const k = selectionKey({ entryId: "e-1", sourceKey: "q:days" });
    expect(parseSelectionKeys([k, "broken", "|x"])).toEqual([{ entry_id: "e-1", source_key: "q:days" }]);
  });
});
