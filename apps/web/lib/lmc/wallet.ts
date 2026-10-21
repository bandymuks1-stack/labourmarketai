import "server-only";

import {
  LMC_COMPENSATION_ENABLED,
  LMC_PURCHASES_ENABLED,
  LMC_SPENDING_ENABLED,
} from "@/lib/billing/lmc-flags";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  compensateSpend,
  type CompensationRpcClient,
  type LmcCompensationOutcome,
} from "@/lib/lmc/compensation";

/**
 * LMC WALLET SERVER LAYER — Wagon 2 of the LMC Commercial System Train
 * (docs/product/lmc-commercial-system-train-v1.md), built under the owner
 * order of 2026-10-21: "build and test the purchase, spend and ledger flows
 * behind the flags, and leave them OFF until the owner approves."
 *
 * WHAT THIS IS. The typed server-side callers for the two production-applied
 * ledger RPCs nothing in the product reached yet:
 *   - `lmc_record_purchase_v1(p_amount_cents bigint, p_reference text,
 *      p_idempotency_key text, p_profile_id uuid = null, p_company_id uuid = null)`
 *   - `lmc_spend_v1(p_amount_cents bigint, p_reason text, p_idempotency_key text,
 *      p_profile_id uuid = null, p_company_id uuid = null,
 *      p_actor_profile_id uuid = null)`
 * plus `spendLmcForAction`, which pairs a spend with the existing
 * `compensateSpend` seam so a charged action that fails gives the credit back.
 *
 * WHAT THIS IS NOT. Not a Stripe top-up (Wagon 4 — a settled top-up will call
 * `recordLmcPurchase` from the signature-verified webhook, never from a
 * redirect), not a UI (Wagon 7), not an activation (Wagon 8). No call site in
 * the product reaches this module yet.
 *
 * TWO KILL-SWITCH LAYERS, BOTH OFF. Every entry point checks its TS flag
 * (`lib/billing/lmc-flags.ts`, literal `false as const`) FIRST and returns
 * `{ kind: "disabled", layer: "code" }` without constructing a client or
 * touching the network. Behind it, the RPC re-checks the `lmc_settings` row
 * (`lmc_require_flag_v1`, fail-closed), surfaced as `layer: "database"`.
 * Pinned by lib/guards/lmc-wallet-flags-off.test.ts.
 *
 * WHY THE SERVICE-ROLE CLIENT. Migration 20261006100300 (applied) revokes
 * EXECUTE on both RPCs from public/anon/authenticated and grants it to
 * `service_role` ONLY. The service key opens the front door, not the authority
 * check: `lmc_spend_v1` re-verifies that the actor owns the debited account or
 * is an admin. `lmc_record_purchase_v1` does NOT authenticate a caller at all —
 * which is exactly why its only legitimate future caller is a server-verified
 * payment settlement, and why nothing browser-reachable may ever pass a
 * caller-supplied amount or reference into it.
 *
 * SUBJECT MODEL. The ledger keys an account on a person (`profiles.id`) XOR a
 * company (`companies.id`) — the RPCs' real parameters. Aligning that with the
 * canonical billing subject (`profile | organization`) is an open design task
 * of the Commercial Train (train doc, header note); this layer mirrors the
 * ledger as it is and invents no mapping.
 *
 * HONEST DEGRADATION. Every ledger error maps to a stable typed result; an
 * unknown error is `rejected/error` with a bounded detail; a malformed payload
 * is an error, never an acknowledgement. Nothing here reports a credit or a
 * debit that the ledger did not confirm.
 */

/** The RPC's own amount ceiling (both RPCs: `p_amount_cents > 100000000` refused). */
export const LMC_WALLET_MAX_AMOUNT_CENTS = 100_000_000;

/** The purchase RPC's reference ceiling (`char_length(p_reference) > 200` refused). */
export const LMC_PURCHASE_REFERENCE_MAX = 200;

