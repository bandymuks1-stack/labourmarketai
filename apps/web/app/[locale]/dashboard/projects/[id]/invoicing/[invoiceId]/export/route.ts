import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import { getInvoiceView } from "@/lib/finance/project-invoice";
import {
  invoiceToCsv,
  invoiceToHtml,
  type CsvLabels,
  type HtmlLabels,
} from "@/lib/finance/project-invoice-model";
import { TAX_TREATMENTS } from "@/lib/finance/invoice-tax-model";
import { BASIS_TYPES } from "@/lib/finance/project-invoice-model";

/**
 * GET - the invoice as a CSV or a printable HTML document, GENERATED on the
 * fly from the stored snapshot (lines, tax treatment / rate / note, totals).
 * Nothing is uploaded, stored or sent: the user prints or saves the response
 * themselves ("documents are readiness, not a vault", decision 0021).
 *
 * Reads go through the caller's own RLS (issuer finance authority, or the
 * client organization's representative for a NON-draft invoice). A draft is
 * exported with a visible DRAFT banner so it can never pass for an issued
 * document. 404 for anything the caller cannot read - no existence oracle.
 */
export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALE_RX = /^[a-z]{2}$/;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ locale: string; id: string; invoiceId: string }> },
): Promise<NextResponse> {
  const { locale, invoiceId } = await ctx.params;
  if (!UUID_RX.test(invoiceId) || !LOCALE_RX.test(locale)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "html";
  const read = await getInvoiceView(invoiceId);
  if (read.kind === "needs-migration") return NextResponse.json({ error: "needs_migration" }, { status: 503 });
  if (read.kind !== "ok" || !read.value) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const view = read.value;

  const t = await getTranslations({ locale, namespace: "projectInvoice" });
  const csvLabels: CsvLabels = {
    kind: { invoice: t("kind.invoice"), credit_note: t("kind.credit_note") },
    basis: Object.fromEntries(BASIS_TYPES.map((b) => [b, t(`basis.${b}`)])) as CsvLabels["basis"],
    evidence: {
      internal_confirmed: t("evidence.internal_confirmed"),
      client_accepted: t("evidence.client_accepted"),
      agreed_basis: t("evidence.agreed_basis"),
    },
    treatment: Object.fromEntries(TAX_TREATMENTS.map((x) => [x, t(`tax.treatment.${x}`)])) as CsvLabels["treatment"],
  };

  const stem = `${view.header.kind === "credit_note" ? "credit-note" : "invoice"}-${view.header.invoiceNumber ?? "draft"}`.replace(/[^A-Za-z0-9_-]/g, "_");

  if (format === "csv") {
    return new NextResponse("﻿" + invoiceToCsv(view, csvLabels), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${stem}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const htmlLabels: HtmlLabels = {
    ...csvLabels,
    title: { invoice: t("export.titleInvoice"), credit_note: t("export.titleCreditNote") },
    number: t("export.number"),
    issued: t("export.issued"),
    customer: t("export.customer"),
    vatId: t("export.vatId"),
    colDescription: t("export.colDescription"),
    colQuantity: t("export.colQuantity"),
    colUnitPrice: t("export.colUnitPrice"),
    colNet: t("export.colNet"),
    colTax: t("export.colTax"),
    colGross: t("export.colGross"),
    colEvidence: t("export.colEvidence"),
    totalsHeading: t("export.totalsHeading"),
    totalNet: t("export.totalNet"),
    totalTax: t("export.totalTax"),
    totalGross: t("export.totalGross"),
    draftNotice: t("export.draftNotice"),
    taxDisclaimer: t("tax.disclaimer"),
    noPaymentNotice: t("export.noPaymentNotice"),
  };
  return new NextResponse(invoiceToHtml(view, htmlLabels, locale), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
