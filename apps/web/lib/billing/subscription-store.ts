import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  decideSubscriptionTransition,
  type PaymentStatus,
  type SubStatus,
  type SubscriptionUpsert,
} from "@/lib/billing/webhook-core";
import type { BillingScope } from "@/lib/billing/checkout-operations-core";

/**
 * Subscription store (Stripe sprint PR4) — the SERVER-only write path for the
 * webhook, using the service-role client. Degrades honestly to "needs-migration"
 * until the PR2 billing tables are applied (42P01). Never throws into the
 * webhook route; returns a status so the route can record + respond cleanly.
 *
 * Billing safety v1 (2026-09-05) adds, on the SAME state machine:
 *   - ORDERING: every write consults `decideSubscriptionTransition` against the
 *     row's `last_event_created_at`; an older event is refused ("stale-event"),
 *     a terminal row is never revived, and a checkout.session.completed LINK
 *     event never regresses a status a real subscription event already set;
 *   - EVIDENCE: `last_event_id` / `last_event_created_at` and the billed
 *     price (`provider_price_id` / `unit_amount_cents` / `currency`) are
 *     persisted with the row; when the safety columns are not applied yet
 *     (42703) the write is retried WITHOUT them — ordering protection is a
 *     safety layer, never a reason to lose a signed event;
 *   - ADMISSION READS: `findScopedSubscription` (per billing subject + plan)
 *     and the ONE self-healing write `applyProviderReconciledStatus`, which
 *     may only copy a DEAD provider status onto a row — it can remove a
 *     phantom entitlement, never grant one.
 */

const RELATION_ABSENT = "42P01";
const UNIQUE_VIOLATION = "23505";
const UNDEFINED_COLUMN = "42703";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  return createAdminClient();
}

export type StoreResult =
  | "ok"
  | "duplicate"
  | "needs-migration"
  | "error"
  /** Refused: the caller's (owner, plan) row tracks a DIFFERENT live provider
   *  subscription. Overwriting it would orphan a paid subscription (it keeps
   *  billing in Stripe with no row here). The event stays unprocessed and the
   *  reason lands in the webhook event's error column — an operator decision,
   *  not a silent replace. */
  | "conflict-live-subscription"
  /** Skipped on purpose: the event is OLDER than the one that last moved the
   *  row, or the row is terminal. The event is acknowledged (processed) — a
   *  replay must not re-apply it either. */
  | "stale-event";

/** Subscription states that no longer bill and may be superseded in place. */
const DEAD_STATUSES = new Set(["cancelled", "expired"]);

/**
 * Result of recording an incoming event. A duplicate is split by whether the
 * FIRST delivery finished processing: a `duplicate-processed` replay is safely
 * acknowledged without reprocessing, while a `duplicate-unprocessed` retry
 * (Stripe redelivering after our non-2xx) MUST be reprocessed — otherwise a
 * transient processing failure would poison the event id forever.
 */
export type RecordEventResult =
  | "ok"
  | "duplicate-processed"
  | "duplicate-unprocessed"
  | "needs-migration"
  | "error";

function isoFromUnixSeconds(v: number | null | undefined): string | null {
  return typeof v === "number" && Number.isFinite(v) ? new Date(v * 1000).toISOString() : null;
}

