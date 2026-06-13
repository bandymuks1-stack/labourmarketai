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

/** Parse a customer.subscription.* event object → SubscriptionUpsert. */
export function parseSubscriptionObject(
  obj: Record<string, unknown> | null | undefined,
  testMode: boolean,
): SubscriptionUpsert | null {
  if (!obj || typeof obj.id !== "string") return null;
  const meta = (obj.metadata as Record<string, unknown> | undefined) ?? {};
  return {
    providerSubscriptionId: obj.id,
    providerCustomerId: asString(obj.customer),
    ownerId: asString(meta.client_reference_id) ?? asString(meta.owner_id),
    planKey: asString(meta.plan_key),
    status: mapStripeStatus(obj.status as string | undefined),
    currentPeriodStart: isoFromUnix(obj.current_period_start),
    currentPeriodEnd: isoFromUnix(obj.current_period_end),
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
  const sub = asString(obj.subscription);
  if (!sub) return null;
  return {
    providerSubscriptionId: sub,
    providerCustomerId: asString(obj.customer),
    ownerId: asString(obj.client_reference_id) ?? asString(meta.client_reference_id),
    planKey: asString(meta.plan_key),
    testMode,
  };
}

/** Parse an invoice.payment_* object → the last payment status + sub id. */
export function parseInvoiceObject(
  obj: Record<string, unknown> | null | undefined,
  succeeded: boolean,
): { providerSubscriptionId: string | null; lastPaymentStatus: PaymentStatus } {
  return {
    providerSubscriptionId: asString(obj?.subscription),
    lastPaymentStatus: succeeded ? "succeeded" : "failed",
  };
}

/** A test event MUST be test-mode — a live event is rejected. */
export function assertTestEvent(event: { testMode: boolean }): boolean {
  return event.testMode === true;
}
