/**
 * LMC top-up settlement — unit tests (Wagon 4). The flags are forced ON in
 * this file only (mocked module); lib/billing/lmc-flags.ts stays all-false
 * and is pinned so by the guards. Packages are injected — the production list
 * is empty (MDD-03 open).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const flagState = vi.hoisted(() => ({ on: true }));
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
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("admin client must be injected in this test");
  },
}));

import {
  handleLmcTopupEvent,
  topupIdempotencyKeyFor,
  type TopupWebhookEvent,
} from "@/lib/lmc/topup-settlement";
import { LMC_TOPUP_PURPOSE } from "@/lib/lmc/topup-metadata";
import type { LmcTopupPackage } from "@/lib/lmc/topup-packages";
import type { LmcWalletRpcClient } from "@/lib/lmc/wallet";

const PERSON = "11111111-1111-4111-8111-111111111111";
const PI = "pi_test_unit_0001";

// Test-only packages (figures are arbitrary test values, not an offer).
const PACKAGES: readonly LmcTopupPackage[] = [
  {
    key: "test_pack",
    creditCents: 1234,
    chargeMinor: 1234,
    currency: "eur",
    approval: { state: "owner_approved", decisionRef: "TEST-ONLY", approvedOnIso: "2026-10-21" },
  },
  { key: "unapproved_pack", creditCents: 500, chargeMinor: 500, currency: "eur", approval: { state: "owner_unapproved" } },
];

function session(over: Record<string, unknown> = {}, meta: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "cs_test_1",
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    payment_intent: PI,
    currency: "eur",
    amount_subtotal: 1234,
    livemode: false,
    metadata: {
      purpose: LMC_TOPUP_PURPOSE,
      package_key: "test_pack",
      subject_type: "person",
      subject_id: PERSON,
      environment: "test",
      ...meta,
    },
    ...over,
  };
}

function ev(object: Record<string, unknown>, type = "checkout.session.completed", testMode = true): TopupWebhookEvent {
  return { id: "evt_1", type, testMode, object };
}

const rpc = vi.fn();
const client = { rpc } as unknown as LmcWalletRpcClient;
const deps = { packages: PACKAGES, client };

beforeEach(() => {
  flagState.on = true;
  rpc.mockReset();
  rpc.mockResolvedValue({
    data: { transaction_id: "tx-1", account_id: "acc-1", kind: "purchased", amount_cents: 1234, already_processed: false },
    error: null,
  });
});

describe("kill-switches", () => {
  it("both flags off → disabled, no RPC", async () => {
    flagState.on = false;
    expect(await handleLmcTopupEvent(ev(session()), deps)).toEqual({ kind: "disabled", layer: "code" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("settlement", () => {
  it("credits the SERVER package amount with the payment-intent key and reference", async () => {
    const out = await handleLmcTopupEvent(ev(session()), deps);
    expect(out).toEqual({ kind: "credited", paymentIntentId: PI, transactionId: "tx-1", amountCents: 1234 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("lmc_record_purchase_v1", {
      p_amount_cents: 1234,
      p_reference: PI,
      p_idempotency_key: `stripe_pi:${PI}`,
      p_profile_id: PERSON,
    });
    expect(topupIdempotencyKeyFor(PI)).toBe(`stripe_pi:${PI}`);
  });

  it("the async_payment_succeeded event for the same payment uses the SAME key", async () => {
    await handleLmcTopupEvent(ev(session()), deps);
    await handleLmcTopupEvent(ev(session({ id: "cs_other" }), "checkout.session.async_payment_succeeded"), deps);
    const keys = rpc.mock.calls.map((c) => (c[1] as { p_idempotency_key: string }).p_idempotency_key);
    expect(new Set(keys)).toEqual(new Set([`stripe_pi:${PI}`]));
  });

  it("an expanded payment_intent object resolves to its id", async () => {
    await handleLmcTopupEvent(ev(session({ payment_intent: { id: PI, object: "payment_intent" } })), deps);
    expect((rpc.mock.calls[0][1] as { p_reference: string }).p_reference).toBe(PI);
  });

  it("a ledger replay → already_credited", async () => {
    rpc.mockResolvedValue({
      data: { transaction_id: "tx-1", account_id: "acc-1", kind: "purchased", amount_cents: 1234, already_processed: true },
      error: null,
    });
    expect(await handleLmcTopupEvent(ev(session()), deps)).toEqual({ kind: "already_credited", paymentIntentId: PI });
  });

  it("the DB unique-reference violation (other subject, same payment) → already_credited", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "lmc_purchase_payment_reference_unique"' },
    });
    expect(await handleLmcTopupEvent(ev(session()), deps)).toEqual({ kind: "already_credited", paymentIntentId: PI });
  });

  it("an idempotency conflict is refused, never re-credited", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "lmc_idempotency_conflict: key already used with a different amount" } });
    expect(await handleLmcTopupEvent(ev(session()), deps)).toEqual({ kind: "refused", reason: "idempotency_conflict" });
  });

  it("the database kill-switch → disabled/database; an unknown error → retry", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "lmc_purchases_disabled" } });
    expect(await handleLmcTopupEvent(ev(session()), deps)).toEqual({ kind: "disabled", layer: "database" });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "connection reset" } });
    expect(await handleLmcTopupEvent(ev(session()), deps)).toMatchObject({ kind: "retry" });
  });
});

describe("refusals (no RPC)", () => {
  const cases: Array<[string, TopupWebhookEvent, string]> = [
    ["live event", ev(session(), "checkout.session.completed", false), "live_event"],
    ["live object", ev(session({ livemode: true })), "live_event"],
    ["not test environment", ev(session({}, { environment: "live" })), "not_test_environment"],
    ["missing payment intent", ev(session({ payment_intent: null })), "missing_payment_intent"],
    ["unapproved package", ev(session({}, { package_key: "unapproved_pack" })), "package_not_sellable"],
    ["unknown package", ev(session({}, { package_key: "nope" })), "package_not_sellable"],
    ["amount mismatch", ev(session({ amount_subtotal: 1 })), "amount_mismatch"],
    ["currency mismatch", ev(session({ currency: "usd" })), "amount_mismatch"],
    ["bad subject", ev(session({}, { subject_id: "not-a-uuid" })), "invalid_metadata"],
    ["two-subject type", ev(session({}, { subject_type: "organization" })), "invalid_metadata"],
  ];
  for (const [name, event, reason] of cases) {
    it(name, async () => {
      expect(await handleLmcTopupEvent(event, deps)).toMatchObject({ kind: "refused", reason });
      expect(rpc).not.toHaveBeenCalled();
    });
  }

  it("the production package list is empty → every real event is refused", async () => {
    expect(await handleLmcTopupEvent(ev(session()), { client })).toMatchObject({
      kind: "refused",
      reason: "package_not_sellable",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("ignored / not paid", () => {
  it("a subscription checkout is not ours", async () => {
    expect(await handleLmcTopupEvent(ev(session({ mode: "subscription" })), deps)).toMatchObject({ kind: "ignored" });
    expect(await handleLmcTopupEvent(ev(session({}, { purpose: undefined })), deps)).toMatchObject({ kind: "ignored" });
  });
  it("an unhandled type is ignored", async () => {
    expect(await handleLmcTopupEvent(ev(session(), "checkout.session.expired"), deps)).toMatchObject({ kind: "ignored" });
  });
  it("an unpaid (async pending) session credits nothing", async () => {
    expect(await handleLmcTopupEvent(ev(session({ payment_status: "unpaid" })), deps)).toEqual({ kind: "not_paid" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("refunds", () => {
  it("a top-up refund is reported for the owner and reverses nothing", async () => {
    const charge = { id: "ch_1", object: "charge", payment_intent: PI, livemode: false, metadata: { purpose: LMC_TOPUP_PURPOSE } };
    expect(await handleLmcTopupEvent(ev(charge, "charge.refunded"), deps)).toEqual({
      kind: "refund_pending_owner_decision",
      paymentIntentId: PI,
      chargeId: "ch_1",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("a refund of something else is ignored", async () => {
    const charge = { id: "ch_2", object: "charge", payment_intent: PI, livemode: false, metadata: {} };
    expect(await handleLmcTopupEvent(ev(charge, "charge.refunded"), deps)).toMatchObject({ kind: "ignored" });
  });
});