/** Idempotent record of a webhook event (unique provider+event_id). */
export async function recordWebhookEvent(input: {
  provider?: string;
  eventId: string;
  eventType: string;
  testMode: boolean;
  payload: Record<string, unknown>;
  /** Stripe `created` (unix seconds) — ordering evidence; optional for legacy callers. */
  eventCreated?: number | null;
}): Promise<RecordEventResult> {
  const provider = input.provider ?? "stripe";
  const base = {
    provider,
    event_id: input.eventId,
    event_type: input.eventType,
    test_mode: input.testMode,
    payload: input.payload,
  };
  const createdAt = isoFromUnixSeconds(input.eventCreated);
  let { error } = await admin()
    .from("payment_webhook_events")
    .insert(createdAt ? { ...base, event_created_at: createdAt } : base);
  if (error?.code === UNDEFINED_COLUMN && createdAt) {
    // Safety column not applied yet — the idempotency record must still land.
    ({ error } = await admin().from("payment_webhook_events").insert(base));
  }
  if (!error) return "ok";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  if (error.code !== UNIQUE_VIOLATION) return "error";

  // Duplicate: only short-circuit if the first delivery actually finished.
  const { data: existing, error: selErr } = await admin()
    .from("payment_webhook_events")
    .select("processed")
    .eq("provider", provider)
    .eq("event_id", input.eventId)
    .maybeSingle();
  if (selErr || !existing) return "error";
  return existing.processed === true ? "duplicate-processed" : "duplicate-unprocessed";
}

/** Mark an event fully processed (call ONLY after successful processing). */
export async function markWebhookProcessed(eventId: string): Promise<void> {
  await admin()
    .from("payment_webhook_events")
    .update({ processed: true, processed_at: new Date().toISOString(), error: null })
    .eq("event_id", eventId);
}

/**
 * Record a processing failure WITHOUT closing the idempotency record:
 * `processed` stays false so a Stripe retry of this event id is reprocessed
 * (`duplicate-unprocessed`) instead of being skipped forever.
 */
export async function markWebhookFailed(eventId: string, err: string): Promise<void> {
  await admin()
    .from("payment_webhook_events")
    .update({ processed: false, error: err })
    .eq("event_id", eventId);
}

// ─── Billing safety v1 helpers ──────────────────────────────────────────────

/** The ordering + amount evidence columns an upsert carries (when known). */
function safetyColumnsFor(u: SubscriptionUpsert): Record<string, unknown> {
  const cols: Record<string, unknown> = {};
  const created = isoFromUnixSeconds(u.eventCreated);
  if (created) {
    cols.last_event_created_at = created;
    cols.last_event_id = u.eventId ?? null;
  }
  if (u.providerPriceId) {
    cols.provider_price_id = u.providerPriceId;
    cols.unit_amount_cents = u.unitAmountCents ?? null;
    cols.currency = u.currency ?? null;
  }
  return cols;
}

interface ExistingRow {
  id: string;
  owner_id: string | null;
  plan_key: string | null;
  provider_customer_id: string | null;
  status: string;
  last_event_created_at: string | null;
}

/**
 * Read the row for a provider subscription id. Selects the safety column when
 * present; falls back to the legacy shape (42703) so ordering simply degrades
 * to "always apply" until the migration lands.
 */
async function readExisting(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  providerSubscriptionId: string,
): Promise<{ row: ExistingRow | null; safetyAvailable: boolean; error: { code?: string } | null }> {
  const { data, error } = await sb
    .from("billing_subscriptions")
    .select("id, owner_id, plan_key, provider_customer_id, status, last_event_created_at")
    .eq("provider", "stripe")
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();
  if (!error) return { row: (data as ExistingRow | null) ?? null, safetyAvailable: true, error: null };
  if (error.code !== UNDEFINED_COLUMN) return { row: null, safetyAvailable: true, error };
  const legacy = await sb
    .from("billing_subscriptions")
    .select("id, owner_id, plan_key, provider_customer_id, status")
    .eq("provider", "stripe")
    .eq("provider_subscription_id", providerSubscriptionId)
    .maybeSingle();
  if (legacy.error) return { row: null, safetyAvailable: false, error: legacy.error };
  const row = legacy.data ? ({ ...(legacy.data as Omit<ExistingRow, "last_event_created_at">), last_event_created_at: null } as ExistingRow) : null;
  return { row, safetyAvailable: false, error: null };
}