/** Bounded so a derived compensation key (`<key>:compensation`) stays ≤ 120. */
export const LMC_WALLET_IDEMPOTENCY_KEY_MAX = 100;
const LMC_WALLET_IDEMPOTENCY_KEY_MIN = 8;

/** Spend reasons are stored verbatim and are part of the replay fingerprint. */
export const LMC_SPEND_REASON_MAX = 300;

/** System-reserved key namespace (`lmc_assert_external_idempotency_key_v1`). */
const RESERVED_KEY_PREFIX = "lmc-expiry:";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Exactly one ledger subject — person XOR company, as `lmc_accounts` holds it. */
export type LmcWalletSubject =
  | { readonly type: "person"; readonly profileId: string }
  | { readonly type: "company"; readonly companyId: string };

/** Mirrors `lmc_record_purchase_v1`'s parameter list (subject key: exactly one). */
export interface RecordPurchaseRpcArgs {
  p_amount_cents: number;
  p_reference: string;
  p_idempotency_key: string;
  p_profile_id?: string;
  p_company_id?: string;
}

/** Mirrors `lmc_spend_v1`'s parameter list (subject key: exactly one). */
export interface SpendRpcArgs {
  p_amount_cents: number;
  p_reason: string;
  p_idempotency_key: string;
  p_profile_id?: string;
  p_company_id?: string;
  p_actor_profile_id: string;
}

type RpcResponse = { data: unknown; error: { message?: string } | null };

/**
 * The narrow client shape this module needs. TYPE boundary only: the generated
 * `Database` type predates these signatures; the cast adds them and widens no
 * privilege — the grants in 20261006100300 are the authority.
 */
export interface LmcWalletRpcClient extends CompensationRpcClient {
  rpc(fn: "lmc_record_purchase_v1", args: RecordPurchaseRpcArgs): PromiseLike<RpcResponse>;
  rpc(fn: "lmc_spend_v1", args: SpendRpcArgs): PromiseLike<RpcResponse>;
  rpc(
    fn: "lmc_compensate_spend_v1",
    args: Parameters<CompensationRpcClient["rpc"]>[1],
  ): PromiseLike<RpcResponse>;
}

export type LmcWalletFlag =
  | "lmc_purchases_enabled"
  | "lmc_spending_enabled"
  | "lmc_compensation_enabled";

/** A kill-switch refused the operation. `code` = TS constant, `database` = lmc_settings. */
export type LmcWalletDisabled = {
  readonly kind: "disabled";
  readonly flag: LmcWalletFlag;
  readonly layer: "code" | "database";
};

export type LmcWalletRejectionReason =
  | "invalid_amount"
  | "reference_required"
  | "reason_required"
  | "invalid_subject"
  | "unknown_subject"
  | "actor_invalid"
  | "actor_not_authorized"
  | "insufficient_balance"
  | "idempotency_conflict"
  | "rpc_absent"
  | "error";

export type LmcWalletRejected = {
  readonly kind: "rejected";
  readonly reason: LmcWalletRejectionReason;
  readonly detail?: string;
};

/** What the ledger confirmed. `replay` = the RPC answered with the ORIGINAL entry. */
export type LmcLedgerEntry = {
  readonly transactionId: string;
  readonly accountId: string;
  readonly amountCents: number;
  readonly replay: boolean;
};

export type LmcPurchaseOutcome =
  | ({ readonly kind: "recorded" } & LmcLedgerEntry)
  | LmcWalletDisabled
  | LmcWalletRejected;

export type LmcSpendOutcome =
  | ({ readonly kind: "spent" } & LmcLedgerEntry)
  | LmcWalletDisabled
  | LmcWalletRejected;

/**
 * Map the ledger's canonical error text onto a typed result. The RPCs raise
 * named `lmc_*` errors by contract; the kill-switch raises
 * `replace(key, '_enabled', '_disabled')`.
 */
