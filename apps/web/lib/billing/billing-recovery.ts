import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingConfig } from "@/lib/billing/config";
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

const RELATION_ABSENT = "42P01";
const UNDEFINED_COLUMN = "42703";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  return createAdminClient();
}

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
  const staleBefore = new Date(now - STALE_AFTER_MS).toISOString();
  const cooldownFrom = new Date(now - COOLDOWN_MS).toISOString();
  const sb = admin();

  // Over-fetch so the cooldown filter cannot empty the batch, still bounded.
  const { data: rows, error } = await sb
    .from("billing_subscriptions")
    .select("provider_subscription_id, updated_at")
    .eq("provider", "stripe")
    .eq("test_mode", input.testMode)
    .in("status", ["incomplete", "none"])
    .not("provider_subscription_id", "is", null)
    .not("provider_subscription_id", "like", "manual\\_%")
    .lt("updated_at", staleBefore)
    .order("updated_at", { ascending: true })
    .limit(limit * 4);
  if (error) {
    return { ok: false, reason: error.code === RELATION_ABSENT || error.code === UNDEFINED_COLUMN ? "needs_migration" : "store_error" };
  }
  const ordered = (rows as Array<{ provider_subscription_id: string | null }> | null ?? [])
    .map((r) => r.provider_subscription_id)
    .filter((v): v is string => typeof v === "string" && v.startsWith("sub_"));

  // Recently reconciled subscriptions (audit rows carry subscription_id).
  const recent = new Set<string>();
  const { data: audits, error: auditErr } = await sb
    .from("payment_webhook_events")
    .select("payload")
    .eq("event_type", RECONCILE_EVENT_TYPE)
    .gte("created_at", cooldownFrom)
    .limit(500);
  if (auditErr) {
    return { ok: false, reason: auditErr.code === RELATION_ABSENT ? "needs_migration" : "store_error" };
  }
  for (const a of (audits as Array<{ payload: Record<string, unknown> | null }> | null) ?? []) {
    const id = a.payload?.subscription_id;
    if (typeof id === "string") recent.add(id);
  }

  // Observability only: events received but never finished.
  let unprocessed: number | null = null;
  const { count, error: cntErr } = await sb
    .from("payment_webhook_events")
    .select("id", { count: "exact", head: true })
    .eq("processed", false)
    .neq("event_type", RECONCILE_EVENT_TYPE)
    .lt("created_at", staleBefore);
  if (!cntErr && typeof count === "number") unprocessed = count;

  return { ok: true, ids: pickBatch(ordered, recent, limit), unprocessedWebhookEvents: unprocessed };
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
