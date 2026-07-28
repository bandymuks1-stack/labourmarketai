import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  shouldApplyStatus,
  isTerminalStatus,
  type SubscriptionUpsert,
  type PaymentStatus,
  type SubStatus,
} from "@/lib/billing/webhook-core";

/**
 * Subscription store (Stripe sprint PR4) — the SERVER-only write path for the
 * webhook, using the service-role client. Degrades honestly to "needs-migration"
 * until the PR2 billing tables are applied (42P01). Never throws into the
 * webhook route; returns a status so the route can record + respond cleanly.
 *
 * Commercial readiness audit v1 — three write-path defects closed here:
 *   1. RE-SUBSCRIPTION. `billing_subscriptions` carries UNIQUE
 *      (owner_id, plan_key, provider). A user who cancels and re-subscribes
 *      gets a NEW provider_subscription_id for the SAME owner+plan, so a write
 *      keyed only on the subscription id violated that unique index (23505) and
 *      the row was never written — the customer paid and got no entitlement.
 *      The existing owner+plan row is now REBOUND to the new subscription id.
 *   2. OUT-OF-ORDER EVENTS. checkout.session.completed carries no status and
 *      was written as `incomplete`; arriving after subscription.updated it
 *      downgraded an active subscriber. Status precedence now guards that.
 *   3. SILENT FAILURE. A write error is reported to the route so it can answer
 *      non-2xx and let Stripe retry, instead of acknowledging a lost payment.
 */

const RELATION_ABSENT = "42P01";
const UNIQUE_VIOLATION = "23505";
/** PostgREST: "no rows" from a maybeSingle-style read — not an error for us. */
const NO_ROWS = "PGRST116";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  return createAdminClient();
}

export type StoreResult = "ok" | "duplicate" | "needs-migration" | "error";

/**
 * Idempotent record of a webhook event.
 *
 * A second delivery of an event that was already processed SUCCESSFULLY is a
 * `duplicate` and must not be reprocessed. A second delivery of an event whose
 * processing FAILED (`processed = false`, or an error recorded) is a Stripe
 * retry of work that never landed, and returns `ok` so the route reprocesses
 * it. Every downstream write is read-then-merge, so reprocessing is safe.
 *
 * This is why the retry path does not delete the ledger row: the migration
 * grants service_role only SELECT/INSERT/UPDATE on payment_webhook_events.
 */
export async function recordWebhookEvent(input: {
  provider?: string;
  eventId: string;
  eventType: string;
  testMode: boolean;
  payload: Record<string, unknown>;
}): Promise<StoreResult> {
  const provider = input.provider ?? "stripe";
  const sb = admin();
  const { error } = await sb.from("payment_webhook_events").insert({
    provider,
    event_id: input.eventId,
    event_type: input.eventType,
    test_mode: input.testMode,
    payload: input.payload,
  });
  if (!error) return "ok";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  if (error.code !== UNIQUE_VIOLATION) return "error";

  const { data: prior, error: selErr } = await sb
    .from("payment_webhook_events")
    .select("processed, error")
    .eq("provider", provider)
    .eq("event_id", input.eventId)
    .maybeSingle();
  // Cannot tell whether the earlier attempt succeeded — treat as a duplicate
  // (never process an event twice on a guess).
  if (selErr || !prior) return "duplicate";
  const settled = prior.processed === true && !prior.error;
  if (settled) return "duplicate";

  await sb
    .from("payment_webhook_events")
    .update({ processed: false, error: null })
    .eq("provider", provider)
    .eq("event_id", input.eventId);
  return "ok";
}

export async function markWebhookProcessed(eventId: string, err?: string): Promise<void> {
  await admin()
    .from("payment_webhook_events")
    .update({ processed: true, processed_at: new Date().toISOString(), error: err ?? null })
    .eq("event_id", eventId);
}

/**
 * Link our profile to the provider customer (billing_customers). Required by
 * the billing portal (cancel / update card / invoices), which is addressed by
 * customer id, not subscription id. Idempotent on (owner_id, provider).
 */
