import "server-only";

import Stripe from "stripe";

import {
  getBillingConfig,
  requireStripeSecret,
  requireStripeWebhookSecret,
} from "@/lib/billing/config";
import type {
  BillingProvider,
  BillingWebhookEvent,
  CheckoutSessionInput,
  CheckoutSessionResult,
  CreateCustomerInput,
  CreateCustomerResult,
  PortalSessionInput,
  PortalSessionResult,
} from "@/lib/billing/provider";

/**
 * The Stripe adapter — the ONLY module that imports the Stripe SDK. Since D3
 * (2026-09-02) it serves BOTH adapter states: `stripe_test` (sk_test_) and
 * `stripe_live` (sk_live_, reachable only after the owner arms live mode —
 * see config-core.ts). `requireStripeSecret` refuses any key whose shape
 * disagrees with the active state, so a live key can never be used under a
 * test config and vice versa. Created lazily by getBillingProvider() only when
 * one of the two states is active. The file keeps its historical name because
 * three guards pin it as the single SDK import site.
 */

/**
 * Explicitly pinned Stripe API version — the exact version the installed SDK's
 * types target (stripe v22 bundles `2026-05-27.dahlia`). Without an explicit
 * pin the account's dashboard default decides the webhook/event shapes, which
 * can silently disagree with the SDK types AND with our parsers. The
 * SDK's `LatestApiVersion` literal (the type of `StripeConfig["apiVersion"]`)
 * makes this a COMPILE-TIME pin: if the SDK is upgraded to a version bundling
 * a different API version, typecheck fails here and the parsers in
 * webhook-core.ts must be re-verified before it can ship. webhook-core
 * parsers accept both this (post-Basil) shape and the legacy pre-Basil shape,
 * so dashboard-default webhook deliveries stay parseable.
 */
export const STRIPE_PINNED_API_VERSION: NonNullable<
  NonNullable<ConstructorParameters<typeof Stripe>[1]>["apiVersion"]
> = "2026-05-27.dahlia";

function client(): Stripe {
  // requireStripeSecret enforces the key shape that matches the active state.
  return new Stripe(requireStripeSecret(), {
    apiVersion: STRIPE_PINNED_API_VERSION,
  });
}

function reasonFrom(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 200) : "stripe_error";
}

export function createStripeProvider(): BillingProvider {
  const cfg = getBillingConfig();
  const live = cfg.state === "stripe_live";
  const testMode = !live;
  return {
    id: live ? "stripe_live" : "stripe_test",
    active: true,

    async createCheckoutSession(
      input: CheckoutSessionInput,
    ): Promise<CheckoutSessionResult> {
      try {
        const metadata: Record<string, string> = {
          ...(input.metadata ?? { plan_key: input.planKey }),
          test_mode: String(testMode),
        };
        const session = await client().checkout.sessions.create(
          {
            mode: "subscription",
            line_items: [{ price: input.priceId, quantity: 1 }],
            client_reference_id: input.clientReferenceId,
            // Reuse the stored customer when we have one; fall back to
            // email prefill for first-time checkouts without a mapping.
            customer: input.providerCustomerId ?? undefined,
            customer_email: input.providerCustomerId
              ? undefined
              : (input.customerEmail ?? undefined),
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            // VAT (owner decision 2026-09-05: price is tax-EXCLUSIVE, Stripe Tax
            // computes it by the customer's country — EU B2B reverse charge via
            // the collected VAT id). Without `automatic_tax` the dashboard's
            // Tax setting is inert for Checkout. Address is required for the
            // computation; a reused customer must allow Stripe to store it.
            automatic_tax: { enabled: true },
            billing_address_collection: "required",
            tax_id_collection: { enabled: true },
            ...(input.providerCustomerId
              ? { customer_update: { address: "auto", name: "auto" } }
              : {}),
            metadata,
            // The SAME canonical metadata rides on the subscription object, so
            // customer.subscription.* events carry owner/plan/org linkage even
            // when they arrive before (or without) the session event.
            subscription_data: { metadata },
          },
          input.idempotencyKey
            ? { idempotencyKey: input.idempotencyKey }
            : undefined,
        );
        if (!session.url) return { ok: false, reason: "no_session_url" };
        return { ok: true, url: session.url, sessionId: session.id, testMode };
      } catch (e) {
        return { ok: false, reason: reasonFrom(e) };
      }
    },

    async createCustomer(
      input: CreateCustomerInput,
    ): Promise<CreateCustomerResult> {
      try {
        const customer = await client().customers.create(
          {
            email: input.email ?? undefined,
            metadata: { ...input.metadata, test_mode: String(testMode) },
          },
          // One customer per profile — a retry must not mint a second one.
          { idempotencyKey: `cus1_${input.ownerId}` },
        );
        return { ok: true, customerId: customer.id, testMode };
      } catch (e) {
        return { ok: false, reason: reasonFrom(e) };
      }
    },

    async createPortalSession(
      input: PortalSessionInput,
    ): Promise<PortalSessionResult> {
      try {
        const session = await client().billingPortal.sessions.create({
          customer: input.customerId,
          return_url: input.returnUrl,
        });
        if (!session.url) return { ok: false, reason: "no_session_url" };
        return { ok: true, url: session.url };
      } catch (e) {
        return { ok: false, reason: reasonFrom(e) };
      }
    },

    async constructWebhookEvent(
      payload: string,
      signature: string,
    ): Promise<BillingWebhookEvent> {
      // Throws on an invalid/forged signature — business logic never runs
      // without a verified webhook secret.
      const event = client().webhooks.constructEvent(
        payload,
        signature,
        requireStripeWebhookSecret(),
      );
      return {
        id: event.id,
        type: event.type,
        testMode: event.livemode === false,
        object: (event.data?.object ?? {}) as unknown as Record<string, unknown>,
      };
    },
  };
}

/** Historical name (Stripe sprint PR1); the adapter is mode-aware since D3. */
export function createStripeTestProvider(): BillingProvider {
  return createStripeProvider();
}
