/**
 * Checkout route — billing safety v1 behaviour, every collaborator mocked.
 *
 *   - amount authority: the body may carry ONLY planKey — a supplied price,
 *     amount or currency is rejected 400 before any collaborator runs; the
 *     price id handed to the provider is the SERVER's env slot;
 *   - admission: a blocking local subscription → 409 subscription_exists and
 *     NO provider session; an unreadable state → 503, no session;
 *   - operation identity: the provider receives the operation-derived
 *     idempotency key + the operation's expires_at; a reused operation hands
 *     Stripe the SAME key; a failed provider call closes the operation;
 *   - degrade: needs-migration on the operations table → legacy deterministic
 *     key, no expires_at; an unreadable operations store → 503, no session.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const supa = vi.hoisted(() => ({
  user: { id: "user-1", email: "o@example.com" } as { id: string; email: string } | null,
  roles: [{ role: "company" }],
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: supa.user } }) },
    from: () => ({ select: () => ({ eq: async () => ({ data: supa.roles }) }) }),
  })),
}));
vi.mock("@/lib/billing/config", () => ({
  getBillingConfig: () => ({ state: "stripe_live", reason: "ok", testMode: false, paymentsEnabled: true, mode: "live" }),
}));
vi.mock("@/lib/billing/prices", () => ({ testPriceIdFor: (k: string) => (k === "company_pilot" ? "price_SERVER" : null) }));
vi.mock("@/lib/billing/billing-subject", () => ({
  resolveBillingSubject: vi.fn(async () => ({ subject: { type: "organization", id: "org-1" }, payerProfileId: "user-1", billingAuthority: true, role: "owner" })),
}));
vi.mock("@/lib/billing/customer-store", () => ({ ensureBillingCustomer: vi.fn(async () => ({ ok: true, customerId: "cus_1" })) }));
vi.mock("@/lib/billing/provider", () => ({ getBillingProvider: vi.fn() }));
vi.mock("@/lib/billing/checkout-admission", () => ({ admitCheckout: vi.fn() }));
vi.mock("@/lib/billing/checkout-operations-store", () => ({
  openCheckoutOperation: vi.fn(),
  attachProviderSession: vi.fn(async () => undefined),
  markCheckoutOperationFailed: vi.fn(async () => undefined),
}));

import { getBillingProvider } from "@/lib/billing/provider";
import { admitCheckout } from "@/lib/billing/checkout-admission";
import {
  attachProviderSession,
  markCheckoutOperationFailed,
  openCheckoutOperation,
} from "@/lib/billing/checkout-operations-store";
import { POST } from "@/app/api/billing/test-checkout/route";

const admit = vi.mocked(admitCheckout);
const open = vi.mocked(openCheckoutOperation);
const createSession = vi.fn();

const OP = {
  id: "op-1",
  scopeKey: "organization:org-1",
  planKey: "company_pilot",
  idempotencyKey: "co2_organization_org-1_company_pilot_op-1",
  expiresAt: "2026-09-05T10:45:00.000Z",
  providerSessionId: null,
};

function post(body: unknown): Promise<Response> {
  return POST(new Request("http://localhost/api/billing/test-checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  supa.user = { id: "user-1", email: "o@example.com" };
  vi.mocked(getBillingProvider).mockResolvedValue({
    id: "stripe_live", active: true, createCheckoutSession: createSession,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  createSession.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/c/x", sessionId: "cs_1", testMode: false });
  admit.mockResolvedValue({ admit: true, reason: "no_local_subscription" });
  open.mockResolvedValue({ kind: "opened", operation: OP });
});

describe("amount authority — the browser never supplies a price", () => {
  it("a body carrying priceId / amount / currency is rejected 400 before anything runs", async () => {
    for (const extra of [{ priceId: "price_evil" }, { amount: 1 }, { currency: "eur" }, { price: 1 }]) {
      const res = await post({ planKey: "company_pilot", ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
      expect((await res.json()).reason).toBe("bad_request");
    }
    expect(admit).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("the provider receives the SERVER-resolved price id only", async () => {
    const res = await post({ planKey: "company_pilot" });
    expect(res.status).toBe(200);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession.mock.calls[0][0]).toEqual(expect.objectContaining({ priceId: "price_SERVER", planKey: "company_pilot" }));
  });
});

describe("admission — one active subscription per subject + plan", () => {
  it("subscription_exists → 409, NO operation opened, NO provider session", async () => {
    admit.mockResolvedValue({ admit: false, reason: "subscription_exists", localStatus: "active", provider: "confirmed_live" });
    const res = await post({ planKey: "company_pilot" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe("subscription_exists");
    expect(body.subscriptionStatus).toBe("active");
    expect(open).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("unreadable local state → 503 checkout_unavailable, NO session", async () => {
    admit.mockResolvedValue({ admit: false, reason: "checkout_unavailable", cause: "store_error" });
    const res = await post({ planKey: "company_pilot" });
    expect(res.status).toBe(503);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("admission is evaluated for the ORGANIZATION scope the server resolved, in the adapter's mode", async () => {
    await post({ planKey: "company_pilot" });
    expect(admit).toHaveBeenCalledWith(expect.objectContaining({
      scope: { type: "organization", id: "org-1" }, planKey: "company_pilot", testMode: false,
    }));
  });
});

describe("operation identity → Stripe idempotency key + expires_at", () => {
  it("an opened operation hands the provider ITS key and ITS window; the session is attached to it", async () => {
    const res = await post({ planKey: "company_pilot" });
    const body = await res.json();
    expect(body).toEqual(expect.objectContaining({ ok: true, operationId: "op-1", reused: false }));
    const input = createSession.mock.calls[0][0];
    expect(input.idempotencyKey).toBe(OP.idempotencyKey);
    expect(input.expiresAt).toBe(Math.floor(Date.parse(OP.expiresAt) / 1000));
    expect(attachProviderSession).toHaveBeenCalledWith("op-1", "cs_1");
    expect(open).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: "user-1", organizationId: "org-1", planKey: "company_pilot", priceId: "price_SERVER", testMode: false,
      scope: { type: "organization", id: "org-1" },
    }));
  });

  it("a REUSED operation (second tab / double click / retry) hands Stripe the SAME key → the same session", async () => {
    open.mockResolvedValue({ kind: "reused", operation: OP });
    const res = await post({ planKey: "company_pilot" });
    expect((await res.json()).reused).toBe(true);
    expect(createSession.mock.calls[0][0].idempotencyKey).toBe(OP.idempotencyKey);
    expect(createSession.mock.calls[0][0].expiresAt).toBe(Math.floor(Date.parse(OP.expiresAt) / 1000));
  });

  it("a provider refusal closes the operation (fresh identity next time) and answers 400", async () => {
    createSession.mockResolvedValue({ ok: false, reason: "idempotency_error" });
    const res = await post({ planKey: "company_pilot" });
    expect(res.status).toBe(400);
    expect(markCheckoutOperationFailed).toHaveBeenCalledWith("op-1", "idempotency_error");
    expect(attachProviderSession).not.toHaveBeenCalled();
  });

  it("operations table not applied → legacy deterministic key, no expires_at (documented degrade)", async () => {
    open.mockResolvedValue({ kind: "needs-migration" });
    const res = await post({ planKey: "company_pilot" });
    expect(res.status).toBe(200);
    const input = createSession.mock.calls[0][0];
    expect(input.idempotencyKey).toBe("co1_user-1_company_pilot_org-1");
    expect(input.expiresAt).toBeUndefined();
    expect((await res.json()).operationId).toBeNull();
  });

  it("an unreadable operations store → 503, NO session (no identity, no checkout)", async () => {
    open.mockResolvedValue({ kind: "error", reason: "insert_failed" });
    const res = await post({ planKey: "company_pilot" });
    expect(res.status).toBe(503);
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("gates that precede everything (unchanged)", () => {
  it("unauthenticated → 401 and no collaborator runs", async () => {
    supa.user = null;
    const res = await post({ planKey: "company_pilot" });
    expect(res.status).toBe(401);
    expect(admit).not.toHaveBeenCalled();
  });

  it("a deferred plan is refused before admission", async () => {
    const res = await post({ planKey: "worker_plus" });
    expect(res.status).toBe(400);
    expect(admit).not.toHaveBeenCalled();
  });
});
