import "server-only";

import { getBillingConfig } from "@/lib/billing/config";
import { getBillingProvider } from "@/lib/billing/provider";
import { applySubscriptionSnapshot } from "@/lib/billing/apply-subscription-snapshot";
import {
  markWebhookFailed,
  markWebhookProcessed,
  readSubscriptionState,
  recordWebhookEvent,
} from "@/lib/billing/subscription-store";
import {
  eventModeMatches,
  parseSubscriptionObject,
  type SubStatus,
} from "@/lib/billing/webhook-core";

/**
 * SUBSCRIPTION RECOVERY ADAPTER (billing recovery, stage 2).
 *
 *   Stripe retrieve -> normalize (webhook-core parser) -> applySubscriptionSnapshot
 *   -> LabourMarket.ai subscription / entitlement state.
 *
 * This module is an ADAPTER, not a state machine. It owns exactly four things:
 * the provider read, the mode/subject safety checks, the audit row, and the
 * outcome mapping. Every state decision (ordering, terminal rows, conflicts,
 * idempotent upsert) lives in the ONE primitive the webhook also uses.
 *
 * It NEVER creates, changes, cancels or refunds a payment and never opens a
 * checkout: the provider is only READ (retrieveSubscriptionRaw /
 * listCustomerSubscriptions).
 *
 * ORDERING RULE (owner-decided): the snapshot is stamped with the Stripe-seconds
 * time captured IMMEDIATELY BEFORE the retrieve call — not the subscription's
 * own `created`, not a post-call "now". Consequences, all pinned by tests:
 *   - a webhook for an event created BEFORE that instant, delivered later, is
 *     older than the snapshot and is skipped as stale (the snapshot already
 *     reflects it);
 *   - a webhook for an event created DURING the call (>= the stamp) still
 *     applies (equal seconds apply — the guard only refuses strictly older);
 *   - a recovery whose stamp is older than the row's last event is itself stale
 *     and writes nothing, so an older retrieval can never beat a newer webhook.
 *
 * AUDIT: payment_webhook_events carries one row per attempt, event_id
 * `reconcile:<source>:<subscription_id>:<stampSeconds>`, event_type
 * `reconcile.subscription`. The table has no CHECK on either column (only
 * provider = 'stripe' and unique (provider, event_id)), so no migration is
 * needed. The same unique key makes two runs in the same second collapse into
 * one (the loser reports `noop`). The applied row's last_event_id is
 * `reconcile:<source>` (the marker applyProviderReconciledStatus already uses).
 */

export type ReconcileOutcome =
  | "applied"
  | "stale"
  | "noop"
  | "not_found"
  | "conflict"
  | "provider_error"
  | "needs_migration"
  | "inactive"
  /** The local store failed (read, audit or write) — retryable, nothing partial. */
  | "store_error";

export interface ReconcileResult {
  readonly outcome: ReconcileOutcome;
  /** Machine reason for non-applied outcomes (never provider ids or secrets). */
  readonly reason?: string;
  /** True when the local row's status differs from what was observed. */
  readonly changed?: boolean;
  /** The provider-observed status mapped to ours (only when a snapshot was parsed). */
  readonly status?: SubStatus;
  /** Server-side only — callers that answer a browser must not forward this. */
  readonly providerSubscriptionId?: string;
}

/** The server-resolved billing subject a recovery may be restricted to. */
export type ExpectedSubject =
  | { readonly type: "organization"; readonly id: string }
  | { readonly type: "profile"; readonly id: string };

