/**
 * LIVE payment check — PURE core (owner 2026-10-22: one real 1 € payment that
 * proves the whole LabourMarket.ai chain — the app creates the LIVE session, the
 * owner pays it, the signed webhook is recorded in the database — not merely
 * that Stripe can take money).
 *
 * Deliberately NOT a plan, NOT a subscription and NOT LMC: a one-time Checkout
 * Session in `payment` mode for a FIXED amount the client can never supply,
 * reachable only when
 *   - billing resolves to `stripe_live` for the caller's workspace organization
 *     (deny-by-default pilot list: every other organization reads billing off),
 *   - the caller holds billing authority in that organization,
 *   - the owner switched the check on (BILLING_LIVE_CHECK_ENABLED=true; off by
 *     default and after the check).
 * At most one payable session per organization per UTC day: the Stripe
 * idempotency key is derived from the organization and the date, so a second
 * click replays the same session instead of creating another charge.
 */

export const LIVE_CHECK_AMOUNT_CENTS = 100;
export const LIVE_CHECK_CURRENCY = "eur";
export const LIVE_CHECK_PURPOSE = "lm_live_payment_check";
export const LIVE_CHECK_PRODUCT_NAME = "LabourMarket.ai LIVE payment check (1 EUR)";

export type LiveCheckRefusal =
  | "live_check_disabled"
  | "unauthenticated"
  | "no_organization"
  | "not_billing_authority"
  | "not_live";

export interface LiveCheckGateInput {
  readonly enabled: boolean;
  readonly authenticated: boolean;
  readonly organizationId: string | null;
  readonly billingAuthority: boolean;
  /** getBillingConfigFor(organizationId).state */
  readonly billingState: string;
}

export type LiveCheckGate =
  | { ok: true; organizationId: string }
  | { ok: false; reason: LiveCheckRefusal; status: number };

export function evaluateLiveCheck(input: LiveCheckGateInput): LiveCheckGate {
  if (!input.enabled) return { ok: false, reason: "live_check_disabled", status: 404 };
  if (!input.authenticated) return { ok: false, reason: "unauthenticated", status: 401 };
  if (!input.organizationId) return { ok: false, reason: "no_organization", status: 403 };
  if (!input.billingAuthority) return { ok: false, reason: "not_billing_authority", status: 403 };
  if (input.billingState !== "stripe_live") return { ok: false, reason: "not_live", status: 409 };
  return { ok: true, organizationId: input.organizationId };
}

/** One payable session per organization per UTC day (Stripe replays it). */
export function liveCheckIdempotencyKey(organizationId: string, now: Date): string {
  return `${LIVE_CHECK_PURPOSE}:${organizationId}:${now.toISOString().slice(0, 10)}`;
}

export function liveCheckMetadata(input: {
  organizationId: string;
  ownerId: string;
}): Record<string, string> {
  return {
    lm_purpose: LIVE_CHECK_PURPOSE,
    organization_id: input.organizationId,
    owner_id: input.ownerId,
  };
}

/**
 * The webhook's evidence for a completed LIVE check — persisted with the
 * idempotency record so the database itself shows what was paid, by which
 * organization, in which mode. Null for every other session.
 */
export function summarizeLiveCheckSession(
  obj: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!obj) return null;
  const metadata = (obj.metadata ?? {}) as Record<string, unknown>;
  if (metadata.lm_purpose !== LIVE_CHECK_PURPOSE) return null;
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  return {
    purpose: LIVE_CHECK_PURPOSE,
    session_id: str(obj.id),
    mode: str(obj.mode),
    payment_status: str(obj.payment_status),
    amount_total: typeof obj.amount_total === "number" ? obj.amount_total : null,
    currency: str(obj.currency),
    livemode: obj.livemode === true,
    organization_id: str(metadata.organization_id),
    payment_intent: str(obj.payment_intent),
  };
}
