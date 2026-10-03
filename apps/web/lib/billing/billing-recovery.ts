import "server-only";

import { getBillingConfig } from "@/lib/billing/config";
import { readRecoveryCandidates } from "@/lib/billing/subscription-store";
import {
  RECONCILE_EVENT_TYPE,
  reconcileSubscription,
  type ReconcileOutcome,
  type ReconcileResult,
} from "@/lib/billing/reconcile-subscription";

/**
 * SCHEDULED BILLING RECOVERY (stage 2) — the sweep around the one-subscription
 * adapter. It selects a BOUNDED set of subscriptions awaiting provider sync and
 * hands each to `reconcileSubscription`, which converges through the same apply
 * primitive as the webhook. Nothing here writes subscription state itself and
 * nothing here can create, change, cancel or refund a payment.
 *
 * Candidates (oldest first, at most BATCH per run):
 *   - local rows still `incomplete` / `none` — "link only": checkout completed
 *     (or a link event landed) but the real subscription event never did —
 *     untouched for STALE_AFTER_MS;
 *   - test-mode rows are matched to the adapter's mode (a TEST row never
 *     recovers under LIVE and vice versa);
 *   - `manual_*` pilot-override rows are never provider subscriptions: skipped;
 *   - terminal rows are never candidates (Stripe never revives them).
 * A subscription reconciled within COOLDOWN_MS (any outcome, read from the
 * audit rows) is skipped, so one that Stripe legitimately still reports as
 * incomplete / unknown cannot starve the rest of the queue.
 *
 * Unprocessed webhook events are COUNTED for observability but not acted on:
 * the webhook's lean audit payload carries no subscription id, so an event
 * cannot be mapped back to a subscription without guessing.
 */

export const RECOVERY_BATCH = 25;
export const STALE_AFTER_MS = 10 * 60 * 1000;
export const COOLDOWN_MS = 30 * 60 * 1000;
/** Hard wall-clock budget so a slow provider cannot run the function to its limit. */
export const RUN_BUDGET_MS = 45_000;

export type RecoveryRun =
  | { readonly kind: "unavailable"; readonly reason: "billing_inactive" | "needs_migration" | "store_error" }
  | {
      readonly kind: "ok";
      readonly mode: "test" | "live";
      readonly selected: number;
      readonly processed: number;
      readonly skippedBudget: number;
      readonly counts: Readonly<Partial<Record<ReconcileOutcome, number>>>;
      readonly unprocessedWebhookEvents: number | null;
    };

export type CandidateSelection =
  | { readonly ok: true; readonly ids: readonly string[]; readonly unprocessedWebhookEvents: number | null }
  | { readonly ok: false; readonly reason: "needs_migration" | "store_error" };

/** Pure: apply the cooldown filter + the batch bound, preserving oldest-first order. */
export function pickBatch(
  ordered: readonly string[],
  recentlyReconciled: ReadonlySet<string>,
  limit: number,
): string[] {
  const out: string[] = [];
  for (const id of ordered) {
    if (recentlyReconciled.has(id)) continue;
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

export async function selectRecoveryCandidates(input: {
  readonly testMode: boolean;
  readonly limit?: number;
  readonly now?: () => number;
}): Promise<CandidateSelection> {
  const limit = Math.max(1, Math.min(input.limit ?? RECOVERY_BATCH, RECOVERY_BATCH));
  const now = (input.now ?? Date.now)();
  // Over-fetch so the cooldown filter cannot empty the batch; still bounded.
  const read = await readRecoveryCandidates({
    testMode: input.testMode,
    staleBeforeIso: new Date(now - STALE_AFTER_MS).toISOString(),
    cooldownFromIso: new Date(now - COOLDOWN_MS).toISOString(),
    fetchLimit: limit * 4,
    reconcileEventType: RECONCILE_EVENT_TYPE,
  });
  if (!read.ok) return read;
  return {
    ok: true,
    ids: pickBatch(read.ids, new Set(read.recentlyReconciled), limit),
    unprocessedWebhookEvents: read.unprocessedWebhookEvents,
  };
}

export async function runBillingRecovery(
  opts: {
    readonly limit?: number;
    readonly now?: () => number;
    readonly reconcile?: (subscriptionId: string) => Promise<ReconcileResult>;
  } = {},
): Promise<RecoveryRun> {
  const cfg = getBillingConfig();
  if (cfg.state !== "stripe_test" && cfg.state !== "stripe_live") {
    return { kind: "unavailable", reason: "billing_inactive" };
  }
  const testMode = cfg.state === "stripe_test";
  const now = opts.now ?? Date.now;

  const selection = await selectRecoveryCandidates({ testMode, limit: opts.limit, now });
  if (!selection.ok) return { kind: "unavailable", reason: selection.reason };

  const reconcile =
    opts.reconcile ??
    ((id: string) => reconcileSubscription({ stripeSubscriptionId: id, source: "cron", now }));
  const started = now();
  const counts: Partial<Record<ReconcileOutcome, number>> = {};
  let processed = 0;
  let skippedBudget = 0;
  for (const id of selection.ids) {
    if (now() - started > RUN_BUDGET_MS) {
      skippedBudget += 1;
      continue;
    }
    let outcome: ReconcileOutcome;
    try {
      outcome = (await reconcile(id)).outcome;
    } catch {
      // One subscription's failure never corrupts or aborts the batch.
      outcome = "store_error";
    }
    counts[outcome] = (counts[outcome] ?? 0) + 1;
    processed += 1;
  }

  const run: RecoveryRun = {
    kind: "ok",
    mode: testMode ? "test" : "live",
    selected: selection.ids.length,
    processed,
    skippedBudget,
    counts,
    unprocessedWebhookEvents: selection.unprocessedWebhookEvents,
  };
  console.info(JSON.stringify({ evt: "billing.recovery.run", ...run }));
  return run;
}
