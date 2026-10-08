import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { InvoiceNote, InvoicePanel } from "@/components/app/invoice-panel";
import { createClient } from "@/lib/supabase/server";
import { getProjectManageFacts } from "@/lib/projects/responsible";
import { getInvoiceView, getProjectInvoicing } from "@/lib/finance/project-invoice";
import {
  computeInvoiceTotals,
  TAX_TREATMENTS,
  type TaxTreatment,
} from "@/lib/finance/invoice-tax-model";
import {
  formatMoney,
  formatQuantity,
  type InvoiceLine,
  type LineEvidenceClass,
} from "@/lib/finance/project-invoice-model";
import {
  addBasisLineAction,
  correctInvoiceAction,
  createInvoiceDraftAction,
  discardDraftAction,
  issueInvoiceAction,
  setTaxAction,
} from "@/lib/finance/project-invoice-actions";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTICE_KEYS = new Set([
  "draft_created", "line_added", "tax_saved", "invoice_issued", "corrected",
  "invalid", "invalid_tax", "not_found", "not_allowed", "tax_confirmation_required", "tax_treatment_missing",
  "evidence_changed", "no_lines", "not_draft", "invalid_term", "already_billed",
  "already_credited", "invalid_replacement", "already_replaced", "period_locked", "issued_invoice_is_immutable", "not_issued_invoice",
  "invalid_state", "mixed_currency", "needs_migration", "error",
]);
const GOOD = new Set(["draft_created", "line_added", "tax_saved", "invoice_issued", "corrected"]);

const inputClass =
  "rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue";
const buttonClass =
  "inline-flex h-9 items-center rounded-lg border border-ink-500 px-3 text-xs font-semibold text-text-secondary transition-colors hover:border-brand-blue hover:text-brand-blue";
const dangerClass =
  "inline-flex h-9 items-center rounded-lg border border-brand-orange/50 px-3 text-xs font-semibold text-brand-orange transition-colors hover:border-brand-orange";
const sectionTitleClass = "font-mono text-meta uppercase tracking-label text-text-muted";
const chipClass =
  "inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary";

