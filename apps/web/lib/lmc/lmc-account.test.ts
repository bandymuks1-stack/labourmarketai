import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A BALANCE NOBODY COULD READ IS NOT A BALANCE OF ZERO.
 *
 * The LMC ledger was proven correct on production and had no reader at all, so
 * the first reader is also the first chance to get its honesty wrong. There are
 * three outcomes here and they must never collapse into one number:
 *
 *   ready        — a real balance from the canonical view;
 *   no_account   — nothing has ever happened (the ordinary state);
 *   unavailable  — the read FAILED.
 *
 * Rendering the third as "0 LMC" is the same defect class as rendering a failed
 * `profile_roles` read as "you do not hold this role" (#1314): a missing answer
 * dressed as a factual one. On money it is worse, because a user who is told
 * they have nothing stops looking for what they had.
 */

type Answer = { data: unknown; error: unknown };

const USER = { id: "11111111-1111-4111-8111-111111111111" };

let userAnswer: { data: { user: unknown }; error: unknown };
let balanceAnswer: Answer;
let movementsAnswer: Answer;

/** Minimal PostgREST-shaped chain: every builder call returns itself, and the
 *  terminal (`maybeSingle` / awaiting the chain) yields the staged answer. */
function chainFor(table: string) {
  const answer = table === "lmc_account_balances" ? () => balanceAnswer : () => movementsAnswer;
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = async () => answer();
  // Awaiting the builder itself is how the movements read terminates.
  chain.then = (resolve: (v: Answer) => unknown) => Promise.resolve(answer()).then(resolve);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => userAnswer },
    from: (table: string) => chainFor(table),
  }),
}));

const { readOwnLmcAccount, lmcDirectionOf } = await import("./lmc-account");

const READ_FAILED = {
  data: null,
  error: { code: "57P01", message: "server closed the connection unexpectedly" },
};

const ACCOUNT_ROW = {
  account_id: "acc-1",
  available_cents: 1250,
  purchased_available_cents: 1000,
  promotional_available_cents: 250,
  expired_remainder_cents: 300,
};

describe("readOwnLmcAccount — the three outcomes stay three", () => {
  beforeEach(() => {
    userAnswer = { data: { user: USER }, error: null };
    balanceAnswer = { data: ACCOUNT_ROW, error: null };
    movementsAnswer = { data: [], error: null };
  });

  it("reports a real balance from the canonical view", async () => {
    movementsAnswer = {
      data: [
        {
          id: "t1",
          kind: "spend",
          amount_cents: 250,
          currency: "LMC",
          reason: "ai_run",
          created_at: "2026-08-27T10:00:00Z",
          original_transaction_id: null,
        },
      ],
      error: null,
    };
    const res = await readOwnLmcAccount();
    expect(res.state).toBe("ready");
    if (res.state !== "ready") return;
    expect(res.availableCents).toBe(1250);
    expect(res.purchasedCents).toBe(1000);
    expect(res.promotionalCents).toBe(250);
    expect(res.expiredRemainderCents).toBe(300);
    expect(res.movements).toHaveLength(1);
    expect(res.movements[0].direction).toBe("debit");
    // The ledger's own reason, carried through untouched.
    expect(res.movements[0].reason).toBe("ai_run");
  });

  it("a FAILED balance read is `unavailable`, never a zero balance", async () => {
    balanceAnswer = READ_FAILED;
    const res = await readOwnLmcAccount();
    expect(res.state).toBe("unavailable");
    // The decisive assertion: no numeric field exists to be rendered as 0.
    expect(res).not.toHaveProperty("availableCents");
  });

  it("a FAILED movement read is `unavailable`, never an empty history", async () => {
    movementsAnswer = READ_FAILED;
    const res = await readOwnLmcAccount();
    expect(res.state).toBe("unavailable");
    // Crucially NOT "ready with an empty list": a balance shown beside a
    // history that silently failed invites the reader to conclude nothing ever
    // happened to it.
    expect(res).not.toHaveProperty("movements");
  });

  it("no account row is `no_account`, which is not a failure either", async () => {
    balanceAnswer = { data: null, error: null };
    const res = await readOwnLmcAccount();
    expect(res).toEqual({ state: "no_account" });
  });

  it("a real balance of zero is still `ready` — a fact, not an absence", async () => {
    balanceAnswer = {
      data: {
        ...ACCOUNT_ROW,
        available_cents: 0,
        purchased_available_cents: 0,
        promotional_available_cents: 0,
      },
      error: null,
    };
    const res = await readOwnLmcAccount();
    expect(res.state).toBe("ready");
    if (res.state !== "ready") return;
    expect(res.availableCents).toBe(0);
  });

  it("a failed session read never becomes an anonymous zero", async () => {
    userAnswer = { data: { user: null }, error: { message: "jwt expired" } };
    const res = await readOwnLmcAccount();
    expect(res).toEqual({
      state: "unavailable",
      reason: "session_read_failed",
    });
  });
});

/**
 * Direction is read from the KIND, never from the sign of the amount — the
 * ledger stores magnitudes. And the vocabulary does not split on the word:
 * three `*reversal` kinds CONSUME a credit lot while `spend_compensation`
 * CREATES one, so any rule based on the substring "revers" has the sign
 * backwards on exactly the rows people ask about.
 */
describe("direction comes from the kind", () => {
  it("credits add", () => {
    for (const kind of [
      "purchased",
      "promotional_signup",
      "promotional_activity",
      "admin_grant",
      "referral_reward",
      "spend_compensation",
    ]) {
      expect(lmcDirectionOf(kind), kind).toBe("credit");
    }
  });

  it("debits remove — including all three reversal kinds", () => {
    for (const kind of [
      "spend",
      "expiry",
      "reversal",
      "refund_reversal",
      "chargeback_reversal",
    ]) {
      expect(lmcDirectionOf(kind), kind).toBe("debit");
    }
  });

  it("an unknown future kind is treated as a debit, never as free credit", () => {
    // Fail-closed: inventing a credit for a kind this build has never seen
    // would overstate what somebody holds.
    expect(lmcDirectionOf("kind_that_does_not_exist_yet")).toBe("debit");
  });
});
