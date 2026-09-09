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
  /**
   * Billing safety v1: the hosted session's expiry (unix seconds) — the
   * server-side checkout operation's window, so the session is unpayable the
   * moment the operation closes. Stripe accepts 30 min … 24 h from creation.
   */
  readonly expiresAt?: number;
  readonly successUrl: string;
  readonly cancelUrl: string;
}

/** Normalized READ of one provider subscription (reconciliation / admission). */
export interface ProviderSubscriptionView {
  readonly id: string;
  readonly customerId: string | null;
  /** Stripe's raw status string (mapped by webhook-core's mapStripeStatus). */
  readonly rawStatus: string;
  readonly priceId: string | null;
  readonly unitAmountCents: number | null;
  readonly currency: string | null;
  readonly livemode: boolean;
  readonly cancelAtPeriodEnd: boolean;
}

export type RetrieveSubscriptionResult =
  | { ok: true; subscription: ProviderSubscriptionView }
  /** The provider has no such subscription (resource_missing). */
  | { ok: true; subscription: null }
  | { ok: false; reason: string };

export type ListSubscriptionsResult =
  | { ok: true; subscriptions: readonly ProviderSubscriptionView[] }
  | { ok: false; reason: string };

export type CheckoutSessionResult =
  | { ok: true; url: string; sessionId: string; testMode: boolean }
  | { ok: false; reason: string };

export interface CreateCustomerInput {
  readonly ownerId: string;
  readonly email?: string | null;
  readonly metadata: Readonly<Record<string, string>>;
}

export type CreateCustomerResult =
  | { ok: true; customerId: string; testMode: boolean }
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
  /** Stripe's own `created` (unix seconds) — ordering evidence (billing safety v1). */
  readonly created?: number;
  /** The event.data.object payload. */
  readonly object: Record<string, unknown>;
}

export interface BillingProvider {
  readonly id: "noop" | "stripe_test" | "stripe_live";
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
  /**
   * READ-ONLY (billing safety v1): the provider's current view of one
   * subscription — the authority checkout admission and reconciliation
   * consult. Never creates, updates or charges anything.
   */
  retrieveSubscription(providerSubscriptionId: string): Promise<RetrieveSubscriptionResult>;
  /** READ-ONLY: every subscription (any status) of one provider customer. */
  listCustomerSubscriptions(providerCustomerId: string): Promise<ListSubscriptionsResult>;
}

/**
 * Returns the active provider. `stripe_test` → the Stripe adapter in test
 * mode, `stripe_live` → the same adapter with the live secret (lazily imported
 * so the SDK never loads in the disabled path); anything else → NOOP. Live is
 * reachable ONLY once the owner armed it (config-core: token + confirmed price
 * table + complete live keys); until then config blocks it before this point.
 */
export async function getBillingProvider(): Promise<BillingProvider> {
  const cfg = getBillingConfig();
  if (cfg.state === "stripe_test" || cfg.state === "stripe_live") {
    const { createStripeProvider } = await import(
      "@/lib/billing/providers/stripe-test"
    );
    return createStripeProvider();
  }
  const { noopProvider } = await import("@/lib/billing/providers/noop");
  return noopProvider();
}
