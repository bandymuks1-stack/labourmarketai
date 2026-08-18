import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import {
  addProcurementOfferAction,
  createProcurementInquiryAction,
  selectProcurementOfferAction,
  setProcurementFinanceRecordAction,
  setProcurementStatusAction,
  submitProcurementApprovalAction,
  submitProcurementInquiryAction,
  syncProcurementApprovalAction,
  updateProcurementInquiryAction,
} from "@/lib/procurement/procurement-actions";
import {
  PROCUREMENT_DESCRIPTION_MAX,
  PROCUREMENT_DESCRIPTION_MIN,
  PROCUREMENT_OFFER_NOTE_MAX,
  PROCUREMENT_ORDER_REFERENCE_MAX,
  PROCUREMENT_QUANTITY_MAX,
  PROCUREMENT_SUPPLIER_MAX,
  PROCUREMENT_SUPPLIER_MIN,
  isProcurementEditable,
  isProcurementOfferable,
  type ProcurementInquiryRow,
  type ProcurementNotice,
} from "@/lib/procurement/procurement-model";
import { getProcurementOverview } from "@/lib/procurement/procurement";
import { formatCentsAsEur, type FinanceRecord } from "@/lib/finance/finance-model";
import { createUtcFormatter } from "@/lib/time/display";

/**
 * Procurement area of the finance page — the audit's MISSING "procurement"
 * row made real.
 *
 * Constitution note: deliberately NOT a new dashboard route. The blessed
 * pattern for new capability is expansion INSIDE an existing declared
 * surface (the network #approvals / planning #timesheets precedent); a
 * purchase inquiry ends as an invoice/expense on this very page, so the
 * area lives here under the #procurement anchor.
 *
 * Every control is a REAL RPC-backed action (writes are RPC-only, the
 * migration revokes direct DML). Approval decisions happen in the approvals
 * area (the canonical Workflow & Approval Engine) — this section links the
 * mirror and re-implements nothing. Recording an offer contacts no
 * supplier; nothing here orders or pays anything.
 *
 * Honest degradation: while the human-gated procurement migration is
 * unapplied the whole area shows a calm "not enabled yet" state.
 */

const STATUS_TONE: Record<ProcurementInquiryRow["status"], string> = {
  draft: "border-ink-500 text-text-muted",
  submitted: "border-brand-blue/50 text-brand-blue",
  decided: "border-state-success/50 text-state-success",
  ordered: "border-brand-orange/50 text-brand-orange",
  closed: "border-ink-500 text-text-secondary",
  cancelled: "border-ink-500 text-text-muted",
};

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
  "approval_cleared",
];