/** Read-then-merge upsert of a subscription (keeps owner/plan if a later event omits them). */
export async function upsertSubscription(u: SubscriptionUpsert): Promise<StoreResult> {
  const sb = admin();
  const { row: existing, safetyAvailable, error: selErr } = await readExisting(sb, u.providerSubscriptionId);
  if (selErr && selErr.code === RELATION_ABSENT) return "needs-migration";

  const ownerId = u.ownerId ?? existing?.owner_id ?? null;
  const planKey = u.planKey ?? existing?.plan_key ?? null;
  const customerId = u.providerCustomerId ?? existing?.provider_customer_id ?? null;
  if (!ownerId || !planKey) {
    // Can't create a subscription row without an owner+plan link (set at
    // checkout). A bare subscription event before checkout is ignored safely.
    if (!existing) return "ok";
  }

  // Billing safety v1 — ORDERING. The decision is pure (webhook-core); the
  // store only supplies the row snapshot. A stale/terminal skip is a
  // successful outcome for the route (acknowledged, never retried).
  const decision = decideSubscriptionTransition(
    existing ? { status: existing.status, lastEventCreatedAt: existing.last_event_created_at } : null,
    { kind: u.transitionKind ?? "subscription", status: u.status, eventCreated: u.eventCreated ?? null },
  );
  if (!decision.apply) return "stale-event";

  const row: Record<string, unknown> = {
    owner_id: ownerId,
    plan_key: planKey,
    provider: "stripe",
    provider_customer_id: customerId,
    provider_subscription_id: u.providerSubscriptionId,
    test_mode: u.testMode,
    updated_at: new Date().toISOString(),
  };
  if (!decision.keepStatus) {
    row.status = u.status;
    row.current_period_start = u.currentPeriodStart;
    row.current_period_end = u.currentPeriodEnd;
    row.cancel_at_period_end = u.cancelAtPeriodEnd;
  }
  // M-P0-7 subject binding: a signature-verified organization binding is
  // NEVER discarded. The column key is included ONLY when a binding exists,
  // so personal rows keep the legacy shape; if the multi-subject schema is
  // unapplied (42703) the org-bound event stays unprocessed (needs-migration)
  // instead of being persisted subject-less.
  if (u.organizationId) row.organization_id = u.organizationId;
  const safety = safetyAvailable ? safetyColumnsFor(u) : {};
  const hasSafety = Object.keys(safety).length > 0;

  let { error } = await sb
    .from("billing_subscriptions")
    .upsert({ ...row, ...safety }, { onConflict: "provider,provider_subscription_id" });
  if (error?.code === UNDEFINED_COLUMN && hasSafety) {
    // Safety columns not applied — persist the signed state without them.
    ({ error } = await sb
      .from("billing_subscriptions")
      .upsert(row, { onConflict: "provider,provider_subscription_id" }));
  }
  if (!error) return "ok";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  if (error.code === UNDEFINED_COLUMN) return "needs-migration";
  if (error.code === UNIQUE_VIOLATION) {
    // The upsert's conflict target is (provider, provider_subscription_id),
    // so a 23505 here comes from the OTHER unique key:
    // (owner_id, plan_key, provider). A different subscription row already
    // exists for this owner+plan. Two very different worlds produce that:
    //
    //   REPLACEABLE — re-subscribe after cancel/expiry, or a `manual_<uuid>`
    //   pilot-override row. The old row no longer bills; the provider event
    //   is authoritative and the row is superseded in place.
    //
    //   NOT replaceable — the row tracks a LIVE provider subscription with a
    //   different id. One person can legitimately buy the same plan for two
    //   organizations; `unique (owner_id, plan_key, provider)` cannot store
    //   both, and replacing the first row would leave a subscription billing
    //   in Stripe with no local record or entitlement. That is silent data
    //   loss on a paid row — refuse instead, keep the event unprocessed, and
    //   surface `conflict-live-subscription` for an operator decision.
    if (!ownerId || !planKey) return "error";
    // Conflict lookup is scoped to the BILLING SUBJECT (M-P0-7): an org-bound
    // event collides only within its organization's scope; a personal event
    // only within the personal (origin-null) scope. Falls back to the legacy
    // unscoped lookup while the multi-subject schema is unapplied (42703).
    let heldQuery = sb
      .from("billing_subscriptions")
      .select("provider_subscription_id, status")
      .eq("provider", "stripe")
      .eq("owner_id", ownerId)
      .eq("plan_key", planKey);
    heldQuery = u.organizationId
      ? heldQuery.eq("organization_id", u.organizationId)
      : heldQuery.is("origin_organization_id", null);
    let { data: held, error: heldErr } = await heldQuery.maybeSingle();
    if (heldErr?.code === UNDEFINED_COLUMN) {
      ({ data: held, error: heldErr } = await sb
        .from("billing_subscriptions")
        .select("provider_subscription_id, status")
        .eq("provider", "stripe")
        .eq("owner_id", ownerId)
        .eq("plan_key", planKey)
        .maybeSingle());
    }
    if (heldErr || !held) return "error";
    const heldSubId =
      typeof held.provider_subscription_id === "string"
        ? held.provider_subscription_id
        : null;
    const replaceable =
      heldSubId === null ||
      heldSubId === u.providerSubscriptionId ||
      heldSubId.startsWith("manual_") ||
      DEAD_STATUSES.has(String(held.status));
    if (!replaceable) return "conflict-live-subscription";
    // Supersede-in-place, scoped to the SAME billing subject (never a row of
    // another organization or of the personal scope). Same 42703 fallback.
    const patch: Record<string, unknown> = {
      provider_customer_id: customerId,
      provider_subscription_id: u.providerSubscriptionId,
      status: u.status,
      current_period_start: u.currentPeriodStart,
      current_period_end: u.currentPeriodEnd,
      cancel_at_period_end: u.cancelAtPeriodEnd,
      test_mode: u.testMode,
      updated_at: new Date().toISOString(),
    };
    const scoped = (p: Record<string, unknown>) => {
      let q = sb
        .from("billing_subscriptions")
        .update(p)
        .eq("provider", "stripe")
        .eq("owner_id", ownerId)
        .eq("plan_key", planKey);
      q = u.organizationId
        ? q.eq("organization_id", u.organizationId)
        : q.is("origin_organization_id", null);
      return q;
    };
    let { error: updErr } = await scoped({ ...patch, ...safety });
    if (updErr?.code === UNDEFINED_COLUMN && hasSafety) {
      ({ error: updErr } = await scoped(patch));
    }
    if (updErr?.code === UNDEFINED_COLUMN) {
      ({ error: updErr } = await sb
        .from("billing_subscriptions")
        .update(patch)
        .eq("provider", "stripe")
        .eq("owner_id", ownerId)
        .eq("plan_key", planKey));
    }
    if (!updErr) return "ok";
    if (updErr.code === RELATION_ABSENT) return "needs-migration";
    return "error";
  }
  return "error";
}

