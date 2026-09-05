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
  // Refund/dispute ingestion (commercial safe-prep v1): these are RECORDED,
  // signature-verified, test-only — see RECORD_ONLY below for why they do not
  // mutate subscription state.
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
]);

export function isHandledEventType(type: string): boolean {
  return HANDLED.has(type);
}

/**
 * Events that are INGESTED AS RECORDS ONLY (persisted to the webhook-events
 * store with a parsed summary) and deliberately cause NO subscription state
 * transition. The semantics are not unambiguous enough to automate:
 *
 *   - `charge.refunded` — a full refund of the latest invoice does NOT mean
 *     the subscription is cancelled: Stripe keeps the subscription billing
 *     unless it is cancelled separately, and a partial/goodwill refund means
 *     even less. Auto-cancelling here would silently strip an entitlement the
 *     provider still considers live. The refund is recorded; any state change
 *     is an operator decision (or a later `customer.subscription.*` event,
 *     which this chain already applies).
 *   - `charge.dispute.created` / `charge.dispute.closed` — a dispute's effect
 *     depends on its outcome and on how the account is configured; Stripe
 *     itself emits the authoritative subscription/invoice events that follow.
 *     The dispute lifecycle is recorded for the operator; state stays
 *     conservative.
 *
 * When ANY billing state change is warranted, it arrives through the
 * subscription/invoice events above — never inferred from a charge event.
 */
const RECORD_ONLY = new Set([
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
]);

export function isRecordOnlyEventType(type: string): boolean {
  return RECORD_ONLY.has(type);
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
  planKey: string | null; // from metadata.canonical_plan_key / plan_key
  /** Canonical organizations.id from signature-verified metadata — the
   *  BILLING SUBJECT binding for company/agency plans (M-P0-7 model);
   *  null = personal subject. */
  organizationId: string | null;
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
    planKey: asString(meta.canonical_plan_key) ?? asString(meta.plan_key),
    organizationId: asString(meta.organization_id),
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
): Pick<SubscriptionUpsert, "providerSubscriptionId" | "providerCustomerId" | "ownerId" | "planKey" | "organizationId" | "testMode"> | null {
  if (!obj) return null;
  const meta = (obj.metadata as Record<string, unknown> | undefined) ?? {};
  // `subscription` may arrive as an id string or an expanded object.
  const sub = idFrom(obj.subscription);
  if (!sub) return null;
  return {
    providerSubscriptionId: sub,
    providerCustomerId: idFrom(obj.customer),
    ownerId: asString(obj.client_reference_id) ?? asString(meta.client_reference_id),
    planKey: asString(meta.canonical_plan_key) ?? asString(meta.plan_key),
    organizationId: asString(meta.organization_id),
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

/**
 * Parsed summary of a charge.refunded event — the persisted RECORD (nothing
 * here drives a state machine). `fullyRefunded` mirrors Stripe's own
 * `refunded` boolean; `amountRefundedCents` is the cumulative refunded total
 * in the charge's smallest currency unit, exactly as Stripe reports it.
 */
export interface ChargeRefundRecord {
  chargeId: string | null;
  paymentIntentId: string | null;
  invoiceId: string | null;
  amountRefundedCents: number | null;
  currency: string | null;
  fullyRefunded: boolean;
}

export function parseChargeRefundObject(
  obj: Record<string, unknown> | null | undefined,
): ChargeRefundRecord | null {
  if (!obj) return null;
  return {
    chargeId: asString(obj.id),
    paymentIntentId: idFrom(obj.payment_intent),
    invoiceId: idFrom(obj.invoice),
    amountRefundedCents:
      typeof obj.amount_refunded === "number" && Number.isFinite(obj.amount_refunded)
        ? obj.amount_refunded
        : null,
    currency: asString(obj.currency),
    fullyRefunded: obj.refunded === true,
  };
}

/** Parsed summary of a charge.dispute.* event — the persisted RECORD. */
export interface DisputeRecord {
  disputeId: string | null;
  chargeId: string | null;
  paymentIntentId: string | null;
  /** Stripe's own dispute status string (e.g. needs_response, won, lost). */
  status: string | null;
  /** Stripe's own dispute reason string (e.g. fraudulent, product_not_received). */
  reason: string | null;
  amountCents: number | null;
  currency: string | null;
}

export function parseDisputeObject(
  obj: Record<string, unknown> | null | undefined,
): DisputeRecord | null {
  if (!obj) return null;
  return {
    disputeId: asString(obj.id),
    chargeId: idFrom(obj.charge),
    paymentIntentId: idFrom(obj.payment_intent),
    status: asString(obj.status),
    reason: asString(obj.reason),
    amountCents:
      typeof obj.amount === "number" && Number.isFinite(obj.amount)
        ? obj.amount
        : null,
    currency: asString(obj.currency),
  };
}

/**
 * The summary a record-only event persists alongside {id, type} in the
 * webhook-events store. Returns null for every other event type (their record
 * stays the lean {id, type} shape it always was).
 */
export function summarizeRecordedEvent(
  type: string,
  obj: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (type === "charge.refunded") {
    const r = parseChargeRefundObject(obj);
    return r ? { ...r } : null;
  }
  if (type === "charge.dispute.created" || type === "charge.dispute.closed") {
    const d = parseDisputeObject(obj);
    return d ? { ...d } : null;
  }
  return null;
}

/** A test event MUST be test-mode — a live event is rejected. */
export function assertTestEvent(event: { testMode: boolean }): boolean {
  return event.testMode === true;
}

/**
 * D3 (2026-09-02): the event's mode must match the ADAPTER state — a live
 * event is rejected under `stripe_test` (the historical rule, unchanged) and
 * a test event is rejected under `stripe_live` (a test-mode replay can never
 * touch a live entitlement). Any other state accepts nothing.
 */
export function eventModeMatches(
  state: "disabled" | "stripe_test" | "stripe_live" | "stripe_live_blocked",
  event: { testMode: boolean },
): boolean {
  if (state === "stripe_test") return assertTestEvent(event);
  if (state === "stripe_live") return event.testMode === false;
  return false;
}
