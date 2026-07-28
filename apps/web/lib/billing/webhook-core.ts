/**
 * Webhook event mapping — PURE core (Stripe sprint PR4). No IO. Translates a
 * verified Stripe TEST event into our normalized subscription/payment shape.
 * The route (app/api/billing/webhook) verifies the signature, enforces test
 * mode + idempotency around this, and persists via the service-role store.
 *
 * API-VERSION NOTE (commercial readiness audit v1). The pinned SDK
 * (`stripe@22`, API `2026-05-27.dahlia`) no longer carries two fields this
 * module used to read:
 *   - `Subscription.current_period_start/end` moved to
 *     `subscription.items.data[].current_period_*` (removed at 2025-04-30.basil);
 *   - `Invoice.subscription` moved to
 *     `invoice.parent.subscription_details.subscription`.
 * Reading the old locations returned `null` on every real event, which silently
 * left every period empty and made EVERY invoice event a no-op (a failed
 * payment never reached the subscription row). Both are read from the new
 * location first, with the legacy location kept as a fallback so replayed or
 * older-API events still parse.
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
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

/** Invoice events that mean "this billing period was paid". */
const INVOICE_PAID_EVENTS = new Set(["invoice.paid", "invoice.payment_succeeded"]);

export function isHandledEventType(type: string): boolean {
  return HANDLED.has(type);
}

export function isInvoicePaidEvent(type: string): boolean {
  return INVOICE_PAID_EVENTS.has(type);
}

/**
 * Stripe subscription.status → our enum (conservative).
 *
 * `paused` maps to `unpaid`, NOT `past_due`: a paused subscription collects no
 * money, and `past_due` is an entitling grace state — mapping it there granted
 * indefinite free paid access through a legitimate Stripe control.
 */