/** Update the last payment status for a subscription (invoice events). */
export async function applyInvoicePayment(
  providerSubscriptionId: string | null,
  status: PaymentStatus,
  event?: { id: string; created?: number | null },
): Promise<StoreResult> {
  if (!providerSubscriptionId) return "ok";
  const sb = admin();
  const patch: Record<string, unknown> = {
    last_payment_status: status,
    updated_at: new Date().toISOString(),
  };
  // A failed payment moves an active subscription to past_due (honest signal).
  if (status === "failed") patch.status = "past_due";

  // Billing safety v1 — ORDERING: an old invoice.payment_failed must not drag
  // a row back to past_due after a newer subscription event made it active,
  // and no invoice event revives a terminal row.
  const eventCreated = typeof event?.created === "number" ? event.created : null;
  const { row: existing, safetyAvailable, error: selErr } = await readExisting(sb, providerSubscriptionId);
  if (selErr && selErr.code === RELATION_ABSENT) return "needs-migration";
  if (existing) {
    const decision = decideSubscriptionTransition(
      { status: existing.status, lastEventCreatedAt: existing.last_event_created_at },
      { kind: "invoice", status: status === "failed" ? "past_due" : null, eventCreated },
    );
    if (!decision.apply) return "stale-event";
  }
  const safety: Record<string, unknown> = {};
  const createdIso = isoFromUnixSeconds(eventCreated);
  if (safetyAvailable && createdIso) {
    safety.last_event_created_at = createdIso;
    safety.last_event_id = event?.id ?? null;
  }
  const write = (p: Record<string, unknown>) =>
    sb
      .from("billing_subscriptions")
      .update(p)
      .eq("provider", "stripe")
      .eq("provider_subscription_id", providerSubscriptionId);
  let { error } = await write({ ...patch, ...safety });
  if (error?.code === UNDEFINED_COLUMN && Object.keys(safety).length > 0) {
    ({ error } = await write(patch));
  }
  if (!error) return "ok";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  return "error";
}

