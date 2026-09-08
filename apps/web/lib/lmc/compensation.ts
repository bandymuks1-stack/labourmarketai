import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Typed server-side caller for `lmc_compensate_spend_v1` — the PREPARED SEAM
 * for "a spend's action failed, give the credit back".
 *
 * THE RPC IS LIVE, THE CALLER WAS NOT. `lmc_compensate_spend_v1` was applied
 * to production on 2026-08-28 (ledger 20260828155923, repo migration
 * 20260828090000_lmc_spend_compensation_v1.sql) with a full invariant suite —
 * only a spend, never more than was spent, idempotent by key, actor must own
 * the account or be an admin, restored value keeps the expiry it had. And no
 * TypeScript in the product could reach it: `lib/supabase/types.ts` predates
 * the migration and carries no generated signature. This module is that
 * missing caller and NOTHING more.
 *
 * WHY THE SERVICE-ROLE CLIENT. The migration grants EXECUTE to `service_role`
 * ONLY (revoked from public, anon and authenticated) — a deliberate posture
 * for a credit-creating SECURITY DEFINER function. So this wrapper runs on the
 * admin client, is `server-only`, and REQUIRES an explicit
 * `actorProfileId`: the RPC refuses a null actor (`lmc_actor_required`) and
 * re-checks that the actor owns the affected account or is an admin. The
 * service key gets this function past the front door; it does not get it past
 * the authority check.
 *
 * WHY NO CALL SITE YET. The product never calls `lmc_spend_v1` today — no
 * spend exists, so no spend-failure path exists to wire this into. The seam
 * ships typed and tested so the FIRST spend caller can pair its failure path
 * with compensation instead of shipping the same irreversible-spend gap the
 * audit flagged (LMC_READY blocker: spend without a reversal path).
 *
 * TYPE BOUNDARY, NOT A PRIVILEGE BOUNDARY. The generated `Database` type does
 * not know this RPC; the narrow structural cast below adds ONLY the missing
 * signature (the same pattern lib/lmc/lmc-account.ts documents for
 * post-generation objects). It widens no privilege — the grants above are the
 * authority.
 */

/** Mirrors the RPC's parameter list (5 args, ledger-proven signature). */
interface CompensateRpcArgs {
  p_original_transaction_id: string;
  p_reason: string;
  p_idempotency_key: string;
  p_actor_profile_id: string;
  p_amount_cents?: number;
}

type RpcResponse = { data: unknown; error: { message?: string } | null };

/** The narrow shape this module needs from a Supabase client. */
export interface CompensationRpcClient {
  rpc(fn: "lmc_compensate_spend_v1", args: CompensateRpcArgs): PromiseLike<RpcResponse>;
}

export type LmcCompensationReason =
  | "compensation_disabled"
  | "original_not_found"
  | "not_a_spend"
  | "already_compensated"
  | "over_compensation"
  | "invalid_amount"
  | "reason_required"
  | "actor_invalid"
  | "actor_not_authorized"
  | "idempotency_conflict"
  | "rpc_absent"
  | "error";

export type LmcCompensationOutcome =
  | {
      ok: true;
      transactionId: string;
      accountId: string;
      amountCents: number;
      /** The restored lot's expiry (mirrors what the spend consumed); null = permanent. */
      expiresAt: string | null;
      /** True when the ledger answered an idempotent retry with the ORIGINAL transaction. */
      replay: boolean;
    }
  | { ok: false; reason: LmcCompensationReason; detail?: string };

/**
 * Map the ledger's canonical error text onto a stable reason code. The ledger
 * raises named errors (`lmc_*`) by contract; anything unrecognised degrades to
 * "error" with a bounded detail — never a fabricated success.
 */
export function mapLmcCompensationError(
  message: string,
): LmcCompensationOutcome & { ok: false } {
  const m = message.toLowerCase();
  // lmc_require_flag_v1 raises replace(key, '_enabled', '_disabled').
  if (m.includes("lmc_compensation_disabled")) {
    return { ok: false, reason: "compensation_disabled" };
  }
  if (m.includes("lmc_original_not_found")) {
    return { ok: false, reason: "original_not_found" };
  }
  if (m.includes("lmc_not_a_spend")) return { ok: false, reason: "not_a_spend" };
  if (m.includes("lmc_already_compensated")) {
    return { ok: false, reason: "already_compensated" };
  }
  if (m.includes("lmc_over_compensation")) {
    return { ok: false, reason: "over_compensation" };
  }
  if (m.includes("lmc_invalid_amount")) return { ok: false, reason: "invalid_amount" };
  if (m.includes("lmc_reason_required")) return { ok: false, reason: "reason_required" };
  if (m.includes("lmc_actor_required") || m.includes("lmc_unknown_actor")) {
    return { ok: false, reason: "actor_invalid" };
  }
  if (m.includes("lmc_actor_not_authorized")) {
    return { ok: false, reason: "actor_not_authorized" };
  }
  if (
    m.includes("lmc_idempotency_conflict") ||
    m.includes("lmc_reserved_idempotency_key")
  ) {
    return { ok: false, reason: "idempotency_conflict" };
  }
  if (m.includes("does not exist") || m.includes("undefined function")) {
    return { ok: false, reason: "rpc_absent" };
  }
  return { ok: false, reason: "error", detail: message.slice(0, 200) };
}

