import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Customer-facing read of the LAST payment's tax evidence (account billing
 * section). Runs through the caller's OWN RLS-scoped client: the table's only
 * SELECT policy is the billing_subscriptions predicate
 * (`owner_id = auth.uid() or public.is_admin()`), so a person sees the evidence
 * of payments they made and nothing else. No service role here — ever.
 *
 * Scoped further by the server-resolved organization and the adapter mode, so
 * a test payment never shows on a live account and one workspace's payment
 * never shows in another.
 */

export interface CustomerTaxEvidence {
  readonly amountTax: number | null;
  readonly amountTotal: number | null;
  readonly currency: string | null;
  readonly reverseCharge: boolean;
  readonly taxIdValue: string | null;
  readonly taxIdVerificationStatus: string | null;
  readonly invoiceUrl: string | null;
  readonly createdAt: string;
}

export const CUSTOMER_TAX_EVIDENCE_COLUMNS =
  "amount_tax, amount_total, currency, reverse_charge, tax_id_value, tax_id_verification_status, invoice_url, created_at";

export async function readLatestTaxEvidence(
  supabase: SupabaseClient,
  scope: { readonly organizationId: string; readonly testMode: boolean },
): Promise<CustomerTaxEvidence | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("billing_tax_evidence")
    .select(CUSTOMER_TAX_EVIDENCE_COLUMNS)
    .eq("organization_id", scope.organizationId)
    .eq("test_mode", scope.testMode)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // 42P01 (not applied) / any error → nothing shown; never a guessed figure.
  if (error || !data) return null;
  return {
    amountTax: typeof data.amount_tax === "number" ? data.amount_tax : null,
    amountTotal: typeof data.amount_total === "number" ? data.amount_total : null,
    currency: typeof data.currency === "string" ? data.currency : null,
    reverseCharge: data.reverse_charge === true,
    taxIdValue: typeof data.tax_id_value === "string" ? data.tax_id_value : null,
    taxIdVerificationStatus:
      typeof data.tax_id_verification_status === "string" ? data.tax_id_verification_status : null,
    invoiceUrl: typeof data.invoice_url === "string" ? data.invoice_url : null,
    createdAt: String(data.created_at),
  };
}

/** Minor units → a localized money string (EUR and every 2-decimal currency). */
export function formatMinorAmount(amount: number | null, currency: string | null, locale: string): string | null {
  if (amount === null || !currency) return null;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}
