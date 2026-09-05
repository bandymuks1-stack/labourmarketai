import "server-only";

import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkoutOperationIdempotencyKey,
  checkoutWindow,
  isOperationReusable,
  scopeKeyFor,
  type BillingScope,
} from "@/lib/billing/checkout-operations-core";

/**
 * Checkout OPERATIONS store (billing safety v1) — the SERVER-only writer of
 * `billing_checkout_operations` (service role; the table carries no
 * authenticated write policy by design, like every billing table).
 *
 * `openCheckoutOperation` is the concurrency seam: the INSERT of an `open`
 * row races into the partial unique index (one open row per scope + plan). The
 * loser re-reads the winner and REUSES its identity, so two concurrent
 * requests, two tabs or a double click hand Stripe the SAME idempotency key
 * (→ the same Checkout Session). An expired open row is closed and replaced.
 * Every outcome is honest: `needs-migration` when the table is not applied
 * (the route then falls back to the legacy deterministic key), `error` when
 * no identity could be established (the route fails CLOSED — no session
 * without an identity).
 */

const RELATION_ABSENT = "42P01";
const UNIQUE_VIOLATION = "23505";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  return createAdminClient();
}

export interface CheckoutOperation {
  readonly id: string;
  readonly scopeKey: string;
  readonly planKey: string;
  readonly idempotencyKey: string;
  /** ISO — the window end AND the Checkout Session's expires_at. */
  readonly expiresAt: string;
  readonly providerSessionId: string | null;
}

export type OpenOperationResult =
  | { kind: "opened"; operation: CheckoutOperation }
  | { kind: "reused"; operation: CheckoutOperation }
  | { kind: "needs-migration" }
  | { kind: "error"; reason: string };

interface OpRow {
  id: string;
  scope_key: string;
  plan_key: string;
  idempotency_key: string;
  expires_at: string;
  provider_session_id: string | null;
  status: string;
}

function toOperation(r: OpRow): CheckoutOperation {
  return {
    id: r.id,
    scopeKey: r.scope_key,
    planKey: r.plan_key,
    idempotencyKey: r.idempotency_key,
    expiresAt: r.expires_at,
    providerSessionId: r.provider_session_id,
  };
}

export async function openCheckoutOperation(input: {
  ownerId: string;
  organizationId: string | null;
  scope: BillingScope;
  planKey: string;
  /** The SERVER-resolved price id (evidence of what was sent to Stripe). */
  priceId: string;
  testMode: boolean;
  source?: string;
  now?: Date;
}): Promise<OpenOperationResult> {
  const sb = admin();
  const scopeKey = scopeKeyFor(input.scope);
  const now = input.now ?? new Date();

  // At most two rounds: insert → (collision) read winner → reuse, or close an
  // expired winner and insert again. A third collision means the world is
  // changing faster than one request — refuse rather than guess.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const id = randomUUID();
    const window = checkoutWindow(now);
    const { error } = await sb.from("billing_checkout_operations").insert({
      id,
      owner_id: input.ownerId,
      organization_id: input.organizationId,
      scope_key: scopeKey,
      plan_key: input.planKey,
      provider: "stripe",
      provider_price_id: input.priceId,
      idempotency_key: checkoutOperationIdempotencyKey({ operationId: id, planKey: input.planKey, scope: input.scope }),
      status: "open",
      test_mode: input.testMode,
      source: input.source ?? "web",
      expires_at: window.expiresAt.toISOString(),
    });
    if (!error) {
      return {
        kind: "opened",
        operation: {
          id,
          scopeKey,
          planKey: input.planKey,
          idempotencyKey: checkoutOperationIdempotencyKey({ operationId: id, planKey: input.planKey, scope: input.scope }),
          expiresAt: window.expiresAt.toISOString(),
          providerSessionId: null,
        },
      };
    }
    if (error.code === RELATION_ABSENT) return { kind: "needs-migration" };
    if (error.code !== UNIQUE_VIOLATION) return { kind: "error", reason: "insert_failed" };

    // Collision: an open operation already exists for this scope + plan.
    const { data: held, error: selErr } = await sb
      .from("billing_checkout_operations")
      .select("id, scope_key, plan_key, idempotency_key, expires_at, provider_session_id, status")
      .eq("scope_key", scopeKey)
      .eq("plan_key", input.planKey)
      .eq("provider", "stripe")
      .eq("status", "open")
      .maybeSingle();
    if (selErr) return { kind: "error", reason: "read_failed" };
    if (held) {
      const row = held as OpRow;
      if (isOperationReusable({ status: row.status, expiresAt: row.expires_at }, now)) {
        return { kind: "reused", operation: toOperation(row) };
      }
      // Window passed: close it (only if still open) and insert a fresh one.
      await sb
        .from("billing_checkout_operations")
        .update({ status: "expired", updated_at: now.toISOString() })
        .eq("id", row.id)
        .eq("status", "open");
    }
    // held === null: the winner closed between our insert and read → retry.
  }
  return { kind: "error", reason: "contention" };
}

/** Record the Stripe session the operation produced (evidence link). */
export async function attachProviderSession(operationId: string, sessionId: string): Promise<void> {
  await admin()
    .from("billing_checkout_operations")
    .update({ provider_session_id: sessionId, updated_at: new Date().toISOString() })
    .eq("id", operationId);
}

/** The provider refused to create the session: close the operation so the next click gets a fresh identity. */
export async function markCheckoutOperationFailed(operationId: string, reason: string): Promise<void> {
  await admin()
    .from("billing_checkout_operations")
    .update({ status: "failed", failure_reason: reason.slice(0, 200), updated_at: new Date().toISOString() })
    .eq("id", operationId)
    .eq("status", "open");
}

export type OperationBookkeepingResult = "ok" | "needs-migration" | "error";

/** Webhook checkout.session.completed → the operation is complete (idempotent). */
export async function completeCheckoutOperationBySession(input: {
  sessionId: string;
  providerSubscriptionId: string | null;
}): Promise<OperationBookkeepingResult> {
  const now = new Date().toISOString();
  const { error } = await admin()
    .from("billing_checkout_operations")
    .update({
      status: "completed",
      provider_subscription_id: input.providerSubscriptionId,
      completed_at: now,
      updated_at: now,
    })
    .eq("provider", "stripe")
    .eq("provider_session_id", input.sessionId);
  if (!error) return "ok";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  return "error";
}

/** Webhook checkout.session.expired → close the operation early (idempotent). */
export async function expireCheckoutOperationBySession(sessionId: string): Promise<OperationBookkeepingResult> {
  const { error } = await admin()
    .from("billing_checkout_operations")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("provider", "stripe")
    .eq("provider_session_id", sessionId)
    .eq("status", "open");
  if (!error) return "ok";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  return "error";
}
