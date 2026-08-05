/**
 * Webhook signature E2E proof (Stripe sprint — activation proof). Proves the
 * cryptographic half of the chain WITHOUT any Stripe account, test keys in env,
 * or money: a self-signed Stripe TEST event (real SDK signature scheme via
 * `webhooks.generateTestHeaderString`) is accepted by `constructEvent`, a
 * tampered/wrong-secret event is rejected, a live event is refused, and the
 * verified event parses through webhook-core into our subscription shape.
 *
 * This is the runnable proof that signature verification + event→parse works.
 * The remaining steps (real checkout-session creation + a browser card entry +
 * a Stripe-delivered webhook) are owner-driven and need real test keys —
 * see docs/audits/stripe-test-activation-runbook.md.
 */
import { describe, it, expect } from "vitest";
import Stripe from "stripe";
import {
  parseSubscriptionObject,
  parseCheckoutSessionObject,
  parseInvoiceObject,
  assertTestEvent,
  mapStripeStatus,
} from "./webhook-core";
import { STRIPE_PINNED_API_VERSION } from "./providers/stripe-test";

// A throwaway TEST key — only used to instantiate the SDK for signing/verifying.
// Never a live key; never makes a network call here. Constructed EXACTLY like
// the production adapter (same pinned apiVersion).
const stripe = new Stripe("sk_test_dummy_for_local_signing", {
  apiVersion: STRIPE_PINNED_API_VERSION,
});
const SECRET = "whsec_test_local_proof";

function signed(payload: object): { body: string; header: string } {
  const body = JSON.stringify(payload);
  const header = stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });
  return { body, header };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const obj = (e: Stripe.Event): any => e.data.object;

describe("webhook signature E2E proof (no keys, no money)", () => {
  it("the adapter's pinned apiVersion IS the version the installed SDK targets", () => {
    // Belt (runtime) on top of braces (the Stripe.LatestApiVersion type pin in
    // stripe-test.ts): the client really carries the pinned version, and the
    // pin matches what this SDK build was generated for.
    expect(stripe.getApiField("version")).toBe(STRIPE_PINNED_API_VERSION);
    expect(STRIPE_PINNED_API_VERSION).toBe("2026-05-27.dahlia");
  });

  it("a correctly-signed TEST event is accepted and parses to an active subscription", () => {
    const { body, header } = signed({
      id: "evt_proof_1",
      type: "customer.subscription.created",
      livemode: false,
      data: {
        object: {
          id: "sub_proof_1", customer: "cus_proof_1", status: "active",
          current_period_start: 1_700_000_000, current_period_end: 1_702_000_000,
          cancel_at_period_end: false,
          metadata: { plan_key: "company_pilot", client_reference_id: "owner_proof" },
        },
      },
    });
    const event = stripe.webhooks.constructEvent(body, header, SECRET); // verifies signature
    expect(event.id).toBe("evt_proof_1");
    expect(event.livemode).toBe(false);
    expect(assertTestEvent({ testMode: event.livemode === false })).toBe(true);

    const sub = parseSubscriptionObject(obj(event), event.livemode === false);
    expect(sub?.status).toBe("active");
    expect(sub?.planKey).toBe("company_pilot");
    expect(sub?.ownerId).toBe("owner_proof");
    expect(mapStripeStatus("active")).toBe("active");
  });

  it("a TAMPERED payload is rejected (signature mismatch)", () => {
    const { body, header } = signed({ id: "evt_t", type: "x", livemode: false, data: { object: {} } });
    expect(() => stripe.webhooks.constructEvent(body + " tampered", header, SECRET)).toThrow();
  });

  it("the WRONG webhook secret is rejected", () => {
    const { body, header } = signed({ id: "evt_w", type: "x", livemode: false, data: { object: {} } });
    expect(() => stripe.webhooks.constructEvent(body, header, "whsec_wrong_secret")).toThrow();
  });

  it("a LIVE event (livemode:true) is refused by assertTestEvent even if signed", () => {
    const { body, header } = signed({
      id: "evt_live", type: "customer.subscription.created", livemode: true,
      data: { object: { id: "sub_l", status: "active", metadata: {} } },
    });
    const event = stripe.webhooks.constructEvent(body, header, SECRET);
    expect(assertTestEvent({ testMode: event.livemode === false })).toBe(false);
  });

  it("a checkout.session.completed links owner+plan to the subscription", () => {
    const { body, header } = signed({
      id: "evt_co", type: "checkout.session.completed", livemode: false,
      data: { object: { subscription: "sub_co", customer: "cus_co", client_reference_id: "owner_co", metadata: { plan_key: "worker_plus" } } },
    });
    const event = stripe.webhooks.constructEvent(body, header, SECRET);
    const link = parseCheckoutSessionObject(obj(event), true);
    expect(link?.providerSubscriptionId).toBe("sub_co");
    expect(link?.ownerId).toBe("owner_co");
    expect(link?.planKey).toBe("worker_plus");
  });

  it("an invoice.payment_failed verified event maps to a failed payment", () => {
    const { body, header } = signed({
      id: "evt_inv", type: "invoice.payment_failed", livemode: false,
      data: { object: { subscription: "sub_co" } },
    });
    const event = stripe.webhooks.constructEvent(body, header, SECRET);
    const inv = parseInvoiceObject(obj(event), false);
    expect(inv.lastPaymentStatus).toBe("failed");
  });

  it("a PINNED-VERSION (post-Basil) shaped subscription event parses with item-level periods", () => {
    // On 2025-03-31.basil and later (incl. the pinned 2026-05-27.dahlia),
    // current_period_* live on the subscription ITEMS, not the subscription.
    const { body, header } = signed({
      id: "evt_dahlia_sub", type: "customer.subscription.updated", livemode: false,
      data: {
        object: {
          id: "sub_dahlia", customer: "cus_d", status: "active",
          items: { data: [{ id: "si_1", current_period_start: 1_700_000_000, current_period_end: 1_702_000_000 }] },
          cancel_at_period_end: false,
          metadata: { plan_key: "company_pilot", client_reference_id: "owner_d" },
        },
      },
    });
    const event = stripe.webhooks.constructEvent(body, header, SECRET);
    const sub = parseSubscriptionObject(obj(event), event.livemode === false);
    expect(sub?.currentPeriodStart).toMatch(/^20/);
    expect(sub?.currentPeriodEnd).toMatch(/^20/);
    expect(sub?.status).toBe("active");
  });

  it("a PINNED-VERSION (post-Basil) shaped invoice.paid event parses the subscription id", () => {
    const { body, header } = signed({
      id: "evt_dahlia_inv", type: "invoice.paid", livemode: false,
      data: {
        object: { parent: { subscription_details: { subscription: "sub_dahlia" } } },
      },
    });
    const event = stripe.webhooks.constructEvent(body, header, SECRET);
    const inv = parseInvoiceObject(obj(event), true);
    expect(inv.providerSubscriptionId).toBe("sub_dahlia");
    expect(inv.lastPaymentStatus).toBe("succeeded");
  });
});