export async function upsertBillingCustomer(input: {
  ownerId: string | null;
  providerCustomerId: string | null;
  testMode: boolean;
}): Promise<StoreResult> {
  if (!input.ownerId || !input.providerCustomerId) return "ok";
  const { error } = await admin()
    .from("billing_customers")
    .upsert(
      {
        owner_id: input.ownerId,
        provider: "stripe",
        provider_customer_id: input.providerCustomerId,
        test_mode: input.testMode,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,provider" },
    );
  if (!error) return "ok";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  return "error";
}

/** The provider customer id for a profile (portal sessions). */
export async function getBillingCustomerId(ownerId: string): Promise<string | null> {
  const { data, error } = await admin()
    .from("billing_customers")
    .select("provider_customer_id")
    .eq("owner_id", ownerId)
    .eq("provider", "stripe")
    .maybeSingle();
  if (error || !data) return null;
  return (data.provider_customer_id as string | null) ?? null;
}

interface ExistingRow {
  id: string;
  owner_id: string | null;
  plan_key: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  status: SubStatus | null;
}

const SUB_COLUMNS =
  "id, owner_id, plan_key, provider_customer_id, provider_subscription_id, status";

/**
 * Read-then-merge write of a subscription (keeps owner/plan when a later event
 * omits them, never regresses a lifecycle status, and rebinds the owner+plan
 * row when a re-subscription brings a new provider subscription id).
 */
export async function upsertSubscription(
  u: SubscriptionUpsert,
  opts?: { fromLink?: boolean },
): Promise<StoreResult> {
  const sb = admin();

  const { data: bySubId, error: selErr } = await sb
    .from("billing_subscriptions")
    .select(SUB_COLUMNS)
    .eq("provider", "stripe")
    .eq("provider_subscription_id", u.providerSubscriptionId)
    .maybeSingle();
  if (selErr && selErr.code === RELATION_ABSENT) return "needs-migration";
  if (selErr && selErr.code !== NO_ROWS) return "error";

  let existing = (bySubId as ExistingRow | null) ?? null;
  let rebound = false;

  const ownerId = u.ownerId ?? existing?.owner_id ?? null;
  const planKey = u.planKey ?? existing?.plan_key ?? null;

  // Re-subscription: same owner+plan, different provider subscription id.
  if (!existing && ownerId && planKey) {
    const { data: byOwnerPlan, error: ownerErr } = await sb
      .from("billing_subscriptions")
      .select(SUB_COLUMNS)
      .eq("provider", "stripe")
      .eq("owner_id", ownerId)
      .eq("plan_key", planKey)
      .maybeSingle();
    if (ownerErr && ownerErr.code === RELATION_ABSENT) return "needs-migration";
    if (byOwnerPlan) {
      existing = byOwnerPlan as ExistingRow;
      rebound = existing.provider_subscription_id !== u.providerSubscriptionId;
    }
  }

  if (!ownerId || !planKey) {
    // Can't create a subscription row without an owner+plan link (set at
    // checkout via subscription_data.metadata). A bare subscription event
    // before checkout is ignored safely.
    if (!existing) return "ok";
  }

  const customerId = u.providerCustomerId ?? existing?.provider_customer_id ?? null;

  // A rebound row carries a NEW subscription: the previous terminal status must
  // not block it. Otherwise apply normal precedence.
  const storedStatus = rebound ? null : (existing?.status ?? null);
  const applyStatus = shouldApplyStatus(u.status, storedStatus, opts);

  const patch: Record<string, unknown> = {
    owner_id: ownerId,
    plan_key: planKey,
    provider: "stripe",
    provider_customer_id: customerId,
    provider_subscription_id: u.providerSubscriptionId,
    cancel_at_period_end: u.cancelAtPeriodEnd,
    test_mode: u.testMode,
    updated_at: new Date().toISOString(),
  };
  if (applyStatus) patch.status = u.status;
  // Never blank a known period with a link event that carries none.
  if (u.currentPeriodStart) patch.current_period_start = u.currentPeriodStart;
  if (u.currentPeriodEnd) patch.current_period_end = u.currentPeriodEnd;
  if (rebound) {
    // A fresh subscription starts with a clean payment history.
    patch.last_payment_status = null;
    if (!u.currentPeriodStart) patch.current_period_start = null;
    if (!u.currentPeriodEnd) patch.current_period_end = null;
  }

  if (existing) {
    const { error } = await sb
      .from("billing_subscriptions")
      .update(patch)
      .eq("id", existing.id);
    if (!error) return "ok";
    if (error.code === RELATION_ABSENT) return "needs-migration";
    return "error";
  }

  const { error } = await sb.from("billing_subscriptions").insert(patch);
  if (!error) return "ok";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  // A concurrent webhook inserted the same row first — it wrote the same link
  // we were about to write, so this is not a lost payment.
  if (error.code === UNIQUE_VIOLATION) return "duplicate";
  return "error";
}

/**
 * Update the payment state for a subscription (invoice events).
 *
 * A failed payment moves an ENTITLING subscription to past_due; a succeeded
 * payment restores a past_due/unpaid/incomplete subscription to active (the
 * Stripe retry path — "the customer fixed their card"). A terminal row
 * (cancelled/expired) is never resurrected by a stray invoice event.
 */
export async function applyInvoicePayment(
  providerSubscriptionId: string | null,
  status: PaymentStatus,
): Promise<StoreResult> {
  if (!providerSubscriptionId) return "ok";
  const sb = admin();
  const { data: existing, error: selErr } = await sb
    .from("billing_subscriptions")
    .select("id, status")
    .eq("provider", "stripe")
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();
  if (selErr && selErr.code === RELATION_ABSENT) return "needs-migration";
  if (selErr && selErr.code !== NO_ROWS) return "error";
  // No row yet (invoice before the checkout link) — nothing to patch.
  if (!existing) return "ok";

  const stored = (existing.status as SubStatus | null) ?? null;
  const patch: Record<string, unknown> = {
    last_payment_status: status,
    updated_at: new Date().toISOString(),
  };
  if (stored && !isTerminalStatus(stored)) {
    if (status === "failed" && (stored === "active" || stored === "trialing")) {
      patch.status = "past_due";
    }
    if (
      status === "succeeded" &&
      (stored === "past_due" || stored === "unpaid" || stored === "incomplete")
    ) {
      patch.status = "active";
    }
  }

  const { error } = await sb
    .from("billing_subscriptions")
    .update(patch)
    .eq("id", existing.id);
  if (!error) return "ok";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  return "error";
}