export function mapLmcWalletError(
  message: string,
  flag: LmcWalletFlag,
): LmcWalletDisabled | LmcWalletRejected {
  const m = message.toLowerCase();
  const reject = (reason: LmcWalletRejectionReason): LmcWalletRejected => ({
    kind: "rejected",
    reason,
  });
  if (m.includes(flag.replace("_enabled", "_disabled"))) {
    return { kind: "disabled", flag, layer: "database" };
  }
  if (m.includes("lmc_insufficient_balance")) return reject("insufficient_balance");
  if (m.includes("lmc_invalid_amount")) return reject("invalid_amount");
  if (m.includes("lmc_reference_required")) return reject("reference_required");
  if (m.includes("lmc_reason_required")) return reject("reason_required");
  if (m.includes("lmc_invalid_subject")) return reject("invalid_subject");
  if (m.includes("lmc_unknown_profile") || m.includes("lmc_unknown_company")) {
    return reject("unknown_subject");
  }
  if (m.includes("lmc_actor_required") || m.includes("lmc_unknown_actor")) {
    return reject("actor_invalid");
  }
  if (m.includes("lmc_actor_not_authorized")) return reject("actor_not_authorized");
  if (
    m.includes("lmc_idempotency_conflict") ||
    m.includes("lmc_reserved_idempotency_key")
  ) {
    return reject("idempotency_conflict");
  }
  if (m.includes("does not exist") || m.includes("undefined function")) {
    return reject("rpc_absent");
  }
  return { kind: "rejected", reason: "error", detail: message.slice(0, 200) };
}

/**
 * Parse the RPCs' jsonb payload `{transaction_id, account_id, kind,
 * amount_cents, already_processed}`. A payload without ids, or of a different
 * kind than the operation, is an error — never a confirmed movement.
 */
export function parseLmcLedgerPayload(
  data: unknown,
  expectedKind: "purchased" | "spend",
): LmcLedgerEntry | LmcWalletRejected {
  const p = (data ?? {}) as Record<string, unknown>;
  const txId = typeof p.transaction_id === "string" ? p.transaction_id : "";
  const accountId = typeof p.account_id === "string" ? p.account_id : "";
  const amount = Number(p.amount_cents);
  if (!txId || !accountId || p.kind !== expectedKind || !Number.isSafeInteger(amount)) {
    return { kind: "rejected", reason: "error", detail: "malformed_rpc_payload" };
  }
  return {
    transactionId: txId,
    accountId,
    amountCents: amount,
    replay: p.already_processed === true,
  };
}

function validateAmount(amountCents: number): LmcWalletRejected | null {
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    amountCents > LMC_WALLET_MAX_AMOUNT_CENTS
  ) {
    return { kind: "rejected", reason: "invalid_amount" };
  }
  return null;
}

function validateKey(key: string): LmcWalletRejected | null {
  const k = key.trim();
  if (
    k.length < LMC_WALLET_IDEMPOTENCY_KEY_MIN ||
    k.length > LMC_WALLET_IDEMPOTENCY_KEY_MAX ||
    k.startsWith(RESERVED_KEY_PREFIX)
  ) {
    return { kind: "rejected", reason: "idempotency_conflict", detail: "invalid_key" };
  }
  return null;
}

function validateSubject(subject: LmcWalletSubject): LmcWalletRejected | null {
  const id = subject.type === "person" ? subject.profileId : subject.companyId;
  if (!UUID_RE.test(id)) {
    return { kind: "rejected", reason: "invalid_subject", detail: "invalid_uuid" };
  }
  return null;
}

function subjectArgs(
  subject: LmcWalletSubject,
): { p_profile_id: string } | { p_company_id: string } {
  return subject.type === "person"
    ? { p_profile_id: subject.profileId }
    : { p_company_id: subject.companyId };
}

function walletClient(client?: LmcWalletRpcClient): LmcWalletRpcClient {
  // TYPE boundary only (see module header).
  return client ?? (createAdminClient() as unknown as LmcWalletRpcClient);
}

// ── Purchase ────────────────────────────────────────────────────────────────

