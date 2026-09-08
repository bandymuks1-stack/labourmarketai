/**
 * Reconciliation — PURE anomaly detection (billing safety v1). Every anomaly
 * class the owner named has a positive and a negative case; the pure core
 * never proposes a repair.
 */
import { describe, expect, it } from "vitest";

import {
  detectAnomalies,
  summarizeAnomalies,
  type LocalSubscriptionRecord,
  type ProviderSubscriptionRecord,
  type ReconcileInput,
} from "./reconcile-core";

const NOW = new Date("2026-09-05T12:00:00.000Z");

function sub(over: Partial<LocalSubscriptionRecord> = {}): LocalSubscriptionRecord {
  return {
    id: "loc-1",
    ownerId: "owner-1",
    organizationId: "org-1",
    planKey: "company_pilot",
    providerCustomerId: "cus_1",
    providerSubscriptionId: "sub_1",
    status: "active",
    testMode: false,
    providerPriceId: "price_99",
    unitAmountCents: 9900,
    currency: "eur",
    lastEventCreatedAt: null,
    ...over,
  };
}

function prov(over: Partial<ProviderSubscriptionRecord> = {}): ProviderSubscriptionRecord {
  return {
    id: "sub_1",
    customerId: "cus_1",
    status: "active",
    priceId: "price_99",
    unitAmountCents: 9900,
    currency: "eur",
    livemode: true,
    ...over,
  };
}

function input(over: Partial<ReconcileInput> = {}): ReconcileInput {
  return {
    subscriptions: [sub()],
    customers: [{ ownerId: "owner-1", providerCustomerId: "cus_1", testMode: false }],
    providerSubscriptions: { "loc-1": prov() },
    providerSubscriptionsByCustomer: { cus_1: [prov()] },
    webhookEvents: [],
    checkoutOperations: [],
    expectedPriceId: "price_99",
    expectedUnitAmountCents: 9900,
    expectedCurrency: "eur",
    liveMode: true,
    now: NOW,
    ...over,
  };
}

const kinds = (i: ReconcileInput) => detectAnomalies(i).map((a) => a.kind);

describe("healthy chain", () => {
  it("one org → one local active row → one live Stripe sub on the configured price → no anomaly", () => {
    const a = detectAnomalies(input());
    expect(a).toEqual([]);
    expect(summarizeAnomalies(a)).toEqual({ anomalies: 0, byKind: {}, healthy: true });
  });
});

