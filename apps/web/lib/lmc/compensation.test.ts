import { describe, expect, it, vi } from "vitest";

import {
  compensateSpend,
  mapLmcCompensationError,
  parseCompensationPayload,
  validateCompensateSpendInput,
  type CompensationRpcClient,
} from "./compensation";

/**
 * The compensation seam's honesty contract:
 *
 *   - every canonical ledger error maps to a stable reason code, never a
 *     fabricated success and never a swallowed failure;
 *   - a malformed RPC payload is an ERROR, not an acknowledgement — a
 *     compensation that cannot be pointed at (no transaction id) must not be
 *     reported as one that happened;
 *   - an idempotent replay is surfaced AS a replay (`already_processed`), so a
 *     retry never reads as a second credit;
 *   - input shape is validated before the network, but the RPC stays the
 *     authority on money (over-compensation, ownership, the kill-switch).
 */

const SPEND_TX = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";

const VALID = {
  originalTransactionId: SPEND_TX,
  reason: "action failed: matching run not delivered",
  idempotencyKey: "lmc-comp:test:0001",
  actorProfileId: ACTOR,
} as const;

function clientAnswering(answer: {
  data: unknown;
  error: { message?: string } | null;
}): CompensationRpcClient & { rpc: ReturnType<typeof vi.fn> } {
  return { rpc: vi.fn(async () => answer) };
}

describe("mapLmcCompensationError — canonical ledger errors → stable reasons", () => {
  const CASES: [string, string][] = [
    ["lmc_compensation_disabled", "compensation_disabled"],
    ["lmc_original_not_found", "original_not_found"],
    ["lmc_not_a_spend: admin_grant cannot be compensated — only a spend can", "not_a_spend"],
    ["lmc_already_compensated: spend x is fully compensated (500 of 500 cents)", "already_compensated"],
    ["lmc_over_compensation: 600 cents requested but only 500 remain of a 500 cent spend", "over_compensation"],
    ["lmc_invalid_amount", "invalid_amount"],
    ["lmc_reason_required", "reason_required"],
    ["lmc_actor_required", "actor_invalid"],
    ["lmc_unknown_actor", "actor_invalid"],
    ["lmc_actor_not_authorized: the initiating actor must own the affected account or be an admin", "actor_not_authorized"],
    ["lmc_idempotency_conflict: key k already used for kind spend", "idempotency_conflict"],
    ["lmc_reserved_idempotency_key: the lmc-expiry: namespace is system-reserved", "idempotency_conflict"],
    ["function public.lmc_compensate_spend_v1(uuid, text, text, uuid, bigint) does not exist", "rpc_absent"],
  ];
  for (const [message, reason] of CASES) {
    it(`"${message.slice(0, 40)}…" → ${reason}`, () => {
      expect(mapLmcCompensationError(message).reason).toBe(reason);
    });
  }

  it("an unrecognised error degrades to 'error' with bounded detail — never ok", () => {
    const out = mapLmcCompensationError("x".repeat(500));
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("error");
    expect(out.detail?.length).toBeLessThanOrEqual(200);
  });
});

describe("parseCompensationPayload — the RPC's jsonb → outcome", () => {
  it("a complete payload parses, replay=false on a fresh credit", () => {
    const out = parseCompensationPayload({
      transaction_id: "44444444-4444-4444-8444-444444444444",
      account_id: "55555555-5555-4555-8555-555555555555",
      kind: "spend_compensation",
      amount_cents: 500,
      expires_at: "2026-10-01T00:00:00Z",
      already_processed: false,
    });
    expect(out).toMatchObject({
      ok: true,
      amountCents: 500,
      expiresAt: "2026-10-01T00:00:00Z",
      replay: false,
    });
  });

  it("already_processed=true surfaces as replay — a retry is never a second credit", () => {
    const out = parseCompensationPayload({
      transaction_id: "44444444-4444-4444-8444-444444444444",
      account_id: "55555555-5555-4555-8555-555555555555",
      amount_cents: 500,
      expires_at: null,
      already_processed: true,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.replay).toBe(true);
      expect(out.expiresAt).toBeNull();
    }
  });

  it("a payload without a transaction id is an ERROR, not an acknowledgement", () => {
    for (const bad of [null, {}, { account_id: "a" }, { transaction_id: "" }]) {
      const out = parseCompensationPayload(bad);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.reason).toBe("error");
    }
  });
});

describe("validateCompensateSpendInput — shape gate before the network", () => {
  it("accepts the valid shape", () => {
    expect(validateCompensateSpendInput(VALID)).toBeNull();
  });
  it("refuses a non-uuid spend id / actor id", () => {
    expect(
      validateCompensateSpendInput({ ...VALID, originalTransactionId: "spend-1" })
        ?.reason,
    ).toBe("original_not_found");
    expect(
      validateCompensateSpendInput({ ...VALID, actorProfileId: "admin" })?.reason,
    ).toBe("actor_invalid");
  });
  it("refuses an empty/oversized reason and a short idempotency key", () => {
    expect(validateCompensateSpendInput({ ...VALID, reason: "  " })?.reason).toBe(
      "reason_required",
    );
    expect(
      validateCompensateSpendInput({ ...VALID, reason: "x".repeat(301) })?.reason,
    ).toBe("reason_required");
    expect(
      validateCompensateSpendInput({ ...VALID, idempotencyKey: "short" })?.reason,
    ).toBe("idempotency_conflict");
  });
  it("refuses a non-positive / fractional explicit amount", () => {
    expect(
      validateCompensateSpendInput({ ...VALID, amountCents: 0 })?.reason,
    ).toBe("invalid_amount");
    expect(
      validateCompensateSpendInput({ ...VALID, amountCents: 10.5 })?.reason,
    ).toBe("invalid_amount");
  });
});

describe("compensateSpend — the composed caller", () => {
  it("forwards the exact ledger-proven argument names; omits an absent amount", async () => {
    const client = clientAnswering({
      data: {
        transaction_id: "44444444-4444-4444-8444-444444444444",
        account_id: "55555555-5555-4555-8555-555555555555",
        amount_cents: 500,
        already_processed: false,
      },
      error: null,
    });
    const out = await compensateSpend(VALID, client);
    expect(out.ok).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("lmc_compensate_spend_v1", {
      p_original_transaction_id: VALID.originalTransactionId,
      p_reason: VALID.reason,
      p_idempotency_key: VALID.idempotencyKey,
      p_actor_profile_id: VALID.actorProfileId,
    });
  });

  it("passes an explicit partial amount through", async () => {
    const client = clientAnswering({
      data: {
        transaction_id: "44444444-4444-4444-8444-444444444444",
        account_id: "55555555-5555-4555-8555-555555555555",
        amount_cents: 200,
        already_processed: false,
      },
      error: null,
    });
    await compensateSpend({ ...VALID, amountCents: 200 }, client);
    expect(client.rpc).toHaveBeenCalledWith(
      "lmc_compensate_spend_v1",
      expect.objectContaining({ p_amount_cents: 200 }),
    );
  });

  it("maps an RPC error instead of throwing — and never reports success", async () => {
    const client = clientAnswering({
      data: null,
      error: { message: "lmc_compensation_disabled" },
    });
    const out = await compensateSpend(VALID, client);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("compensation_disabled");
  });

  it("shape-invalid input never reaches the network", async () => {
    const client = clientAnswering({ data: null, error: null });
    const out = await compensateSpend({ ...VALID, reason: "" }, client);
    expect(out.ok).toBe(false);
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