export interface RecordLmcPurchaseInput {
  readonly subject: LmcWalletSubject;
  /** LMC-cents (100 = 1 LMC = 1 EUR of internal credit); positive integer. */
  readonly amountCents: number;
  /** The settled payment's provider reference (e.g. a TEST-mode payment id). */
  readonly providerReference: string;
  /** Caller-supplied so a retried settlement is provably the SAME purchase. */
  readonly idempotencyKey: string;
}

export function validateRecordLmcPurchaseInput(
  input: RecordLmcPurchaseInput,
): LmcWalletRejected | null {
  const amount = validateAmount(input.amountCents);
  if (amount) return amount;
  const ref = input.providerReference.trim();
  if (ref.length === 0 || ref.length > LMC_PURCHASE_REFERENCE_MAX) {
    return { kind: "rejected", reason: "reference_required" };
  }
  return validateKey(input.idempotencyKey) ?? validateSubject(input.subject);
}

/**
 * Record a SETTLED LMC top-up as purchased (non-expiring) credit. Code flag
 * first — while `LMC_PURCHASES_ENABLED` is false (it is) no client is built
 * and no RPC is called.
 */
export async function recordLmcPurchase(
  input: RecordLmcPurchaseInput,
  client?: LmcWalletRpcClient,
): Promise<LmcPurchaseOutcome> {
  if (!LMC_PURCHASES_ENABLED) {
    return { kind: "disabled", flag: "lmc_purchases_enabled", layer: "code" };
  }
  const invalid = validateRecordLmcPurchaseInput(input);
  if (invalid) return invalid;

  const args: RecordPurchaseRpcArgs = {
    p_amount_cents: input.amountCents,
    p_reference: input.providerReference.trim(),
    p_idempotency_key: input.idempotencyKey.trim(),
    ...subjectArgs(input.subject),
  };
  const { data, error } = await walletClient(client).rpc("lmc_record_purchase_v1", args);
  if (error) return mapLmcWalletError(error.message ?? "error", "lmc_purchases_enabled");
  const entry = parseLmcLedgerPayload(data, "purchased");
  if ("kind" in entry) return entry;
  return { kind: "recorded", ...entry };
}

// ── Spend ───────────────────────────────────────────────────────────────────

export interface SpendLmcInput {
  readonly subject: LmcWalletSubject;
  /** LMC-cents; positive integer. */
  readonly amountCents: number;
  /** Stored verbatim as WHY value left the account; part of the replay fingerprint. */
  readonly reason: string;
  /** Caller-supplied so a retry is provably the SAME spend. */
  readonly idempotencyKey: string;
  /** WHO initiated it — must own the debited account or be an admin (RPC-enforced). */
  readonly actorProfileId: string;
}

export function validateSpendLmcInput(input: SpendLmcInput): LmcWalletRejected | null {
  const amount = validateAmount(input.amountCents);
  if (amount) return amount;
  const reason = input.reason.trim();
  if (reason.length === 0 || reason.length > LMC_SPEND_REASON_MAX) {
    return { kind: "rejected", reason: "reason_required" };
  }
  if (!UUID_RE.test(input.actorProfileId)) {
    return { kind: "rejected", reason: "actor_invalid", detail: "invalid_uuid" };
  }
  return validateKey(input.idempotencyKey) ?? validateSubject(input.subject);
}

/**
 * Debit LMC through the ledger (promotional/expiring value first, never below
 * zero — both enforced by the RPC). Code flag first — while
 * `LMC_SPENDING_ENABLED` is false (it is) no client is built and no RPC runs.
 */
