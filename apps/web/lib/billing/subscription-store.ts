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
const COLUMN_ABSENT = "42703";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  return createAdminClient();
}

export type StoreResult = "ok" | "duplicate" | "needs-migration" | "error";

/**
 * True only when the DRAFT migration 20260721150000 (billing_subscriptions
 * .organization_id + origin snapshot + org-scoped unique indexes) is applied.
 * Org-scoped (company/agency) checkout FAILS CLOSED until this is true, so we
 * never mint a real Stripe subscription we cannot store with its verified
 * organization linkage. A missing column (42703) or table (42P01) → not ready.
 */
export async function isOrganizationLinkageReady(): Promise<boolean> {
  const { error } = await admin()
    .from("billing_subscriptions")
    .select("organization_id")
    .limit(1);
  if (!error) return true;
  if (error.code === COLUMN_ABSENT || error.code === RELATION_ABSENT) return false;
  // Any other read error is treated as not-ready — fail closed, never open.
  return false;
}

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
  // Org linkage (company/agency plans) rides along when known. The column
  // ships in DRAFT migration 20260721150000; until the owner applies it, an
  // org-scoped subscription must FAIL CLOSED (see COLUMN_ABSENT below) rather
  // than be persisted with its verified organization binding discarded.
  if (u.organizationId) row.organization_id = u.organizationId;

  const { error } = await sb
    .from("billing_subscriptions")
    .upsert(row, { onConflict: "provider,provider_subscription_id" });
  if (!error) return "ok";
  if (error.code === COLUMN_ABSENT && "organization_id" in row) {
    // The organization_id column is not migrated yet. Do NOT retry without it:
    // stripping the linkage would store an org subscription under the personal
    // uniqueness model and, for a second org on the same plan, collide on the
    // old constraint and leave a real Stripe subscription untracked. Fail
    // closed — org-scoped checkout is already blocked at the route until the
    // column exists, so this is defense in depth (Codex round 2 P1).
    return "needs-migration";
  }
  if (error.code === RELATION_ABSENT) return "needs-migration";
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
