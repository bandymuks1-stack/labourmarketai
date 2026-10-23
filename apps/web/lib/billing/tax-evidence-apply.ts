import "server-only";

import type { BillingProvider, BillingWebhookEvent } from "@/lib/billing/provider";
import {
  parseCheckoutSessionTax,
  parseInvoiceTax,
  parseTaxIdObject,
  verificationFor,
  type TaxEvidence,
  type TaxIdView,
} from "@/lib/billing/stripe-tax-core";
import {
  applyTaxIdVerification,
  upsertTaxEvidence,
  type TaxEvidenceStoreResult,
} from "@/lib/billing/tax-evidence-store";

/**
 * Stripe Tax evidence — webhook glue (owner order 2026-10-23). Called by the
 * EXISTING webhook route (app/api/billing/webhook) after its own processing;
 * no second webhook, no second parser of the subscription state.
 *
 *   captureTaxEvidence — checkout.session.completed / invoice.paid /
 *     invoice.payment_succeeded, ONLY while BILLING_STRIPE_TAX_ENABLED=true
 *     (the route checks the switch). Reads the session's expand-only tax
 *     breakdown and the customer's VAT id verification from Stripe (READ-ONLY);
 *     a failed read is recorded honestly ("unknown" / no breakdown) and the
 *     review rules flag it — the payment itself is never blocked by a read.
 *   applyTaxIdUpdate — customer.tax_id.updated: the VIES/HMRC result lands on
 *     the evidence rows of that customer + VAT id. Touches only rows that
 *     already exist, so it is harmless while the switch is off.
 */

export const TAX_EVIDENCE_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_succeeded",
]);

function taxIdViews(list: readonly Record<string, unknown>[] | null): TaxIdView[] | null {
  if (!list) return null;
  return list.map((o) => parseTaxIdObject(o)).filter((t): t is TaxIdView => t !== null);
}

export async function captureTaxEvidence(
  event: BillingWebhookEvent,
  provider: BillingProvider,
): Promise<TaxEvidenceStoreResult | null> {
  if (!TAX_EVIDENCE_EVENT_TYPES.has(event.type)) return null;
  const isSession = event.type === "checkout.session.completed";
  const fromPayload: TaxEvidence | null = isSession
    ? parseCheckoutSessionTax(event.object)
    : parseInvoiceTax(event.object);
  if (!fromPayload) return null;

  let evidence = fromPayload;
  let taxIds: TaxIdView[] | null = null;
  if (provider.retrieveTaxEvidenceSources) {
    const read = await provider.retrieveTaxEvidenceSources({
      sessionId: isSession ? fromPayload.providerObjectId : null,
      customerId: fromPayload.providerCustomerId,
    });
    if (read.ok) {
      if (isSession && read.session) {
        // The expanded read carries the breakdown; linkage stays from the
        // signed payload when the read lacks it.
        const expanded = parseCheckoutSessionTax(read.session);
        if (expanded && expanded.providerObjectId === fromPayload.providerObjectId) {
          evidence = {
            ...expanded,
            ownerId: expanded.ownerId ?? fromPayload.ownerId,
            organizationId: expanded.organizationId ?? fromPayload.organizationId,
          };
        }
      }
      taxIds = taxIdViews(read.taxIds);
    }
  }
  const verification = verificationFor(evidence.taxIdValue, taxIds);
  return upsertTaxEvidence({
    evidence,
    testMode: event.testMode,
    verification,
    event: { id: event.id, created: typeof event.created === "number" ? event.created : null },
  });
}

export async function applyTaxIdUpdate(event: BillingWebhookEvent): Promise<TaxEvidenceStoreResult | null> {
  if (event.type !== "customer.tax_id.updated") return null;
  const view = parseTaxIdObject(event.object);
  if (!view || !view.providerCustomerId || !view.value) return null;
  return applyTaxIdVerification({
    providerCustomerId: view.providerCustomerId,
    taxIdValue: view.value,
    status: view.status,
    verifiedName: view.verifiedName,
    event: { id: event.id, created: typeof event.created === "number" ? event.created : null },
  });
}
