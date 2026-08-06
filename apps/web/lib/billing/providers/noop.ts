import "server-only";

import type {
  BillingProvider,
  CheckoutSessionResult,
  CreateCustomerResult,
  PortalSessionResult,
} from "@/lib/billing/provider";

/**
 * Disabled billing provider (Stripe sprint PR1). The default when payments are
 * off / no valid test config. NO checkout, customer, or portal session is
 * possible; webhook parsing throws. Honest, never a fake success.
 */
export function noopProvider(): BillingProvider {
  return {
    id: "noop",
    active: false,
    async createCheckoutSession(): Promise<CheckoutSessionResult> {
      return { ok: false, reason: "payments_disabled" };
    },
    async createCustomer(): Promise<CreateCustomerResult> {
      return { ok: false, reason: "payments_disabled" };
    },
    async createPortalSession(): Promise<PortalSessionResult> {
      return { ok: false, reason: "payments_disabled" };
    },
    async constructWebhookEvent() {
      throw new Error("Billing disabled — no webhook processing.");
    },
  };
}
