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
  /** Stored provider customer id (cus_…) — reuse instead of a bare email. */
  readonly providerCustomerId?: string | null;
  /** Canonical organizations.id for company/agency plans (server-verified). */
  readonly organizationId?: string | null;
  /**
   * Canonical metadata (lib/billing/metadata-core.ts) stamped on the session
   * AND the resulting subscription (subscription_data.metadata).
   */
  readonly metadata?: Readonly<Record<string, string>>;
  /** Deterministic retry key — a retry replays the session, not a new one. */
  readonly idempotencyKey?: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
}

export type CheckoutSessionResult =
  | { ok: true; url: string; sessionId: string; testMode: true }
  | { ok: false; reason: string };

export interface CreateCustomerInput {
  readonly ownerId: string;
  readonly email?: string | null;
  readonly metadata: Readonly<Record<string, string>>;
}

export type CreateCustomerResult =
  | { ok: true; customerId: string; testMode: true }
  | { ok: false; reason: string };

export interface PortalSessionInput {
  /** The caller's OWN stored provider customer id — never caller-supplied. */
  readonly customerId: string;
  readonly returnUrl: string;
}

export type PortalSessionResult =
  | { ok: true; url: string }
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
  /** Create a provider TEST customer for a profile (canonical metadata). */
  createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult>;
  /** Create a Customer Portal session for the caller's OWN customer. */
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
