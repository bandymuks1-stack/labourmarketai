import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperadmin } from "@/lib/auth/superadmin";
import { getBillingConfig } from "@/lib/billing/config";
import { getBillingProvider } from "@/lib/billing/provider";
import { testPriceIdFor } from "@/lib/billing/prices";
import { ORGANIZATION_PLAN_KEY } from "@/lib/billing/plans";
import { getPlans } from "@/lib/marketing/plans";
import { mapStripeStatus } from "@/lib/billing/webhook-core";
import {
  detectAnomalies,
  summarizeAnomalies,
  type Anomaly,
  type CheckoutOperationRecord,
  type LocalCustomerRecord,
  type LocalSubscriptionRecord,
  type ProviderSubscriptionRecord,
  type ReconciliationSummary,
  type WebhookEventRecord,
} from "@/lib/billing/reconcile-core";

/**
 * Billing RECONCILIATION — server wrapper (billing safety v1). READ-ONLY.
 *
 * Walks organization → local subscription → Stripe customer → Stripe
 * subscription → price → status → entitlement and reports every anomaly the
 * pure core names. It performs NO write, NO Stripe mutation and NEVER a
 * charge: repair is an operator decision made with this report in hand.
 *
 * Authority: an explicit `isSuperadmin()` re-check gates the whole run. The
 * service-role client is used for the LOCAL reads only because
 * `payment_webhook_events` / `billing_checkout_operations` are admin-SELECT
 * through `public.is_admin()` (active_role only) while the app-level admin
 * signal is dual (profile_roles too) — the launch-readiness pattern. Provider
 * reads go through the adapter's read-only methods.
 *
 * Bounded (owner scale constraint 2026-09-05): at most LIMIT rows per table
 * and one provider read per local subscription / customer; `truncated` says
 * when the bound was hit.
 */

const LIMIT = 200;
const RELATION_ABSENT = "42P01";
const UNDEFINED_COLUMN = "42703";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  return createAdminClient();
}

export interface ReconciliationReport {
  readonly ok: boolean;
  readonly ranAt: string;
  readonly mode: "test" | "live" | "inactive";
  readonly expected: {
    readonly planKey: string;
    readonly priceId: string | null;
    readonly unitAmountCents: number | null;
    readonly currency: "eur";
  };
  readonly counts: {
    readonly subscriptions: number;
    readonly customers: number;
    readonly webhookEvents: number;
    readonly unprocessedWebhookEvents: number;
    readonly checkoutOperations: number;
    readonly providerLookups: number;
    readonly providerLookupFailures: number;
  };
  readonly tables: {
    readonly checkoutOperations: "present" | "absent";
    readonly safetyColumns: "present" | "absent";
  };
  readonly truncated: boolean;
  readonly summary: ReconciliationSummary;
  readonly anomalies: readonly Anomaly[];
  /** The report never repairs. Stated in the payload so no reader assumes otherwise. */
  readonly writesPerformed: 0;
  readonly reason?: "not_admin" | "billing_tables_absent";
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Stripe object id an event is about, from the lean payload we store. */
function objectIdOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const s = (payload as { summary?: Record<string, unknown> }).summary;
  if (!s) return null;
  return str(s.invoiceId) ?? str(s.chargeId) ?? str(s.disputeId) ?? null;
}

