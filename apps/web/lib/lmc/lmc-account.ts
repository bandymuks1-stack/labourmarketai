import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * THE read layer for "how much LMC do I have, and what happened to it".
 *
 * WHY THIS FILE EXISTS. The LMC ledger was built, hardened and proven on
 * production — top-up credits, idempotent replay, spend debits, overspend
 * refused with the balance unchanged, a foreign actor refused, refund clawback,
 * append-only enforced. And a user could not see a single number of it. There
 * was NO application code reading the ledger at all: `lib/billing/lmc-flags.ts`
 * holds constants, `lib/supabase/types.ts` holds generated row types, and that
 * was the entire footprint. A backend nobody can reach is not a capability.
 *
 * WHAT IT IS NOT. It is not a second balance. The number here is computed by
 * the database view `lmc_account_balances`, which sums SPENDABLE lot remainders
 * (an expired lot contributes zero) — the same arithmetic `lmc_spend_v1`
 * enforces when it decides whether a spend is affordable. The client never adds
 * anything up and never holds an authoritative figure; if the two ever
 * disagreed, the ledger is right and this is the bug.
 *
 * AUTHORISATION IS THE DATABASE'S, NOT THIS MODULE'S. Every read below runs as
 * the signed-in user through the ordinary client, so `lmc_accounts_select`,
 * `lmc_transactions_select` and the security-invoker views decide what comes
 * back. This module adds no filter RLS does not already enforce, and could not
 * widen one if it tried. That is why any future client — web, Android, iOS, an
 * MCP tool — can sit on exactly this shape without re-deriving the rules.
 *
 * NO WRITES. Not one. Ledger writes are RPC-only by construction: there is no
 * INSERT/UPDATE/DELETE policy on any LMC table, and even service_role is
 * revoked from writing them.
 */

/**
 * The unit label, deliberately NOT in the message catalogue.
 *
 * "LMC" is language-invariant, the same way a currency code is — and the
 * untranslated-string ratchet is right to flag a catalogue key that is
 * byte-identical to English in every locale, because that is exactly what an
 * untranslated string looks like. The repository already draws this line for
 * `NATIVE_LOCALE_NAMES` ("language-invariant, so not in the i18n bundle"); this
 * follows it rather than teaching the ratchet an exception.
 *
 * The peg it names is canonical: 1 LMC = 1 EUR of internal platform credit,
 * stored as bigint LMC-cents (100 = 1 LMC), no floating point anywhere.
 */
export const LMC_UNIT_LABEL = "LMC" as const;

/** How many recent movements the surface shows before deferring. */
export const LMC_RECENT_LIMIT = 20;

/**
 * A movement, as a person reads it.
 *
 * `amountCents` is always POSITIVE. The ledger stores magnitudes and the KIND
 * carries the direction, so a surface that inferred a sign from the number
 * would be inventing one.
 */
export type LmcMovement = {
  readonly id: string;
  readonly kind: string;
  /** `credit` adds, `debit` removes. Derived from the kind, never from a sign. */
  readonly direction: "credit" | "debit";
  readonly amountCents: number;
  readonly currency: string;
  /** The ledger's own stored reason. Shown verbatim; never rewritten. */
  readonly reason: string;
  readonly createdAt: string;
  /** Set on kinds that answer an earlier transaction (reversals, compensation). */
  readonly originalTransactionId: string | null;
};

export type LmcAccountView =
  | {
      readonly state: "ready";
      readonly accountId: string;
      readonly availableCents: number;
      readonly purchasedCents: number;
      readonly promotionalCents: number;
      /**
       * Value that WAS granted and has since expired. Surfaced because a
       * balance that silently shrank is the thing people write in asking about.
       */
      readonly expiredRemainderCents: number;
      readonly movements: readonly LmcMovement[];
    }
  /**
   * No account row exists yet — the ordinary state for almost everyone on the
   * platform, because an account is created by the first service-side monetary
   * event. NOT an error and NOT a failed read: it means nothing has ever
   * happened, and the surface says exactly that.
   */
  | { readonly state: "no_account" }
  /**
   * The read FAILED. Kept distinct from every zero above on purpose. Reporting
   * a failed balance read as "you have 0 LMC" is the same defect class as
   * reporting a failed roles read as "you do not hold this role" (#1314): a
   * missing answer rendered as a factual one. The surface must say it could not
   * read — never a number it does not have.
   */
  | { readonly state: "unavailable"; readonly reason: string };

