import "server-only";

import Stripe from "stripe";

import {
  requireStripeTestSecret,
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
 * Stripe TEST-mode adapter (Stripe sprint PR1) — the ONLY module that imports
 * the Stripe SDK. It is constructed exclusively with a sk_test_ secret
 * (requireStripeTestSecret throws on anything else), so a live key can never be
 * used here. Created lazily by getBillingProvider() only when the config is
 * `stripe_test`.
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
  // requireStripeTestSecret enforces sk_test_ and that test mode is active.
  return new Stripe(requireStripeTestSecret(), {
    apiVersion: STRIPE_PINNED_API_VERSION,
  });
}

function reasonFrom(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 200) : "stripe_error";
}

export function createStripeTestProvider(): BillingProvider {
  return {
    id: "stripe_test",
    active: true,

    async createCheckoutSession(
      input: CheckoutSessionInput,
    ): Promise<CheckoutSessionResult> {
      try {
        const metadata: Record<string, string> = {
          ...(input.metadata ?? { plan_key: input.planKey }),
          test_mode: "true",
        };
        const session = await client().checkout.sessions.create(
          {
            mode: "subscription",
            line_items: [{ price: input.priceId, quantity: 1 }],
            client_reference_id: input.clientReferenceId,
            // Reuse the stored TEST customer when we have one; fall back to
            // email prefill for first-time checkouts without a mapping.
            customer: input.providerCustomerId ?? undefined,
            customer_email: input.providerCustomerId
              ? undefined
              : (input.customerEmail ?? undefined),
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
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
        return { ok: true, url: session.url, sessionId: session.id, testMode: true };
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
            metadata: { ...input.metadata, test_mode: "true" },
          },
          // One customer per profile — a retry must not mint a second one.
          { idempotencyKey: `cus1_${input.ownerId}` },
        );
        return { ok: true, customerId: customer.id, testMode: true };
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
      // without a verified test webhook secret.
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