export async function runBillingReconciliation(): Promise<ReconciliationReport> {
  const cfg = getBillingConfig();
  const mode: ReconciliationReport["mode"] =
    cfg.state === "stripe_live" ? "live" : cfg.state === "stripe_test" ? "test" : "inactive";
  const ranAt = new Date().toISOString();

  // The approved figure lives ONLY in plans.price_eur_monthly ("business" row
  // renders as Organization); the price id ONLY in the env slot.
  const plans = await getPlans();
  const business = plans?.find((p) => p.slug === "business") ?? null;
  const expected = {
    planKey: ORGANIZATION_PLAN_KEY,
    priceId: testPriceIdFor(ORGANIZATION_PLAN_KEY),
    unitAmountCents: business?.price_eur_monthly != null ? Math.round(business.price_eur_monthly * 100) : null,
    currency: "eur" as const,
  };

  const empty: ReconciliationReport = {
    ok: false,
    ranAt,
    mode,
    expected,
    counts: { subscriptions: 0, customers: 0, webhookEvents: 0, unprocessedWebhookEvents: 0, checkoutOperations: 0, providerLookups: 0, providerLookupFailures: 0 },
    tables: { checkoutOperations: "absent", safetyColumns: "absent" },
    truncated: false,
    summary: { anomalies: 0, byKind: {}, healthy: false },
    anomalies: [],
    writesPerformed: 0,
  };

  if (!(await isSuperadmin())) return { ...empty, reason: "not_admin" };

  const sb = admin();

  // ── local subscriptions (safety columns when present) ────────────────────
  let subsRes = await sb
    .from("billing_subscriptions")
    .select("id, owner_id, organization_id, plan_key, provider_customer_id, provider_subscription_id, status, test_mode, provider_price_id, unit_amount_cents, currency, last_event_created_at")
    .eq("provider", "stripe")
    .order("updated_at", { ascending: false })
    .limit(LIMIT + 1);
  let safetyColumns: "present" | "absent" = "present";
  if (subsRes.error?.code === UNDEFINED_COLUMN) {
    safetyColumns = "absent";
    subsRes = await sb
      .from("billing_subscriptions")
      .select("id, owner_id, organization_id, plan_key, provider_customer_id, provider_subscription_id, status, test_mode")
      .eq("provider", "stripe")
      .order("updated_at", { ascending: false })
      .limit(LIMIT + 1);
  }
  if (subsRes.error?.code === RELATION_ABSENT) return { ...empty, reason: "billing_tables_absent" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subRows = ((subsRes.data ?? []) as any[]);
  let truncated = subRows.length > LIMIT;
  const subscriptions: LocalSubscriptionRecord[] = subRows.slice(0, LIMIT).map((r) => ({
    id: String(r.id),
    ownerId: String(r.owner_id),
    organizationId: str(r.organization_id),
    planKey: String(r.plan_key),
    providerCustomerId: str(r.provider_customer_id),
    providerSubscriptionId: str(r.provider_subscription_id),
    status: String(r.status),
    testMode: r.test_mode === true,
    providerPriceId: str(r.provider_price_id),
    unitAmountCents: num(r.unit_amount_cents),
    currency: str(r.currency),
    lastEventCreatedAt: str(r.last_event_created_at),
  }));

  // ── local customers ──────────────────────────────────────────────────────
  const custRes = await sb
    .from("billing_customers")
    .select("owner_id, provider_customer_id, test_mode")
    .eq("provider", "stripe")
    .limit(LIMIT + 1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const custRows = ((custRes.data ?? []) as any[]);
  truncated = truncated || custRows.length > LIMIT;
  const customers: LocalCustomerRecord[] = custRows.slice(0, LIMIT).map((r) => ({
    ownerId: String(r.owner_id),
    providerCustomerId: String(r.provider_customer_id),
    testMode: r.test_mode === true,
  }));

  // ── webhook events (recent) ──────────────────────────────────────────────
  const evRes = await sb
    .from("payment_webhook_events")
    .select("event_id, event_type, processed, error, created_at, payload")
    .eq("provider", "stripe")
    .order("created_at", { ascending: false })
    .limit(LIMIT + 1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evRows = ((evRes.data ?? []) as any[]);
  truncated = truncated || evRows.length > LIMIT;
  const webhookEvents: WebhookEventRecord[] = evRows.slice(0, LIMIT).map((r) => ({
    eventId: String(r.event_id),
    eventType: String(r.event_type),
    processed: r.processed === true,
    error: str(r.error),
    createdAt: String(r.created_at),
    objectId: objectIdOf(r.payload),
  }));

  // ── checkout operations (when the table exists) ──────────────────────────
  let checkoutOperations: CheckoutOperationRecord[] = [];
  let checkoutOperationsTable: "present" | "absent" = "present";
  const opRes = await sb
    .from("billing_checkout_operations")
    .select("id, scope_key, plan_key, status, expires_at, provider_session_id")
    .order("created_at", { ascending: false })
    .limit(LIMIT + 1);
  if (opRes.error?.code === RELATION_ABSENT) {
    checkoutOperationsTable = "absent";
  } else if (!opRes.error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opRows = ((opRes.data ?? []) as any[]);
    truncated = truncated || opRows.length > LIMIT;
    checkoutOperations = opRows.slice(0, LIMIT).map((r) => ({
      id: String(r.id),
      scopeKey: String(r.scope_key),
      planKey: String(r.plan_key),
      status: String(r.status),
      expiresAt: String(r.expires_at),
      providerSessionId: str(r.provider_session_id),
    }));
  }

  // ── provider reads (adapter, read-only) — only in an active mode ─────────
  const providerSubscriptions: Record<string, ProviderSubscriptionRecord | null> = {};
  const providerSubscriptionsByCustomer: Record<string, ProviderSubscriptionRecord[]> = {};
  let providerLookups = 0;
  let providerLookupFailures = 0;
  if (mode !== "inactive") {
    const provider = await getBillingProvider();
    const modeIsTest = mode === "test";
    const toRecord = (v: { id: string; customerId: string | null; rawStatus: string; priceId: string | null; unitAmountCents: number | null; currency: string | null; livemode: boolean }): ProviderSubscriptionRecord => ({
      id: v.id,
      customerId: v.customerId,
      status: mapStripeStatus(v.rawStatus),
      priceId: v.priceId,
      unitAmountCents: v.unitAmountCents,
      currency: v.currency,
      livemode: v.livemode,
    });
    for (const s of subscriptions) {
      // Only rows of THIS mode can be looked up in this mode's Stripe account.
      if (!s.providerSubscriptionId || s.providerSubscriptionId.startsWith("manual_") || s.testMode !== modeIsTest) continue;
      providerLookups += 1;
      const r = await provider.retrieveSubscription(s.providerSubscriptionId);
      if (!r.ok) { providerLookupFailures += 1; continue; }
      providerSubscriptions[s.id] = r.subscription ? toRecord(r.subscription) : null;
    }
    for (const c of customers) {
      if (c.testMode !== modeIsTest) continue;
      providerLookups += 1;
      const r = await provider.listCustomerSubscriptions(c.providerCustomerId);
      if (!r.ok) { providerLookupFailures += 1; continue; }
      providerSubscriptionsByCustomer[c.providerCustomerId] = r.subscriptions.map(toRecord);
    }
  }

  const anomalies = detectAnomalies({
    subscriptions,
    customers,
    providerSubscriptions,
    providerSubscriptionsByCustomer,
    webhookEvents,
    checkoutOperations,
    expectedPriceId: expected.priceId,
    expectedUnitAmountCents: expected.unitAmountCents,
    expectedCurrency: expected.currency,
    liveMode: mode === "live",
    now: new Date(),
  });

  return {
    ok: true,
    ranAt,
    mode,
    expected,
    counts: {
      subscriptions: subscriptions.length,
      customers: customers.length,
      webhookEvents: webhookEvents.length,
      unprocessedWebhookEvents: webhookEvents.filter((e) => !e.processed).length,
      checkoutOperations: checkoutOperations.length,
      providerLookups,
      providerLookupFailures,
    },
    tables: { checkoutOperations: checkoutOperationsTable, safetyColumns },
    truncated,
    summary: summarizeAnomalies(anomalies),
    anomalies,
    writesPerformed: 0,
  };
}
