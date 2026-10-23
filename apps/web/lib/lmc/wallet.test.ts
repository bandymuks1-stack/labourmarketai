import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The wallet server layer's contract, with the Supabase admin client mocked:
 *
 *   - flags OFF (the shipped state) short-circuit BEFORE any client is built;
 *   - with the flags forced ON *inside this test only* (vi.mock — the shipped
 *     constants stay `false as const`, pinned by the guards), the argument
 *     names sent to the RPC are exactly the SQL signature's parameter names;
 *   - every canonical ledger error maps to a typed result, never a success;
 *   - an idempotent replay is surfaced as a replay;
 *   - an action failure after a spend calls compensation; a failed spend never
 *     runs the action and never compensates.
 */

const flags = vi.hoisted(() => ({
  purchases: false,
  spending: false,
  compensation: false,
}));

vi.mock("@/lib/billing/lmc-flags", () => ({
  get LMC_PURCHASES_ENABLED() {
    return flags.purchases;
  },
  get LMC_SPENDING_ENABLED() {
    return flags.spending;
  },
  get LMC_COMPENSATION_ENABLED() {
    return flags.compensation;
  },
}));

const createAdminClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

import {
  compensationKeyFor,
  mapLmcWalletError,
  parseLmcLedgerPayload,
  recordLmcPurchase,
  spendLmc,
  spendLmcForAction,
  type LmcWalletRpcClient,
} from "./wallet";

const PERSON = "11111111-1111-4111-8111-111111111111";
const COMPANY = "66666666-6666-4666-8666-666666666666";
const ACTOR = "33333333-3333-4333-8333-333333333333";
const TX = "44444444-4444-4444-8444-444444444444";
const ACCOUNT = "55555555-5555-4555-8555-555555555555";
const COMP_TX = "77777777-7777-4777-8777-777777777777";

const PURCHASE = {
  subject: { type: "person", profileId: PERSON },
  amountCents: 2_500,
  providerReference: "pi_test_0001",
  idempotencyKey: "lmc-topup:test:0001",
} as const;

const SPEND = {
  subject: { type: "person", profileId: PERSON },
  amountCents: 500,
  reason: "matching run",
  idempotencyKey: "lmc-spend:test:0001",
  actorProfileId: ACTOR,
} as const;

type Answer = { data: unknown; error: { message?: string } | null };

function client(
  answers: Partial<Record<string, Answer>>,
): LmcWalletRpcClient & { rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(async (fn: string) => answers[fn] ?? { data: null, error: null });
  return { rpc } as unknown as LmcWalletRpcClient & { rpc: ReturnType<typeof vi.fn> };
}

const ok = (kind: string, amount: number, replay = false): Answer => ({
  data: {
    transaction_id: TX,
    account_id: ACCOUNT,
    kind,
    amount_cents: amount,
    already_processed: replay,
  },
  error: null,
});

/** Parameter names of a function in the applied ledger migration, in order. */
function sqlParams(fn: string): string[] {
  const sql = readFileSync(
    join(
      process.cwd(),
      "..",
      "..",
      "supabase",
      "migrations",
      "20260720190000_lmc_ledger_foundation_v1.sql",
    ),
    "utf8",
  );
  const m = sql.match(
    new RegExp(`create or replace function public\\.${fn}\\(([\\s\\S]*?)\\)\\s*returns`),
  );
  if (!m) throw new Error(`${fn} not found`);
  return [...m[1].matchAll(/(p_\w+)\s/g)].map((x) => x[1]);
}

beforeEach(() => {
  flags.purchases = false;
  flags.spending = false;
  flags.compensation = false;
  createAdminClient.mockReset();
});

