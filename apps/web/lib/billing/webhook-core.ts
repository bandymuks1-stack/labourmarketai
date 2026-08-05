/**
 * Webhook event mapping — PURE core (Stripe sprint PR4). No IO. Translates a
 * verified Stripe TEST event into our normalized subscription/payment shape.
 * The route (app/api/billing/webhook) verifies the signature, enforces test
 * mode + idempotency around this, and persists via the service-role store.
 */

export type SubStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "cancelled"
  | "incomplete"
  | "expired";

export type PaymentStatus = "succeeded" | "failed" | "pending" | "none";

const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  // `invoice.paid` is Stripe's recommended success event (fires for
  // out-of-band payments too) and on newer API versions it can be the ONLY
  // success signal delivered. Handled identically to
  // invoice.payment_succeeded; applying "succeeded" twice for the same
  // invoice is a no-op on the subscription row, so a paid/payment_succeeded
  // pair for one invoice is harmless.
  "invoice.paid",
  "invoice.payment_failed",
]);

export function isHandledEventType(type: string): boolean {
  return HANDLED.has(type);
}

/** Stripe subscription.status → our enum (conservative). */
export function mapStripeStatus(s: string | undefined): SubStatus {
  switch (s) {
    case "trialing": return "trialing";
    case "active": return "active";
    case "past_due": return "past_due";
    case "unpaid": return "unpaid";
    case "canceled": return "cancelled";
    case "incomplete": return "incomplete";
    case "incomplete_expired": return "expired";
    case "paused": return "past_due";
    default: return "none";
  }
}

export interface SubscriptionUpsert {
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  ownerId: string | null; // our profile id (from metadata / client_reference_id)
  planKey: string | null; // from metadata.plan_key
  status: SubStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  testMode: boolean;
}

function isoFromUnix(v: unknown): string | null {
  return typeof v === "number" && Number.isFinite(v)
    ? new Date(v * 1000).toISOString()
    : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** An id-or-expanded-object reference ("sub_1" or { id: "sub_1", … }) → id. */
function idFrom(v: unknown): string | null {
  if (typeof v === "string") return v.length > 0 ? v : null;
  if (v && typeof v === "object") {
    return asString((v as Record<string, unknown>).id);
  }
  return null;
}

/**
 * Subscription billing period — tolerant of BOTH API shapes:
 *  - post-Basil (2025-03-31.basil and later, incl. the pinned 2026-05-27.dahlia):
 *    `current_period_start/end` live on each SUBSCRIPTION ITEM
 *    (`items.data[n].current_period_*`) — the top-level fields are gone;
 *  - pre-Basil (legacy): top-level `current_period_start/end` on the
 *    subscription object.
 * Reads the new location first and falls back to the legacy field, so a
 * dashboard-default webhook on an older account version still parses.
 */
function periodFromSubscription(
  obj: Record<string, unknown>,
  key: "current_period_start" | "current_period_end",
): string | null {
  const items = (obj.items as { data?: unknown[] } | null | undefined)?.data;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const iso = isoFromUnix((item as Record<string, unknown>)[key]);
      if (iso) return iso;
    }
  }
  return isoFromUnix(obj[key]);
}

/**
 * Invoice → subscription id — tolerant of BOTH API shapes:
 *  - post-Basil: `invoice.parent.subscription_details.subscription`
 *    (id string or expanded object);
 *  - pre-Basil (legacy): `invoice.subscription` (id string or expanded object).
 */
function subscriptionIdFromInvoice(
  obj: Record<string, unknown> | null | undefined,
): string | null {
  if (!obj) return null;
  const parent = obj.parent as Record<string, unknown> | null | undefined;
  const details = parent?.subscription_details as
    | Record<string, unknown>
    | null
    | undefined;
  return idFrom(details?.subscription) ?? idFrom(obj.subscription);
}

/** Parse a customer.subscription.* event object → SubscriptionUpsert. */
export function parseSubscriptionObject(
  obj: Record<string, unknown> | null | undefined,
  testMode: boolean,
): SubscriptionUpsert | null {
  if (!obj || typeof obj.id !== "string") return null;
  const meta = (obj.metadata as Record<string, unknown> | undefined) ?? {};
  return {
    providerSubscriptionId: obj.id,
    providerCustomerId: idFrom(obj.customer),
    ownerId: asString(meta.client_reference_id) ?? asString(meta.owner_id),
    planKey: asString(meta.plan_key),
    status: mapStripeStatus(obj.status as string | undefined),
    currentPeriodStart: periodFromSubscription(obj, "current_period_start"),
    currentPeriodEnd: periodFromSubscription(obj, "current_period_end"),
    cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
    testMode,
  };
}

/** Parse a checkout.session.completed object → the initial link. */
export function parseCheckoutSessionObject(
  obj: Record<string, unknown> | null | undefined,
  testMode: boolean,
): Pick<SubscriptionUpsert, "providerSubscriptionId" | "providerCustomerId" | "ownerId" | "planKey" | "testMode"> | null {
  if (!obj) return null;
  const meta = (obj.metadata as Record<string, unknown> | undefined) ?? {};
  // `subscription` may arrive as an id string or an expanded object.
  const sub = idFrom(obj.subscription);
  if (!sub) return null;
  return {
    providerSubscriptionId: sub,
    providerCustomerId: idFrom(obj.customer),
    ownerId: asString(obj.client_reference_id) ?? asString(meta.client_reference_id),
    planKey: asString(meta.plan_key),
    testMode,
  };
}

/** Parse an invoice.paid / invoice.payment_* object → payment status + sub id. */
export function parseInvoiceObject(
  obj: Record<string, unknown> | null | undefined,
  succeeded: boolean,
): { providerSubscriptionId: string | null; lastPaymentStatus: PaymentStatus } {
  return {
    providerSubscriptionId: subscriptionIdFromInvoice(obj),
    lastPaymentStatus: succeeded ? "succeeded" : "failed",
  };
}

/** A test event MUST be test-mode — a live event is rejected. */
export function assertTestEvent(event: { testMode: boolean }): boolean {
  return event.testMode === true;
}
