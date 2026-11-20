import { formatMinorAmount, type CustomerTaxEvidence } from "@/lib/billing/tax-evidence-read";

const VAT_ID_STATUSES = ["pending", "verified", "unverified", "unavailable", "unknown"] as const;
type VatIdStatus = (typeof VAT_ID_STATUSES)[number];

export interface AccountBillingTaxLabels {
  readonly lastPayment: string;
  readonly total: string;
  readonly reverseCharge: string;
  readonly vatId: string;
  readonly invoice: string;
  readonly vatIdStatus: Readonly<Record<VatIdStatus, string>>;
}

/**
 * Account → billing: VAT of the LAST payment (Stripe Tax, owner order
 * 2026-10-23). The parent section reads the row ONLY while the Stripe Tax
 * switch is on, through the person's own RLS (lib/billing/tax-evidence-read);
 * no row → nothing renders. States what Stripe recorded — the VAT amount and
 * the VAT number check result as Stripe reported it — with no certification
 * wording and no figure we computed ourselves.
 */
export function AccountBillingTaxLine({
  row,
  locale,
  labels,
}: {
  row: CustomerTaxEvidence | null;
  locale: string;
  labels: AccountBillingTaxLabels;
}) {
  if (!row) return null;
  const vat = formatMinorAmount(row.amountTax, row.currency, locale);
  const total = formatMinorAmount(row.amountTotal, row.currency, locale);
  const status = VAT_ID_STATUSES.find((s) => s === row.taxIdVerificationStatus) ?? null;
  return (
    <div className="flex flex-col gap-1" data-testid="account-billing-tax">
      <p className="text-sm text-text-secondary">
        {labels.lastPayment}: {vat ?? "—"}
        {total ? ` · ${labels.total}: ${total}` : ""}
      </p>
      {row.reverseCharge ? (
        <p className="text-meta text-text-muted" data-testid="account-billing-tax-reverse">{labels.reverseCharge}</p>
      ) : null}
      {row.taxIdValue ? (
        <p className="text-meta text-text-muted" data-testid="account-billing-tax-id" data-status={status ?? "none"}>
          {labels.vatId}: {row.taxIdValue} · {status ? labels.vatIdStatus[status] : "—"}
        </p>
      ) : null}
      {row.invoiceUrl ? (
        <a
          href={row.invoiceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-meta text-brand-blue underline-offset-2 hover:underline"
        >
          {labels.invoice}
        </a>
      ) : null}
    </div>
  );
}