export async function spendLmc(
  input: SpendLmcInput,
  client?: LmcWalletRpcClient,
): Promise<LmcSpendOutcome> {
  if (!LMC_SPENDING_ENABLED) {
    return { kind: "disabled", flag: "lmc_spending_enabled", layer: "code" };
  }
  const invalid = validateSpendLmcInput(input);
  if (invalid) return invalid;

  const args: SpendRpcArgs = {
    p_amount_cents: input.amountCents,
    p_reason: input.reason.trim(),
    p_idempotency_key: input.idempotencyKey.trim(),
    ...subjectArgs(input.subject),
    p_actor_profile_id: input.actorProfileId,
  };
  const { data, error } = await walletClient(client).rpc("lmc_spend_v1", args);
  if (error) return mapLmcWalletError(error.message ?? "error", "lmc_spending_enabled");
  const entry = parseLmcLedgerPayload(data, "spend");
  if ("kind" in entry) return entry;
  return { kind: "spent", ...entry };
}

// ── Spend paired with its remedy ────────────────────────────────────────────

/** The compensation key derived from a spend key — deterministic, so retries converge. */
export function compensationKeyFor(spendIdempotencyKey: string): string {
  return `${spendIdempotencyKey.trim()}:compensation`;
}

export type LmcSpendForActionOutcome<T> =
  /** Charged and delivered. */
  | { readonly kind: "completed"; readonly spend: LmcLedgerEntry; readonly result: T }
  /**
   * The ledger answered with an EARLIER spend under this key. The action is NOT
   * re-run: that attempt may already have delivered — or failed and been
   * compensated — and running it again could deliver for free. The caller
   * resolves the earlier attempt's own outcome.
   */
  | { readonly kind: "spend_replayed"; readonly spend: LmcLedgerEntry }
  /** Charged, the action failed, and the credit was (or was not) returned. */
  | {
      readonly kind: "action_failed";
      readonly spend: LmcLedgerEntry;
      readonly creditReturned: boolean;
      readonly compensation: LmcCompensationOutcome;
      readonly actionError: string;
    }
  /** Nothing was charged; the action never ran. */
  | LmcWalletDisabled
  | LmcWalletRejected;

export interface SpendLmcForActionInput extends SpendLmcInput {
  /** Short label stored in the compensation reason if the action fails. */
  readonly actionLabel: string;
}

/**
 * Spend, run the paid action, and give the credit back if the action throws.
 *
 * Requires BOTH `LMC_SPENDING_ENABLED` and `LMC_COMPENSATION_ENABLED`: a charge
 * for an action is never taken unless the remedy for that action failing is
 * reachable — the "spend without a reversal path" blocker this train recorded.
 * While either is false (both are) nothing is called.
 */
export async function spendLmcForAction<T>(
  input: SpendLmcForActionInput,
  action: (spend: LmcLedgerEntry) => Promise<T>,
  client?: LmcWalletRpcClient,
): Promise<LmcSpendForActionOutcome<T>> {
  if (!LMC_SPENDING_ENABLED) {
    return { kind: "disabled", flag: "lmc_spending_enabled", layer: "code" };
  }
  if (!LMC_COMPENSATION_ENABLED) {
    return { kind: "disabled", flag: "lmc_compensation_enabled", layer: "code" };
  }
  const label = input.actionLabel.trim();
  if (label.length === 0 || label.length > 200) {
    return { kind: "rejected", reason: "reason_required", detail: "invalid_action_label" };
  }

  const sb = walletClient(client);
  const spent = await spendLmc(input, sb);
  if (spent.kind !== "spent") return spent;

  const spend: LmcLedgerEntry = {
    transactionId: spent.transactionId,
    accountId: spent.accountId,
    amountCents: spent.amountCents,
    replay: spent.replay,
  };
  if (spend.replay) return { kind: "spend_replayed", spend };

  try {
    const result = await action(spend);
    return { kind: "completed", spend, result };
  } catch (err) {
    const actionError = (err instanceof Error ? err.message : String(err)).slice(0, 200);
    const compensation = await compensateSpend(
      {
        originalTransactionId: spend.transactionId,
        reason: `action failed: ${label}`.slice(0, 300),
        idempotencyKey: compensationKeyFor(input.idempotencyKey),
        actorProfileId: input.actorProfileId,
      },
      sb,
    );
    return {
      kind: "action_failed",
      spend,
      creditReturned: compensation.ok,
      compensation,
      actionError,
    };
  }
}