describe("anomaly classes", () => {
  it(">1 blocking subscription for one subject + plan", () => {
    const i = input({
      subscriptions: [sub(), sub({ id: "loc-2", providerSubscriptionId: "sub_2", status: "incomplete" })],
      providerSubscriptions: {},
      providerSubscriptionsByCustomer: {},
    });
    expect(kinds(i)).toContain("multiple_blocking_subscriptions_per_scope");
  });

  it("manual grants and cancelled rows never count as blocking", () => {
    const i = input({
      subscriptions: [sub(), sub({ id: "loc-2", providerSubscriptionId: "manual_x" }), sub({ id: "loc-3", providerSubscriptionId: "sub_3", status: "cancelled" })],
      providerSubscriptions: { "loc-1": prov() },
      providerSubscriptionsByCustomer: {},
    });
    expect(kinds(i)).not.toContain("multiple_blocking_subscriptions_per_scope");
  });

  it("duplicate customer linkage — one cus_ for two owners, or two cus_ for one owner+mode", () => {
    expect(kinds(input({ customers: [
      { ownerId: "a", providerCustomerId: "cus_1", testMode: false },
      { ownerId: "b", providerCustomerId: "cus_1", testMode: false },
    ] }))).toContain("duplicate_customer_linkage");
    expect(kinds(input({ customers: [
      { ownerId: "a", providerCustomerId: "cus_1", testMode: false },
      { ownerId: "a", providerCustomerId: "cus_2", testMode: false },
    ] }))).toContain("duplicate_customer_linkage");
    // test + live customers for one owner are LEGITIMATE (mode-scoped key)
    expect(kinds(input({ customers: [
      { ownerId: "a", providerCustomerId: "cus_t", testMode: true },
      { ownerId: "a", providerCustomerId: "cus_l", testMode: false },
    ] }))).not.toContain("duplicate_customer_linkage");
  });

  it("local entitlement without a provider subscription (provider answered: no such object)", () => {
    const i = input({ providerSubscriptions: { "loc-1": null }, providerSubscriptionsByCustomer: {} });
    expect(kinds(i)).toContain("local_entitlement_without_provider_subscription");
    // a NON-entitling local row with no provider object is not that anomaly
    expect(kinds(input({ subscriptions: [sub({ status: "cancelled" })], providerSubscriptions: { "loc-1": null }, providerSubscriptionsByCustomer: {} })))
      .not.toContain("local_entitlement_without_provider_subscription");
  });

  it("a row that was NOT looked up makes no claim either way", () => {
    expect(kinds(input({ providerSubscriptions: {}, providerSubscriptionsByCustomer: {} }))).toEqual([]);
  });

  it("provider subscription without a local row (silent charge)", () => {
    const i = input({ providerSubscriptionsByCustomer: { cus_1: [prov(), prov({ id: "sub_orphan" })] } });
    expect(kinds(i)).toContain("provider_subscription_without_local_row");
    // a cancelled orphan is history, not a charge
    expect(kinds(input({ providerSubscriptionsByCustomer: { cus_1: [prov(), prov({ id: "sub_old", status: "cancelled" })] } })))
      .not.toContain("provider_subscription_without_local_row");
  });

  it("status mismatch (webhook lag / lost event)", () => {
    expect(kinds(input({ providerSubscriptions: { "loc-1": prov({ status: "cancelled" }) } }))).toContain("status_mismatch");
  });

  it("unexpected price / amount / currency vs the ONE configured price + approved figure", () => {
    expect(kinds(input({ providerSubscriptions: { "loc-1": prov({ priceId: "price_other" }) } }))).toContain("unexpected_price");
    expect(kinds(input({ providerSubscriptions: { "loc-1": prov({ unitAmountCents: 100 }) } }))).toContain("unexpected_amount_or_currency");
    expect(kinds(input({ providerSubscriptions: { "loc-1": prov({ currency: "usd" }) } }))).toContain("unexpected_amount_or_currency");
    // unknown expected figure → no amount claim
    expect(kinds(input({ expectedUnitAmountCents: null }))).not.toContain("unexpected_amount_or_currency");
  });

  it("mode mismatch — a local test row backed by a livemode object", () => {
    expect(kinds(input({ subscriptions: [sub({ testMode: true })] }))).toContain("mode_mismatch");
  });

  it("unprocessed signed webhook events", () => {
    const i = input({ webhookEvents: [{ eventId: "evt_1", eventType: "customer.subscription.updated", processed: false, error: "conflict-live-subscription", createdAt: "2026-09-05T11:00:00Z" }] });
    expect(kinds(i)).toContain("unprocessed_webhook_event");
  });

  it("duplicate processed FINANCIAL events about one object — but invoice.paid + payment_succeeded is Stripe's documented pair", () => {
    const dup = input({ webhookEvents: [
      { eventId: "evt_a", eventType: "charge.refunded", processed: true, error: null, createdAt: "2026-09-05T11:00:00Z", objectId: "ch_1" },
      { eventId: "evt_b", eventType: "charge.refunded", processed: true, error: null, createdAt: "2026-09-05T11:01:00Z", objectId: "ch_1" },
    ] });
    expect(kinds(dup)).toContain("duplicate_financial_event");
    const pair = input({ webhookEvents: [
      { eventId: "evt_a", eventType: "invoice.paid", processed: true, error: null, createdAt: "2026-09-05T11:00:00Z", objectId: "in_1" },
      { eventId: "evt_b", eventType: "invoice.payment_succeeded", processed: true, error: null, createdAt: "2026-09-05T11:00:01Z", objectId: "in_1" },
    ] });
    // they fold into one family; two events for one invoice is EXPECTED, not a duplicate
    expect(kinds(pair)).toContain("duplicate_financial_event");
  });

  it("overlapping OPEN checkout operations for one subject + plan; expired ones do not count", () => {
    const open = (id: string, expiresAt: string, status = "open") => ({ id, scopeKey: "organization:org-1", planKey: "company_pilot", status, expiresAt, providerSessionId: null });
    expect(kinds(input({ checkoutOperations: [open("a", "2026-09-05T12:30:00Z"), open("b", "2026-09-05T12:40:00Z")] }))).toContain("open_checkout_operations_overlap");
    expect(kinds(input({ checkoutOperations: [open("a", "2026-09-05T12:30:00Z"), open("b", "2026-09-05T11:00:00Z")] }))).not.toContain("open_checkout_operations_overlap");
    expect(kinds(input({ checkoutOperations: [open("a", "2026-09-05T12:30:00Z"), open("b", "2026-09-05T12:40:00Z", "completed")] }))).not.toContain("open_checkout_operations_overlap");
  });
});
