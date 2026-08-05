import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionUpsert, PaymentStatus } from "@/lib/billing/webhook-core";

/**
 * Subscription store (Stripe sprint PR4) — the SERVER-only write path for the
 * webhook, using the service-role client. Degrades honestly to "needs-migration"
 * until the PR2 billing tables are applied (42P01). Never throws into the
 * webhook route; returns a status so the route can record + respond cleanly.
 */

const RELATION_ABSENT = "42P01";
const UNIQUE_VIOLATION = "23505";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  return createAdminClient();
}

export type StoreResult = "ok" | "duplicate" | "needs-migration" | "error";

/**
 * Result of recording an incoming event. A duplicate is split by whether the
 * FIRST delivery finished processing: a `duplicate-processed` replay is safely
 * acknowledged without reprocessing, while a `duplicate-unprocessed` retry
 * (Stripe redelivering after our non-2xx) MUST be reprocessed — otherwise a
 * transient processing failure would poison the event id forever.
 */
export type RecordEventResult =
  | "ok"
  | "duplicate-processed"
  | "duplicate-unprocessed"
  | "needs-migration"
  | "error";

/** Idempotent record of a webhook event (unique provider+event_id). */
export async function recordWebhookEvent(input: {
  provider?: string;
  eventId: string;
  eventType: string;
  testMode: boolean;
  payload: Record<string, unknown>;
}): Promise<RecordEventResult> {
  const provider = input.provider ?? "stripe";
  const { error } = await admin()
    .from("payment_webhook_events")
    .insert({
      provider,
      event_id: input.eventId,
      event_type: input.eventType,
      test_mode: input.testMode,
      payload: input.payload,
    });
  if (!error) return "ok";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  if (error.code !== UNIQUE_VIOLATION) return "error";

  // Duplicate: only short-circuit if the first delivery actually finished.
  const { data: existing, error: selErr } = await admin()
    .from("payment_webhook_events")
    .select("processed")
    .eq("provider", provider)
    .eq("event_id", input.eventId)
    .maybeSingle();
  if (selErr || !existing) return "error";
  return existing.processed === true ? "duplicate-processed" : "duplicate-unprocessed";
}

/** Mark an event fully processed (call ONLY after successful processing). */
export async function markWebhookProcessed(eventId: string): Promise<void> {
  await admin()
    .from("payment_webhook_events")
    .update({ processed: true, processed_at: new Date().toISOString(), error: null })
    .eq("event_id", eventId);
}

/**
 * Record a processing failure WITHOUT closing the idempotency record:
 * `processed` stays false so a Stripe retry of this event id is reprocessed
 * (`duplicate-unprocessed`) instead of being skipped forever.
 */
export async function markWebhookFailed(eventId: string, err: string): Promise<void> {
  await admin()
    .from("payment_webhook_events")
    .update({ processed: false, error: err })
    .eq("event_id", eventId);
}

/** Read-then-merge upsert of a subscription (keeps owner/plan if a later event omits them). */
export async function upsertSubscription(u: SubscriptionUpsert): Promise<StoreResult> {
  const sb = admin();
  const { data: existing, error: selErr } = await sb
    .from("billing_subscriptions")
    .select("id, owner_id, plan_key, provider_customer_id")
    .eq("provider", "stripe")
    .eq("provider_subscription_id", u.providerSubscriptionId)
    .maybeSingle();
  if (selErr && selErr.code === RELATION_ABSENT) return "needs-migration";

  const ownerId = u.ownerId ?? existing?.owner_id ?? null;
  const planKey = u.planKey ?? existing?.plan_key ?? null;
  const customerId = u.providerCustomerId ?? existing?.provider_customer_id ?? null;
  if (!ownerId || !planKey) {
    // Can't create a subscription row without an owner+plan link (set at
    // checkout). A bare subscription event before checkout is ignored safely.
    if (!existing) return "ok";
  }

  const row = {
    owner_id: ownerId,
    plan_key: planKey,
    provider: "stripe",
    provider_customer_id: customerId,
    provider_subscription_id: u.providerSubscriptionId,
    status: u.status,
    current_period_start: u.currentPeriodStart,
    current_period_end: u.currentPeriodEnd,
    cancel_at_period_end: u.cancelAtPeriodEnd,
    test_mode: u.testMode,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb
    .from("billing_subscriptions")
    .upsert(row, { onConflict: "provider,provider_subscription_id" });
  if (!error) return "ok";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  if (error.code === UNIQUE_VIOLATION) {
    // The upsert's conflict target is (provider, provider_subscription_id),
    // so a 23505 here comes from the OTHER unique key:
    // (owner_id, plan_key, provider). A different subscription row already
    // exists for this owner+plan — re-subscribe after cancel, or a manual
    // `manual_<uuid>` pilot-override row. The provider event is authoritative:
    // the existing row for that owner+plan becomes the new subscription
    // (provider_subscription_id, status, periods, customer id replaced).
    // Without this, the paid subscription write fails and the user gets
    // nothing for their money.
    if (!ownerId || !planKey) return "error";
    const { error: updErr } = await sb
      .from("billing_subscriptions")
      .update({
        provider_customer_id: customerId,
        provider_subscription_id: u.providerSubscriptionId,
        status: u.status,
        current_period_start: u.currentPeriodStart,
        current_period_end: u.currentPeriodEnd,
        cancel_at_period_end: u.cancelAtPeriodEnd,
        test_mode: u.testMode,
        updated_at: new Date().toISOString(),
      })
      .eq("provider", "stripe")
      .eq("owner_id", ownerId)
      .eq("plan_key", planKey);
    if (!updErr) return "ok";
    if (updErr.code === RELATION_ABSENT) return "needs-migration";
    return "error";
  }
  return "error";
}

/** Update the last payment status for a subscription (invoice events). */
export async function applyInvoicePayment(
  providerSubscriptionId: string | null,
  status: PaymentStatus,
): Promise<StoreResult> {
  if (!providerSubscriptionId) return "ok";
  const patch: Record<string, unknown> = {
    last_payment_status: status,
    updated_at: new Date().toISOString(),
  };
  // A failed payment moves an active subscription to past_due (honest signal).
  if (status === "failed") patch.status = "past_due";
  const { error } = await admin()
    .from("billing_subscriptions")
    .update(patch)
    .eq("provider", "stripe")
    .eq("provider_subscription_id", providerSubscriptionId);
  if (!error) return "ok";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  return "error";
}
