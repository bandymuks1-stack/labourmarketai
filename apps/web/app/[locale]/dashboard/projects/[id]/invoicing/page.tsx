import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { InvoiceNote, InvoicePanel } from "@/components/app/invoice-panel";
import { createClient } from "@/lib/supabase/server";
import { getProjectManageFacts } from "@/lib/projects/responsible";
import {
  countUnattributedEntries,
  getPeriodChanges,
  getPeriodPreview,
  getProjectInvoicing,
} from "@/lib/finance/project-invoice";
import {
  BASIS_TYPES,
  formatMoney,
  formatNumberPreview,
  selectionKey,
  summarizePreview,
  totalsByCurrency,
  type BillingPeriod,
  type RateTerm,
  type SeriesConfig,
  type SeriesDocumentType,
} from "@/lib/finance/project-invoice-model";
import { TAX_TREATMENTS } from "@/lib/finance/invoice-tax-model";
import {
  addRateTermAction,
  archiveRecipientAction,
  configureSeriesAction,
  createInvoiceDraftAction,
  saveRecipientAction,
  createPeriodAction,
  endRateTermAction,
  saveTaxPresetAction,
} from "@/lib/finance/project-invoice-actions";

export const dynamic = "force-dynamic";

const NOTICE_KEYS = new Set([
  "term_created", "term_ended", "period_created", "draft_created", "draft_discarded", "line_added", "tax_saved",
  "invoice_issued", "corrected", "preset_saved", "invalid", "invalid_tax",
  "not_found", "not_allowed", "overlapping_term", "overlapping_period", "period_locked", "already_has_invoice",
  "nothing_billable", "ambiguous_rate_terms", "mixed_currency", "tax_confirmation_required",
  "tax_treatment_missing", "evidence_changed", "no_lines", "not_draft", "invalid_term", "already_billed",
  "invalid_client_org", "already_credited", "invalid_replacement", "already_replaced", "needs_migration", "project_has_no_organization",
  "recipient_saved", "recipient_archived", "series_saved", "recipient_missing", "recipient_incomplete", "recipient_not_found",
  "selection_not_billable", "time_basis_conflict", "over_credit", "invalid_line", "limit_reached",
  "error",
]);
const GOOD_NOTICES = new Set([
  "term_created", "term_ended", "period_created", "draft_created", "draft_discarded", "line_added", "tax_saved",
  "invoice_issued", "corrected", "preset_saved", "recipient_saved", "recipient_archived", "series_saved",
]);

const inputClass =
  "rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue";
const buttonClass =
  "inline-flex h-9 items-center rounded-lg border border-ink-500 px-3 text-xs font-semibold text-text-secondary transition-colors hover:border-brand-blue hover:text-brand-blue";
const sectionTitleClass = "font-mono text-meta uppercase tracking-label text-text-muted";
const chipClass =
  "inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary";

