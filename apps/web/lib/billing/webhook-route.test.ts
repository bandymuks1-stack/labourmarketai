/**
 * Webhook route state machine — retryable failures, replay-safe duplicates.
 *
 * The retry/idempotency contract under test:
 *
 *   record="ok"                    → process
 *   record="duplicate-processed"   → 200 duplicate (skip — replay of a success)
 *   record="duplicate-unprocessed" → process again (Stripe retry after our 5xx)
 *   record="needs-migration"       → 200 honest degraded ack
 *   record="error"                 → 500 (no idempotency record — Stripe retries)
 *   process ok                     → markWebhookProcessed → 200
 *   process "needs-migration"      → markWebhookFailed(open) → 200 degraded ack
 *   process "error" / throw        → markWebhookFailed(open) → 500 → Stripe
 *                                    retries → duplicate-unprocessed → reprocess
 *
 * A processing failure must NEVER be answered 2xx with a closed idempotency
 * record: that combination made Stripe stop retrying while replays were
 * skipped as duplicates — the event was lost forever (the pre-fix defect).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/billing/provider", () => ({ getBillingProvider: vi.fn() }));
// D3: the route reads the adapter STATE to match the event's mode. Every test
// that predates D3 runs under `stripe_test` (the historical behaviour).
const billingCfg = vi.hoisted(() => ({ state: "stripe_test" as string, testMode: true }));
vi.mock("@/lib/billing/config", () => ({ getBillingConfig: () => billingCfg }));
vi.mock("@/lib/billing/subscription-store", () => ({
  recordWebhookEvent: vi.fn(),
  markWebhookProcessed: vi.fn(),
  markWebhookFailed: vi.fn(),
  upsertSubscription: vi.fn(),
  applyInvoicePayment: vi.fn(),
}));
// Billing safety v1: the route also books the server-side checkout operation
// (checkout.session.completed / expired). Mocked so no service-role client is
// constructed here; the behaviour is pinned in webhook-route-safety.test.ts.
vi.mock("@/lib/billing/checkout-operations-store", () => ({
  completeCheckoutOperationBySession: vi.fn(async () => "ok"),
  expireCheckoutOperationBySession: vi.fn(async () => "ok"),
}));

import { getBillingProvider } from "@/lib/billing/provider";
import {
  recordWebhookEvent,
  markWebhookProcessed,
  markWebhookFailed,
  upsertSubscription,
  applyInvoicePayment,
} from "@/lib/billing/subscription-store";
import { POST } from "@/app/api/billing/webhook/route";

const record = vi.mocked(recordWebhookEvent);
const processed = vi.mocked(markWebhookProcessed);
const failed = vi.mocked(markWebhookFailed);
const upsert = vi.mocked(upsertSubscription);
const invoicePay = vi.mocked(applyInvoicePayment);

function withEvent(event: unknown): void {
  vi.mocked(getBillingProvider).mockResolvedValue({
    id: "stripe_test",
    active: true,
    createCheckoutSession: vi.fn(),
    constructWebhookEvent: vi.fn().mockResolvedValue(event),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function post(): Promise<Response> {
  return POST(
    new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "t=1,v1=deadbeef" },
    }),
  );
}

const SUB_EVENT = {
  id: "evt_1",
  type: "customer.subscription.updated",
  testMode: true,
  object: { id: "sub_1", status: "active", metadata: { plan_key: "p", client_reference_id: "o" } },
};

beforeEach(() => {
  vi.clearAllMocks();
  record.mockResolvedValue("ok");
  upsert.mockResolvedValue("ok");
  invoicePay.mockResolvedValue("ok");
  processed.mockResolvedValue();
  failed.mockResolvedValue();
});

describe("webhook route — signature & mode gates (unchanged)", () => {
  it("invalid signature → 400, nothing recorded", async () => {
    vi.mocked(getBillingProvider).mockResolvedValue({
      constructWebhookEvent: vi.fn().mockRejectedValue(new Error("bad sig")),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const res = await post();
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("invalid_signature");
    expect(record).not.toHaveBeenCalled();
  });

  it("live event → 400, nothing recorded, nothing written", async () => {
    withEvent({ ...SUB_EVENT, testMode: false });
    const res = await post();
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("live_event_rejected");
    expect(record).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("webhook route — idempotency record outcomes", () => {
  it("duplicate-processed → 200 duplicate, NOT reprocessed", async () => {
    withEvent(SUB_EVENT);
    record.mockResolvedValue("duplicate-processed");
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).duplicate).toBe(true);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("duplicate-unprocessed (retry after failure) IS reprocessed to success", async () => {
    withEvent(SUB_EVENT);
    record.mockResolvedValue("duplicate-unprocessed");
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).processed).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(processed).toHaveBeenCalledWith("evt_1");
  });

  it("record error → 500 so Stripe retries; event NOT processed without a record", async () => {
    withEvent(SUB_EVENT);
    record.mockResolvedValue("error");
    const res = await post();
    expect(res.status).toBe(500);
    expect((await res.json()).reason).toBe("record_failed");
    expect(upsert).not.toHaveBeenCalled();
    expect(processed).not.toHaveBeenCalled();
  });

  it("record needs-migration → 200 honest degraded ack", async () => {
    withEvent(SUB_EVENT);
    record.mockResolvedValue("needs-migration");
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).reason).toBe("needs-migration");
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("webhook route — processing outcomes", () => {
  it("success → markWebhookProcessed (record closed) → 200", async () => {
    withEvent(SUB_EVENT);
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).processed).toBe(true);
    expect(processed).toHaveBeenCalledWith("evt_1");
    expect(failed).not.toHaveBeenCalled();
  });

  it("store 'error' → 500 + record kept OPEN via markWebhookFailed (Stripe will retry)", async () => {
    withEvent(SUB_EVENT);
    upsert.mockResolvedValue("error");
    const res = await post();
    expect(res.status).toBe(500);
    expect(failed).toHaveBeenCalledWith("evt_1", "error");
    expect(processed).not.toHaveBeenCalled();
  });

  it("processing throw → 500 + record kept OPEN (retryable), never a silent 200", async () => {
    withEvent(SUB_EVENT);
    upsert.mockRejectedValue(new Error("db down"));
    const res = await post();
    expect(res.status).toBe(500);
    expect((await res.json()).reason).toBe("process_error");
    expect(failed).toHaveBeenCalledWith("evt_1", "db down");
    expect(processed).not.toHaveBeenCalled();
  });

  it("store 'needs-migration' → 200 degraded ack, record stays open for post-migration replay", async () => {
    withEvent(SUB_EVENT);
    upsert.mockResolvedValue("needs-migration");
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).reason).toBe("needs-migration");
    expect(failed).toHaveBeenCalledWith("evt_1", "needs-migration");
  });

  it("unhandled event type → acknowledged, recorded processed (ignored)", async () => {
    withEvent({ id: "evt_x", type: "payout.paid", testMode: true, object: {} });
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).ignored).toBe(true);
    expect(processed).toHaveBeenCalledWith("evt_x");
  });
});

describe("webhook route — refund/dispute ingestion (record-only)", () => {
  const REFUND_EVENT = {
    id: "evt_ref",
    type: "charge.refunded",
    testMode: true,
    object: {
      id: "ch_1",
      payment_intent: "pi_1",
      invoice: "in_1",
      amount_refunded: 2900,
      currency: "eur",
      refunded: true,
    },
  };

  it("charge.refunded is recorded WITH its parsed summary and marked processed", async () => {
    withEvent(REFUND_EVENT);
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).recordOnly).toBe(true);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt_ref",
        eventType: "charge.refunded",
        payload: expect.objectContaining({
          summary: expect.objectContaining({
            chargeId: "ch_1",
            amountRefundedCents: 2900,
            fullyRefunded: true,
          }),
        }),
      }),
    );
    expect(processed).toHaveBeenCalledWith("evt_ref");
  });

  it("a FULL refund never auto-cancels: no subscription/invoice state write", async () => {
    withEvent(REFUND_EVENT);
    await post();
    expect(upsert).not.toHaveBeenCalled();
    expect(invoicePay).not.toHaveBeenCalled();
  });

  it("charge.dispute.created/closed are recorded with the dispute summary, no state write", async () => {
    for (const [id, type, status] of [
      ["evt_dp1", "charge.dispute.created", "needs_response"],
      ["evt_dp2", "charge.dispute.closed", "won"],
    ] as const) {
      vi.clearAllMocks();
      record.mockResolvedValue("ok");
      processed.mockResolvedValue();
      withEvent({
        id,
        type,
        testMode: true,
        object: { id: "dp_1", charge: "ch_1", status, reason: "fraudulent", amount: 100, currency: "eur" },
      });
      const res = await post();
      expect(res.status).toBe(200);
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: type,
          payload: expect.objectContaining({
            summary: expect.objectContaining({ disputeId: "dp_1", status }),
          }),
        }),
      );
      expect(processed).toHaveBeenCalledWith(id);
      expect(upsert).not.toHaveBeenCalled();
      expect(invoicePay).not.toHaveBeenCalled();
    }
  });

  it("a duplicate-processed refund replay is skipped, not re-recorded as processed", async () => {
    withEvent(REFUND_EVENT);
    record.mockResolvedValue("duplicate-processed");
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).duplicate).toBe(true);
    expect(processed).not.toHaveBeenCalled();
  });
});

describe("webhook route — invoice.paid parity", () => {
  const invoice = (type: string) => ({
    id: `evt_${type}`,
    type,
    testMode: true,
    object: { parent: { subscription_details: { subscription: "sub_9" } } },
  });

  // Billing safety v1: the route now also passes the event {id, created} for
  // ordering — the payment-status mapping under test is unchanged.
  it("invoice.paid applies a SUCCEEDED payment (same as invoice.payment_succeeded)", async () => {
    withEvent(invoice("invoice.paid"));
    const res = await post();
    expect(res.status).toBe(200);
    expect(invoicePay).toHaveBeenCalledWith("sub_9", "succeeded", expect.objectContaining({ id: "evt_invoice.paid" }));
  });

  it("invoice.payment_succeeded still applies SUCCEEDED", async () => {
    withEvent(invoice("invoice.payment_succeeded"));
    await post();
    expect(invoicePay).toHaveBeenCalledWith("sub_9", "succeeded", expect.objectContaining({ id: "evt_invoice.payment_succeeded" }));
  });

  it("invoice.payment_failed applies FAILED", async () => {
    withEvent(invoice("invoice.payment_failed"));
    await post();
    expect(invoicePay).toHaveBeenCalledWith("sub_9", "failed", expect.objectContaining({ id: "evt_invoice.payment_failed" }));
  });

  it("checkout.session.completed links owner+plan as incomplete (unchanged)", async () => {
    withEvent({
      id: "evt_co",
      type: "checkout.session.completed",
      testMode: true,
      object: {
        subscription: "sub_co",
        customer: "cus_co",
        client_reference_id: "owner_co",
        metadata: { plan_key: "worker_plus" },
      },
    });
    await post();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        providerSubscriptionId: "sub_co",
        ownerId: "owner_co",
        planKey: "worker_plus",
        status: "incomplete",
      }),
    );
  });
});

describe("webhook route — D3 mode match under stripe_live", () => {
  beforeEach(() => {
    billingCfg.state = "stripe_live";
    billingCfg.testMode = false;
  });
  afterEach(() => {
    billingCfg.state = "stripe_test";
    billingCfg.testMode = true;
  });

  it("a TEST event under a LIVE adapter → 400 test_event_rejected, nothing recorded", async () => {
    withEvent({ ...SUB_EVENT, testMode: true });
    const res = await post();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "test_event_rejected" });
    expect(record).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("a LIVE event under a LIVE adapter is recorded and processed", async () => {
    withEvent({ ...SUB_EVENT, testMode: false });
    const res = await post();
    expect(res.status).toBe(200);
    expect(record).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(processed).toHaveBeenCalledTimes(1);
  });
});