export async function ProcurementSection({
  locale,
  notice,
  financeRecords,
}: {
  locale: string;
  notice: ProcurementNotice | null;
  /** The caller's own finance records (for the invoice-link select) —
   *  passed in so the page reads them exactly once. */
  financeRecords: readonly FinanceRecord[];
}) {
  const t = await getTranslations("procurement");
  const dateFmt = createUtcFormatter(locale, { dateStyle: "medium" });
  const overview = await getProcurementOverview();

  if (overview.status === "not-authed") return null;

  const header = (
    <div className="flex flex-col gap-1">
      <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
        {t("title")}
      </h2>
      <p className="text-xs text-text-muted">{t("intro")}</p>
    </div>
  );

  const noticeBanner = notice ? (
    <p
      role="status"
      className={`rounded-md border px-3 py-2 text-sm ${
        (SUCCESS_NOTICES as readonly string[]).includes(notice)
          ? "border-state-success/50 bg-state-success/10 text-state-success"
          : "border-state-warning/50 bg-state-warning/10 text-text-primary"
      }`}
      data-testid={`procurement-notice-${notice}`}
    >
      {t(`notice.${notice}`)}
    </p>
  ) : null;

  if (overview.status === "needs-migration") {
    return (
      <section
        id="procurement"
        className="flex flex-col gap-3"
        data-testid="procurement-section"
      >
        {header}
        {noticeBanner}
        <p
          className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
          data-testid="procurement-needs-migration"
        >
          {t("needsMigration")}
        </p>
      </section>
    );
  }

  const { inquiries, offers, orgOptions } = overview;
  const invoiceOptions = financeRecords.filter(
    (r) => r.recordType === "invoice_received",
  );

  function hidden(inquiryId?: string) {
    return (
      <>
        <input type="hidden" name="locale" value={locale} />
        {inquiryId ? (
          <input type="hidden" name="inquiryId" value={inquiryId} />
        ) : null}
      </>
    );
  }

  return (
    <section
      id="procurement"
      className="flex flex-col gap-3"
      data-testid="procurement-section"
    >
      {header}
      {noticeBanner}
      {overview.error ? (
        <p className="rounded-md border border-state-warning/50 bg-state-warning/10 px-3 py-2 text-sm text-text-primary">
          {t("readError")}
        </p>
      ) : null}

      {/* Create — offered only where the caller belongs to an org. */}
      {orgOptions.length > 0 ? (
        <details
          className="rounded-md border border-ink-500 bg-ink-800/30 p-3"
          data-testid="procurement-create"
        >
          <summary className="cursor-pointer text-sm font-semibold text-text-primary">
            {t("form.open")}
          </summary>
          <form
            action={createProcurementInquiryAction}
            className="mt-3 flex flex-col gap-3"
          >
            {hidden()}
            <label className="flex flex-col gap-1">
              <Label>{t("form.orgLabel")}</Label>
              <Select name="organizationId" defaultValue={orgOptions[0]!.organizationId}>
                {orgOptions.map((o) => (
                  <option key={o.organizationId} value={o.organizationId}>
                    {o.name ?? o.organizationId.slice(0, 8)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <Label>{t("form.descriptionLabel")}</Label>
              <textarea
                name="itemDescription"
                minLength={PROCUREMENT_DESCRIPTION_MIN}
                maxLength={PROCUREMENT_DESCRIPTION_MAX}
                rows={2}
                required
                placeholder={t("form.descriptionPlaceholder")}
                className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <Label>{t("form.quantityLabel")}</Label>
                <Input
                  name="quantity"
                  maxLength={PROCUREMENT_QUANTITY_MAX}
                  placeholder={t("form.quantityPlaceholder")}
                />
              </label>
              <label className="flex flex-col gap-1">
                <Label>{t("form.budgetLabel")}</Label>
                <Input
                  name="estimatedBudget"
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </label>
            </div>
            <div>
              <Button type="submit" size="sm" data-testid="procurement-create-submit">
                {t("form.submit")}
              </Button>
            </div>
          </form>
        </details>
      ) : null}

      {inquiries.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-secondary"
          data-testid="procurement-empty"
        >
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="procurement-list">
          {inquiries.map((inquiry) => {
            const inquiryOffers = offers.get(inquiry.id) ?? [];
            return (
              <li
                key={inquiry.id}
                className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/30 p-3"
                data-testid={`procurement-inquiry-${inquiry.id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 break-words text-sm font-semibold text-text-primary">
                    {inquiry.itemDescription}
                  </p>
                  {inquiry.estimatedBudgetCents !== null ? (
                    <span className="shrink-0 text-sm tabular-nums text-text-secondary">
                      ~{formatCentsAsEur(inquiry.estimatedBudgetCents)} €
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 ${STATUS_TONE[inquiry.status]}`}
                  >
                    {t(`status.${inquiry.status}`)}
                  </span>
                  {inquiry.approvalStatus ? (
                    <span data-testid={`procurement-approval-${inquiry.approvalStatus}`}>
                      {t(`approval.${inquiry.approvalStatus}`)}
                    </span>
                  ) : null}
                  {inquiry.quantity ? <span>{inquiry.quantity}</span> : null}
                  <span>{dateFmt(inquiry.createdAt)}</span>
                  {inquiry.orderReference ? (
                    <span>
                      {t("orderRefLabel")}: {inquiry.orderReference}
                    </span>
                  ) : null}
                  {inquiry.financeRecordId ? (
                    <span data-testid="procurement-invoice-linked">
                      {t("invoiceLinked")}
                    </span>
                  ) : null}
                </div>

                {/* Offers — comparison IS this list. */}
                {inquiryOffers.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {inquiryOffers.map((offer) => (
                      <li
                        key={offer.id}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs ${
                          inquiry.selectedOfferId === offer.id
                            ? "border-state-success/50 bg-state-success/10"
                            : "border-ink-600 bg-ink-800/40"
                        }`}
                        data-testid={`procurement-offer-${offer.id}`}
                      >
                        <span className="min-w-0 break-words text-text-primary">
                          {offer.supplierName}
                          {offer.note ? (
                            <span className="text-text-muted"> — {offer.note}</span>
                          ) : null}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums text-text-primary">
                            {formatCentsAsEur(offer.amountCents)} €
                          </span>
                          {inquiry.selectedOfferId === offer.id ? (
                            <span className="text-state-success">
                              {t("offerSelected")}
                            </span>
                          ) : inquiry.status === "submitted" ? (
                            <form action={selectProcurementOfferAction}>
                              {hidden(inquiry.id)}
                              <input type="hidden" name="offerId" value={offer.id} />
                              <Button
                                type="submit"
                                variant="secondary"
                                size="sm"
                                data-testid={`procurement-select-offer-${offer.id}`}
                              >
                                {t("actions.selectOffer")}
                              </Button>
                            </form>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : isProcurementOfferable(inquiry.status) ? (
                  <p className="text-xs text-text-muted">{t("noOffers")}</p>
                ) : null}

                {/* Record an offer (draft/submitted). */}
                {isProcurementOfferable(inquiry.status) ? (
                  <details className="rounded-md border border-ink-600 bg-ink-800/40 p-2">
                    <summary className="cursor-pointer text-xs text-text-secondary">
                      {t("actions.addOffer")}
                    </summary>
                    <form
                      action={addProcurementOfferAction}
                      className="mt-2 flex flex-col gap-2"
                    >
                      {hidden(inquiry.id)}
                      <label className="flex flex-col gap-1">
                        <Label>{t("form.supplierLabel")}</Label>
                        <Input
                          name="supplierName"
                          minLength={PROCUREMENT_SUPPLIER_MIN}
                          maxLength={PROCUREMENT_SUPPLIER_MAX}
                          required
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <Label>{t("form.offerAmountLabel")}</Label>
                        <Input
                          name="amount"
                          inputMode="decimal"
                          placeholder="0.00"
                          required
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <Label>{t("form.offerNoteLabel")}</Label>
                        <Input name="note" maxLength={PROCUREMENT_OFFER_NOTE_MAX} />
                      </label>
                      <div>
                        <Button type="submit" variant="secondary" size="sm">
                          {t("actions.saveOffer")}
                        </Button>
                      </div>
                    </form>
                  </details>
                ) : null}

                {/* Edit a draft's fields. */}
                {isProcurementEditable(inquiry.status) ? (
                  <details className="rounded-md border border-ink-600 bg-ink-800/40 p-2">
                    <summary className="cursor-pointer text-xs text-text-secondary">
                      {t("actions.edit")}
                    </summary>
                    <form
                      action={updateProcurementInquiryAction}
                      className="mt-2 flex flex-col gap-2"
                    >
                      {hidden(inquiry.id)}
                      <label className="flex flex-col gap-1">
                        <Label>{t("form.descriptionLabel")}</Label>
                        <textarea
                          name="itemDescription"
                          defaultValue={inquiry.itemDescription}
                          minLength={PROCUREMENT_DESCRIPTION_MIN}
                          maxLength={PROCUREMENT_DESCRIPTION_MAX}
                          rows={2}
                          required
                          className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors focus:border-brand-blue"
                        />
                      </label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <Label>{t("form.quantityLabel")}</Label>
                          <Input
                            name="quantity"
                            defaultValue={inquiry.quantity ?? ""}
                            maxLength={PROCUREMENT_QUANTITY_MAX}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <Label>{t("form.budgetLabel")}</Label>
                          <Input
                            name="estimatedBudget"
                            inputMode="decimal"
                            defaultValue={
                              inquiry.estimatedBudgetCents === null
                                ? ""
                                : formatCentsAsEur(inquiry.estimatedBudgetCents)
                            }
                          />
                        </label>
                      </div>
                      <div>
                        <Button type="submit" variant="secondary" size="sm">
                          {t("actions.save")}
                        </Button>
                      </div>
                    </form>
                  </details>
                ) : null}

                {/* Real transitions per status. */}
                <div className="flex flex-wrap items-center gap-2">
                  {inquiry.status === "draft" ? (
                    <form action={submitProcurementInquiryAction}>
                      {hidden(inquiry.id)}
                      <Button
                        type="submit"
                        size="sm"
                        data-testid={`procurement-submit-${inquiry.id}`}
                      >
                        {t("actions.submit")}
                      </Button>
                    </form>
                  ) : null}
                  {inquiry.status === "submitted" &&
                  inquiry.approvalStatus === null ? (
                    <form action={submitProcurementApprovalAction}>
                      {hidden(inquiry.id)}
                      <Button type="submit" variant="secondary" size="sm">
                        {t("actions.requestApproval")}
                      </Button>
                    </form>
                  ) : null}
                  {inquiry.approvalStatus === "pending" ? (
                    <form action={syncProcurementApprovalAction}>
                      {hidden(inquiry.id)}
                      <Button type="submit" variant="secondary" size="sm">
                        {t("actions.checkApproval")}
                      </Button>
                    </form>
                  ) : null}
                  {inquiry.status === "decided" ? (
                    <form
                      action={setProcurementStatusAction}
                      className="flex flex-wrap items-center gap-2"
                    >
                      {hidden(inquiry.id)}
                      <input type="hidden" name="status" value="ordered" />
                      <Input
                        name="orderReference"
                        maxLength={PROCUREMENT_ORDER_REFERENCE_MAX}
                        placeholder={t("form.orderRefPlaceholder")}
                        className="max-w-48"
                      />
                      <Button type="submit" variant="secondary" size="sm">
                        {t("actions.markOrdered")}
                      </Button>
                    </form>
                  ) : null}
                  {inquiry.status === "decided" || inquiry.status === "ordered" ? (
                    <form action={setProcurementStatusAction}>
                      {hidden(inquiry.id)}
                      <input type="hidden" name="status" value="closed" />
                      <Button type="submit" variant="secondary" size="sm">
                        {t("actions.close")}
                      </Button>
                    </form>
                  ) : null}
                  {inquiry.status === "draft" || inquiry.status === "submitted" ? (
                    <form action={setProcurementStatusAction}>
                      {hidden(inquiry.id)}
                      <input type="hidden" name="status" value="cancelled" />
                      <Button type="submit" variant="secondary" size="sm">
                        {t("actions.cancel")}
                      </Button>
                    </form>
                  ) : null}
                </div>

                {/* Invoice link (decided/ordered/closed). */}
                {(inquiry.status === "decided" ||
                  inquiry.status === "ordered" ||
                  inquiry.status === "closed") &&
                invoiceOptions.length > 0 ? (
                  <form
                    action={setProcurementFinanceRecordAction}
                    className="flex flex-wrap items-center gap-2"
                  >
                    {hidden(inquiry.id)}
                    <Select
                      name="financeRecordId"
                      defaultValue={inquiry.financeRecordId ?? ""}
                      className="max-w-72"
                    >
                      <option value="">{t("form.invoiceNone")}</option>
                      {invoiceOptions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title} — {formatCentsAsEur(r.amountCents)} €
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" variant="secondary" size="sm">
                      {t("actions.linkInvoice")}
                    </Button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