export interface ReconcileInput {
  readonly stripeSubscriptionId?: string;
  readonly customerId?: string;
  /** Who asked: 'cron' | 'user_refresh' | ... — becomes `reconcile:<source>`. */
  readonly source: string;
  /**
   * When set, the observed subscription's signed metadata MUST bind to this
   * subject, else `conflict` / `subject_mismatch` and nothing is written.
   */
  readonly expectSubject?: ExpectedSubject;
  /** Test seams. */
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const SUB_ID = /^sub_[A-Za-z0-9_]+$/;
const CUS_ID = /^cus_[A-Za-z0-9_]+$/;
const SOURCE = /^[a-z0-9_-]{1,32}$/;
const RETRY_DELAYS_MS = [250, 750] as const;
/** A customer lookup never fans out wider than this. */
const MAX_SUBS_PER_CUSTOMER = 5;

export const RECONCILE_EVENT_TYPE = "reconcile.subscription";

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function logOutcome(source: string, r: ReconcileResult): void {
  // Structured, secret-free (a Stripe subscription id is an identifier, not a credential).
  console.info(
    JSON.stringify({
      evt: "billing.reconcile",
      source,
      outcome: r.outcome,
      reason: r.reason ?? null,
      changed: r.changed ?? null,
      status: r.status ?? null,
      subscription: r.providerSubscriptionId ?? null,
    }),
  );
}

async function withRetry<T extends { ok: boolean; retryable?: boolean }>(
  fn: () => Promise<T>,
  sleep: (ms: number) => Promise<void>,
): Promise<T> {
  let last = await fn();
  for (const delay of RETRY_DELAYS_MS) {
    if (last.ok || last.retryable !== true) return last;
    await sleep(delay);
    last = await fn();
  }
  return last;
}

async function reconcileOne(
  subscriptionId: string,
  input: ReconcileInput,
): Promise<ReconcileResult> {
  const source = SOURCE.test(input.source) ? input.source : "unknown";
  const now = input.now ?? Date.now;
  const sleep = input.sleep ?? defaultSleep;

  const cfg = getBillingConfig();
  if (cfg.state !== "stripe_test" && cfg.state !== "stripe_live") {
    return { outcome: "inactive", reason: "billing_inactive" };
  }
  const provider = await getBillingProvider();
  if (!provider.active) return { outcome: "inactive", reason: "billing_inactive" };
  if (!SUB_ID.test(subscriptionId)) return { outcome: "noop", reason: "invalid_subscription_id" };

  // Ordering stamp: captured BEFORE the provider call (see module doc).
  const stamp = Math.floor(now() / 1000);

  const fetched = await withRetry(() => provider.retrieveSubscriptionRaw(subscriptionId), sleep);
  if (!fetched.ok) {
    // 429 / 5xx / network / anything else: no write of any kind.
    return { outcome: "provider_error", reason: fetched.retryable ? "provider_transient" : "provider_failed" };
  }

  const evidenceId = `reconcile:${source}`;
  const auditId = `${evidenceId}:${subscriptionId}:${stamp}`;
  const testMode = cfg.state === "stripe_test";

  // Audit-first, like the webhook's recordWebhookEvent: dedupe + a durable trace.
  const recorded = await recordWebhookEvent({
    eventId: auditId,
    eventType: RECONCILE_EVENT_TYPE,
    testMode,
    eventCreated: stamp,
    payload: {
      id: auditId,
      type: RECONCILE_EVENT_TYPE,
      created: stamp,
      source: evidenceId,
      subscription_id: subscriptionId,
      // Non-secret workspace key (`organization:<id>` | `profile:<id>`): lets the
      // user-refresh door read a DURABLE per-workspace cooldown from this table.
      ...(input.expectSubject ? { subject: `${input.expectSubject.type}:${input.expectSubject.id}` } : {}),
    },
  });
  if (recorded === "duplicate-processed") return { outcome: "noop", reason: "duplicate_run", providerSubscriptionId: subscriptionId };
  if (recorded === "needs-migration") return { outcome: "needs_migration", providerSubscriptionId: subscriptionId };
  if (recorded === "error") return { outcome: "store_error", reason: "audit_failed", providerSubscriptionId: subscriptionId };

  const finish = async (r: ReconcileResult, closed: boolean): Promise<ReconcileResult> => {
    const withId = { ...r, providerSubscriptionId: subscriptionId };
    if (closed) await markWebhookProcessed(auditId);
    else await markWebhookFailed(auditId, r.reason ?? r.outcome);
    return withId;
  };

  try {
    if (fetched.object === null) {
      // The provider has no such subscription. We observe; we never cancel.
      return await finish({ outcome: "not_found" }, true);
    }
    // Mode safety (mirrors the webhook's eventModeMatches).
    if (!eventModeMatches(cfg.state, { testMode: !fetched.livemode })) {
      return await finish({ outcome: "conflict", reason: "mode_mismatch" }, false);
    }

    const sub = parseSubscriptionObject(fetched.object, testMode, { id: evidenceId, created: stamp });
    if (!sub) return await finish({ outcome: "noop", reason: "unparseable" }, true);

    if (input.expectSubject) {
      const e = input.expectSubject;
      const bound =
        e.type === "organization"
          ? sub.organizationId === e.id
          : sub.ownerId === e.id && sub.organizationId === null;
      if (!bound) return await finish({ outcome: "conflict", reason: "subject_mismatch", status: sub.status }, false);
    }

    const local = await readSubscriptionState(subscriptionId);
    if (local.status === "needs-migration") return await finish({ outcome: "needs_migration" }, false);
    if (local.status === "error") return await finish({ outcome: "store_error", reason: "read_failed" }, false);
    if (local.status === "none" && (!sub.ownerId || !sub.planKey)) {
      // No local row and no signed owner+plan link to create one from.
      return await finish({ outcome: "noop", reason: "unlinked", status: sub.status }, true);
    }
    const changed = local.status === "none" || local.row.status !== sub.status;

    const applied = await applySubscriptionSnapshot(sub);
    switch (applied) {
      case "ok":
        return await finish({ outcome: "applied", changed, status: sub.status }, true);
      case "stale-event":
        return await finish({ outcome: "stale", changed: false, status: sub.status }, true);
      case "conflict-live-subscription":
        return await finish({ outcome: "conflict", reason: "conflict-live-subscription", status: sub.status }, false);
      case "needs-migration":
        return await finish({ outcome: "needs_migration" }, false);
      default:
        return await finish({ outcome: "store_error", reason: "apply_failed" }, false);
    }
  } catch (e) {
    // One subscription's failure is its own: the audit row stays open, the
    // caller (and the batch) carries on.
    return await finish(
      { outcome: "store_error", reason: e instanceof Error ? e.message.slice(0, 120) : "process_error" },
      false,
    ).catch(() => ({ outcome: "store_error" as const, reason: "process_error", providerSubscriptionId: subscriptionId }));
  }
}

const RANK: Readonly<Record<ReconcileOutcome, number>> = {
  provider_error: 8,
  store_error: 7,
  needs_migration: 6,
  conflict: 5,
  applied: 4,
  stale: 3,
  not_found: 2,
  noop: 1,
  inactive: 9,
};

/**
 * Reconcile one provider subscription (or every subscription of a customer,
 * bounded) into the canonical subscription state. Never throws.
 */
export async function reconcileSubscription(input: ReconcileInput): Promise<ReconcileResult> {
  const source = SOURCE.test(input.source) ? input.source : "unknown";
  let result: ReconcileResult;
  try {
    if (input.stripeSubscriptionId) {
      result = await reconcileOne(input.stripeSubscriptionId, input);
    } else if (input.customerId) {
      result = await reconcileCustomer(input.customerId, input);
    } else {
      result = { outcome: "noop", reason: "no_target" };
    }
  } catch {
    result = { outcome: "store_error", reason: "unexpected" };
  }
  logOutcome(source, result);
  return result;
}

async function reconcileCustomer(customerId: string, input: ReconcileInput): Promise<ReconcileResult> {
  if (!CUS_ID.test(customerId)) return { outcome: "noop", reason: "invalid_customer_id" };
  const cfg = getBillingConfig();
  if (cfg.state !== "stripe_test" && cfg.state !== "stripe_live") {
    return { outcome: "inactive", reason: "billing_inactive" };
  }
  const provider = await getBillingProvider();
  if (!provider.active) return { outcome: "inactive", reason: "billing_inactive" };
  const listed = await withRetry(
    async () => {
      const r = await provider.listCustomerSubscriptions(customerId);
      // The view adapter does not classify transience; treat a failed list as retryable once.
      return r.ok ? { ok: true as const, subscriptions: r.subscriptions } : { ok: false as const, retryable: true, reason: r.reason };
    },
    input.sleep ?? defaultSleep,
  );
  if (!listed.ok) return { outcome: "provider_error", reason: "provider_transient" };
  const ids = listed.subscriptions.slice(0, MAX_SUBS_PER_CUSTOMER).map((s) => s.id);
  if (ids.length === 0) return { outcome: "not_found" };
  let best: ReconcileResult | null = null;
  for (const id of ids) {
    const r = await reconcileOne(id, input);
    // With a subject binding, another workspace's subscription on the same
    // payer's customer is not an outcome for THIS subject — it is excluded
    // (and, as always, nothing was written for it).
    if (input.expectSubject && r.reason === "subject_mismatch") continue;
    if (!best || RANK[r.outcome] > RANK[best.outcome]) best = r;
  }
  return best ?? { outcome: input.expectSubject ? "not_found" : "noop", reason: input.expectSubject ? undefined : "no_target" };
}
