import { describe, it, expect } from "vitest";
import {
  isHandledEventType,
  mapStripeStatus,
  parseSubscriptionObject,
  parseCheckoutSessionObject,
  parseInvoiceObject,
  parseInvoiceRenewal,
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
      "invoice.payment_failed",
    ]) expect(isHandledEventType(t)).toBe(true);
    expect(isHandledEventType("charge.refunded")).toBe(false);
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

  it("a live event is rejected (test-only chain)", () => {
    expect(assertTestEvent({ testMode: true })).toBe(true);
    expect(assertTestEvent({ testMode: false })).toBe(false);
  });
});

describe("webhook-core — invoice renewal bookkeeping (Sprint v2 pricing slice)", () => {
  it("reads the covered period from the first invoice line", () => {
    const r = parseInvoiceRenewal({
      subscription: "sub_7",
      lines: { data: [{ period: { start: 1767225600, end: 1769904000 } }] },
    });
    expect(r.providerSubscriptionId).toBe("sub_7");
    expect(r.periodStart).toBe(new Date(1767225600 * 1000).toISOString());
    expect(r.periodEnd).toBe(new Date(1769904000 * 1000).toISOString());
  });

  it("falls back to invoice-level period fields", () => {
    const r = parseInvoiceRenewal({
      subscription: "sub_7",
      period_start: 1767225600,
      period_end: 1769904000,
    });
    expect(r.periodStart).toBe(new Date(1767225600 * 1000).toISOString());
    expect(r.periodEnd).toBe(new Date(1769904000 * 1000).toISOString());
  });

  it("unknown period stays null — nothing is guessed", () => {
    const r = parseInvoiceRenewal({ subscription: "sub_7" });
    expect(r.periodStart).toBeNull();
    expect(r.periodEnd).toBeNull();
    expect(parseInvoiceRenewal(null).providerSubscriptionId).toBeNull();
  });
});
