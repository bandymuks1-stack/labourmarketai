/**
 * Billing RECONCILIATION — PURE core (billing safety v1). No IO. Given
 * normalized snapshots of the local billing tables and of the provider's view
 * (read through the adapter), names every anomaly along the chain
 *
 *   organization → local subscription → Stripe customer → Stripe subscription
 *   → price → status → entitlement
 *
 * so an operator can see, attribute and repair. This module NEVER decides a
 * repair and the server wrapper NEVER performs one: reconciliation is
 * READ-ONLY reporting. A charge is never a repair.
 */

import type { SubStatus } from "@/lib/billing/webhook-core";
import { subscriptionBlocksCheckout } from "@/lib/billing/checkout-operations-core";

export interface LocalSubscriptionRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly organizationId: string | null;
  readonly planKey: string;
  readonly providerCustomerId: string | null;
  readonly providerSubscriptionId: string | null;
  readonly status: SubStatus | string;
  readonly testMode: boolean;
  readonly providerPriceId: string | null;
  readonly unitAmountCents: number | null;
  readonly currency: string | null;
  readonly lastEventCreatedAt: string | null;
}

export interface LocalCustomerRecord {
  readonly ownerId: string;
  readonly providerCustomerId: string;
  readonly testMode: boolean;
}

/** The provider's view of ONE subscription (adapter `retrieveSubscription`). */
export interface ProviderSubscriptionRecord {
  readonly id: string;
  readonly customerId: string | null;
  readonly status: SubStatus;
  readonly priceId: string | null;
  readonly unitAmountCents: number | null;
  readonly currency: string | null;
  readonly livemode: boolean;
}

export interface WebhookEventRecord {
  readonly eventId: string;
  readonly eventType: string;
  readonly processed: boolean;
  readonly error: string | null;
  readonly createdAt: string;
  /** Stripe object id the event is about (charge / invoice / subscription), when known. */
  readonly objectId?: string | null;
}

export interface CheckoutOperationRecord {
  readonly id: string;
  readonly scopeKey: string;
  readonly planKey: string;
  readonly status: string;
  readonly expiresAt: string;
  readonly providerSessionId: string | null;
}

export type AnomalyKind =
  /** >1 payable (blocking) local subscription for one subject + plan. */
  | "multiple_blocking_subscriptions_per_scope"
  /** One provider customer id mapped to more than one owner, or one owner+mode to >1 customer. */
  | "duplicate_customer_linkage"
  /** Local row entitles (active/trialing/past_due) but the provider has no live subscription behind it. */
  | "local_entitlement_without_provider_subscription"
  /** Provider bills a subscription for our customer that has no local row (no entitlement, silent charge). */
  | "provider_subscription_without_local_row"
  /** Provider status differs from the local status (webhook lag or a lost event). */
  | "status_mismatch"
  /** The subscription bills a price id other than the ONE configured price. */
  | "unexpected_price"
  /** Amount or currency differs from the approved figure. */
  | "unexpected_amount_or_currency"
  /** A signed event was recorded but never processed (retry exhausted or migration gap). */
  | "unprocessed_webhook_event"
  /** Two distinct processed FINANCIAL events describe the same charge/invoice object. */
  | "duplicate_financial_event"
  /** More than one OPEN checkout operation for one subject + plan (index should forbid). */
  | "open_checkout_operations_overlap"
  /** A local row's test_mode disagrees with the provider object's livemode. */
  | "mode_mismatch";

export interface Anomaly {
  readonly kind: AnomalyKind;
  /** Stable identifiers the operator can search in Stripe / the DB. */
  readonly refs: Readonly<Record<string, string | number | boolean | null>>;
  readonly detail: string;
}

export interface ReconcileInput {
  readonly subscriptions: readonly LocalSubscriptionRecord[];
  readonly customers: readonly LocalCustomerRecord[];
  /** Provider view per LOCAL subscription id; missing key = lookup failed / not attempted. */
  readonly providerSubscriptions: Readonly<Record<string, ProviderSubscriptionRecord | null>>;
  /** Provider subscriptions listed per LOCAL customer id (to find rows we lack). */
  readonly providerSubscriptionsByCustomer: Readonly<Record<string, readonly ProviderSubscriptionRecord[]>>;
  readonly webhookEvents: readonly WebhookEventRecord[];
  readonly checkoutOperations: readonly CheckoutOperationRecord[];
  /** The ONE configured price for the sellable plan (env slot); null = not configured. */
  readonly expectedPriceId: string | null;
  /** The approved figure in cents, from plans.price_eur_monthly (null = unknown). */
  readonly expectedUnitAmountCents: number | null;
  readonly expectedCurrency: string;
  /** The adapter mode the reconciliation ran under. */
  readonly liveMode: boolean;
  readonly now: Date;
}

