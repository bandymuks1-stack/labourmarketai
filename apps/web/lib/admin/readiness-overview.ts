import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSuperadmin } from "@/lib/auth/superadmin";
import { countryRulesNeedingReview, type CountryReviewItem } from "@/lib/country-readiness/review-queue";
import { PAYMENTS_ENABLED, PRE_PAYMENT_PLANS } from "@/lib/billing/plans";

/**
 * Admin readiness control-center data (Stage 9). Aggregates the
 * payment-readiness blockers from live tables + the app-layer country review
 * queue. Read-mostly; every live query DEGRADES (missing table/column → an
 * honest "not available yet" flag) so the page never errors before the owner
 * applies the PR2 migrations.
 */

const ABSENT = new Set(["42P01", "42703", "PGRST202", "PGRST204"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface PendingDoc {
  id: string;
  workerId: string;
  documentTypeSlug: string;
  country: string | null;
  verification: string;
}

export interface AdminReadinessOverview {
  isAdmin: boolean;
  countryReview: CountryReviewItem[];
  pendingDocs: PendingDoc[];
  pendingDocsAvailable: boolean; // false until the verification column is applied
  docsAttentionCount: number; // missing/blocked worker documents
  companiesNeedingAttention: number;
  bookingsByStatus: Record<string, number>;
  bookingsAvailable: boolean;
  paymentsEnabled: boolean;
  paidPlanCount: number;
}

export async function getAdminReadinessOverview(): Promise<AdminReadinessOverview> {
  const admin = await isSuperadmin();
  const base: AdminReadinessOverview = {
    isAdmin: admin,
    countryReview: countryRulesNeedingReview(),
    pendingDocs: [],
    pendingDocsAvailable: false,
    docsAttentionCount: 0,
    companiesNeedingAttention: 0,
    bookingsByStatus: {},
    bookingsAvailable: false,
    paymentsEnabled: PAYMENTS_ENABLED,
    paidPlanCount: PRE_PAYMENT_PLANS.filter((p) => p.accessState === "payment_not_enabled").length,
  };
  if (!admin) return base;

  const supabase = await createClient();

  // Document verification queue (PR2 verification column).
  const pend = await asAny(supabase)
    .from("worker_documents")
    .select("id, worker_id, document_type_slug, country, verification")
    .eq("verification", "pending")
    .limit(100);
  if (!pend.error) {
    base.pendingDocsAvailable = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    base.pendingDocs = ((pend.data ?? []) as any[]).map((d) => ({
      id: d.id,
      workerId: d.worker_id,
      documentTypeSlug: d.document_type_slug,
      country: d.country ?? null,
      verification: d.verification,
    }));
  } else if (!ABSENT.has(pend.error.code)) {
    base.pendingDocsAvailable = true; // table present, query issue — don't hide
  }

  // Documents needing attention (missing/blocked) — admin sees all via RLS.
  const att = await asAny(supabase)
    .from("worker_documents")
    .select("id", { count: "exact", head: true })
    .in("status", ["missing", "blocked"]);
  if (!att.error && typeof att.count === "number") base.docsAttentionCount = att.count;

  // Companies needing legal/billing attention (incomplete verification ladder).
  const co = await asAny(supabase)
    .from("companies")
    .select("id", { count: "exact", head: true })
    .in("verification_status", ["draft", "needs_checks", "pending_verification"]);
  if (!co.error && typeof co.count === "number") base.companiesNeedingAttention = co.count;

  // Booking requests by status (PR2 table).
  const bk = await asAny(supabase).from("booking_requests").select("status").limit(500);
  if (!bk.error) {
    base.bookingsAvailable = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (bk.data ?? []) as any[]) {
      base.bookingsByStatus[r.status] = (base.bookingsByStatus[r.status] ?? 0) + 1;
    }
  }

  return base;
}