export function mapStripeStatus(s: string | undefined): SubStatus {
  switch (s) {
    case "trialing": return "trialing";
    case "active": return "active";
    case "past_due": return "past_due";
    case "unpaid": return "unpaid";
    case "canceled": return "cancelled";
    case "incomplete": return "incomplete";
    case "incomplete_expired": return "expired";
    case "paused": return "unpaid";
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

/** A Stripe field that may be an id string or an expanded object with an id. */
function asIdRef(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  if (v && typeof v === "object") {
    const id = (v as Record<string, unknown>).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
}

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/**
 * Current period for a subscription. The canonical location since
 * 2025-04-30.basil is the subscription ITEM; the removed top-level field is
 * still accepted for replayed/legacy events.
 */
export function parseSubscriptionPeriod(
  obj: Record<string, unknown> | null | undefined,
): { start: string | null; end: string | null } {
  const legacyStart = isoFromUnix(obj?.current_period_start);
  const legacyEnd = isoFromUnix(obj?.current_period_end);
  if (legacyStart || legacyEnd) return { start: legacyStart, end: legacyEnd };

  const items = record(obj?.items);
  const data = Array.isArray(items?.data) ? (items.data as unknown[]) : [];
  // Multiple items share one billing cycle; take the widest window present.
  let start: string | null = null;
  let end: string | null = null;
  for (const raw of data) {
    const item = record(raw);
    if (!item) continue;
    const s = isoFromUnix(item.current_period_start);
    const e = isoFromUnix(item.current_period_end);
    if (s && (!start || s < start)) start = s;
    if (e && (!end || e > end)) end = e;
  }
  return { start, end };
}

/**
 * A subscription whose collection is paused (`pause_collection`) keeps
 * `status: "active"` while Stripe charges nothing. Treated as non-entitling for
 * the same reason as `status: "paused"` — no money is being collected.
 */
export function isCollectionPaused(
  obj: Record<string, unknown> | null | undefined,
): boolean {
  const pause = record(obj?.pause_collection);
  if (!pause) return false;
  const behavior = asString(pause.behavior);
  // `keep_as_draft` still invoices (the draft is collected later); `void` and
  // `mark_uncollectible` do not.
  return behavior === "void" || behavior === "mark_uncollectible";
}

/** Parse a customer.subscription.* event object → SubscriptionUpsert. */
export function parseSubscriptionObject(
  obj: Record<string, unknown> | null | undefined,
  testMode: boolean,
): SubscriptionUpsert | null {
  if (!obj || typeof obj.id !== "string") return null;
  const meta = (obj.metadata as Record<string, unknown> | undefined) ?? {};
  const period = parseSubscriptionPeriod(obj);
  const mapped = mapStripeStatus(obj.status as string | undefined);
  return {
    providerSubscriptionId: obj.id,
    providerCustomerId: asIdRef(obj.customer),
    ownerId: asString(meta.client_reference_id) ?? asString(meta.owner_id),
    planKey: asString(meta.plan_key),
    status: isCollectionPaused(obj) && mapped === "active" ? "unpaid" : mapped,
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
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
  const sub = asIdRef(obj.subscription);
  if (!sub) return null;
  return {
    providerSubscriptionId: sub,
    providerCustomerId: asIdRef(obj.customer),
    ownerId: asString(obj.client_reference_id) ?? asString(meta.client_reference_id),
    planKey: asString(meta.plan_key),
    testMode,
  };
}

/**
 * The subscription an invoice belongs to. Canonical location since
 * 2025-04-30.basil is `parent.subscription_details.subscription`; the removed
 * top-level `subscription`, and the per-line parent, are accepted as fallbacks.
 */
export function parseInvoiceSubscriptionId(
  obj: Record<string, unknown> | null | undefined,
): string | null {
  const parent = record(obj?.parent);
  const details = record(parent?.subscription_details);
  const fromParent = asIdRef(details?.subscription);
  if (fromParent) return fromParent;

  const legacy = asIdRef(obj?.subscription);
  if (legacy) return legacy;

  const lines = record(obj?.lines);
  const data = Array.isArray(lines?.data) ? (lines.data as unknown[]) : [];
  for (const raw of data) {
    const line = record(raw);
    const lineParent = record(line?.parent);
    const itemDetails = record(lineParent?.subscription_item_details);
    const fromLine = asIdRef(itemDetails?.subscription);
    if (fromLine) return fromLine;
  }
  return null;
}

/** Parse an invoice.* payment event → the last payment status + sub id. */
export function parseInvoiceObject(
  obj: Record<string, unknown> | null | undefined,
  succeeded: boolean,
): { providerSubscriptionId: string | null; lastPaymentStatus: PaymentStatus } {
  return {
    providerSubscriptionId: parseInvoiceSubscriptionId(obj),
    lastPaymentStatus: succeeded ? "succeeded" : "failed",
  };
}

/**
 * Status precedence for out-of-order webhook delivery.
 *
 * Stripe does NOT guarantee event order. `checkout.session.completed` carries
 * no subscription status, so it is applied as `incomplete`; if it lands AFTER
 * `customer.subscription.updated` (active), a naive write would downgrade a
 * paid subscriber to `incomplete` and revoke their entitlement. A lifecycle
 * status is therefore never overwritten by the weaker linking status —
 * terminal states (cancelled/expired) always win, since they are final.
 */
const STATUS_RANK: Record<SubStatus, number> = {
  none: 0,
  incomplete: 1,
  unpaid: 2,
  past_due: 3,
  trialing: 4,
  active: 5,
  cancelled: 9,
  expired: 9,
};

export function isTerminalStatus(s: SubStatus): boolean {
  return s === "cancelled" || s === "expired";
}

/**
 * Whether an incoming status may replace the stored one.
 * `fromLink` marks the placeholder status written by checkout.session.completed.
 */
export function shouldApplyStatus(
  incoming: SubStatus,
  stored: SubStatus | null | undefined,
  opts?: { fromLink?: boolean },
): boolean {
  if (!stored || stored === "none") return true;
  if (isTerminalStatus(stored) && !isTerminalStatus(incoming)) {
    // A re-subscription reuses the row via a NEW subscription id; that path
    // resets the row explicitly. A stale event must not resurrect access.
    return false;
  }
  if (opts?.fromLink) return STATUS_RANK[incoming] > STATUS_RANK[stored];
  return true;
}

/** A test event MUST be test-mode — a live event is rejected. */
export function assertTestEvent(event: { testMode: boolean }): boolean {
  return event.testMode === true;
}