const FINANCIAL_EVENT_TYPES = new Set([
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
]);

function isManualRow(s: LocalSubscriptionRecord): boolean {
  return s.providerSubscriptionId === null || s.providerSubscriptionId.startsWith("manual_");
}

function scopeOf(s: LocalSubscriptionRecord): string {
  return s.organizationId ? `organization:${s.organizationId}` : `profile:${s.ownerId}`;
}

function entitles(status: string): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

export function detectAnomalies(input: ReconcileInput): Anomaly[] {
  const out: Anomaly[] = [];

  // (a) >1 blocking subscription per scope + plan
  const byScopePlan = new Map<string, LocalSubscriptionRecord[]>();
  for (const s of input.subscriptions) {
    if (isManualRow(s) || !subscriptionBlocksCheckout(s.status)) continue;
    const k = `${scopeOf(s)}|${s.planKey}`;
    byScopePlan.set(k, [...(byScopePlan.get(k) ?? []), s]);
  }
  for (const [k, rows] of byScopePlan) {
    if (rows.length > 1) {
      out.push({
        kind: "multiple_blocking_subscriptions_per_scope",
        refs: { scopePlan: k, subscriptionIds: rows.map((r) => r.providerSubscriptionId).join(",") },
        detail: `${rows.length} payable subscriptions for one billing subject + plan`,
      });
    }
  }

  // (b) duplicate customer linkage
  const custToOwners = new Map<string, Set<string>>();
  const ownerModeToCust = new Map<string, Set<string>>();
  for (const c of input.customers) {
    custToOwners.set(c.providerCustomerId, new Set([...(custToOwners.get(c.providerCustomerId) ?? []), c.ownerId]));
    const om = `${c.ownerId}|${c.testMode ? "test" : "live"}`;
    ownerModeToCust.set(om, new Set([...(ownerModeToCust.get(om) ?? []), c.providerCustomerId]));
  }
  for (const [cus, owners] of custToOwners) {
    if (owners.size > 1) {
      out.push({ kind: "duplicate_customer_linkage", refs: { providerCustomerId: cus, owners: [...owners].join(",") }, detail: "one provider customer mapped to several owners" });
    }
  }
  for (const [om, custs] of ownerModeToCust) {
    if (custs.size > 1) {
      out.push({ kind: "duplicate_customer_linkage", refs: { ownerMode: om, customers: [...custs].join(",") }, detail: "one owner holds several provider customers in one mode" });
    }
  }

  // (c)(d)(e)(f) per local subscription vs provider
  for (const s of input.subscriptions) {
    if (isManualRow(s)) continue;
    const subId = s.providerSubscriptionId as string;
    const p = Object.prototype.hasOwnProperty.call(input.providerSubscriptions, s.id)
      ? input.providerSubscriptions[s.id]
      : undefined;
    if (p === undefined) continue; // not looked up — no claim either way
    if (p === null) {
      if (entitles(s.status)) {
        out.push({
          kind: "local_entitlement_without_provider_subscription",
          refs: { localId: s.id, providerSubscriptionId: subId, localStatus: s.status },
          detail: "local row entitles but the provider has no such subscription",
        });
      }
      continue;
    }
    if (p.status !== s.status) {
      out.push({
        kind: "status_mismatch",
        refs: { localId: s.id, providerSubscriptionId: subId, localStatus: s.status, providerStatus: p.status },
        detail: entitles(s.status) && !entitles(p.status)
          ? "local row entitles but the provider subscription no longer bills"
          : "provider status differs from the local status",
      });
    }
    if (p.livemode === s.testMode) {
      out.push({
        kind: "mode_mismatch",
        refs: { localId: s.id, providerSubscriptionId: subId, localTestMode: s.testMode, providerLivemode: p.livemode },
        detail: "local test_mode disagrees with the provider object's livemode",
      });
    }
    if (input.expectedPriceId && p.priceId && p.priceId !== input.expectedPriceId) {
      out.push({
        kind: "unexpected_price",
        refs: { providerSubscriptionId: subId, priceId: p.priceId, expectedPriceId: input.expectedPriceId },
        detail: "subscription bills a price id other than the configured one",
      });
    }
    if (
      (input.expectedUnitAmountCents !== null && p.unitAmountCents !== null && p.unitAmountCents !== input.expectedUnitAmountCents) ||
      (p.currency !== null && p.currency.toLowerCase() !== input.expectedCurrency.toLowerCase())
    ) {
      out.push({
        kind: "unexpected_amount_or_currency",
        refs: { providerSubscriptionId: subId, unitAmountCents: p.unitAmountCents, currency: p.currency, expectedUnitAmountCents: input.expectedUnitAmountCents, expectedCurrency: input.expectedCurrency },
        detail: "subscription amount/currency differs from the approved figure",
      });
    }
  }

  // (g) provider subscriptions our customers hold that have no local row
  const localSubIds = new Set(input.subscriptions.map((s) => s.providerSubscriptionId).filter(Boolean));
  for (const [cus, subs] of Object.entries(input.providerSubscriptionsByCustomer)) {
    for (const p of subs) {
      if (localSubIds.has(p.id)) continue;
      if (p.status === "cancelled" || p.status === "expired") continue;
      out.push({
        kind: "provider_subscription_without_local_row",
        refs: { providerCustomerId: cus, providerSubscriptionId: p.id, providerStatus: p.status },
        detail: "the provider bills a subscription we have no row (and no entitlement) for",
      });
    }
  }

  // (h) unprocessed signed events
  for (const e of input.webhookEvents) {
    if (!e.processed) {
      out.push({
        kind: "unprocessed_webhook_event",
        refs: { eventId: e.eventId, eventType: e.eventType, error: e.error, createdAt: e.createdAt },
        detail: "a signature-verified event was recorded but never finished processing",
      });
    }
  }

  // (i) duplicate financial events about one object (distinct event ids)
  const byObject = new Map<string, WebhookEventRecord[]>();
  for (const e of input.webhookEvents) {
    if (!e.processed || !FINANCIAL_EVENT_TYPES.has(e.eventType) || !e.objectId) continue;
    // invoice.paid + invoice.payment_succeeded for ONE invoice is Stripe's documented pair — not a duplicate.
    const family = e.eventType.startsWith("invoice.payment_succeeded") ? "invoice.paid" : e.eventType;
    const k = `${family}|${e.objectId}`;
    byObject.set(k, [...(byObject.get(k) ?? []), e]);
  }
  for (const [k, rows] of byObject) {
    if (rows.length > 1) {
      out.push({
        kind: "duplicate_financial_event",
        refs: { objectKey: k, eventIds: rows.map((r) => r.eventId).join(",") },
        detail: "two distinct processed financial events describe the same object",
      });
    }
  }

  // (j) overlapping OPEN checkout operations
  const openByScope = new Map<string, CheckoutOperationRecord[]>();
  for (const op of input.checkoutOperations) {
    if (op.status !== "open" || Date.parse(op.expiresAt) <= input.now.getTime()) continue;
    const k = `${op.scopeKey}|${op.planKey}`;
    openByScope.set(k, [...(openByScope.get(k) ?? []), op]);
  }
  for (const [k, ops] of openByScope) {
    if (ops.length > 1) {
      out.push({
        kind: "open_checkout_operations_overlap",
        refs: { scopePlan: k, operationIds: ops.map((o) => o.id).join(",") },
        detail: "more than one open checkout operation for one subject + plan",
      });
    }
  }

  return out;
}

export interface ReconciliationSummary {
  readonly anomalies: number;
  readonly byKind: Readonly<Record<string, number>>;
  readonly healthy: boolean;
}

export function summarizeAnomalies(anomalies: readonly Anomaly[]): ReconciliationSummary {
  const byKind: Record<string, number> = {};
  for (const a of anomalies) byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
  return { anomalies: anomalies.length, byKind, healthy: anomalies.length === 0 };
}