/**
 * Parse the RPC's jsonb payload into the outcome shape. The ledger returns
 * `{transaction_id, account_id, kind, amount_cents, expires_at,
 * already_processed}`; a payload missing its transaction id is treated as an
 * error rather than acknowledged as a compensation that cannot be pointed at.
 */
export function parseCompensationPayload(data: unknown): LmcCompensationOutcome {
  const payload = (data ?? {}) as Record<string, unknown>;
  const txId =
    typeof payload.transaction_id === "string" && payload.transaction_id.length > 0
      ? payload.transaction_id
      : null;
  const accountId =
    typeof payload.account_id === "string" && payload.account_id.length > 0
      ? payload.account_id
      : null;
  if (!txId || !accountId) {
    return { ok: false, reason: "error", detail: "malformed_rpc_payload" };
  }
  return {
    ok: true,
    transactionId: txId,
    accountId,
    amountCents: Number(payload.amount_cents ?? 0),
    expiresAt:
      typeof payload.expires_at === "string" && payload.expires_at.length > 0
        ? payload.expires_at
        : null,
    replay: payload.already_processed === true,
  };
}

export interface CompensateSpendInput {
  /** The `lmc_transactions.id` of the SPEND being compensated. */
  readonly originalTransactionId: string;
  /** Stored verbatim in the ledger as WHY the value came back (3–300 chars). */
  readonly reason: string;
  /** Caller-supplied so a retry is provably the SAME compensation. */
  readonly idempotencyKey: string;
  /** WHO authorised it — must own the account or be an admin (RPC-enforced). */
  readonly actorProfileId: string;
  /** Omit to make the user whole (the RPC computes the remaining maximum). */
  readonly amountCents?: number;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shape-validate before the network — the RPC stays the authority. */
export function validateCompensateSpendInput(
  input: CompensateSpendInput,
): (LmcCompensationOutcome & { ok: false }) | null {
  if (!UUID_RE.test(input.originalTransactionId)) {
    return { ok: false, reason: "original_not_found", detail: "invalid_uuid" };
  }
  if (!UUID_RE.test(input.actorProfileId)) {
    return { ok: false, reason: "actor_invalid", detail: "invalid_uuid" };
  }
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 300) {
    return { ok: false, reason: "reason_required" };
  }
  if (input.idempotencyKey.trim().length < 8 || input.idempotencyKey.length > 120) {
    return { ok: false, reason: "idempotency_conflict", detail: "invalid_key" };
  }
  if (
    input.amountCents !== undefined &&
    (!Number.isInteger(input.amountCents) || input.amountCents <= 0)
  ) {
    return { ok: false, reason: "invalid_amount" };
  }
  return null;
}

/**
 * Compensate a failed spend through the production-proven ledger RPC.
 * Idempotent by key; never credits more than the spend across any number of
 * calls (both enforced by the RPC, not re-derived here).
 */
export async function compensateSpend(
  input: CompensateSpendInput,
  client?: CompensationRpcClient,
): Promise<LmcCompensationOutcome> {
  const invalid = validateCompensateSpendInput(input);
  if (invalid) return invalid;

  // TYPE boundary only (see module header): the generated Database type
  // predates this RPC; the cast adds the one missing signature.
  const sb =
    client ?? (createAdminClient() as unknown as CompensationRpcClient);

  const args: CompensateRpcArgs = {
    p_original_transaction_id: input.originalTransactionId,
    p_reason: input.reason.trim(),
    p_idempotency_key: input.idempotencyKey.trim(),
    p_actor_profile_id: input.actorProfileId,
  };
  if (input.amountCents !== undefined) args.p_amount_cents = input.amountCents;

  const { data, error } = await sb.rpc("lmc_compensate_spend_v1", args);
  if (error) return mapLmcCompensationError(error.message ?? "error");
  return parseCompensationPayload(data);
}
