/**
 * Pure decisions for the two billing funnel events (funnel-emitters v1).
 *
 * The webhook route calls these ONLY after the signature was verified, the
 * event mode matched, and the existing handler PERSISTED the change with
 * result "ok". Nothing here talks to Stripe, the database or telemetry, and
 * nothing here arms, configures or changes charging.
 *
 * Honesty rules:
 *  - `subscription_started` = a verified checkout session whose subscription
 *    link was stored. It is NOT a payment (a trial checkout is also a start).
 *  - `subscription_invoice_paid` = a verified `invoice.paid` with
 *    `amount_paid > 0`. A zero-amount invoice (trial) is not a payment, and
 *    `invoice.payment_succeeded` is deliberately NOT counted — Stripe sends
 *    both for one invoice and counting both would double the number.
 */

/** Billing reasons kept as a bounded word; anything else collapses to "other". */
const BILLING_REASONS = [
  "subscription_create",
  "subscription_cycle",
  "subscription_update",
  "manual",
] as const;
export type InvoiceBillingReason = (typeof BILLING_REASONS)[number] | "other";

export function invoiceBillingReason(
  obj: Record<string, unknown> | null | undefined,
): InvoiceBillingReason {
  const v = obj?.["billing_reason"];
  return typeof v === "string" && (BILLING_REASONS as readonly string[]).includes(v)
    ? (v as InvoiceBillingReason)
    : "other";
}

/** True only for a finite, strictly positive `amount_paid` (smallest unit). */
export function invoiceHadPayment(
  obj: Record<string, unknown> | null | undefined,
): boolean {
  const v = obj?.["amount_paid"];
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * Whether a funnel event may fire for this webhook outcome.
 *  - only a persisted "ok" ("stale-event" is a skipped/replayed observation,
 *    never a new fact; errors/conflicts/needs-migration persisted nothing);
 *  - never for a Stripe TEST-mode event: test-mode checkouts and invoices are
 *    not commercial facts, and an anonymous (profile-less) webhook row would
 *    otherwise be counted as real subscription/payment activity.
 */
export function shouldEmitBillingFunnel(result: string, testMode: boolean): boolean {
  return result === "ok" && !testMode;
}
