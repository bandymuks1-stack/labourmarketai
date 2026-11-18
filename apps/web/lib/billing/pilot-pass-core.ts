/**
 * Organization PILOT PASS — PURE core (owner 2026-10-22).
 *
 * One real 1 € payment that gives the pilot organization the FULL paid
 * Organization plan (`company_pilot`) for a fixed period, activated by the
 * signed webhook — so the owner proves the whole chain: payment → webhook →
 * database → plan → access rights → paid features, and then actually uses the
 * plan.
 *
 * Deliberately NOT a subscription: a one-time Checkout Session in `payment`
 * mode. Nothing renews, nothing is charged again, the 99 € price is never
 * touched. The pass is stored as the organization's plan row in
 * `billing_subscriptions` (provider subscription id `pilotpass_<session>`)
 * with `cancel_at_period_end = true` and `current_period_end` = payment time +
 * PILOT_PASS_DAYS, so every existing reader (entitlements, the account billing
 * section's "active until …" line) shows it honestly; once that moment passes
 * the entitlement read treats the row as `expired` (`effectivePilotPassStatus`).
 *
 * Reachable only when
 *   - the owner switched it on (BILLING_PILOT_PASS_ENABLED=true; off by default),
 *   - billing resolves to an active Stripe state for the caller's workspace
 *     organization (deny-by-default pilot list: other organizations read off),
 *   - the caller holds billing authority there,
 *   - the organization has no active paid plan already.
 * At most one payable session per organization per UTC day: the Stripe
 * idempotency key is derived from the organization and the date.
 */

export const PILOT_PASS_AMOUNT_CENTS = 100;
export const PILOT_PASS_CURRENCY = "eur";
/** The pilot period, stated on the button before payment (owner: define it first). */
export const PILOT_PASS_DAYS = 30;
/** The plan the pass grants: the one paid Organization plan (plans.ts ORGANIZATION_PLAN_KEY). */
export const PILOT_PASS_PLAN_KEY = "company_pilot";
export const PILOT_PASS_PURPOSE = "lm_pilot_pass";
export const PILOT_PASS_PRODUCT_NAME = "LabourMarket.ai Organization plan - 30-day pilot (1 EUR, no renewal)";
export const PILOT_PASS_ID_PREFIX = "pilotpass_";

export type PilotPassRefusal =
  | "pilot_pass_disabled"
  | "unauthenticated"
  | "no_organization"
  | "not_billing_authority"
  | "billing_not_active"
  | "plan_active";

export interface PilotPassGateInput {
  readonly enabled: boolean;
  readonly authenticated: boolean;
  readonly organizationId: string | null;
  readonly billingAuthority: boolean;
  /** getBillingConfigFor(organizationId).state */
  readonly billingState: string;
  /** The organization already holds an active paid plan (a pass or a subscription). */
  readonly planActive: boolean;
}

export type PilotPassGate =
  | { ok: true; organizationId: string }
  | { ok: false; reason: PilotPassRefusal; status: number };

export function evaluatePilotPass(input: PilotPassGateInput): PilotPassGate {
  if (!input.enabled) return { ok: false, reason: "pilot_pass_disabled", status: 404 };
  if (!input.authenticated) return { ok: false, reason: "unauthenticated", status: 401 };
  if (!input.organizationId) return { ok: false, reason: "no_organization", status: 403 };
  if (!input.billingAuthority) return { ok: false, reason: "not_billing_authority", status: 403 };
  if (input.billingState !== "stripe_live" && input.billingState !== "stripe_test") {
    return { ok: false, reason: "billing_not_active", status: 409 };
  }
  if (input.planActive) return { ok: false, reason: "plan_active", status: 409 };
  return { ok: true, organizationId: input.organizationId };
}

/** One payable session per organization per UTC day (Stripe replays it). */
export function pilotPassIdempotencyKey(organizationId: string, now: Date): string {
  return `${PILOT_PASS_PURPOSE}:${organizationId}:${now.toISOString().slice(0, 10)}`;
}

