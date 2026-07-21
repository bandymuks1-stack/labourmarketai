import { NextResponse } from "next/server";

import { getBillingProvider } from "@/lib/billing/provider";
import {
  isHandledEventType,
  isInvoiceSuccessEvent,
  parseSubscriptionObject,
  parseCheckoutSessionObject,
  parseInvoiceObject,
  assertTestEvent,
} from "@/lib/billing/webhook-core";
import {
  recordWebhookEvent,
  markWebhookProcessed,
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

  if (!isHandledEventType(event.type)) {
    await markWebhookProcessed(event.id);
    return NextResponse.json({ ok: true, received: true, ignored: true });
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
    } else if (isInvoiceSuccessEvent(event.type) || event.type === "invoice.payment_failed") {
      const inv = parseInvoiceObject(event.object, isInvoiceSuccessEvent(event.type));
      result = await applyInvoicePayment(inv.providerSubscriptionId, inv.lastPaymentStatus);
    }
    await markWebhookProcessed(event.id, result === "ok" ? undefined : result);
  } catch (e) {
    await markWebhookProcessed(event.id, e instanceof Error ? e.message : "process_error");
    return NextResponse.json({ ok: true, received: true, processed: false }, { status: 200 });
  }

  return NextResponse.json({ ok: true, received: true, processed: result === "ok", result });
}
