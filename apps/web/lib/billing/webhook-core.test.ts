import { describe, it, expect } from "vitest";
import {
  isHandledEventType,
  isRecordOnlyEventType,
  mapStripeStatus,
  parseSubscriptionObject,
  parseCheckoutSessionObject,
  parseInvoiceObject,
  parseChargeRefundObject,
  parseDisputeObject,
  summarizeRecordedEvent,
  assertTestEvent,
} from "./webhook-core";

describe("webhook-core — event mapping", () => {
  it("handles exactly the expected event types", () => {
    for (const t of [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_succeeded",
      "invoice.paid",
      "invoice.payment_failed",
      // Refund/dispute ingestion (commercial safe-prep v1) — record-only.
      "charge.refunded",
      "charge.dispute.created",
      "charge.dispute.closed",
    ]) expect(isHandledEventType(t)).toBe(true);
    expect(isHandledEventType("charge.succeeded")).toBe(false);
    expect(isHandledEventType("payout.paid")).toBe(false);
  });

  it("refund/dispute events are RECORD-ONLY — subscription events are not", () => {
    for (const t of [
      "charge.refunded",
      "charge.dispute.created",
      "charge.dispute.closed",
    ]) expect(isRecordOnlyEventType(t)).toBe(true);
    for (const t of [
      "checkout.session.completed",
      "customer.subscription.updated",
      "invoice.payment_failed",
    ]) expect(isRecordOnlyEventType(t)).toBe(false);
  });

  it("maps Stripe statuses → our enum (active grants, canceled limits, etc.)", () => {
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("trialing")).toBe("trialing");
    expect(mapStripeStatus("past_due")).toBe("past_due");
    expect(mapStripeStatus("unpaid")).toBe("unpaid");
    expect(mapStripeStatus("canceled")).toBe("cancelled");
    expect(mapStripeStatus("incomplete")).toBe("incomplete");
    expect(mapStripeStatus("incomplete_expired")).toBe("expired");
    expect(mapStripeStatus(undefined)).toBe("none");
  });

  it("parses a subscription object incl. metadata-derived owner + plan", () => {
    const u = parseSubscriptionObject(
      {
        id: "sub_123", customer: "cus_1", status: "active",
        current_period_start: 1_700_000_000, current_period_end: 1_702_000_000,
        cancel_at_period_end: false,
        metadata: { plan_key: "company_pilot", client_reference_id: "owner_1" },
      },
      true,
    );
    expect(u?.providerSubscriptionId).toBe("sub_123");
    expect(u?.status).toBe("active");
    expect(u?.planKey).toBe("company_pilot");
    expect(u?.ownerId).toBe("owner_1");
    expect(u?.currentPeriodEnd).toMatch(/^20/);
    expect(u?.testMode).toBe(true);
  });

  it("a cancelled subscription maps to 'cancelled' (entitlement is limited)", () => {
    const u = parseSubscriptionObject({ id: "sub_1", status: "canceled", metadata: {} }, true);
    expect(u?.status).toBe("cancelled");
  });

  it("parses a checkout session (links owner+plan to the subscription)", () => {
    const link = parseCheckoutSessionObject(
      { subscription: "sub_9", customer: "cus_9", client_reference_id: "owner_9", metadata: { plan_key: "worker_plus" } },
      true,
    );
    expect(link?.providerSubscriptionId).toBe("sub_9");
    expect(link?.ownerId).toBe("owner_9");
    expect(link?.planKey).toBe("worker_plus");
  });

  it("a failed invoice maps to last_payment_status=failed", () => {
    expect(parseInvoiceObject({ subscription: "sub_1" }, false).lastPaymentStatus).toBe("failed");
    expect(parseInvoiceObject({ subscription: "sub_1" }, true).lastPaymentStatus).toBe("succeeded");
  });

  // ── API-shape tolerance (pre-Basil legacy vs 2025-03-31.basil and later,
  //    incl. the pinned 2026-05-27.dahlia) ─────────────────────────────────

  it("subscription periods parse from the POST-BASIL item location (items.data[n].current_period_*)", () => {
    const u = parseSubscriptionObject(
      {
        id: "sub_basil", customer: "cus_1", status: "active",
        // No top-level current_period_* — gone on basil+.
        items: {
          data: [
            { id: "si_1", current_period_start: 1_700_000_000, current_period_end: 1_702_000_000 },
          ],
        },
        cancel_at_period_end: false,
        metadata: { plan_key: "company_pilot", client_reference_id: "owner_1" },
      },
      true,
    );
    expect(u?.currentPeriodStart).toBe(new Date(1_700_000_000 * 1000).toISOString());
    expect(u?.currentPeriodEnd).toBe(new Date(1_702_000_000 * 1000).toISOString());
  });

  it("subscription periods still parse from the LEGACY top-level fields (pre-Basil)", () => {
    const u = parseSubscriptionObject(
      {
        id: "sub_legacy", status: "active", metadata: {},
        current_period_start: 1_700_000_000, current_period_end: 1_702_000_000,
      },
      true,
    );
    expect(u?.currentPeriodStart).toBe(new Date(1_700_000_000 * 1000).toISOString());
    expect(u?.currentPeriodEnd).toBe(new Date(1_702_000_000 * 1000).toISOString());
  });

  it("when both shapes are present the item-level (new) value wins", () => {
    const u = parseSubscriptionObject(
      {
        id: "sub_both", status: "active", metadata: {},
        current_period_end: 1_600_000_000,
        items: { data: [{ current_period_end: 1_702_000_000 }] },
      },
      true,
    );
    expect(u?.currentPeriodEnd).toBe(new Date(1_702_000_000 * 1000).toISOString());
  });

  it("a subscription with NEITHER shape yields null periods (never a fake date)", () => {
    const u = parseSubscriptionObject(
      { id: "sub_none", status: "active", metadata: {}, items: { data: [{}] } },
      true,
    );
    expect(u?.currentPeriodStart).toBeNull();
    expect(u?.currentPeriodEnd).toBeNull();
  });

  it("invoice subscription id parses from the POST-BASIL parent.subscription_details location", () => {
    expect(
      parseInvoiceObject(
        { parent: { subscription_details: { subscription: "sub_basil" } } },
        true,
      ).providerSubscriptionId,
    ).toBe("sub_basil");
    // Expanded object form.
    expect(
      parseInvoiceObject(
        { parent: { subscription_details: { subscription: { id: "sub_exp" } } } },
        true,
      ).providerSubscriptionId,
    ).toBe("sub_exp");
  });

  it("invoice subscription id still parses from the LEGACY invoice.subscription field", () => {
    expect(parseInvoiceObject({ subscription: "sub_legacy" }, true).providerSubscriptionId)
      .toBe("sub_legacy");
    expect(parseInvoiceObject({ subscription: { id: "sub_legacy_exp" } }, true).providerSubscriptionId)
      .toBe("sub_legacy_exp");
    expect(parseInvoiceObject({}, true).providerSubscriptionId).toBeNull();
    expect(parseInvoiceObject(null, true).providerSubscriptionId).toBeNull();
  });

  it("a checkout session with an EXPANDED subscription object still links", () => {
    const link = parseCheckoutSessionObject(
      { subscription: { id: "sub_exp" }, customer: { id: "cus_exp" }, client_reference_id: "owner_1", metadata: { plan_key: "worker_plus" } },
      true,
    );
    expect(link?.providerSubscriptionId).toBe("sub_exp");
    expect(link?.providerCustomerId).toBe("cus_exp");
  });

  it("a live event is rejected (test-only chain)", () => {
    expect(assertTestEvent({ testMode: true })).toBe(true);
    expect(assertTestEvent({ testMode: false })).toBe(false);
  });

  it("parses a charge.refunded object into the persisted record shape", () => {
    const r = parseChargeRefundObject({
      id: "ch_1",
      payment_intent: "pi_1",
      invoice: { id: "in_1" },
      amount_refunded: 2900,
      currency: "eur",
      refunded: true,
    });
    expect(r).toEqual({
      chargeId: "ch_1",
      paymentIntentId: "pi_1",
      invoiceId: "in_1",
      amountRefundedCents: 2900,
      currency: "eur",
      fullyRefunded: true,
    });
    // Partial refund: refunded=false, cumulative amount still recorded.
    const partial = parseChargeRefundObject({
      id: "ch_2",
      amount_refunded: 500,
      refunded: false,
    });
    expect(partial?.fullyRefunded).toBe(false);
    expect(partial?.amountRefundedCents).toBe(500);
    expect(partial?.invoiceId).toBeNull();
    expect(parseChargeRefundObject(null)).toBeNull();
  });

  it("parses a dispute object with Stripe's own status/reason verbatim", () => {
    const d = parseDisputeObject({
      id: "dp_1",
      charge: "ch_1",
      payment_intent: { id: "pi_1" },
      status: "needs_response",
      reason: "product_not_received",
      amount: 2900,
      currency: "eur",
    });
    expect(d).toEqual({
      disputeId: "dp_1",
      chargeId: "ch_1",
      paymentIntentId: "pi_1",
      status: "needs_response",
      reason: "product_not_received",
      amountCents: 2900,
      currency: "eur",
    });
    expect(parseDisputeObject(null)).toBeNull();
  });

  it("summarizeRecordedEvent yields a summary ONLY for record-only types", () => {
    expect(
      summarizeRecordedEvent("charge.refunded", { id: "ch_1", refunded: true }),
    ).toMatchObject({ chargeId: "ch_1", fullyRefunded: true });
    expect(
      summarizeRecordedEvent("charge.dispute.closed", { id: "dp_1", status: "won" }),
    ).toMatchObject({ disputeId: "dp_1", status: "won" });
    // Subscription/invoice events keep their lean {id, type} record.
    expect(summarizeRecordedEvent("customer.subscription.updated", { id: "sub_1" })).toBeNull();
    expect(summarizeRecordedEvent("invoice.paid", {})).toBeNull();
  });
});