export function pilotPassMetadata(input: {
  organizationId: string;
  ownerId: string;
}): Record<string, string> {
  return {
    lm_purpose: PILOT_PASS_PURPOSE,
    plan_key: PILOT_PASS_PLAN_KEY,
    pilot_days: String(PILOT_PASS_DAYS),
    organization_id: input.organizationId,
    owner_id: input.ownerId,
  };
}

export function isPilotPassSubscriptionId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith(PILOT_PASS_ID_PREFIX);
}

export interface PilotPassGrant {
  readonly providerSubscriptionId: string;
  readonly providerCustomerId: string | null;
  readonly ownerId: string;
  readonly organizationId: string;
  readonly planKey: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly amountTotal: number | null;
  readonly currency: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
const idOf = (v: unknown) =>
  str(v) ?? (v && typeof v === "object" ? str((v as Record<string, unknown>).id) : null);

/**
 * A completed, PAID pilot-pass session → the plan grant the webhook stores.
 * Null for every other session, for an unpaid one, and for one whose
 * organization or owner is missing. The period starts at the event's own
 * `created` (Stripe's clock, signature-verified) — never the request time —
 * so a Stripe retry days later grants the same window, not a later one.
 */
export function parsePilotPassGrant(
  obj: Record<string, unknown> | null | undefined,
  eventCreatedUnix: number | null,
): PilotPassGrant | null {
  if (!obj) return null;
  const metadata = (obj.metadata ?? {}) as Record<string, unknown>;
  if (metadata.lm_purpose !== PILOT_PASS_PURPOSE) return null;
  if (obj.mode !== "payment" || obj.payment_status !== "paid") return null;
  const sessionId = str(obj.id);
  const organizationId = str(metadata.organization_id);
  const ownerId = str(obj.client_reference_id) ?? str(metadata.owner_id);
  if (!sessionId || !organizationId || !ownerId || eventCreatedUnix === null) return null;
  const startMs = eventCreatedUnix * 1000;
  return {
    providerSubscriptionId: `${PILOT_PASS_ID_PREFIX}${sessionId}`,
    providerCustomerId: idOf(obj.customer),
    ownerId,
    organizationId,
    planKey: PILOT_PASS_PLAN_KEY,
    periodStart: new Date(startMs).toISOString(),
    periodEnd: new Date(startMs + PILOT_PASS_DAYS * 86_400_000).toISOString(),
    amountTotal: typeof obj.amount_total === "number" ? obj.amount_total : null,
    currency: str(obj.currency),
  };
}

/**
 * The status the entitlement read uses for a plan row: a pilot pass past its
 * end is `expired` whatever the stored status says (nothing renews it, and no
 * provider event will arrive to end it). Every other row is unchanged.
 */
export function effectivePilotPassStatus(
  row: { provider_subscription_id?: unknown; status?: unknown; current_period_end?: unknown },
  now: Date,
): string | null {
  const status = typeof row.status === "string" ? row.status : null;
  if (!isPilotPassSubscriptionId(row.provider_subscription_id)) return status;
  const end = typeof row.current_period_end === "string" ? Date.parse(row.current_period_end) : NaN;
  if (!Number.isFinite(end) || end <= now.getTime()) return "expired";
  return status;
}

/** The webhook's evidence for a completed pass, kept with the idempotency record. */
export function summarizePilotPassSession(
  obj: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!obj) return null;
  const metadata = (obj.metadata ?? {}) as Record<string, unknown>;
  if (metadata.lm_purpose !== PILOT_PASS_PURPOSE) return null;
  return {
    purpose: PILOT_PASS_PURPOSE,
    session_id: str(obj.id),
    mode: str(obj.mode),
    payment_status: str(obj.payment_status),
    amount_total: typeof obj.amount_total === "number" ? obj.amount_total : null,
    currency: str(obj.currency),
    livemode: obj.livemode === true,
    organization_id: str(metadata.organization_id),
    plan_key: str(metadata.plan_key),
    pilot_days: str(metadata.pilot_days),
    payment_intent: idOf(obj.payment_intent),
  };
}