/**
 * Which kinds ADD value and which REMOVE it.
 *
 * Spelled out rather than inferred, because the ledger's vocabulary does not
 * split on the word: `reversal`, `refund_reversal` and `chargeback_reversal`
 * CONSUME a credit lot (they take value away), while `spend_compensation`
 * CREATES one (it gives value back). A reader that grouped everything
 * containing "revers" would have the sign backwards on exactly the
 * transactions people ask about most.
 */
const CREDIT_KINDS: ReadonlySet<string> = new Set([
  "purchased",
  "promotional_signup",
  "promotional_activity",
  "admin_grant",
  "referral_reward",
  "spend_compensation",
]);

export function lmcDirectionOf(kind: string): "credit" | "debit" {
  return CREDIT_KINDS.has(kind) ? "credit" : "debit";
}

type MovementRow = {
  id: string;
  kind: string;
  amount_cents: number;
  currency: string;
  reason: string;
  created_at: string;
  original_transaction_id: string | null;
};

/**
 * Read the signed-in person's OWN LMC account.
 *
 * Personal subject only. A company's account belongs to the company surface and
 * would need the workspace resolver to say which company is being acted for —
 * guessing would put one organisation's money on another's screen.
 */
export async function readOwnLmcAccount(): Promise<LmcAccountView> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) return { state: "unavailable", reason: "session_read_failed" };
  if (!user) return { state: "unavailable", reason: "not_authenticated" };

  // The LMC views are not in the generated `Database` type as selectable
  // relations with these projections; the boundary cast is the same pattern
  // lib/demand uses for post-generation objects. It is a TYPE boundary only —
  // it does not widen a single privilege.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const balance = await sb
    .from("lmc_account_balances")
    .select(
      "account_id, available_cents, purchased_available_cents, promotional_available_cents, expired_remainder_cents",
    )
    .eq("profile_id", user.id)
    .maybeSingle();

  // The error is CHECKED before the data is read. `data ?? []` on an errored
  // query is how a broken read starts telling a user a fact about themselves.
  if (balance.error) {
    console.error("[lmc] balance read failed:", balance.error.message);
    return { state: "unavailable", reason: "balance_read_failed" };
  }
  if (!balance.data?.account_id) return { state: "no_account" };

  const accountId = String(balance.data.account_id);

  const movements = await sb
    .from("lmc_transactions")
    .select(
      "id, kind, amount_cents, currency, reason, created_at, original_transaction_id",
    )
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(LMC_RECENT_LIMIT);

  if (movements.error) {
    console.error("[lmc] movement read failed:", movements.error.message);
    return { state: "unavailable", reason: "movements_read_failed" };
  }

  return {
    state: "ready",
    accountId,
    availableCents: Number(balance.data.available_cents ?? 0),
    purchasedCents: Number(balance.data.purchased_available_cents ?? 0),
    promotionalCents: Number(balance.data.promotional_available_cents ?? 0),
    expiredRemainderCents: Number(balance.data.expired_remainder_cents ?? 0),
    movements: ((movements.data ?? []) as MovementRow[]).map(
      (r): LmcMovement => ({
        id: String(r.id),
        kind: String(r.kind),
        direction: lmcDirectionOf(String(r.kind)),
        amountCents: Number(r.amount_cents ?? 0),
        currency: String(r.currency ?? "EUR"),
        reason: String(r.reason ?? ""),
        createdAt: String(r.created_at),
        originalTransactionId: r.original_transaction_id
          ? String(r.original_transaction_id)
          : null,
      }),
    ),
  };
}
