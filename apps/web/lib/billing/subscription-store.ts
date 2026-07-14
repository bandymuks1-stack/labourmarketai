import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  SubscriptionUpsert,
  PaymentStatus,
  InvoiceRenewal,
} from "@/lib/billing/webhook-core";
import { resolvePlanV2Slug } from "@/lib/billing/plans";
import {
  LAUNCH_OFFER_PLAN_SLUG,
  buildLaunchOfferEligibilityRow,
} from "@/lib/billing/offers";
import { recordLaunchOfferEligibility } from "@/lib/billing/offer-store";

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

/** Idempotent record of a webhook event. Duplicate (same provider+event_id) → 'duplicate'. */
export async function recordWebhookEvent(input: {
  provider?: string;
  eventId: string;
  eventType: string;
  testMode: boolean;
  payload: Record<string, unknown>;
}): Promise<StoreResult> {
  const { error } = await admin()
    .from("payment_webhook_events")
    .insert({
      provider: input.provider ?? "stripe",
      event_id: input.eventId,
      event_type: input.eventType,
      test_mode: input.testMode,
      payload: input.payload,
    });
  if (!error) return "ok";
  if (error.code === UNIQUE_VIOLATION) return "duplicate";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  return "error";
}

export async function markWebhookProcessed(eventId: string, err?: string): Promise<void> {
  await admin()
    .from("payment_webhook_events")
    .update({ processed: true, processed_at: new Date().toISOString(), error: err ?? null })
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
  if (!error) {
    await maybeRecordLaunchOfferEligibility({
      ownerId,
      planKey,
      status: u.status,
      activationAtIso: u.currentPeriodStart,
      testMode: u.testMode,
    });
    return "ok";
  }
  if (error.code === RELATION_ABSENT) return "needs-migration";
  return "error";
}

/**
 * Launch Offer hook (Sprint v2 §9): when a subscription for the Launch Offer
 * plan becomes active/trialing inside the offer window, the system
 * automatically remembers the 15% first-annual discount eligibility
 * (billing_offer_eligibility). Best-effort and idempotent — a duplicate or a
 * not-yet-applied migration never affects the subscription write.
 */
async function maybeRecordLaunchOfferEligibility(input: {
  ownerId: string | null;
  planKey: string | null;
  status: SubscriptionUpsert["status"];
  activationAtIso: string | null;
  testMode: boolean;
}): Promise<void> {
  try {
    if (!input.ownerId || !input.planKey) return;
    if (input.status !== "active" && input.status !== "trialing") return;
    const v2 = resolvePlanV2Slug(input.planKey);
    if (v2 !== LAUNCH_OFFER_PLAN_SLUG) return;
    const row = buildLaunchOfferEligibilityRow({
      profileId: input.ownerId,
      planV2Slug: v2,
      activationAtIso: input.activationAtIso ?? new Date().toISOString(),
      testMode: input.testMode,
    });
    if (!row) return; // outside the offer window — nothing earned
    await recordLaunchOfferEligibility(row);
  } catch {
    // best-effort: eligibility bookkeeping never breaks the webhook chain
  }
}

/**
 * Update the last payment status for a subscription (invoice events). A PAID
 * invoice may carry the renewal period (Sprint v2 renewal bookkeeping) — the
 * covered period is then recorded so current_period_end extends on renewal.
 */
export async function applyInvoicePayment(
  providerSubscriptionId: string | null,
  status: PaymentStatus,
  renewal?: Pick<InvoiceRenewal, "periodStart" | "periodEnd">,
): Promise<StoreResult> {
  if (!providerSubscriptionId) return "ok";
  const patch: Record<string, unknown> = {
    last_payment_status: status,
    updated_at: new Date().toISOString(),
  };
  // A failed payment moves an active subscription to past_due (honest signal).
  if (status === "failed") patch.status = "past_due";
  // Renewal bookkeeping: only a SUCCEEDED payment extends the recorded period.
  if (status === "succeeded" && renewal) {
    if (renewal.periodStart) patch.current_period_start = renewal.periodStart;
    if (renewal.periodEnd) patch.current_period_end = renewal.periodEnd;
  }
  const { error } = await admin()
    .from("billing_subscriptions")
    .update(patch)
    .eq("provider", "stripe")
    .eq("provider_subscription_id", providerSubscriptionId);
  if (!error) return "ok";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  return "error";
}
