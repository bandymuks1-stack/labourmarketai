import "server-only";

import {
  parseCheckoutSessionObject,
  parseSubscriptionObject,
  type SubscriptionUpsert,
} from "@/lib/billing/webhook-core";
import { upsertSubscription, type StoreResult } from "@/lib/billing/subscription-store";

/**
 * THE canonical subscription-apply primitive.
 *
 * Every path that moves a `billing_subscriptions` row from provider data goes
 * through here: the signed webhook today, and (stage 2) scheduled recovery /
 * the user-initiated refresh. There is ONE state machine:
 *
 *   provider data -> normalize (webhook-core parsers) -> applySubscriptionSnapshot
 *     -> upsertSubscription (ordering guard decideSubscriptionTransition,
 *        terminal rows never revived, conflict-live-subscription refusal,
 *        idempotent on (provider, provider_subscription_id))
 *     -> entitlements derive from the row (effective-entitlements) — never here.
 *
 * Nothing in this module talks to the provider or creates/changes/cancels a
 * payment. It never throws: the store returns a StoreResult.
 */

export type ApplyResult = StoreResult;

/** Evidence of WHICH observation produced the snapshot (ordering key + audit id). */
export interface SnapshotEvidence {
  /** Webhook event id, or `reconcile:<source>` for a recovery observation. */
  readonly id: string;
  /** Stripe seconds the observation is stamped with (ordering guard input). */
  readonly created: number | null;
}

/**
 * Apply a normalized subscription snapshot.
 * `deleted` is the webhook's `customer.subscription.deleted` rule: the object
 * still carries its last live status, but the event means the subscription is
 * cancelled.
 */
export async function applySubscriptionSnapshot(
  snapshot: SubscriptionUpsert,
  opts: { readonly deleted?: boolean } = {},
): Promise<ApplyResult> {
  return upsertSubscription(opts.deleted ? { ...snapshot, status: "cancelled" } : snapshot);
}

/**
 * Normalize + apply a raw Stripe subscription object (webhook event.data.object
 * or a recovery retrieval). Returns null when the object is not a subscription
 * (nothing to apply) — callers treat that as "ok, nothing to do".
 */
export async function applyRawSubscriptionObject(
  obj: Record<string, unknown> | null | undefined,
  input: { readonly testMode: boolean; readonly evidence: SnapshotEvidence; readonly deleted?: boolean },
): Promise<ApplyResult | null> {
  const sub = parseSubscriptionObject(obj, input.testMode, {
    id: input.evidence.id,
    created: input.evidence.created,
  });
  if (!sub) return null;
  return applySubscriptionSnapshot(sub, { deleted: input.deleted });
}

/**
 * checkout.session.completed is a LINK event: it knows ids, not state. On an
 * existing row it fills linkage and keeps the status a real subscription event
 * already set (never active -> incomplete). Returns null when the session
 * carries no subscription.
 */
export async function applyCheckoutLink(
  session: Record<string, unknown> | null | undefined,
  input: { readonly testMode: boolean; readonly evidence: SnapshotEvidence },
): Promise<{ result: ApplyResult; providerSubscriptionId: string } | null> {
  const link = parseCheckoutSessionObject(session, input.testMode);
  if (!link) return null;
  const result = await upsertSubscription({
    providerSubscriptionId: link.providerSubscriptionId,
    providerCustomerId: link.providerCustomerId,
    ownerId: link.ownerId,
    planKey: link.planKey,
    organizationId: link.organizationId,
    status: "incomplete",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    testMode: link.testMode,
    transitionKind: "link",
    eventId: input.evidence.id,
    eventCreated: input.evidence.created,
  });
  return { result, providerSubscriptionId: link.providerSubscriptionId };
}
