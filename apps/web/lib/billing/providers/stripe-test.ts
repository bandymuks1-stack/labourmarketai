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

export function createStripeTestProvider(): BillingProvider {
  return {
    id: "stripe_test",
    active: true,

    async createCheckoutSession(
      input: CheckoutSessionInput,
    ): Promise<CheckoutSessionResult> {
      try {
        const session = await client().checkout.sessions.create({
          mode: "subscription",
          line_items: [{ price: input.priceId, quantity: 1 }],
          client_reference_id: input.clientReferenceId,
          customer_email: input.customerEmail ?? undefined,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          metadata: { plan_key: input.planKey, test_mode: "true" },
        });
        if (!session.url) return { ok: false, reason: "no_session_url" };
        return { ok: true, url: session.url, sessionId: session.id, testMode: true };
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : "stripe_error" };
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