describe("flags OFF (the shipped state) — nothing reaches the database", () => {
  it("recordLmcPurchase returns disabled/code and builds no client", async () => {
    const c = client({});
    expect(await recordLmcPurchase(PURCHASE, c)).toEqual({
      kind: "disabled",
      flag: "lmc_purchases_enabled",
      layer: "code",
    });
    expect(await recordLmcPurchase(PURCHASE)).toMatchObject({ kind: "disabled" });
    expect(c.rpc).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("spendLmc returns disabled/code and builds no client", async () => {
    const c = client({});
    expect(await spendLmc(SPEND, c)).toEqual({
      kind: "disabled",
      flag: "lmc_spending_enabled",
      layer: "code",
    });
    expect(await spendLmc(SPEND)).toMatchObject({ kind: "disabled" });
    expect(c.rpc).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("spendLmcForAction never runs the action and builds no client", async () => {
    const c = client({});
    const action = vi.fn(async () => "delivered");
    const out = await spendLmcForAction({ ...SPEND, actionLabel: "match" }, action, c);
    expect(out).toEqual({ kind: "disabled", flag: "lmc_spending_enabled", layer: "code" });
    expect(action).not.toHaveBeenCalled();
    expect(c.rpc).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("spending ON but compensation OFF still refuses — no charge without a remedy", async () => {
    flags.spending = true;
    const c = client({});
    const action = vi.fn(async () => "delivered");
    const out = await spendLmcForAction({ ...SPEND, actionLabel: "match" }, action, c);
    expect(out).toEqual({
      kind: "disabled",
      flag: "lmc_compensation_enabled",
      layer: "code",
    });
    expect(action).not.toHaveBeenCalled();
    expect(c.rpc).not.toHaveBeenCalled();
  });
});

describe("argument mapping — exactly the SQL signatures", () => {
  it("the SQL signatures are what this test assumes", () => {
    expect(sqlParams("lmc_record_purchase_v1")).toEqual([
      "p_amount_cents",
      "p_reference",
      "p_idempotency_key",
      "p_profile_id",
      "p_company_id",
    ]);
    expect(sqlParams("lmc_spend_v1")).toEqual([
      "p_amount_cents",
      "p_reason",
      "p_idempotency_key",
      "p_profile_id",
      "p_company_id",
      "p_actor_profile_id",
    ]);
  });

  it("purchase for a person sends exactly the person-keyed arguments", async () => {
    flags.purchases = true;
    const c = client({ lmc_record_purchase_v1: ok("purchased", 2_500) });
    const out = await recordLmcPurchase(PURCHASE, c);
    expect(out).toEqual({
      kind: "recorded",
      transactionId: TX,
      accountId: ACCOUNT,
      amountCents: 2_500,
      replay: false,
    });
    expect(c.rpc).toHaveBeenCalledWith("lmc_record_purchase_v1", {
      p_amount_cents: 2_500,
      p_reference: "pi_test_0001",
      p_idempotency_key: "lmc-topup:test:0001",
      p_profile_id: PERSON,
    });
    const sent = Object.keys(c.rpc.mock.calls[0][1]);
    for (const k of sent) expect(sqlParams("lmc_record_purchase_v1")).toContain(k);
  });

  it("purchase for a company sends p_company_id and never p_profile_id", async () => {
    flags.purchases = true;
    const c = client({ lmc_record_purchase_v1: ok("purchased", 2_500) });
    await recordLmcPurchase(
      { ...PURCHASE, subject: { type: "company", companyId: COMPANY } },
      c,
    );
    const args = c.rpc.mock.calls[0][1];
    expect(args.p_company_id).toBe(COMPANY);
    expect("p_profile_id" in args).toBe(false);
  });

  it("spend sends exactly the SQL parameter names including the actor", async () => {
    flags.spending = true;
    const c = client({ lmc_spend_v1: ok("spend", 500) });
    const out = await spendLmc({ ...SPEND, reason: "  matching run  " }, c);
    expect(out).toMatchObject({ kind: "spent", transactionId: TX, amountCents: 500 });
    expect(c.rpc).toHaveBeenCalledWith("lmc_spend_v1", {
      p_amount_cents: 500,
      p_reason: "matching run",
      p_idempotency_key: "lmc-spend:test:0001",
      p_profile_id: PERSON,
      p_actor_profile_id: ACTOR,
    });
    const sent = Object.keys(c.rpc.mock.calls[0][1]);
    for (const k of sent) expect(sqlParams("lmc_spend_v1")).toContain(k);
  });
});

describe("shape validation before the network", () => {
  it("refuses bad amounts, references, keys, subjects and actors without an RPC", async () => {
    flags.purchases = true;
    flags.spending = true;
    const c = client({});
    const cases: [Promise<{ kind: string; reason?: string }>, string][] = [
      [recordLmcPurchase({ ...PURCHASE, amountCents: 0 }, c), "invalid_amount"],
      [recordLmcPurchase({ ...PURCHASE, amountCents: 10.5 }, c), "invalid_amount"],
      [recordLmcPurchase({ ...PURCHASE, amountCents: 100_000_001 }, c), "invalid_amount"],
      [recordLmcPurchase({ ...PURCHASE, providerReference: "  " }, c), "reference_required"],
      [
        recordLmcPurchase({ ...PURCHASE, providerReference: "x".repeat(201) }, c),
        "reference_required",
      ],
      [recordLmcPurchase({ ...PURCHASE, idempotencyKey: "short" }, c), "idempotency_conflict"],
      [
        recordLmcPurchase({ ...PURCHASE, idempotencyKey: "lmc-expiry:abcdefgh" }, c),
        "idempotency_conflict",
      ],
      [
        recordLmcPurchase(
          { ...PURCHASE, subject: { type: "person", profileId: "me" } },
          c,
        ),
        "invalid_subject",
      ],
      [spendLmc({ ...SPEND, reason: " " }, c), "reason_required"],
      [spendLmc({ ...SPEND, actorProfileId: "admin" }, c), "actor_invalid"],
      [spendLmc({ ...SPEND, amountCents: -5 }, c), "invalid_amount"],
    ];
    for (const [p, reason] of cases) {
      expect(await p).toMatchObject({ kind: "rejected", reason });
    }
    expect(c.rpc).not.toHaveBeenCalled();
  });
});

describe("error mapping — canonical ledger errors → typed results", () => {
  const CASES: [string, string][] = [
    ["lmc_invalid_amount", "invalid_amount"],
    ["lmc_reference_required", "reference_required"],
    ["lmc_reason_required", "reason_required"],
    ["lmc_invalid_subject: exactly one of profile or company required", "invalid_subject"],
    ["lmc_unknown_profile", "unknown_subject"],
    ["lmc_unknown_company", "unknown_subject"],
    ["lmc_actor_required", "actor_invalid"],
    ["lmc_unknown_actor", "actor_invalid"],
    ["lmc_actor_not_authorized: the initiating actor must own the debited account or be an admin", "actor_not_authorized"],
    ["lmc_insufficient_balance: available 100 < requested 500", "insufficient_balance"],
    ["lmc_idempotency_conflict: key k already used with a different amount", "idempotency_conflict"],
    ["lmc_reserved_idempotency_key: the lmc-expiry: namespace is system-reserved", "idempotency_conflict"],
    ["function public.lmc_spend_v1(bigint, text, text, uuid, uuid, uuid) does not exist", "rpc_absent"],
  ];
  for (const [message, reason] of CASES) {
    it(`"${message.slice(0, 40)}…" → ${reason}`, () => {
      expect(mapLmcWalletError(message, "lmc_spending_enabled")).toMatchObject({
        kind: "rejected",
        reason,
      });
    });
  }

  it("the DB kill-switch maps to disabled/database for its own flag", () => {
    expect(mapLmcWalletError("lmc_purchases_disabled", "lmc_purchases_enabled")).toEqual({
      kind: "disabled",
      flag: "lmc_purchases_enabled",
      layer: "database",
    });
    expect(mapLmcWalletError("lmc_spending_disabled", "lmc_spending_enabled")).toEqual({
      kind: "disabled",
      flag: "lmc_spending_enabled",
      layer: "database",
    });
  });

  it("an unknown error degrades to rejected/error with bounded detail", () => {
    const out = mapLmcWalletError("x".repeat(500), "lmc_spending_enabled");
    expect(out).toMatchObject({ kind: "rejected", reason: "error" });
    if (out.kind === "rejected") expect(out.detail!.length).toBeLessThanOrEqual(200);
  });

  it("a DB refusal through the composed caller is never a success", async () => {
    flags.purchases = true;
    flags.spending = true;
    const p = await recordLmcPurchase(
      PURCHASE,
      client({ lmc_record_purchase_v1: { data: null, error: { message: "lmc_purchases_disabled" } } }),
    );
    expect(p).toEqual({ kind: "disabled", flag: "lmc_purchases_enabled", layer: "database" });
    const s = await spendLmc(
      SPEND,
      client({ lmc_spend_v1: { data: null, error: { message: "lmc_insufficient_balance" } } }),
    );
    expect(s).toMatchObject({ kind: "rejected", reason: "insufficient_balance" });
  });

  it("a malformed or wrong-kind payload is an error, not an acknowledgement", () => {
    for (const bad of [null, {}, { transaction_id: TX }, { ...ok("spend", 5).data as object, kind: "purchased" }]) {
      expect(parseLmcLedgerPayload(bad, "spend")).toMatchObject({
        kind: "rejected",
        reason: "error",
      });
    }
  });
});

describe("idempotent replay", () => {
  it("already_processed surfaces as replay=true for purchase and spend", async () => {
    flags.purchases = true;
    flags.spending = true;
    expect(
      await recordLmcPurchase(PURCHASE, client({ lmc_record_purchase_v1: ok("purchased", 2_500, true) })),
    ).toMatchObject({ kind: "recorded", replay: true });
    expect(
      await spendLmc(SPEND, client({ lmc_spend_v1: ok("spend", 500, true) })),
    ).toMatchObject({ kind: "spent", replay: true });
  });

  it("a replayed spend does NOT re-run the action and does not compensate", async () => {
    flags.spending = true;
    flags.compensation = true;
    const c = client({ lmc_spend_v1: ok("spend", 500, true) });
    const action = vi.fn(async () => "delivered");
    const out = await spendLmcForAction({ ...SPEND, actionLabel: "match" }, action, c);
    expect(out.kind).toBe("spend_replayed");
    expect(action).not.toHaveBeenCalled();
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("spendLmcForAction — spend paired with its remedy", () => {
  beforeEach(() => {
    flags.spending = true;
    flags.compensation = true;
  });

  it("completes: one spend, the action runs once with the ledger entry", async () => {
    const c = client({ lmc_spend_v1: ok("spend", 500) });
    const action = vi.fn(async () => "delivered");
    const out = await spendLmcForAction({ ...SPEND, actionLabel: "match" }, action, c);
    expect(out).toMatchObject({ kind: "completed", result: "delivered" });
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: TX, amountCents: 500 }),
    );
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });

  it("an action failure compensates the exact spend and reports creditReturned", async () => {
    const c = client({
      lmc_spend_v1: ok("spend", 500),
      lmc_compensate_spend_v1: {
        data: {
          transaction_id: COMP_TX,
          account_id: ACCOUNT,
          kind: "spend_compensation",
          amount_cents: 500,
          expires_at: null,
          already_processed: false,
        },
        error: null,
      },
    });
    const out = await spendLmcForAction(
      { ...SPEND, actionLabel: "match" },
      async () => {
        throw new Error("upstream timeout");
      },
      c,
    );
    expect(out).toMatchObject({
      kind: "action_failed",
      creditReturned: true,
      actionError: "upstream timeout",
    });
    expect(c.rpc).toHaveBeenNthCalledWith(2, "lmc_compensate_spend_v1", {
      p_original_transaction_id: TX,
      p_reason: "action failed: match",
      p_idempotency_key: compensationKeyFor(SPEND.idempotencyKey),
      p_actor_profile_id: ACTOR,
    });
  });

  it("a refused compensation is reported as creditReturned=false, never hidden", async () => {
    const c = client({
      lmc_spend_v1: ok("spend", 500),
      lmc_compensate_spend_v1: { data: null, error: { message: "lmc_compensation_disabled" } },
    });
    const out = await spendLmcForAction(
      { ...SPEND, actionLabel: "match" },
      async () => {
        throw new Error("boom");
      },
      c,
    );
    expect(out).toMatchObject({
      kind: "action_failed",
      creditReturned: false,
      compensation: { ok: false, reason: "compensation_disabled" },
    });
  });

  it("a failed spend never runs the action and never compensates", async () => {
    const c = client({
      lmc_spend_v1: { data: null, error: { message: "lmc_insufficient_balance" } },
    });
    const action = vi.fn(async () => "delivered");
    const out = await spendLmcForAction({ ...SPEND, actionLabel: "match" }, action, c);
    expect(out).toMatchObject({ kind: "rejected", reason: "insufficient_balance" });
    expect(action).not.toHaveBeenCalled();
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(c.rpc).not.toHaveBeenCalledWith("lmc_compensate_spend_v1", expect.anything());
  });

  it("the derived compensation key fits the compensation RPC's 120-char bound", () => {
    expect(compensationKeyFor("k".repeat(100)).length).toBeLessThanOrEqual(120);
  });
});