export default async function ProjectInvoicingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const notice = sp.notice && NOTICE_KEYS.has(sp.notice) ? sp.notice : null;
  const t = await getTranslations("projectInvoice");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const facts = await getProjectManageFacts(id);
  if (!facts) {
    return (
      <div className="mx-auto flex w-full max-w-content flex-col gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">{t("page.title")}</h1>
        <InvoiceNote className="p-4 text-sm text-text-secondary">{t("page.notAuthorized")}</InvoiceNote>
      </div>
    );
  }
  const orgId = facts.organizationId;
  const read = await getProjectInvoicing(id, orgId);
  if (read.kind !== "ok") {
    return (
      <div className="mx-auto flex w-full max-w-content flex-col gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">{t("page.title")}</h1>
        <InvoiceNote className="p-4 text-sm text-text-secondary" testId="invoicing-unavailable">
          {read.kind === "needs-migration" ? t("page.needsMigration") : t("page.readFailed")}
        </InvoiceNote>
      </div>
    );
  }
  const { rateTerms, periods, invoices, presets, recipients, series, totals } = read.value;
  const unattributed = orgId ? await countUnattributedEntries(orgId) : null;
  const money = (c: number, cur: string) => formatMoney(c, cur, locale);

  // per-period evidence: preview for open periods, changes for locked ones (bounded: 12 newest)
  const periodDetails = await Promise.all(
    periods.slice(0, 12).map(async (p: BillingPeriod) => ({
      period: p,
      preview: p.status !== "invoiced" ? await getPeriodPreview(p.id) : null,
      changes: p.status === "invoiced" ? await getPeriodChanges(p.id) : null,
    })),
  );
  const invoiceByPeriod = new Map(invoices.filter((i) => i.kind === "invoice" && !i.creditedAt).map((i) => [i.billingPeriodId, i] as const));
  const termLabel = (x: RateTerm) =>
    `${t(`basis.${x.basisType}`)}${x.unit && x.basisType === "quantity" ? ` (${x.unit})` : ""}${x.label ? ` - ${x.label}` : ""}`;

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6" data-testid="project-invoicing">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">{t("page.title")}</h1>
        <p className="text-sm text-text-secondary">{t("page.intro")}</p>
        <Link href={`/dashboard/projects/${id}/operations` as "/dashboard"} className="text-sm text-brand-blue hover:underline">
          {t("page.backToOperations")}
        </Link>
      </header>

      {notice ? (
        <InvoiceNote
          className={`text-sm ${GOOD_NOTICES.has(notice) ? "text-text-primary" : "text-state-warning"}`}
          role="status"
          testId="invoicing-notice"
        >
          {t(`notice.${notice}`)}
        </InvoiceNote>
      ) : null}

      <InvoiceNote className="p-3 text-meta leading-relaxed text-text-muted" testId="invoicing-tax-disclaimer">
        {t("tax.disclaimer")} {t("page.noPayment")}
      </InvoiceNote>

      {unattributed != null && unattributed > 0 ? (
        <InvoiceNote className="p-3 text-sm text-text-secondary" testId="invoicing-unattributed">
          {t("page.unattributed", { count: unattributed })}
        </InvoiceNote>
      ) : null}

      {/* ── 1. Agreed commercial basis ───────────────────────────── */}
      <InvoicePanel id="invoicing-terms" testId="invoicing-terms" gap={3}>
        <h2 className={sectionTitleClass}>{t("terms.title")}</h2>
        <p className="text-sm text-text-secondary">{t("terms.intro")}</p>
        {rateTerms.length === 0 ? (
          <p className="text-sm text-text-muted">{t("terms.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rateTerms.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
                <span className={chipClass}>{termLabel(x)}</span>
                <span className="font-semibold">
                  {money(x.rateCents, x.currency)}
                  {x.basisType === "hours" || x.basisType === "quantity" ? ` / ${x.unit ?? ""}` : ""}
                </span>
                <span className="text-text-muted">
                  {x.validFrom} - {x.validTo ?? t("terms.openEnded")}
                </span>
                {x.roleLabel ? <span className="text-text-muted">({x.roleLabel}; {t("terms.roleNotApplied")})</span> : null}
                {!x.validTo ? (
                  <form action={endRateTermAction} className="flex items-center gap-2">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="project_id" value={id} />
                    <input type="hidden" name="term_id" value={x.id} />
                    <label className="sr-only" htmlFor={`end-${x.id}`}>{t("terms.endDate")}</label>
                    <input id={`end-${x.id}`} type="date" name="valid_to" required min={x.validFrom} className={inputClass} />
                    <button type="submit" className={buttonClass}>{t("terms.end")}</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <form action={addRateTermAction} className="grid gap-3 sm:grid-cols-2" data-testid="invoicing-term-form">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="project_id" value={id} />
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("terms.basis")}
            <select name="basis_type" className={inputClass} defaultValue="hours">
              {BASIS_TYPES.map((b) => (
                <option key={b} value={b}>{t(`basis.${b}`)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("terms.unit")}
            <input name="unit" maxLength={60} className={inputClass} />
            <span className="text-text-muted">{t("terms.unitHint")}</span>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("terms.rate")}
            <input name="rate" inputMode="decimal" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("terms.currency")}
            <input name="currency" required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" className={`${inputClass} uppercase`} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("terms.label")}
            <input name="label" maxLength={160} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("terms.roleLabel")}
            <input name="role_label" maxLength={120} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("terms.validFrom")}
            <input type="date" name="valid_from" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("terms.validTo")}
            <input type="date" name="valid_to" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary sm:col-span-2">
            {t("terms.note")}
            <input name="note" maxLength={1000} className={inputClass} />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className={buttonClass}>{t("terms.submit")}</button>
          </div>
        </form>
      </InvoicePanel>

      {/* ── 2. Tax presets (form pre-fill only) ──────────────────── */}
      {orgId ? (
        <InvoicePanel id="invoicing-presets" testId="invoicing-presets" gap={3}>
          <h2 className={sectionTitleClass}>{t("presets.title")}</h2>
          <p className="text-sm text-text-secondary">{t("presets.intro")}</p>
          {presets.length === 0 ? (
            <p className="text-sm text-text-muted">{t("presets.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm text-text-primary">
              {presets.map((p) => (
                <li key={p.id}>
                  <span className="font-semibold">{p.label}</span>: {t(`tax.treatment.${p.treatment}`)}
                  {p.ratePercent ? ` ${p.ratePercent}%` : ""}
                  {p.noteText ? <span className="text-text-muted"> - {p.noteText}</span> : null}
                </li>
              ))}
            </ul>
          )}
          <form action={saveTaxPresetAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="project_id" value={id} />
            <input type="hidden" name="organization_id" value={orgId} />
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("presets.label")}
              <input name="label" required maxLength={80} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("tax.treatmentLabel")}
              <select name="treatment" className={inputClass} defaultValue="standard">
                {TAX_TREATMENTS.map((x) => (
                  <option key={x} value={x}>{t(`tax.treatment.${x}`)}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("tax.rateLabel")}
              <input name="rate_percent" inputMode="decimal" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("tax.noteLabel")}
              <input name="note_text" maxLength={500} className={inputClass} />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className={buttonClass}>{t("presets.save")}</button>
            </div>
          </form>
        </InvoicePanel>
      ) : null}

      {/* ── 2b. Recipients: the issuer's own contact book ─────────── */}
      {orgId ? (
        <InvoicePanel id="invoicing-recipients" testId="invoicing-recipients" gap={3}>
          <h2 className={sectionTitleClass}>{t("recipients.title")}</h2>
          <p className="text-sm text-text-secondary">{t("recipients.intro")}</p>
          {recipients.length === 0 ? (
            <p className="text-sm text-text-muted">{t("recipients.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recipients.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
                  <span className="font-semibold">{r.legalName}</span>
                  <span className="text-text-muted">{[r.address, r.country, r.taxId].filter(Boolean).join(" - ") || t("recipients.incomplete")}</span>
                  <form action={archiveRecipientAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="project_id" value={id} />
                    <input type="hidden" name="recipient_id" value={r.id} />
                    <button type="submit" className={buttonClass}>{t("recipients.archive")}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={saveRecipientAction} className="grid gap-3 sm:grid-cols-2" data-testid="recipient-form">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="project_id" value={id} />
            <input type="hidden" name="organization_id" value={orgId} />
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("recipients.legalName")}
              <input name="legal_name" required minLength={2} maxLength={160} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("recipients.country")}
              <input name="country" minLength={2} maxLength={2} pattern="[A-Za-z]{2}" className={`${inputClass} uppercase`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary sm:col-span-2">
              {t("recipients.address")}
              <input name="address" maxLength={400} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("recipients.taxId")}
              <input name="tax_id" maxLength={60} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("recipients.reference")}
              <input name="reference" maxLength={200} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("recipients.contactName")}
              <input name="contact_name" maxLength={160} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("recipients.contactEmail")}
              <input name="contact_email" type="email" maxLength={200} className={inputClass} />
            </label>
            <div className="sm:col-span-2 flex flex-col gap-1">
              <p className="text-meta text-text-muted">{t("recipients.minimum")}</p>
              <div><button type="submit" className={buttonClass}>{t("recipients.save")}</button></div>
            </div>
          </form>
        </InvoicePanel>
      ) : null}

      {/* ── 2c. Numbering series: configured by the issuing organization ── */}
      {orgId ? (
        <InvoicePanel id="invoicing-series" testId="invoicing-series" gap={3}>
          <h2 className={sectionTitleClass}>{t("series.title")}</h2>
          <p className="text-sm text-text-secondary">{t("series.intro")}</p>
          {(["invoice", "credit_note"] as SeriesDocumentType[]).map((dt) => {
            const cfg: SeriesConfig | undefined = series.find((x) => x.documentType === dt);
            return (
              <form key={dt} action={configureSeriesAction} className="flex flex-wrap items-end gap-3" data-testid={`series-${dt}`}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="project_id" value={id} />
                <input type="hidden" name="organization_id" value={orgId} />
                <input type="hidden" name="document_type" value={dt} />
                <span className="w-32 text-sm font-semibold text-text-primary">{t(`kind.${dt}`)}</span>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("series.prefix")}
                  <input name="prefix" maxLength={20} defaultValue={cfg?.prefix ?? ""} className={`${inputClass} w-28`} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("series.separator")}
                  <input name="separator" maxLength={3} defaultValue={cfg?.separator ?? "-"} className={`${inputClass} w-16`} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {t("series.pad")}
                  <input name="pad" type="number" min={1} max={12} defaultValue={cfg?.pad ?? 4} className={`${inputClass} w-20`} />
                </label>
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input type="checkbox" name="year_based" value="yes" defaultChecked={cfg?.yearBased ?? false} />
                  {t("series.yearBased")}
                </label>
                <button type="submit" className={buttonClass}>{t("series.save")}</button>
                <span className="text-meta text-text-muted">
                  {cfg ? t("series.example", { example: formatNumberPreview(cfg, new Date().getUTCFullYear(), 1) }) : t("series.notConfigured")}
                </span>
              </form>
            );
          })}
          <p className="text-meta text-text-muted">{t("series.note")}</p>
        </InvoicePanel>
      ) : null}

      {/* ── 3. Billing periods ───────────────────────────────────── */}
      <InvoicePanel id="invoicing-periods" testId="invoicing-periods" gap={4}>
        <h2 className={sectionTitleClass}>{t("periods.title")}</h2>
        <p className="text-sm text-text-secondary">{t("periods.intro")}</p>
        <form action={createPeriodAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="project_id" value={id} />
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("periods.start")}
            <input type="date" name="period_start" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("periods.end")}
            <input type="date" name="period_end" required className={inputClass} />
          </label>
          <button type="submit" className={buttonClass}>{t("periods.create")}</button>
        </form>
        {periods.length === 0 ? <p className="text-sm text-text-muted">{t("periods.empty")}</p> : null}
        {periodDetails.map(({ period, preview, changes }) => {
          const inv = invoiceByPeriod.get(period.id);
          const sum = preview && preview.kind === "ok" ? summarizePreview(preview.value) : null;
          const previewRows = preview && preview.kind === "ok" ? preview.value : [];
          return (
            <article key={period.id} className="flex flex-col gap-3 rounded-lg border border-ink-500 p-4" data-testid={`period-${period.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-text-primary">{period.periodStart} - {period.periodEnd}</span>
                <span className={chipClass}>{t(`periods.status.${period.status}`)}</span>
                {inv ? (
                  <Link href={`/dashboard/projects/${id}/invoicing/${inv.id}` as "/dashboard"} className="text-sm text-brand-blue hover:underline">
                    {t(`status.${inv.status}` as "status.draft")} {inv.invoiceNumber ?? ""} {"->"}
                  </Link>
                ) : null}
              </div>

              {sum ? (
                <>
                  <ul className="flex flex-wrap gap-2 text-meta text-text-secondary" data-testid="period-summary">
                    <li className={chipClass}>{t("periods.summary.billable", { rows: sum.billableRows, hours: sum.billableHours })}</li>
                    {sum.clientAcceptedRows > 0 ? <li className={chipClass}>{t("periods.summary.clientAccepted", { rows: sum.clientAcceptedRows })}</li> : null}
                    {sum.unpricedRows > 0 ? <li className={chipClass}>{t("periods.summary.unpriced", { rows: sum.unpricedRows })}</li> : null}
                    {sum.notConfirmed > 0 ? <li className={chipClass}>{t("periods.summary.notConfirmed", { rows: sum.notConfirmed })}</li> : null}
                    {sum.clientDisputed > 0 ? <li className={chipClass}>{t("periods.summary.clientDisputed", { rows: sum.clientDisputed })}</li> : null}
                    {sum.alreadyBilled > 0 ? <li className={chipClass}>{t("periods.summary.alreadyBilled", { rows: sum.alreadyBilled })}</li> : null}
                  </ul>
                  <p className="text-meta text-text-muted">{t("periods.summary.basis")}</p>
                  {!inv && sum.billableRows > 0 ? (
                    <form action={createInvoiceDraftAction} className="flex flex-col gap-3" data-testid="draft-form">
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="project_id" value={id} />
                      <input type="hidden" name="period_id" value={period.id} />
                      <input type="hidden" name="explicit" value="1" />
                      <fieldset className="flex flex-col gap-1">
                        <legend className="text-xs font-semibold text-text-secondary">{t("draft.selectEvidence")}</legend>
                        <p className="text-meta text-text-muted">{t("draft.selectEvidenceHelp")}</p>
                        {previewRows.filter((r) => r.eligibility === "billable" && r.termId).map((r) => (
                          <label key={selectionKey(r)} className="flex items-center gap-2 text-sm text-text-primary">
                            <input type="checkbox" name="pick" value={selectionKey(r)} defaultChecked />
                            <span>
                              {r.workDay} - {r.kind === "hours" ? `${r.hours} h` : `${r.quantity} ${r.unit ?? ""}`} - {t(`evidence.${r.evidenceClass}`)}
                            </span>
                          </label>
                        ))}
                        {previewRows.filter((r) => r.eligibility === "billable" && !r.termId).map((r) => (
                          <p key={selectionKey(r)} className="text-meta text-text-muted">
                            {r.workDay} - {r.kind === "hours" ? `${r.hours} h` : `${r.quantity} ${r.unit ?? ""}`} - {t("draft.noAgreedRate")}
                          </p>
                        ))}
                        {previewRows.filter((r) => r.eligibility !== "billable").map((r) => (
                          <p key={selectionKey(r)} className="text-meta text-text-muted">
                            {r.workDay} - {r.kind === "hours" ? `${r.hours} h` : `${r.quantity} ${r.unit ?? ""}`} - {t(`draft.held.${r.eligibility}`)}
                          </p>
                        ))}
                      </fieldset>
                      <label className="flex flex-col gap-1 text-xs text-text-secondary">
                        {t("draft.recipient")}
                        <select name="recipient_id" required className={inputClass} defaultValue="">
                          <option value="" disabled>{t("draft.chooseRecipient")}</option>
                          {recipients.map((r) => (
                            <option key={r.id} value={r.id}>{r.legalName}{r.country ? ` (${r.country})` : ""}</option>
                          ))}
                        </select>
                        {recipients.length === 0 ? <span className="text-state-warning">{t("draft.noRecipientYet")}</span> : null}
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-text-secondary">
                        {t("draft.dueDate")}
                        <input type="date" name="due_date" className={inputClass} />
                      </label>
                      <div>
                        <button type="submit" className={buttonClass}>{t("draft.create")}</button>
                      </div>
                    </form>
                  ) : null}
                </>
              ) : null}

              {changes && changes.kind === "ok" ? (
                <div data-testid="period-changes">
                  <h3 className="text-sm font-semibold text-text-primary">{t("changes.title")}</h3>
                  {changes.value.length === 0 ? (
                    <p className="text-meta text-text-muted">{t("changes.none")}</p>
                  ) : (
                    <>
                      <p className="text-meta text-state-warning">{t("changes.intro")}</p>
                      <ul className="mt-1 flex flex-col gap-1 text-meta text-text-secondary">
                        {changes.value.map((c) => (
                          <li key={`${c.entryId}-${c.sourceKey}-${c.kind}`}>{t(`changes.kind.${c.kind}`)} - {c.sourceKey}</li>
                        ))}
                      </ul>
                      {inv ? (
                        <Link href={`/dashboard/projects/${id}/invoicing/${inv.id}#correct` as "/dashboard"} className="text-sm text-brand-blue hover:underline" data-testid="start-correction-link">
                          {t("changes.startCorrection")} {"->"}
                        </Link>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </InvoicePanel>

      {/* ── 4. Invoices ─────────────────────────────────────────── */}
      <InvoicePanel id="invoicing-invoices" testId="invoicing-invoices" gap={3}>
        <h2 className={sectionTitleClass}>{t("invoices.title")}</h2>
        {totals.length > 0 ? (
          <div className="flex flex-col gap-1" data-testid="invoicing-totals">
            {[...totalsByCurrency(totals).entries()].map(([cur, rows]) => (
              <p key={cur} className="text-sm text-text-primary">
                <span className="font-semibold">{cur}</span>:{" "}
                {rows.map((r) => `${t(`kind.${r.kind}`)} ${money(r.grossCents, r.currency)} (${r.documents})`).join(" - ")}
              </p>
            ))}
            <p className="text-meta text-text-muted">{t("invoices.totalsNote")}</p>
          </div>
        ) : null}
        {invoices.length === 0 ? (
          <p className="text-sm text-text-muted">{t("invoices.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
                <span className={chipClass}>{t(`kind.${i.kind}`)}</span>
                <span className={chipClass}>{i.creditedAt ? t("status.credited") : t(`status.${i.status}` as "status.draft")}</span>
                <Link href={`/dashboard/projects/${id}/invoicing/${i.id}` as "/dashboard"} className="font-semibold text-brand-blue hover:underline">
                  {i.invoiceNumber ?? t("invoices.draftNoNumber")}
                </Link>
                <span>{i.customerName}</span>
                <span className="text-text-muted">
                  {i.grossTotalCents != null ? money(i.grossTotalCents, i.currency) : `${t("invoices.netOnly")} ${money(i.netTotalCents ?? 0, i.currency)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </InvoicePanel>
    </div>
  );
}
