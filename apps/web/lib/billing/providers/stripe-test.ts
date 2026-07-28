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

function client(): Stripe {
  // requireStripeTestSecret enforces sk_test_ and that test mode is active.
  return new Stripe(requireStripeTestSecret());
}

export function createStripeTestProvider(): BillingProvider {
  return {
    id: "stripe_test",
    active: true,

    async createCheckoutSession(
      input: CheckoutSessionInput,
    ): Promise<CheckoutSessionResult> {
      try {
        const linkMetadata = {
          plan_key: input.planKey,
          client_reference_id: input.clientReferenceId,
          test_mode: "true",
        };
        const session = await client().checkout.sessions.create(
          {
            mode: "subscription",
            line_items: [{ price: input.priceId, quantity: 1 }],
            client_reference_id: input.clientReferenceId,
            // Reuse the known customer when we have one; otherwise let Stripe
            // create it from the email (both cannot be sent together).
            ...(input.providerCustomerId
              ? { customer: input.providerCustomerId }
              : { customer_email: input.customerEmail ?? undefined }),
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            metadata: linkMetadata,
            /**
             * Session metadata is NOT copied onto the subscription. Without
             * this block every customer.subscription.* event arrived with no
             * owner and no plan, so the whole chain depended on
             * checkout.session.completed winning a race it is not guaranteed
             * to win — a paid subscriber could end up with no entitlement.
             */
            subscription_data: { metadata: linkMetadata },
          },
          // A double-clicked checkout must not create two subscriptions.
          input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
        );
        if (!session.url) return { ok: false, reason: "no_session_url" };
        return { ok: true, url: session.url, sessionId: session.id, testMode: true };
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : "stripe_error" };
      }
    },

    async createPortalSession(
      input: PortalSessionInput,
    ): Promise<PortalSessionResult> {
      try {
        const session = await client().billingPortal.sessions.create({
          customer: input.providerCustomerId,
          return_url: input.returnUrl,
        });
        if (!session.url) return { ok: false, reason: "no_portal_url" };
        return { ok: true, url: session.url, testMode: true };
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
