/**
 * /api/lmc/topup-checkout + /api/lmc/topup-webhook — route unit tests, every
 * collaborator mocked. The flags are switched per test through a mocked
 * module (getters); lib/billing/lmc-flags.ts itself stays all-false.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const flagState = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/billing/lmc-flags", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    get STRIPE_LMC_TOPUPS_ENABLED() {
      return flagState.on;
    },
    get LMC_PURCHASES_ENABLED() {
      return flagState.on;
    },
  };
});

const st = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111", email: "p@example.test" } as { id: string; email: string } | null,
  ctx: { kind: "unavailable" } as Record<string, unknown>,
  state: "stripe_test",
}));

const createClient = vi.hoisted(() =>
  vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: st.user } }) } })),
);
vi.mock("@/lib/supabase/server", () => ({ createClient }));
const resolveCtx = vi.hoisted(() => vi.fn(async () => st.ctx));
vi.mock("@/lib/company/employer-company-context", () => ({ resolveEmployerCompanyContext: resolveCtx }));
const getBillingConfig = vi.hoisted(() => vi.fn(() => ({ state: st.state, reason: "ok", testMode: st.state === "stripe_test" })));
const getBillingConfigFor = vi.hoisted(() =>
  vi.fn((organizationId: string | null) => {
    void organizationId; // asserted via toHaveBeenCalledWith
    return { state: st.state, reason: "ok", testMode: st.state === "stripe_test" };
  }),
);
vi.mock("@/lib/billing/config", () => ({ getBillingConfig, getBillingConfigFor }));
const createSession = vi.hoisted(() => vi.fn());
const constructEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/billing/provider", () => ({
  createTestModePaymentSession: createSession,
  constructTestModeTopupWebhookEvent: constructEvent,
}));
const handle = vi.hoisted(() => vi.fn());
vi.mock("@/lib/lmc/topup-settlement", () => ({ handleLmcTopupEvent: handle }));

// Test-only package list (arbitrary test figures, not an offer).
vi.mock("@/lib/lmc/topup-packages", async (orig) => {
  const real = (await orig()) as typeof import("@/lib/lmc/topup-packages");
  const TEST = [
    { key: "test_pack", creditCents: 777, chargeMinor: 777, currency: "eur" as const, approval: { state: "owner_approved" as const, decisionRef: "TEST-ONLY", approvedOnIso: "2026-10-21" } },
    { key: "unapproved_pack", creditCents: 5, chargeMinor: 5, currency: "eur" as const, approval: { state: "owner_unapproved" as const } },
  ];
  return { ...real, findSellableTopupPackage: (k: unknown) => real.findSellableTopupPackage(k, TEST) };
});

import { POST as checkout } from "@/app/api/lmc/topup-checkout/route";
import { POST as webhook } from "@/app/api/lmc/topup-webhook/route";

const post = (body: unknown) =>
  checkout(new Request("http://localhost/api/lmc/topup-checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
const deliver = (body = "{}", sig = "t=1,v1=x") =>
  webhook(new Request("http://localhost/api/lmc/topup-webhook", {
    method: "POST",
    headers: { "stripe-signature": sig },
    body,
  }));

beforeEach(() => {
  vi.clearAllMocks();
  flagState.on = false;
  st.user = { id: "11111111-1111-4111-8111-111111111111", email: "p@example.test" };
  st.ctx = { kind: "unavailable" };
  st.state = "stripe_test";
  createSession.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_1", sessionId: "cs_test_1", testMode: true });
  constructEvent.mockResolvedValue({ id: "evt_1", type: "checkout.session.completed", testMode: true, object: {} });
  handle.mockResolvedValue({ kind: "credited", paymentIntentId: "pi_x", transactionId: "t", amountCents: 1 });
});

describe("flags off (the shipped state)", () => {
  it("checkout → 503 before any auth, config or Stripe call", async () => {
    const r = await post({ packageKey: "test_pack" });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ reason: "topups_disabled" });
    for (const f of [createClient, resolveCtx, getBillingConfigFor, createSession]) expect(f).not.toHaveBeenCalled();
  });
  it("webhook → 503 before config, verification or settlement", async () => {
    const r = await deliver();
    expect(r.status).toBe(503);
    for (const f of [getBillingConfig, constructEvent, handle]) expect(f).not.toHaveBeenCalled();
  });
});

describe("checkout (flags forced on in this test only)", () => {
  beforeEach(() => {
    flagState.on = true;
  });

  it("accepts ONLY a package key — an amount/price/subject is a 400", async () => {
    for (const body of [{ packageKey: "test_pack", amount: 1 }, { packageKey: "test_pack", priceId: "p" }, { packageKey: "test_pack", subjectId: "x" }, "nope"]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(createSession).not.toHaveBeenCalled();
  });

  it("unknown or unapproved package → 400 package_not_sellable, no Stripe", async () => {
    for (const k of ["unapproved_pack", "unknown"]) {
      const r = await post({ packageKey: k });
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ reason: "package_not_sellable" });
    }
    expect(createSession).not.toHaveBeenCalled();
  });

  it("signed out → 401", async () => {
    st.user = null;
    expect((await post({ packageKey: "test_pack" })).status).toBe(401);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("not stripe_test (live, disabled) → 503 test_mode_required, no Stripe", async () => {
    for (const s of ["stripe_live", "disabled", "stripe_live_blocked"]) {
      st.state = s;
      const r = await post({ packageKey: "test_pack" });
      expect(r.status).toBe(503);
      expect(await r.json()).toMatchObject({ reason: "test_mode_required" });
    }
    expect(createSession).not.toHaveBeenCalled();
  });

  it("person subject: server package amount, person metadata, test environment", async () => {
    const r = await post({ packageKey: "test_pack" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, testMode: true });
    const input = createSession.mock.calls[0][0];
    expect(input).toMatchObject({ unitAmountMinor: 777, currency: "eur", clientReferenceId: st.user!.id });
    expect(input.metadata).toMatchObject({
      purpose: "lmc_topup_v1",
      package_key: "test_pack",
      subject_type: "person",
      subject_id: st.user!.id,
      environment: "test",
    });
    expect(input.idempotencyKey).toBe(input.metadata.checkout_idempotency_key);
    expect(getBillingConfigFor).toHaveBeenCalledWith(null);
  });

  it("organization workspace with manage-billing → the company is the subject", async () => {
    st.ctx = { kind: "ok", companyId: "22222222-2222-4222-8222-222222222222", organizationId: "org-1", role: "owner" };
    await post({ packageKey: "test_pack" });
    expect(createSession.mock.calls[0][0].metadata).toMatchObject({
      subject_type: "company",
      subject_id: "22222222-2222-4222-8222-222222222222",
    });
    expect(getBillingConfigFor).toHaveBeenCalledWith("org-1");
  });

  it("organization workspace WITHOUT manage-billing → 403, never a silent person top-up", async () => {
    st.ctx = { kind: "ok", companyId: "22222222-2222-4222-8222-222222222222", organizationId: "org-1", role: "member" };
    expect((await post({ packageKey: "test_pack" })).status).toBe(403);
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("webhook (flags forced on in this test only)", () => {
  beforeEach(() => {
    flagState.on = true;
  });

  it("not stripe_test → 503, nothing verified", async () => {
    st.state = "stripe_live";
    expect((await deliver()).status).toBe(503);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("bad signature → 400, never settled", async () => {
    constructEvent.mockRejectedValue(new Error("bad sig"));
    const r = await deliver();
    expect(r.status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
  });

  it("live event → 400, never settled", async () => {
    constructEvent.mockResolvedValue({ id: "evt_live", type: "checkout.session.completed", testMode: false, object: {} });
    const r = await deliver();
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ reason: "live_event_rejected" });
    expect(handle).not.toHaveBeenCalled();
  });

  it("maps outcomes to Stripe-facing statuses", async () => {
    const table: Array<[Record<string, unknown>, number]> = [
      [{ kind: "credited", paymentIntentId: "pi_x", transactionId: "t", amountCents: 1 }, 200],
      [{ kind: "already_credited", paymentIntentId: "pi_x" }, 200],
      [{ kind: "ignored", reason: "x" }, 200],
      [{ kind: "not_paid" }, 200],
      [{ kind: "refund_pending_owner_decision", paymentIntentId: "pi_x", chargeId: "ch" }, 200],
      [{ kind: "refused", reason: "amount_mismatch" }, 422],
      [{ kind: "refused", reason: "live_event" }, 400],
      [{ kind: "disabled", layer: "database" }, 503],
      [{ kind: "retry", detail: "x" }, 500],
    ];
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const [outcome, status] of table) {
      handle.mockResolvedValueOnce(outcome);
      expect((await deliver()).status, String(outcome.kind)).toBe(status);
    }
    expect(err.mock.calls.some((c) => String(c[0]).includes("refund_pending_owner_decision"))).toBe(true);
    err.mockRestore();
  });
});
