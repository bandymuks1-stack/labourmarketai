import "server-only";

import {
  LMC_PURCHASES_ENABLED,
  STRIPE_LMC_TOPUPS_ENABLED,
} from "@/lib/billing/lmc-flags";
import {
  findSellableTopupPackage,
  OWNER_APPROVED_LMC_TOPUP_PACKAGES,
  type LmcTopupPackage,
} from "@/lib/lmc/topup-packages";
import {
  LMC_TOPUP_PURPOSE,
  parseTopupSubject,
} from "@/lib/lmc/topup-metadata";
import {
  recordLmcPurchase,
  type LmcWalletRpcClient,
  type LmcWalletSubject,
} from "@/lib/lmc/wallet";

/**
 * LMC TOP-UP SETTLEMENT — Wagon 4 of the LMC Commercial System Train. Turns a
 * signature-verified Stripe TEST event (verified by the caller, the
 * /api/lmc/topup-webhook route) into AT MOST ONE purchased-credit ledger entry.
 *
 * EXACTLY ONCE PER STRIPE PAYMENT ("Neleisk dvigubai suteikti kreditų",
 * owner order 2026-10-21) — three independent layers:
 *   1. The ledger idempotency key is derived ONLY from the payment intent id
 *      (`stripe_pi:<pi_…>`), never from an event id, a session id or a
 *      timestamp. checkout.session.completed and
 *      checkout.session.async_payment_succeeded for the same payment, Stripe
 *      retries and replays all carry the same payment intent, so they all
 *      resolve to the SAME ledger entry (`lmc_record_purchase_v1` answers a
 *      committed replay with the original entry, under the account lock).
 *   2. The ledger reference is that same payment intent id, and the database
 *      holds a unique index over the purchase reference
 *      (`lmc_purchase_payment_reference_unique`, migration 20261021150000):
 *      the key is unique only PER ACCOUNT, so a payment replayed against a
 *      different subject would otherwise credit twice. The unique violation is
 *      mapped to `already_credited`, never to a second credit.
 *   3. The amount credited is the SERVER's package figure — never a number
 *      read from the event — and the charged amount must equal the package's
 *      charge, else the event is refused.
 *
 * TEST ONLY. A live-mode event (event or object `livemode`) is refused; the
 * session must also carry `environment=test`.
 *
 * REFUNDS. `charge.refunded` for a top-up does NOT reverse credit here: no
 * server wrapper for `lmc_reverse_v1` exists, and the refund rule for unspent
 * purchased LMC is an open owner decision (MDD-08). It is returned as
 * `refund_pending_owner_decision` so the route logs it loudly; Stripe's own
 * record and the billing endpoint's record-only `charge.refunded` row keep it
 * durable. Never silent, never auto-reversed.
 */

export interface TopupWebhookEvent {
  readonly id: string;
  readonly type: string;
  readonly testMode: boolean;
  readonly object: Record<string, unknown>;
}

export type LmcTopupRefusal =
  | "live_event"
  | "not_test_environment"
  | "invalid_metadata"
  | "missing_payment_intent"
  | "package_not_sellable"
  | "amount_mismatch"
  | "idempotency_conflict"
  | "ledger_rejected";

export type LmcTopupSettlementOutcome =
  /** Both kill-switches (or the DB flag) refused — retryable once armed. */
  | { readonly kind: "disabled"; readonly layer: "code" | "database" }
  /** Not a top-up event (or a type this endpoint does not act on). */
  | { readonly kind: "ignored"; readonly reason: string }
  /** A top-up session that is not paid yet (async methods settle later). */
  | { readonly kind: "not_paid" }
  /** One NEW purchased-credit entry was written for this payment. */
  | {
      readonly kind: "credited";
      readonly paymentIntentId: string;
      readonly transactionId: string;
      readonly amountCents: number;
    }
  /** This payment already has its credit — nothing was written. */
  | { readonly kind: "already_credited"; readonly paymentIntentId: string }
  /** A refund of a top-up: recorded for the owner, credit NOT reversed. */
  | {
      readonly kind: "refund_pending_owner_decision";
      readonly paymentIntentId: string;
      readonly chargeId: string | null;
    }
  /** The event can never credit (tampered, mismatched, unapproved). */
  | { readonly kind: "refused"; readonly reason: LmcTopupRefusal; readonly detail?: string }
  /** Transient — the route answers non-2xx so Stripe retries. */
  | { readonly kind: "retry"; readonly detail: string };

export interface LmcTopupSettlementDeps {
  /** Test injection only; production reads the owner-filled list. */
  readonly packages?: readonly LmcTopupPackage[];
  readonly client?: LmcWalletRpcClient;
}

/** THE idempotency key of a top-up credit. Derived from the payment intent ONLY. */
export function topupIdempotencyKeyFor(paymentIntentId: string): string {
  return `stripe_pi:${paymentIntentId}`;
}

