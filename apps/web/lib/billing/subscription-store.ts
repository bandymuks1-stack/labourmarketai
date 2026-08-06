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
const UNDEFINED_COLUMN = "42703";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  return createAdminClient();
}

export type StoreResult =
  | "ok"
  | "duplicate"
  | "needs-migration"
  | "error"
  /** Refused: the caller's (owner, plan) row tracks a DIFFERENT live provider
   *  subscription. Overwriting it would orphan a paid subscription (it keeps
   *  billing in Stripe with no row here). The event stays unprocessed and the
   *  reason lands in the webhook event's error column — an operator decision,
   *  not a silent replace. */
  | "conflict-live-subscription";

/** Subscription states that no longer bill and may be superseded in place. */
const DEAD_STATUSES = new Set(["cancelled", "expired"]);

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

  const row: Record<string, unknown> = {
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
  // M-P0-7 subject binding: a signature-verified organization binding is
  // NEVER discarded. The column key is included ONLY when a binding exists,
  // so personal rows keep the legacy shape; if the multi-subject schema is
  // unapplied (42703) the org-bound event stays unprocessed (needs-migration)
  // instead of being persisted subject-less.
  if (u.organizationId) row.organization_id = u.organizationId;
  const { error } = await sb
    .from("billing_subscriptions")
    .upsert(row, { onConflict: "provider,provider_subscription_id" });
  if (!error) return "ok";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  if (error.code === UNDEFINED_COLUMN) return "needs-migration";
  if (error.code === UNIQUE_VIOLATION) {
    // The upsert's conflict target is (provider, provider_subscription_id),
    // so a 23505 here comes from the OTHER unique key:
    // (owner_id, plan_key, provider). A different subscription row already
    // exists for this owner+plan. Two very different worlds produce that:
    //
    //   REPLACEABLE — re-subscribe after cancel/expiry, or a `manual_<uuid>`
    //   pilot-override row. The old row no longer bills; the provider event
    //   is authoritative and the row is superseded in place.
    //
    //   NOT replaceable — the row tracks a LIVE provider subscription with a
    //   different id. One person can legitimately buy the same plan for two
    //   organizations; `unique (owner_id, plan_key, provider)` cannot store
    //   both, and replacing the first row would leave a subscription billing
    //   in Stripe with no local record or entitlement. That is silent data
    //   loss on a paid row — refuse instead, keep the event unprocessed, and
    //   surface `conflict-live-subscription` for an operator decision.
    if (!ownerId || !planKey) return "error";
    // Conflict lookup is scoped to the BILLING SUBJECT (M-P0-7): an org-bound
    // event collides only within its organization's scope; a personal event
    // only within the personal (origin-null) scope. Falls back to the legacy
    // unscoped lookup while the multi-subject schema is unapplied (42703).
    let heldQuery = sb
      .from("billing_subscriptions")
      .select("provider_subscription_id, status")
      .eq("provider", "stripe")
      .eq("owner_id", ownerId)
      .eq("plan_key", planKey);
    heldQuery = u.organizationId
      ? heldQuery.eq("organization_id", u.organizationId)
      : heldQuery.is("origin_organization_id", null);
    let { data: held, error: heldErr } = await heldQuery.maybeSingle();
    if (heldErr?.code === UNDEFINED_COLUMN) {
      ({ data: held, error: heldErr } = await sb
        .from("billing_subscriptions")
        .select("provider_subscription_id, status")
        .eq("provider", "stripe")
        .eq("owner_id", ownerId)
        .eq("plan_key", planKey)
        .maybeSingle());
    }
    if (heldErr || !held) return "error";
    const heldSubId =
      typeof held.provider_subscription_id === "string"
        ? held.provider_subscription_id
        : null;
    const replaceable =
      heldSubId === null ||
      heldSubId === u.providerSubscriptionId ||
      heldSubId.startsWith("manual_") ||
      DEAD_STATUSES.has(String(held.status));
    if (!replaceable) return "conflict-live-subscription";
    // Supersede-in-place, scoped to the SAME billing subject (never a row of
    // another organization or of the personal scope). Same 42703 fallback.
    let updQuery = sb
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
    updQuery = u.organizationId
      ? updQuery.eq("organization_id", u.organizationId)
      : updQuery.is("origin_organization_id", null);
    let { error: updErr } = await updQuery;
    if (updErr?.code === UNDEFINED_COLUMN) {
      ({ error: updErr } = await sb
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
        .eq("plan_key", planKey));
    }
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
