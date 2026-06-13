import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSuperadmin } from "@/lib/auth/superadmin";
import { getBillingConfig } from "@/lib/billing/config";
import { PRE_PAYMENT_PLANS } from "@/lib/billing/plans";

/**
 * Admin billing overview (Stripe sprint PR6). Read-mostly: the billing config
 * state (test/disabled/live-blocked), recent subscriptions, recent webhook
 * events, and the payment-readiness blockers. Degrades when the PR2 tables are
 * absent. Admin cannot enable live from here — config is env-only and live is
 * hard-blocked.
 */

const RELATION_ABSENT = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface AdminSubscriptionRow {
  ownerId: string;
  planKey: string;
  status: string;
  testMode: boolean;
  cancelAtPeriodEnd: boolean;
  lastPaymentStatus: string | null;
  currentPeriodEnd: string | null;
  isManualOverride: boolean;
}

export interface AdminWebhookRow {
  eventType: string;
  testMode: boolean;
  processed: boolean;
  createdAt: string;
}

export interface AdminBillingOverview {
  isAdmin: boolean;
  configState: string;
  testMode: boolean;
  paymentsEnabled: boolean;
  configReason: string;
  hasTestSecret: boolean;
  hasWebhookSecret: boolean;
  tablesAvailable: boolean;
  subscriptions: AdminSubscriptionRow[];
  webhookEvents: AdminWebhookRow[];
  lastPaymentStatus: string | null;
  /** Honest list of what still blocks turning real (live) payments on. */
  blockers: string[];
  paidPlanCount: number;
}

export async function getAdminBillingOverview(): Promise<AdminBillingOverview> {
  const cfg = getBillingConfig();
  const admin = await isSuperadmin();

  const blockers: string[] = [];
  if (!cfg.paymentsEnabled) blockers.push("payments_disabled");
  if (cfg.state === "stripe_live_blocked") blockers.push("live_blocked_by_guard");
  if (!cfg.hasTestSecret) blockers.push("missing_test_secret");
  if (!cfg.hasWebhookSecret) blockers.push("missing_webhook_secret");

  const base: AdminBillingOverview = {
    isAdmin: admin,
    configState: cfg.state,
    testMode: cfg.testMode,
    paymentsEnabled: cfg.paymentsEnabled,
    configReason: cfg.reason,
    hasTestSecret: cfg.hasTestSecret,
    hasWebhookSecret: cfg.hasWebhookSecret,
    tablesAvailable: false,
    subscriptions: [],
    webhookEvents: [],
    lastPaymentStatus: null,
    blockers,
    paidPlanCount: PRE_PAYMENT_PLANS.filter((p) => p.accessState === "payment_not_enabled").length,
  };
  if (!admin) return base;

  const supabase = await createClient();

  const subs = await asAny(supabase)
    .from("billing_subscriptions")
    .select("owner_id, plan_key, status, test_mode, cancel_at_period_end, last_payment_status, current_period_end, provider_subscription_id, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (subs.error?.code === RELATION_ABSENT) {
    blockers.push("billing_tables_not_applied");
    return base;
  }
  base.tablesAvailable = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  base.subscriptions = ((subs.data ?? []) as any[]).map((r) => ({
    ownerId: r.owner_id,
    planKey: r.plan_key,
    status: r.status,
    testMode: r.test_mode,
    cancelAtPeriodEnd: r.cancel_at_period_end,
    lastPaymentStatus: r.last_payment_status ?? null,
    currentPeriodEnd: r.current_period_end ?? null,
    isManualOverride: String(r.provider_subscription_id ?? "").startsWith("manual_"),
  }));
  base.lastPaymentStatus = base.subscriptions[0]?.lastPaymentStatus ?? null;

  const events = await asAny(supabase)
    .from("payment_webhook_events")
    .select("event_type, test_mode, processed, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (!events.error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    base.webhookEvents = ((events.data ?? []) as any[]).map((r) => ({
      eventType: r.event_type,
      testMode: r.test_mode,
      processed: r.processed,
      createdAt: r.created_at,
    }));
  }

  return base;
}