/** The DB unique index (20261021150000) — its violation means "already credited". */
export const LMC_PURCHASE_REFERENCE_UNIQUE_INDEX = "lmc_purchase_payment_reference_unique";
/** The ledger's per-account key constraint (a concurrent duplicate on the same account). */
const LMC_TX_IDEMPOTENCY_CONSTRAINT = "lmc_tx_idempotency";

const PI_RE = /^pi_[A-Za-z0-9_]{6,190}$/;

const SETTLING_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

function idFrom(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") {
    return (v as { id: string }).id;
  }
  return null;
}

function metadataOf(obj: Record<string, unknown>): Record<string, unknown> {
  const m = obj.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

/**
 * Handle ONE verified event. Both kill-switches are checked FIRST — while
 * either is false (both are) nothing is parsed, no client is built and no
 * RPC is called.
 */
export async function handleLmcTopupEvent(
  event: TopupWebhookEvent,
  deps: LmcTopupSettlementDeps = {},
): Promise<LmcTopupSettlementOutcome> {
  if (!STRIPE_LMC_TOPUPS_ENABLED || !LMC_PURCHASES_ENABLED) {
    return { kind: "disabled", layer: "code" };
  }
  if (!event.testMode || event.object.livemode === true) {
    return { kind: "refused", reason: "live_event" };
  }

  if (event.type === "charge.refunded") return handleRefund(event.object);
  if (!SETTLING_TYPES.has(event.type)) return { kind: "ignored", reason: "unhandled_type" };

  const session = event.object;
  const meta = metadataOf(session);
  // A subscription checkout (or anything we did not sell as a top-up) also
  // reaches this endpoint if the owner subscribes it broadly — not ours.
  if (meta.purpose !== LMC_TOPUP_PURPOSE || session.mode !== "payment") {
    return { kind: "ignored", reason: "not_a_topup" };
  }
  if (meta.environment !== "test") return { kind: "refused", reason: "not_test_environment" };
  if (session.payment_status !== "paid") return { kind: "not_paid" };

  const paymentIntentId = idFrom(session.payment_intent);
  if (!paymentIntentId || !PI_RE.test(paymentIntentId)) {
    return { kind: "refused", reason: "missing_payment_intent" };
  }
  const pkg = findSellableTopupPackage(
    meta.package_key,
    deps.packages ?? OWNER_APPROVED_LMC_TOPUP_PACKAGES,
  );
  if (!pkg) return { kind: "refused", reason: "package_not_sellable" };
  if (session.currency !== pkg.currency || session.amount_subtotal !== pkg.chargeMinor) {
    return { kind: "refused", reason: "amount_mismatch" };
  }
  const subject: LmcWalletSubject | null = parseTopupSubject(meta.subject_type, meta.subject_id);
  if (!subject) return { kind: "refused", reason: "invalid_metadata" };

  const out = await recordLmcPurchase(
    {
      subject,
      amountCents: pkg.creditCents,
      providerReference: paymentIntentId,
      idempotencyKey: topupIdempotencyKeyFor(paymentIntentId),
    },
    deps.client,
  );

  switch (out.kind) {
    case "recorded":
      return out.replay
        ? { kind: "already_credited", paymentIntentId }
        : {
            kind: "credited",
            paymentIntentId,
            transactionId: out.transactionId,
            amountCents: out.amountCents,
          };
    case "disabled":
      return { kind: "disabled", layer: out.layer };
    case "rejected": {
      const detail = out.detail ?? "";
      if (
        detail.includes(LMC_PURCHASE_REFERENCE_UNIQUE_INDEX) ||
        detail.includes(LMC_TX_IDEMPOTENCY_CONSTRAINT)
      ) {
        return { kind: "already_credited", paymentIntentId };
      }
      if (out.reason === "idempotency_conflict") {
        // Same payment key, different amount/reference — never overwrite.
        return { kind: "refused", reason: "idempotency_conflict" };
      }
      if (out.reason === "error" || out.reason === "rpc_absent") {
        return { kind: "retry", detail: detail || out.reason };
      }
      return { kind: "refused", reason: "ledger_rejected", detail: out.reason };
    }
  }
}

function handleRefund(charge: Record<string, unknown>): LmcTopupSettlementOutcome {
  const meta = metadataOf(charge);
  if (meta.purpose !== LMC_TOPUP_PURPOSE) return { kind: "ignored", reason: "not_a_topup" };
  const paymentIntentId = idFrom(charge.payment_intent);
  if (!paymentIntentId || !PI_RE.test(paymentIntentId)) {
    return { kind: "refused", reason: "missing_payment_intent" };
  }
  return {
    kind: "refund_pending_owner_decision",
    paymentIntentId,
    chargeId: typeof charge.id === "string" ? charge.id : null,
  };
}
