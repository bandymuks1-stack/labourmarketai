/**
 * Stage 1 characterization: the canonical apply primitive hands the store the
 * EXACT upsert the webhook route used to build inline (no behaviour change),
 * and the webhook route's HTTP contract over it is unchanged.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/billing/provider", () => ({ getBillingProvider: vi.fn() }));
const billingCfg = vi.hoisted(() => ({ state: "stripe_test" as string, testMode: true }));
vi.mock("@/lib/billing/config", () => ({ getBillingConfig: () => billingCfg }));
vi.mock("@/lib/billing/subscription-store", () => ({
  recordWebhookEvent: vi.fn(),
  markWebhookProcessed: vi.fn(),
  markWebhookFailed: vi.fn(),
  upsertSubscription: vi.fn(),
  applyInvoicePayment: vi.fn(),
}));
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
} from "@/lib/billing/subscription-store";
import {
  applyCheckoutLink,
  applyRawSubscriptionObject,
  applySubscriptionSnapshot,
} from "@/lib/billing/apply-subscription-snapshot";
import { POST } from "@/app/api/billing/webhook/route";

const upsert = vi.mocked(upsertSubscription);
const record = vi.mocked(recordWebhookEvent);
const processed = vi.mocked(markWebhookProcessed);
const failed = vi.mocked(markWebhookFailed);

const SUB_OBJ = {
  id: "sub_1",
  customer: "cus_1",
  status: "active",
  cancel_at_period_end: false,
  metadata: { plan_key: "company_pro", client_reference_id: "owner_1", organization_id: "org_1" },
};

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue("ok");
  record.mockResolvedValue("ok");
  processed.mockResolvedValue();
  failed.mockResolvedValue();
});

describe("applyRawSubscriptionObject", () => {
  it("normalizes with the shared parser and stamps the evidence", async () => {
    const r = await applyRawSubscriptionObject(SUB_OBJ, {
      testMode: true,
      evidence: { id: "evt_9", created: 1700000000 },
    });
    expect(r).toBe("ok");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      providerSubscriptionId: "sub_1",
      providerCustomerId: "cus_1",
      ownerId: "owner_1",
      planKey: "company_pro",
      organizationId: "org_1",
      status: "active",
      testMode: true,
      eventId: "evt_9",
      eventCreated: 1700000000,
    });
  });

  it("deleted forces status cancelled", async () => {
    await applyRawSubscriptionObject(SUB_OBJ, {
      testMode: true,
      evidence: { id: "evt_9", created: 1 },
      deleted: true,
    });
    expect(upsert.mock.calls[0][0].status).toBe("cancelled");
  });

  it("a non-subscription object is a no-op (null, no write)", async () => {
    expect(await applyRawSubscriptionObject({}, { testMode: true, evidence: { id: "e", created: 1 } })).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("passes every store outcome through untouched", async () => {
    for (const o of ["stale-event", "conflict-live-subscription", "needs-migration", "error"] as const) {
      upsert.mockResolvedValueOnce(o);
      expect(
        await applyRawSubscriptionObject(SUB_OBJ, { testMode: true, evidence: { id: "e", created: 1 } }),
      ).toBe(o);
    }
  });
});

describe("applySubscriptionSnapshot", () => {
  it("is a straight delegate to the store (no second state machine)", async () => {
    const snap = {
      providerSubscriptionId: "sub_1",
      providerCustomerId: null,
      ownerId: "o",
      planKey: "p",
      organizationId: null,
      status: "past_due" as const,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      testMode: true,
    };
    await applySubscriptionSnapshot(snap);
    expect(upsert).toHaveBeenCalledWith(snap);
  });
});

describe("applyCheckoutLink", () => {
  it("builds an incomplete LINK upsert", async () => {
    const r = await applyCheckoutLink(
      { id: "cs_1", subscription: "sub_1", customer: "cus_1", client_reference_id: "o", metadata: { plan_key: "p" } },
      { testMode: true, evidence: { id: "evt_1", created: 5 } },
    );
    expect(r).toEqual({ result: "ok", providerSubscriptionId: "sub_1" });
    expect(upsert.mock.calls[0][0]).toMatchObject({
      status: "incomplete",
      transitionKind: "link",
      eventId: "evt_1",
      eventCreated: 5,
      cancelAtPeriodEnd: false,
    });
  });

  it("a session without a subscription writes nothing", async () => {
    expect(await applyCheckoutLink({ id: "cs_1" }, { testMode: true, evidence: { id: "e", created: 1 } })).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("webhook route over the primitive - contract unchanged", () => {
  function send(event: unknown) {
    vi.mocked(getBillingProvider).mockResolvedValue({
      id: "stripe_test",
      active: true,
      constructWebhookEvent: vi.fn().mockResolvedValue(event),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return POST(
      new Request("http://localhost/api/billing/webhook", {
        method: "POST",
        body: "{}",
        headers: { "stripe-signature": "t=1,v1=x" },
      }),
    );
  }

  it("customer.subscription.deleted -> cancelled, processed", async () => {
    const res = await send({ id: "evt_d", type: "customer.subscription.deleted", testMode: true, created: 10, object: SUB_OBJ });
    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0].status).toBe("cancelled");
    expect(processed).toHaveBeenCalledWith("evt_d");
  });

  it("stale event -> 200, record closed, never retried", async () => {
    upsert.mockResolvedValue("stale-event");
    const res = await send({ id: "evt_s", type: "customer.subscription.updated", testMode: true, created: 1, object: SUB_OBJ });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ processed: true, result: "stale-event" });
    expect(processed).toHaveBeenCalledWith("evt_s");
    expect(failed).not.toHaveBeenCalled();
  });

  it("conflict-live-subscription -> 500 with reason, record kept open", async () => {
    upsert.mockResolvedValue("conflict-live-subscription");
    const res = await send({ id: "evt_c", type: "customer.subscription.updated", testMode: true, created: 1, object: SUB_OBJ });
    expect(res.status).toBe(500);
    expect((await res.json()).reason).toBe("conflict-live-subscription");
    expect(failed).toHaveBeenCalledWith("evt_c", "conflict-live-subscription");
    expect(processed).not.toHaveBeenCalled();
  });

  it("a throw inside the primitive -> 500 process_error, record kept open", async () => {
    upsert.mockRejectedValue(new Error("boom"));
    const res = await send({ id: "evt_t", type: "customer.subscription.updated", testMode: true, created: 1, object: SUB_OBJ });
    expect(res.status).toBe(500);
    expect((await res.json()).reason).toBe("process_error");
    expect(failed).toHaveBeenCalledWith("evt_t", "boom");
  });

  it("duplicate-processed -> short-circuit, primitive not invoked", async () => {
    record.mockResolvedValue("duplicate-processed");
    const res = await send({ id: "evt_x", type: "customer.subscription.updated", testMode: true, created: 1, object: SUB_OBJ });
    expect((await res.json()).duplicate).toBe(true);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("checkout.session.completed -> link, session bookkeeping", async () => {
    const res = await send({
      id: "evt_l",
      type: "checkout.session.completed",
      testMode: true,
      created: 3,
      object: { id: "cs_1", subscription: "sub_1", client_reference_id: "o", metadata: { plan_key: "p" } },
    });
    expect(res.status).toBe(200);
    expect(upsert.mock.calls[0][0]).toMatchObject({ transitionKind: "link", status: "incomplete" });
  });
});