export default async function InvoiceViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string; invoiceId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { locale, id, invoiceId } = await params;
  setRequestLocale(locale);
  if (!UUID_RX.test(invoiceId)) redirect(`/${locale}/dashboard/projects/${id}/invoicing`);
  const sp = await searchParams;
  const notice = sp.notice && NOTICE_KEYS.has(sp.notice) ? sp.notice : null;
  const t = await getTranslations("projectInvoice");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const read = await getInvoiceView(invoiceId);
  if (read.kind === "needs-migration" || read.kind === "error" || !read.value) {
    return (
      <div className="mx-auto flex w-full max-w-content flex-col gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">{t("view.title")}</h1>
        <InvoiceNote className="p-4 text-sm text-text-secondary">
          {read.kind === "needs-migration" ? t("page.needsMigration") : read.kind === "error" ? t("page.readFailed") : t("view.notFound")}
        </InvoiceNote>
      </div>
    );
  }
  const view = read.value;
  const h = view.header;
  const facts = await getProjectManageFacts(id);
  // Issuer side = the viewer can manage this project AND it is the issuer's project. A client
  // representative reaches this page by direct link only and sees the stored snapshot, nothing else.
  const issuerSide = facts !== null && facts.organizationId !== null && facts.organizationId === h.issuerOrgId;
  const money = (c: number | null) => (c == null ? "-" : formatMoney(c, h.currency, locale));
  const isDraft = h.status === "draft";
  const isIssuedInvoice = h.kind === "invoice" && h.issuedAt !== null;
  const isCredited = h.creditedAt !== null;
  const projectInvoicing = issuerSide && isDraft ? await getProjectInvoicing(id, facts?.organizationId ?? null) : null;
  const presets = projectInvoicing && projectInvoicing.kind === "ok" ? projectInvoicing.value.presets : [];
  const basisTerms =
    projectInvoicing && projectInvoicing.kind === "ok"
      ? projectInvoicing.value.rateTerms.filter((x) => (x.basisType === "milestone" || x.basisType === "fixed") && !x.validTo)
      : [];

  // Live preview of what the database will store (same arithmetic, per line).
  const preview = computeInvoiceTotals(
    view.lines.map((l) => ({ netCents: l.netCents, treatment: l.taxTreatment, ratePercent: l.taxRatePercent, note: l.taxNote })),
  );
  const evidenceLabel = (c: LineEvidenceClass) => t(`evidence.${c}`);
  const sourcesByLine = new Map<string, { entries: number; internalHours: number; clientRows: number; photos: number }>();
  for (const s of view.sources) {
    const cur = sourcesByLine.get(s.lineId) ?? { entries: 0, internalHours: 0, clientRows: 0, photos: 0 };
    sourcesByLine.set(s.lineId, {
      entries: cur.entries + 1,
      internalHours: cur.internalHours + (s.hours ?? s.quantity ?? 0),
      clientRows: cur.clientRows + (s.evidenceClass === "client_accepted" ? 1 : 0),
      photos: cur.photos + s.photoCount,
    });
  }

  const taxForm = (line: InvoiceLine | null) => (
    <form action={setTaxAction} className="flex flex-wrap items-end gap-2" data-testid={line ? `tax-form-${line.lineNo}` : "tax-form-all"}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="project_id" value={id} />
      <input type="hidden" name="invoice_id" value={invoiceId} />
      {line ? <input type="hidden" name="line_id" value={line.id} /> : null}
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {t("tax.treatmentLabel")}
        <select name="treatment" defaultValue={line?.taxTreatment ?? ""} required className={inputClass}>
          <option value="" disabled>{t("tax.choose")}</option>
          {TAX_TREATMENTS.map((x) => (
            <option key={x} value={x}>{t(`tax.treatment.${x}`)}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {t("tax.rateLabel")}
        <input name="rate_percent" inputMode="decimal" defaultValue={line?.taxRatePercent ? String(line.taxRatePercent) : ""} className={`${inputClass} w-24`} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {t("tax.noteLabel")}
        <input name="tax_note" maxLength={500} defaultValue={line?.taxNote ?? ""} className={`${inputClass} w-64`} />
      </label>
      {!line ? (
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("tax.scopeLabel")}
          <select name="scope" defaultValue="unset" className={inputClass}>
            <option value="unset">{t("tax.scopeUnset")}</option>
            <option value="all">{t("tax.scopeAll")}</option>
          </select>
        </label>
      ) : null}
      <button type="submit" className={buttonClass}>{line ? t("tax.saveLine") : t("tax.saveAll")}</button>
    </form>
  );

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6" data-testid="invoice-view">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t(`kind.${h.kind}`)} {h.invoiceNumber ?? ""}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className={chipClass} data-testid="invoice-status">{isCredited ? t("status.credited") : t(`status.${h.status}` as "status.draft")}</span>
          {h.supersedesId ? <span className={chipClass}>{t("view.creditsInvoice")}</span> : null}
          {h.replacesId ? <span className={chipClass}>{t("view.replacesNotice")}</span> : null}
        </div>
        {issuerSide ? (
          <Link href={`/dashboard/projects/${id}/invoicing` as "/dashboard"} className="text-sm text-brand-blue hover:underline">
            {t("view.backToInvoicing")}
          </Link>
        ) : null}
      </header>

      {notice ? (
        <InvoiceNote className={`text-sm ${GOOD.has(notice) ? "text-text-primary" : "text-state-warning"}`} role="status" testId="invoice-notice">
          {t(`notice.${notice}`)}
        </InvoiceNote>
      ) : null}

      <InvoiceNote className="p-3 text-meta leading-relaxed text-text-muted">{t("tax.disclaimer")} {t("page.noPayment")}</InvoiceNote>

      <InvoicePanel gap={2}>
        <div><span className="text-text-muted">{t("export.customer")}: </span><span className="font-semibold text-text-primary">{h.customerName}</span></div>
        {h.customerVatId ? <div><span className="text-text-muted">{t("export.vatId")}: </span>{h.customerVatId}</div> : null}
        {h.customerAddress ? <div className="sm:col-span-2"><span className="text-text-muted">{t("draft.customerAddress")}: </span>{h.customerAddress}</div> : null}
        {h.issuedAt ? <div><span className="text-text-muted">{t("export.issued")}: </span>{h.issuedAt.slice(0, 10)}</div> : null}
        {h.dueDate ? <div><span className="text-text-muted">{t("draft.dueDate")}: </span>{h.dueDate}</div> : null}
        {h.correctionReason ? <div className="sm:col-span-2"><span className="text-text-muted">{t("chain.reason")}: </span>{h.correctionReason}{h.correctionReference ? ` (${h.correctionReference})` : ""}</div> : null}
        {isCredited ? <div className="sm:col-span-2 text-text-secondary">{t("view.creditedNotice", { number: view.chain.find((c) => c.id === h.creditedById)?.number ?? "" })}</div> : null}
      </InvoicePanel>

      {/* ── evidence legend: the classes never merge ─────────────── */}
      <InvoicePanel id="invoice-evidence-legend" testId="invoice-evidence-legend" gap={1}>
        <h2 className={sectionTitleClass}>{t("evidence.title")}</h2>
        <p className="text-sm text-text-secondary"><strong>{evidenceLabel("internal_confirmed")}</strong> - {t("evidence.internal_confirmed_help")}</p>
        <p className="text-sm text-text-secondary"><strong>{evidenceLabel("client_accepted")}</strong> - {t("evidence.client_accepted_help")}</p>
        <p className="text-sm text-text-secondary"><strong>{evidenceLabel("agreed_basis")}</strong> - {t("evidence.agreed_basis_help")}</p>
        <p className="text-meta text-text-muted">{t("evidence.optionalClient")}</p>
      </InvoicePanel>

      {/* ── lines: net -> treatment / rate -> tax -> gross ─────────── */}
      <InvoicePanel id="invoice-lines" testId="invoice-lines" gap={3}>
        <h2 className={sectionTitleClass}>{t("view.lines")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-meta text-text-muted">
              <tr>
                <th className="py-1 pr-2">#</th>
                <th className="py-1 pr-2">{t("export.colDescription")}</th>
                <th className="py-1 pr-2 text-right">{t("export.colQuantity")}</th>
                <th className="py-1 pr-2 text-right">{t("export.colUnitPrice")}</th>
                <th className="py-1 pr-2 text-right">{t("export.colNet")}</th>
                <th className="py-1 pr-2">{t("tax.treatmentLabel")}</th>
                <th className="py-1 pr-2 text-right">{t("export.colTax")}</th>
                <th className="py-1 pr-2 text-right">{t("export.colGross")}</th>
                <th className="py-1">{t("export.colEvidence")}</th>
              </tr>
            </thead>
            <tbody>
              {view.lines.map((l) => {
                const src = sourcesByLine.get(l.id);
                return (
                  <tr key={l.id} className="border-t border-ink-600 align-top">
                    <td className="py-2 pr-2">{l.lineNo}</td>
                    <td className="py-2 pr-2">
                      <div className="text-text-primary">{l.description ?? t(`basis.${l.basisType}`)}</div>
                      <div className="text-meta text-text-muted">{t(`basis.${l.basisType}`)}</div>
                      {l.taxNote ? <div className="text-meta text-text-muted">{l.taxNote}</div> : null}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatQuantity(l.quantity)} {l.unit ?? ""}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(l.unitPriceCents)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(l.netCents)}</td>
                    <td className="py-2 pr-2">{l.taxTreatment ? `${t(`tax.treatment.${l.taxTreatment}`)}${l.taxRatePercent ? ` ${l.taxRatePercent}%` : ""}` : <span className="text-state-warning">{t("tax.unset")}</span>}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(l.taxCents)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(l.grossCents)}</td>
                    <td className="py-2">
                      <div>{evidenceLabel(l.evidenceClass)}</div>
                      {l.qtyClientAccepted > 0 ? (
                        <div className="text-meta text-text-muted">{t("evidence.clientShare", { qty: formatQuantity(l.qtyClientAccepted), total: formatQuantity(l.quantity) })}</div>
                      ) : null}
                      {issuerSide && src ? (
                        <div className="text-meta text-text-muted">{t("view.sourceSummary", { entries: src.entries, photos: src.photos })}</div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {issuerSide && isDraft
          ? view.lines.map((l) => (
              <details key={l.id} className="text-sm text-text-secondary">
                <summary className="cursor-pointer">{t("tax.editLine", { n: l.lineNo })}</summary>
                <div className="pt-2">{taxForm(l)}</div>
              </details>
            ))
          : null}
      </InvoicePanel>

      {/* ── totals grouped by treatment/rate ─────────────────────── */}
      <InvoicePanel id="invoice-totals" testId="invoice-totals" gap={2}>
        <h2 className={sectionTitleClass}>{t("export.totalsHeading")}</h2>
        {preview.complete || h.taxBreakdown ? (
          <table className="w-full text-left text-sm">
            <thead className="text-meta text-text-muted">
              <tr><th /><th className="text-right">{t("export.totalNet")}</th><th className="text-right">{t("export.totalTax")}</th><th className="text-right">{t("export.totalGross")}</th></tr>
            </thead>
            <tbody>
              {(h.taxBreakdown ?? (preview.complete ? preview.groups : [])).map((g, i) => (
                <tr key={i} className="border-t border-ink-600">
                  <td className="py-1">
                    {t(`tax.treatment.${g.treatment as TaxTreatment}`)}{g.ratePercent ? ` ${g.ratePercent}%` : ""}
                    {g.note ? <div className="text-meta text-text-muted">{g.note}</div> : null}
                  </td>
                  <td className="text-right tabular-nums">{money(g.netCents)}</td>
                  <td className="text-right tabular-nums">{money(g.taxCents)}</td>
                  <td className="text-right tabular-nums">{money(g.grossCents)}</td>
                </tr>
              ))}
              <tr className="border-t border-ink-500 font-semibold">
                <td className="py-1">&Sigma;</td>
                <td className="text-right tabular-nums">{money(h.netTotalCents ?? preview.netCents)}</td>
                <td className="text-right tabular-nums">{money(h.taxTotalCents ?? (preview.complete ? preview.taxCents : null))}</td>
                <td className="text-right tabular-nums">{money(h.grossTotalCents ?? (preview.complete ? preview.grossCents : null))}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-state-warning" data-testid="invoice-tax-incomplete">
            {t("tax.incomplete", { net: money(h.netTotalCents ?? preview.netCents), count: preview.complete ? 0 : preview.unsetLines })}
          </p>
        )}
        <p className="text-meta text-text-muted">{t("tax.roundingPerLine")}</p>
      </InvoicePanel>

      {/* ── draft: tax for all lines, milestone/fixed lines, issue, discard ── */}
      {issuerSide && isDraft ? (
        <>
          <InvoicePanel id="invoice-tax-all" testId="invoice-tax-all" gap={3}>
            <h2 className={sectionTitleClass}>{t("tax.title")}</h2>
            <p className="text-sm text-text-secondary">{t("tax.confirmIntro")}</p>
            {presets.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-meta text-text-muted">{t("tax.presetsIntro")}</p>
                <ul className="flex flex-wrap gap-2">
                  {presets.map((p) => (
                    <li key={p.id}>
                      <form action={setTaxAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="project_id" value={id} />
                        <input type="hidden" name="invoice_id" value={invoiceId} />
                        <input type="hidden" name="treatment" value={p.treatment} />
                        <input type="hidden" name="rate_percent" value={p.ratePercent == null ? "" : String(p.ratePercent)} />
                        <input type="hidden" name="tax_note" value={p.noteText ?? ""} />
                        <input type="hidden" name="scope" value="unset" />
                        <button type="submit" className={buttonClass}>
                          {p.label}: {t(`tax.treatment.${p.treatment}`)}{p.ratePercent ? ` ${p.ratePercent}%` : ""}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {taxForm(null)}
            <p className="text-meta text-text-muted">{t("tax.rateOnlyForRated")}</p>
          </InvoicePanel>

          {basisTerms.length > 0 ? (
            <InvoicePanel id="invoice-basis-line" testId="invoice-basis-line" gap={3}>
              <h2 className={sectionTitleClass}>{t("view.addBasisLine")}</h2>
              <p className="text-sm text-text-secondary">{t("view.addBasisLineHelp")}</p>
              <form action={addBasisLineAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="project_id" value={id} />
                <input type="hidden" name="invoice_id" value={invoiceId} />
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("view.basisTerm")}
                  <select name="term_id" required className={inputClass}>
                    {basisTerms.map((x) => (
                      <option key={x.id} value={x.id}>
                        {t(`basis.${x.basisType}`)}{x.label ? ` - ${x.label}` : ""} ({formatMoney(x.rateCents, x.currency, locale)})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("export.colQuantity")}
                  <input name="quantity" inputMode="decimal" defaultValue="1" className={`${inputClass} w-24`} />
                </label>
                <button type="submit" className={buttonClass}>{t("view.addBasisLineSubmit")}</button>
              </form>
            </InvoicePanel>
          ) : null}

          <InvoicePanel id="invoice-issue" testId="invoice-issue" gap={3}>
            <h2 className={sectionTitleClass}>{t("view.issueTitle")}</h2>
            <p className="text-sm text-text-secondary">{t("view.issueHelp")}</p>
            <form action={issueInvoiceAction} className="flex flex-col gap-3">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="project_id" value={id} />
              <input type="hidden" name="invoice_id" value={invoiceId} />
              <label className="flex items-start gap-2 text-sm text-text-primary">
                <input type="checkbox" name="tax_confirmed" value="yes" required className="mt-1" />
                <span>{t("view.taxConfirm")}</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={buttonClass} data-testid="invoice-issue-submit">{t("view.issueSubmit")}</button>
              </div>
            </form>
            <form action={discardDraftAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="project_id" value={id} />
              <input type="hidden" name="invoice_id" value={invoiceId} />
              <button type="submit" className={dangerClass}>{t("view.discard")}</button>
            </form>
          </InvoicePanel>
        </>
      ) : null}

      {/* ── issued: correction by credit note (the authorized issuer's accounting action) ── */}
      {issuerSide && isIssuedInvoice && !isCredited ? (
        <InvoicePanel id="correct" testId="invoice-correct" gap={3}>
          <h2 className={sectionTitleClass}>{t("view.correctTitle")}</h2>
          <p className="text-sm text-text-secondary">{t("view.correctHelp")}</p>
          <form action={correctInvoiceAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="project_id" value={id} />
            <input type="hidden" name="invoice_id" value={invoiceId} />
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("view.correctReason")}
              <input name="reason" required minLength={3} maxLength={500} className={`${inputClass} w-80`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("view.correctReference")}
              <input name="reference" maxLength={200} className={`${inputClass} w-56`} />
            </label>
            <button type="submit" className={dangerClass}>{t("view.correctSubmit")}</button>
          </form>
        </InvoicePanel>
      ) : null}

      {issuerSide && isIssuedInvoice && isCredited && h.billingPeriodId && !view.chain.some((c) => c.replacesId === h.id) ? (
        <InvoicePanel id="invoice-replace" testId="invoice-replace" gap={3}>
          <h2 className={sectionTitleClass}>{t("view.replaceTitle")}</h2>
          <p className="text-sm text-text-secondary">{t("view.replaceHelp")}</p>
          <form action={createInvoiceDraftAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="project_id" value={id} />
            <input type="hidden" name="period_id" value={h.billingPeriodId} />
            <input type="hidden" name="replaces_id" value={h.id} />
            <input type="hidden" name="customer_name" value={h.customerName} />
            <input type="hidden" name="customer_vat_id" value={h.customerVatId ?? ""} />
            <input type="hidden" name="customer_address" value={h.customerAddress ?? ""} />
            <input type="hidden" name="client_org_id" value={h.clientOrgId ?? ""} />
            <button type="submit" className={buttonClass}>{t("view.replaceSubmit")}</button>
          </form>
        </InvoicePanel>
      ) : null}

      {view.chain.length > 1 ? (
        <InvoicePanel id="invoice-chain" testId="invoice-chain" gap={2}>
          <h2 className={sectionTitleClass}>{t("view.chain")}</h2>
          <ol className="flex flex-col gap-2 text-sm text-text-primary">
            {view.chain.map((c) => (
              <li key={c.id} className="flex flex-col">
                <span>
                  <Link href={`/dashboard/projects/${id}/invoicing/${c.id}` as "/dashboard"} className="font-semibold text-brand-blue hover:underline">
                    {c.kind === "credit_note" ? t("chain.credit_note") : c.replacesId ? t("chain.replacement") : t("chain.original")} {c.number ?? ""}
                  </Link>
                  {c.id === h.id ? " *" : ""}
                  {c.grossCents != null ? ` - ${formatMoney(c.grossCents, c.currency, locale)}` : ""}
                </span>
                {c.reason ? (
                  <span className="text-meta text-text-muted">
                    {t("chain.reason")}: {c.reason}
                    {c.reference ? ` - ${t("chain.reference")}: ${c.reference}` : ""}
                    {c.actedAt ? ` - ${t("chain.actedAt")}: ${c.actedAt.slice(0, 10)}` : ""}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </InvoicePanel>
      ) : null}

      <section className="flex flex-wrap gap-3 text-sm" data-testid="invoice-export">
        <a className="text-brand-blue hover:underline" href={`/${locale}/dashboard/projects/${id}/invoicing/${invoiceId}/export?format=html`} target="_blank" rel="noopener noreferrer">
          {t("view.exportHtml")}
        </a>
        <a className="text-brand-blue hover:underline" href={`/${locale}/dashboard/projects/${id}/invoicing/${invoiceId}/export?format=csv`}>
          {t("view.exportCsv")}
        </a>
        <span className="text-meta text-text-muted">{t("view.exportNote")}</span>
      </section>
    </div>
  );
}
