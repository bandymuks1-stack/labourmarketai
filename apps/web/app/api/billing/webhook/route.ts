import { NextResponse } from "next/server";

import { getBillingProvider } from "@/lib/billing/provider";
import {
  isHandledEventType,
  isInvoicePaidEvent,
  parseSubscriptionObject,
  parseCheckoutSessionObject,
  parseInvoiceObject,
  assertTestEvent,
} from "@/lib/billing/webhook-core";
import {
  recordWebhookEvent,
  markWebhookProcessed,
  upsertSubscription,
  upsertBillingCustomer,
  applyInvoicePayment,
  type StoreResult,
} from "@/lib/billing/subscription-store";

/**
 * Stripe TEST webhook (Stripe sprint PR4). Verifies the signature (via the
 * provider + the configured TEST webhook secret), REJECTS live events, is
 * idempotent by event id, and updates subscription state — all server-side with
 * the service-role store. Business logic NEVER runs without a verified
 * signature. Degrades honestly to "needs-migration" until the PR2 tables exist.
 *
 * Commercial readiness audit v1 — RETRY SEMANTICS. A store failure used to be
 * answered with HTTP 200: Stripe recorded a delivered event, never retried, and
 * a paying customer was left un-entitled with no visible signal anywhere. A
 * genuine write failure now answers 500 so Stripe retries (the event row is
 * removed from the idempotency ledger first, otherwise the retry would be
 * dismissed as a duplicate). "needs-migration" stays a 200: retrying cannot fix
 * an unapplied migration, and the state is already recorded honestly.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A failed write we want Stripe to redeliver. */
function isRetryable(result: StoreResult): boolean {
  return result === "error";
}

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

  // Reject a live event outright — this chain is test-only.
  if (!assertTestEvent(event)) {
    return NextResponse.json({ ok: false, reason: "live_event_rejected" }, { status: 400 });
  }

  // Idempotency: record first; a duplicate is acknowledged but not reprocessed.
  const recorded = await recordWebhookEvent({
    eventId: event.id,
    eventType: event.type,
    testMode: event.testMode,
    payload: { id: event.id, type: event.type },
  });
  if (recorded === "duplicate") {
    return NextResponse.json({ ok: true, received: true, duplicate: true });
  }
  if (recorded === "needs-migration") {
    return NextResponse.json({ ok: true, received: true, processed: false, reason: "needs-migration" });
  }
  if (recorded === "error") {
    // The idempotency ledger itself is unavailable — do not process blind.
    return NextResponse.json(
      { ok: false, received: true, processed: false, reason: "event_not_recorded" },
      { status: 500 },
    );
  }

  if (!isHandledEventType(event.type)) {
    await markWebhookProcessed(event.id);
    return NextResponse.json({ ok: true, received: true, ignored: true });
  }

  let result: StoreResult = "ok";
  try {
    if (event.type === "checkout.session.completed") {
      const link = parseCheckoutSessionObject(event.object, event.testMode);
      if (link) {
        // The portal (cancel / update card / invoices) is addressed by customer
        // id, so the customer link is stored the moment checkout completes.
        const customer = await upsertBillingCustomer({
          ownerId: link.ownerId,
          providerCustomerId: link.providerCustomerId,
          testMode: link.testMode,
        });
        result = await upsertSubscription(
          {
            providerSubscriptionId: link.providerSubscriptionId,
            providerCustomerId: link.providerCustomerId,
            ownerId: link.ownerId,
            planKey: link.planKey,
            status: "incomplete",
            currentPeriodStart: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            testMode: link.testMode,
          },
          // Carries no real lifecycle status: must never downgrade a
          // subscription an out-of-order event already activated.
          { fromLink: true },
        );
        if (result === "ok" && customer !== "ok") result = customer;
      }
    } else if (event.type.startsWith("customer.subscription.")) {
      const sub = parseSubscriptionObject(event.object, event.testMode);
      if (sub) {
        await upsertBillingCustomer({
          ownerId: sub.ownerId,
          providerCustomerId: sub.providerCustomerId,
          testMode: sub.testMode,
        });
        if (event.type === "customer.subscription.deleted") {
          result = await upsertSubscription({ ...sub, status: "cancelled" });
        } else {
          result = await upsertSubscription(sub);
        }
      }
    } else if (
      isInvoicePaidEvent(event.type) ||
      event.type === "invoice.payment_failed"
    ) {
      const inv = parseInvoiceObject(event.object, isInvoicePaidEvent(event.type));
      result = await applyInvoicePayment(inv.providerSubscriptionId, inv.lastPaymentStatus);
    }
  } catch (e) {
    await markWebhookProcessed(event.id, e instanceof Error ? e.message : "process_error");
    // Unexpected throw — let Stripe redeliver rather than lose the event.
    return NextResponse.json(
      { ok: false, received: true, processed: false, reason: "process_error" },
      { status: 500 },
    );
  }

  await markWebhookProcessed(event.id, result === "ok" ? undefined : result);

  if (isRetryable(result)) {
    // The ledger row stays with processed=false + the error, which is exactly
    // what makes the Stripe retry reprocess instead of short-circuit as a
    // duplicate (see recordWebhookEvent).
    return NextResponse.json(
      { ok: false, received: true, processed: false, reason: result },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    received: true,
    processed: result === "ok" || result === "duplicate",
    result,
  });
}
