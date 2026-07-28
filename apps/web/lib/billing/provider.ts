import "server-only";

import { getBillingConfig } from "@/lib/billing/config";

/**
 * Billing provider interface (Stripe sprint PR1). A single seam so the rest of
 * the app never imports Stripe directly — only `getBillingProvider()`. When the
 * config is not `stripe_test`, the NOOP provider is returned and NO checkout is
 * possible (honest disabled state). Stripe is touched ONLY by the test adapter.
 */

export interface CheckoutSessionInput {
  readonly planKey: string;
  /** Stripe TEST price id (price_…) — provided per-plan via env-mapped config. */
  readonly priceId: string;
  readonly clientReferenceId: string; // our profile/owner id
  readonly customerEmail?: string | null;
  readonly successUrl: string;
  readonly cancelUrl: string;
  /**
   * Reuse of an already-known provider customer, so a returning buyer does not
   * accumulate duplicate Stripe customers (and their portal keeps working).
   */
  readonly providerCustomerId?: string | null;
  /**
   * Deterministic idempotency key. A double-clicked checkout must not create
   * two subscriptions for the same user+plan.
   */
  readonly idempotencyKey?: string;
}

export type CheckoutSessionResult =
  | { ok: true; url: string; sessionId: string; testMode: true }
  | { ok: false; reason: string };

export interface PortalSessionInput {
  readonly providerCustomerId: string;
  readonly returnUrl: string;
}

export type PortalSessionResult =
  | { ok: true; url: string; testMode: true }
  | { ok: false; reason: string };

export interface BillingWebhookEvent {
  readonly id: string;
  readonly type: string;
  readonly testMode: boolean;
  /** The event.data.object payload. */
  readonly object: Record<string, unknown>;
}

export interface BillingProvider {
  readonly id: "noop" | "stripe_test";
  readonly active: boolean;
  createCheckoutSession(
    input: CheckoutSessionInput,
  ): Promise<CheckoutSessionResult>;
  /**
   * Customer self-service (cancel, update card, invoice history). Without this
   * a subscriber has no in-product way to end the contract — an EU consumer
   * requirement, not a nice-to-have.
   */
  createPortalSession(input: PortalSessionInput): Promise<PortalSessionResult>;
  /** Verify signature + parse. Throws on an invalid/forged signature. */
  constructWebhookEvent(
    payload: string,
    signature: string,
  ): Promise<BillingWebhookEvent>;
}

/**
 * Returns the active provider. `stripe_test` → the Stripe test adapter (lazily
 * imported so the SDK never loads in the disabled path); anything else → NOOP.
 * Live is never reachable (config blocks it before this point).
 */
export async function getBillingProvider(): Promise<BillingProvider> {
  const cfg = getBillingConfig();
  if (cfg.state === "stripe_test") {
    const { createStripeTestProvider } = await import(
      "@/lib/billing/providers/stripe-test"
    );
    return createStripeTestProvider();
  }
  const { noopProvider } = await import("@/lib/billing/providers/noop");
  return noopProvider();
}
