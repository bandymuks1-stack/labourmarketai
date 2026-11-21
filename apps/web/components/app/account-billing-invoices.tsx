import {
  formatInvoiceAmount,
  formatInvoiceDate,
  type OrgInvoiceStatus,
  type OrgInvoicesResult,
} from "@/lib/billing/org-invoices-core";

export interface AccountBillingInvoicesLabels {
  readonly title: string;
  readonly billingOff: string;
  readonly noCustomer: string;
  readonly unknown: string;
  readonly empty: string;
  readonly incomplete: string;
  readonly number: string;
  readonly noNumber: string;
  readonly date: string;
  readonly period: string;
  readonly oneTime: string;
  readonly excludingVat: string;
  readonly vat: string;
  readonly total: string;
  readonly notReported: string;
  readonly view: string;
  readonly pdf: string;
  readonly opensStripe: string;
  readonly status: Readonly<Record<OrgInvoiceStatus, string>>;
}

const STATUS_TONE: Record<OrgInvoiceStatus, string> = {
  paid: "border-state-success/40 text-state-success",
  open: "border-state-amber/50 text-state-amber",
  void: "border-border-subtle text-text-muted",
  uncollectible: "border-state-warning/50 text-state-warning",
};

/**
 * The organization's invoices inside the account billing section (registry
 * 7.20). Presentational and synchronous: the section awaits
 * `readOrganizationInvoices()` (server, live Stripe read) and passes the
 * result here. `not_authorized` renders NOTHING — a member without billing
 * authority sees no invoice block at all. A failed read says the list is
 * unknown; it never reads as "no invoices".
 */
export function AccountBillingInvoices({
  result,
  locale,
  labels,
}: {
  result: OrgInvoicesResult | null;
  locale: string;
  labels: AccountBillingInvoicesLabels;
}) {
  if (!result || result.state === "not_authorized") return null;

  const note = (text: string, tone = "text-text-secondary") => (
    <p className={`text-sm ${tone}`} data-testid="account-billing-invoices-note">
      {text}
    </p>
  );

  return (
    <div
      className="mt-2 flex flex-col gap-2 border-t border-border-subtle pt-3"
      data-testid="account-billing-invoices"
      data-invoices-state={result.state}
    >
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.title}</p>
      {result.state === "billing_off" ? note(labels.billingOff) : null}
      {result.state === "no_customer" ? note(labels.noCustomer) : null}
      {result.state === "unknown" ? note(labels.unknown, "text-state-warning") : null}
      {result.state === "list" ? (
        <>
          {result.invoices.length === 0 ? note(labels.empty) : null}
          {result.invoices.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="account-billing-invoice-list">
              {result.invoices.map((inv) => {
                const money = (v: number | null) =>
                  formatInvoiceAmount(v, inv.currency, locale) ?? labels.notReported;
                const period =
                  inv.periodStart !== null && inv.periodEnd !== null
                    ? `${formatInvoiceDate(inv.periodStart, locale)} – ${formatInvoiceDate(inv.periodEnd, locale)}`
                    : labels.oneTime;
                return (
                  <li
                    key={inv.id}
                    className="rounded-md border border-border-subtle px-3 py-2"
                    data-testid="account-billing-invoice"
                    data-invoice-status={inv.status}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-text-primary">
                        <span className="sr-only">{labels.number}: </span>
                        {inv.number ?? labels.noNumber}
                      </p>
                      <span
                        className={`rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${STATUS_TONE[inv.status]}`}
                      >
                        {labels.status[inv.status]}
                      </span>
                    </div>
                    <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-sm">
                      <dt className="text-text-muted">{labels.date}</dt>
                      <dd className="text-text-secondary">{formatInvoiceDate(inv.created, locale)}</dd>
                      <dt className="text-text-muted">{labels.period}</dt>
                      <dd className="text-text-secondary">{period}</dd>
                      <dt className="text-text-muted">{labels.excludingVat}</dt>
                      <dd className="tabular-nums text-text-secondary">{money(inv.amountExcludingTax)}</dd>
                      <dt className="text-text-muted">{labels.vat}</dt>
                      <dd className="tabular-nums text-text-secondary">{money(inv.tax)}</dd>
                      <dt className="text-text-muted">{labels.total}</dt>
                      <dd className="tabular-nums font-semibold text-text-primary">{money(inv.total)}</dd>
                    </dl>
                    {inv.hostedInvoiceUrl || inv.invoicePdfUrl ? (
                      <p className="mt-1 flex flex-wrap gap-3 text-sm">
                        {inv.hostedInvoiceUrl ? (
                          <a
                            href={inv.hostedInvoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-blue underline-offset-2 hover:underline"
                            data-testid="account-billing-invoice-view"
                          >
                            {labels.view}
                            <span className="sr-only"> ({labels.opensStripe})</span>
                          </a>
                        ) : null}
                        {inv.invoicePdfUrl ? (
                          <a
                            href={inv.invoicePdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-blue underline-offset-2 hover:underline"
                            data-testid="account-billing-invoice-pdf"
                          >
                            {labels.pdf}
                            <span className="sr-only"> ({labels.opensStripe})</span>
                          </a>
                        ) : null}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {result.incomplete ? note(labels.incomplete, "text-state-warning") : null}
        </>
      ) : null}
    </div>
  );
}