// ─── Billing safety v1 — admission reads + the one provider-truth heal ──────

export type ScopedSubscriptionLookup =
  | {
      status: "found";
      row: { providerSubscriptionId: string | null; status: SubStatus; testMode: boolean };
    }
  | { status: "none" }
  | { status: "needs-migration" }
  | { status: "error" };

/**
 * The billing subject's row for a plan (≤1 by the partial unique indexes),
 * restricted to the adapter's MODE: a TEST-mode row can neither block nor
 * entitle a LIVE checkout and vice versa.
 */
export async function findScopedSubscription(input: {
  scope: BillingScope;
  planKey: string;
  testMode: boolean;
}): Promise<ScopedSubscriptionLookup> {
  let q = admin()
    .from("billing_subscriptions")
    .select("provider_subscription_id, status, test_mode")
    .eq("provider", "stripe")
    .eq("plan_key", input.planKey)
    .eq("test_mode", input.testMode);
  q =
    input.scope.type === "organization"
      ? q.eq("organization_id", input.scope.id)
      : q.eq("owner_id", input.scope.id).is("origin_organization_id", null);
  // Several rows are impossible under the partial unique indexes; if they ever
  // appear, the newest speaks and reconciliation reports the anomaly.
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    if (error.code === RELATION_ABSENT || error.code === UNDEFINED_COLUMN) return { status: "needs-migration" };
    return { status: "error" };
  }
  if (!data) return { status: "none" };
  return {
    status: "found",
    row: {
      providerSubscriptionId:
        typeof data.provider_subscription_id === "string" ? data.provider_subscription_id : null,
      status: data.status as SubStatus,
      testMode: data.test_mode === true,
    },
  };
}

/**
 * The ONE self-healing write on the admission/reconciliation path. It copies
 * a DEAD provider status (read from the provider API, not from a redirect or
 * a client) onto the local row. The type forbids anything that could GRANT:
 * only `cancelled` / `expired` are accepted.
 */
export async function applyProviderReconciledStatus(input: {
  providerSubscriptionId: string;
  status: "cancelled" | "expired";
  /** Who observed the provider state (evidence): e.g. "checkout_admission". */
  source: string;
}): Promise<StoreResult> {
  const sb = admin();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: input.status, updated_at: now };
  const safety = { last_event_id: `reconcile:${input.source}`, last_event_created_at: now };
  const write = (p: Record<string, unknown>) =>
    sb
      .from("billing_subscriptions")
      .update(p)
      .eq("provider", "stripe")
      .eq("provider_subscription_id", input.providerSubscriptionId);
  let { error } = await write({ ...patch, ...safety });
  if (error?.code === UNDEFINED_COLUMN) ({ error } = await write(patch));
  if (!error) return "ok";
  if (error.code === RELATION_ABSENT) return "needs-migration";
  return "error";
}
