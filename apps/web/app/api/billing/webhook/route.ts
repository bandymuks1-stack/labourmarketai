import { NextResponse } from "next/server";

import { getBillingProvider } from "@/lib/billing/provider";
import { getBillingConfig } from "@/lib/billing/config";
import {
  isHandledEventType,
  isRecordOnlyEventType,
  parseSubscriptionObject,
  parseCheckoutSessionObject,
  parseInvoiceObject,
  summarizeRecordedEvent,
  assertTestEvent,
  eventModeMatches,
} from "@/lib/billing/webhook-core";
import {
  recordWebhookEvent,
  markWebhookProcessed,
  markWebhookFailed,
  upsertSubscription,
  applyInvoicePayment,
} from "@/lib/billing/subscription-store";

/**
 * Stripe TEST webhook (Stripe sprint PR4). Verifies the signature (via the
 * provider + the configured TEST webhook secret), REJECTS live events, is
 * idempotent by event id, and updates subscription state — all server-side with
 * the service-role store. Business logic NEVER runs without a verified
 * signature. Degrades honestly to "needs-migration" until the PR2 tables exist.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature") ?? "";
  const body = await req.text(); // RAW body — required for signature verification

  const provider = await getBillingProvider();

  let event;
  try {
    event = await provider.constructWebhookEvent(body, signature);
  } catch {
    // Invalid/forged signature, or billing disabled → never process.
    return NextResponse.json({ ok: false, reason: "invalid_signature" }, { status: 400 });
  }

  // The event's mode must match the adapter state: under `stripe_test` a
  // live event is rejected outright (assertTestEvent — the historical rule);
  // under `stripe_live` (D3, owner-armed) a TEST event is rejected, so a
  // test-mode replay can never touch a live entitlement.
  const billing = getBillingConfig();
  if (!eventModeMatches(billing.state, event)) {
    const reason =
      billing.state === "stripe_live" && assertTestEvent(event)
        ? "test_event_rejected"
        : "live_event_rejected";
    return NextResponse.json({ ok: false, reason }, { status: 400 });
  }

  // Idempotency: record first. Only a duplicate whose FIRST delivery finished
  // processing is short-circuited; an unprocessed duplicate is a Stripe retry
  // after our earlier non-2xx and MUST be reprocessed.
  // Record-only events (charge.refunded / charge.dispute.*) persist a parsed
  // summary with the record — that summary IS their processing outcome, so the
  // operator can read what was refunded/disputed without replaying Stripe.
  const summary = summarizeRecordedEvent(event.type, event.object);
  const recorded = await recordWebhookEvent({
    eventId: event.id,
    eventType: event.type,
    testMode: event.testMode,
    payload: summary
      ? { id: event.id, type: event.type, summary }
      : { id: event.id, type: event.type },
  });
  if (recorded === "duplicate-processed") {
    return NextResponse.json({ ok: true, received: true, duplicate: true });
  }
  if (recorded === "needs-migration") {
    return NextResponse.json({ ok: true, received: true, processed: false, reason: "needs-migration" });
  }
  if (recorded === "error") {
    // No idempotency record could be written or read — processing without one
    // would break replay safety. Non-2xx so Stripe retries the delivery.
    return NextResponse.json(
      { ok: false, received: true, processed: false, reason: "record_failed" },
      { status: 500 },
    );
  }
  // recorded === "ok" | "duplicate-unprocessed" → process (or reprocess).

  if (!isHandledEventType(event.type)) {
    await markWebhookProcessed(event.id);
    return NextResponse.json({ ok: true, received: true, ignored: true });
  }

  // Refund/dispute ingestion is RECORD-ONLY (commercial safe-prep v1): the
  // event + parsed summary are persisted above, and NO subscription state
  // transition happens here — a full refund of the latest invoice does NOT
  // auto-cancel (Stripe keeps the subscription billing unless it is cancelled
  // separately), and a dispute's effect depends on its outcome. Any warranted
  // state change arrives via the customer.subscription.* / invoice.* events
  // this route already applies conservatively. See webhook-core RECORD_ONLY.
  if (isRecordOnlyEventType(event.type)) {
    await markWebhookProcessed(event.id);
    return NextResponse.json({ ok: true, received: true, processed: true, recordOnly: true });
  }

  let result: string = "ok";
  try {
    if (event.type === "checkout.session.completed") {
      const link = parseCheckoutSessionObject(event.object, event.testMode);
      if (link) {
        result = await upsertSubscription({
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
        });
      }
    } else if (event.type.startsWith("customer.subscription.")) {
      const sub = parseSubscriptionObject(event.object, event.testMode);
      if (sub) {
        if (event.type === "customer.subscription.deleted") {
          result = await upsertSubscription({ ...sub, status: "cancelled" });
        } else {
          result = await upsertSubscription(sub);
        }
      }
    } else if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_succeeded" ||
      event.type === "invoice.payment_failed"
    ) {
      // invoice.paid ≡ invoice.payment_succeeded here; both may arrive for the
      // same invoice (distinct event ids) — applying "succeeded" twice is a
      // no-op on the subscription row.
      const inv = parseInvoiceObject(event.object, event.type !== "invoice.payment_failed");
      result = await applyInvoicePayment(inv.providerSubscriptionId, inv.lastPaymentStatus);
    }
  } catch (e) {
    // Keep the idempotency record OPEN (processed=false) and answer non-2xx so
    // Stripe retries; the retry reprocesses via "duplicate-unprocessed".
    await markWebhookFailed(event.id, e instanceof Error ? e.message : "process_error");
    return NextResponse.json(
      { ok: false, received: true, processed: false, reason: "process_error" },
      { status: 500 },
    );
  }

  if (result === "ok") {
    await markWebhookProcessed(event.id);
    return NextResponse.json({ ok: true, received: true, processed: true, result });
  }
  if (result === "needs-migration") {
    // Honest degraded ack (tables not applied yet): a retry cannot succeed
    // until the migration lands, so acknowledge with 200; the record stays
    // processed=false, so a post-migration redelivery IS reprocessed.
    await markWebhookFailed(event.id, "needs-migration");
    return NextResponse.json({ ok: true, received: true, processed: false, reason: "needs-migration" });
  }
  // Store-level failure ("error" | "conflict-live-subscription"): retryable —
  // same contract as a throw. The conflict case needs an operator decision
  // (two live subscriptions collide on one owner+plan row); a retry after
  // remediation succeeds, and until then the reason stays on the event row.
  await markWebhookFailed(event.id, result);
  return NextResponse.json(
    { ok: false, received: true, processed: false, reason: result },
    { status: 500 },
  );
}
