/**
 * Checkout OPERATIONS — PURE core (billing safety v1, owner directive
 * 2026-09-05 "BILLING SAFETY — MANDATORY BEFORE REAL CUSTOMERS"). No IO.
 *
 * The problem a disabled button cannot solve: a double click, a refresh, the
 * back button, a client/server/network retry, two tabs, two concurrent
 * requests, a re-opened checkout or a repeated chat action must NEVER end in
 * two payable subscriptions. The answer is a canonical SERVER-SIDE identity for
 * every checkout request — a `billing_checkout_operations` row — from which
 * the Stripe idempotency key is DERIVED, and a window in which exactly ONE such
 * operation may be open per billing subject + plan:
 *
 *   - the row's id is the identity; the key is `co2_<scope>_<plan>_<id>`, so a
 *     request that reuses the row reuses the key and Stripe replays the SAME
 *     Checkout Session (same URL) instead of minting another;
 *   - the row's `expires_at` IS the Checkout Session's `expires_at`, so when
 *     the local window closes the hosted session is unpayable too — at any
 *     instant at most one payable session exists per (subject, plan);
 *   - a LOCAL subscription in a billing state (active / trialing / past_due /
 *     incomplete / unpaid) for the same subject + plan REFUSES a new checkout
 *     until reconciled against Stripe (checkout-admission.ts): the only way
 *     to a second subscription is through the provider's own state, never a
 *     click.
 *
 * Statuses the store writes: open → completed (webhook checkout.session.
 * completed) | expired (window passed / checkout.session.expired) | failed
 * (provider refused to create the session) | superseded (a newer operation
 * replaced an expired one).
 */

import type { SubStatus } from "@/lib/billing/webhook-core";

/**
 * The open-checkout window. Stripe accepts `expires_at` between 30 minutes and
 * 24 hours after session creation; 45 minutes keeps a margin above the
 * minimum for a reused operation whose first Stripe call never happened.
 */
export const CHECKOUT_WINDOW_MINUTES = 45 as const;

export type CheckoutOperationStatus =
  | "open"
  | "completed"
  | "expired"
  | "failed"
  | "superseded";

/**
 * Local subscription states that mean "this subject already has (or is in the
 * middle of getting) a payable subscription for this plan". Every one of them
 * refuses a fresh checkout until Stripe confirms the subscription is dead:
 *   active / trialing  — billing now;
 *   past_due / unpaid  — Stripe is still collecting (the Customer Portal is
 *                        the path to fix the card, not a second checkout);
 *   incomplete         — a checkout completed and the first payment is
 *                        pending/failed; Stripe expires it after ~23h and
 *                        emits the terminal event (incomplete_expired).
 * cancelled / expired / none never block.
 */
export const BLOCKING_SUBSCRIPTION_STATUSES: readonly SubStatus[] = [
  "active",
  "trialing",
  "past_due",
  "incomplete",
  "unpaid",
];

export function subscriptionBlocksCheckout(status: SubStatus | string | null | undefined): boolean {
  return status != null && (BLOCKING_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

/** A provider (Stripe API) status that means the subscription no longer bills. */
export function providerStatusIsDead(status: SubStatus): boolean {
  return status === "cancelled" || status === "expired";
}

export type BillingScope =
  | { readonly type: "organization"; readonly id: string }
  | { readonly type: "profile"; readonly id: string };

/** Immutable scope discriminator stored on the operation row. */
export function scopeKeyFor(scope: BillingScope): string {
  return `${scope.type}:${scope.id}`;
}

/**
 * The Stripe idempotency key DERIVED from the operation identity. Same row →
 * same key → Stripe replays the same session. Stripe allows 255 chars; this
 * stays well under (prefix + 12 + 36 + slug + 36).
 */
export function checkoutOperationIdempotencyKey(input: {
  operationId: string;
  planKey: string;
  scope: BillingScope;
}): string {
  return `co2_${input.scope.type}_${input.scope.id}_${input.planKey}_${input.operationId}`;
}

export interface CheckoutWindow {
  readonly expiresAt: Date;
  /** Unix seconds — the value handed to Stripe as the session `expires_at`. */
  readonly expiresAtUnix: number;
}

export function checkoutWindow(now: Date): CheckoutWindow {
  const expiresAt = new Date(now.getTime() + CHECKOUT_WINDOW_MINUTES * 60_000);
  return { expiresAt, expiresAtUnix: Math.floor(expiresAt.getTime() / 1000) };
}

/** `expires_at` (ISO) → the Stripe unix value, identical for every reuse. */
export function expiresAtUnixFromIso(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

export interface OpenOperationSnapshot {
  readonly status: CheckoutOperationStatus | string;
  readonly expiresAt: string;
}

/** An operation is reusable iff it is still `open` AND inside its window. */
export function isOperationReusable(op: OpenOperationSnapshot, now: Date): boolean {
  return op.status === "open" && Date.parse(op.expiresAt) > now.getTime();
}

// ─── Admission (the "one active subscription per subject+plan" rule) ────────

export type CheckoutAdmission =
  /** No blocking local row → proceed. */
  | { readonly admit: true; readonly reason: "no_local_subscription" }
  /** A manual admin grant is not a payable subscription → proceed. */
  | { readonly admit: true; readonly reason: "manual_override_only" }
  /**
   * The local row said "blocking" but the PROVIDER (authoritative, read via
   * the API) says the subscription is dead: the local row is healed to the
   * provider status and checkout proceeds. This is the ONLY self-healing
   * write on the admission path and it copies provider truth — never grants.
   */
  | { readonly admit: true; readonly reason: "healed_from_provider"; readonly providerStatus: SubStatus }
  /** A payable subscription exists (or cannot be disproved) → refuse. */
  | {
      readonly admit: false;
      readonly reason: "subscription_exists";
      readonly localStatus: SubStatus;
      /** Why the refusal stood: provider confirmed, or provider unreachable (fail closed). */
      readonly provider: "confirmed_live" | "unavailable";
    };

export function decideCheckoutAdmission(input: {
  local: { status: SubStatus; providerSubscriptionId: string | null } | null;
  /** null = provider lookup unavailable/failed (fail CLOSED). */
  provider: { status: SubStatus } | null;
}): CheckoutAdmission {
  const local = input.local;
  if (!local) return { admit: true, reason: "no_local_subscription" };
  const isManual =
    local.providerSubscriptionId === null || local.providerSubscriptionId.startsWith("manual_");
  if (isManual) return { admit: true, reason: "manual_override_only" };
  if (!subscriptionBlocksCheckout(local.status)) {
    return { admit: true, reason: "no_local_subscription" };
  }
  if (input.provider && providerStatusIsDead(input.provider.status)) {
    return { admit: true, reason: "healed_from_provider", providerStatus: input.provider.status };
  }
  return {
    admit: false,
    reason: "subscription_exists",
    localStatus: local.status,
    provider: input.provider ? "confirmed_live" : "unavailable",
  };
}
