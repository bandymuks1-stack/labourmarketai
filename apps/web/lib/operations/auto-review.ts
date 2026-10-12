import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  AUTO_REVIEW_BATCH,
  eligibleForAutoReview,
  type ReviewAcceptanceRow,
  type ReviewContextRow,
  type ReviewInvitationRow,
} from "./auto-review-model";

/**
 * Work-review auto-enable (owner decision 1, 2026-10-12) — the executor.
 *
 * Runs in the MANAGER's own session, so every read is under that manager's RLS
 * and every switch goes through the existing audited RPC
 * `set_engagement_journal_review`, which itself re-checks that the caller
 * manages the context's organization and that the relationship is reviewable,
 * and writes the `audit_logs` row (actor, organization, relationship, enabled).
 * There is no direct UPDATE here and no service role.
 *
 * What qualifies is decided by `eligibleForAutoReview` (pure, tested). This
 * never throws and never blocks the page: any failed read answers
 * `unavailable` and enables nothing (SEP-7 — unknown is not "nothing to do").
 *
 * KNOWN LIMIT: the audit row records the manager whose session ran this and
 * `enabled: true`; it cannot carry an "automatic" marker without a DB change,
 * which is outside the owner's grant. The disclosure sentence and the narrow
 * eligibility rule are what make the automation attributable.
 */
export type AutoReviewResult =
  | { readonly status: "ok"; readonly checked: number; readonly enabled: number; readonly skipped: number }
  | { readonly status: "unavailable" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export async function autoEnableReviewForAcceptedStaff(organizationId: string): Promise<AutoReviewResult> {
  try {
    const supabase = await createClient();

    const ctxRes = await asAny(supabase)
      .from("engagement_contexts")
      .select("id, profile_id, organization_id, relationship_slug, status, journal_review_enabled, created_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("relationship_slug", "employee")
      .eq("status", "active")
      .eq("journal_review_enabled", false)
      .order("created_at", { ascending: false })
      .limit(200);
    if (ctxRes.error) return { status: "unavailable" };
    const contexts = (ctxRes.data ?? []) as ReviewContextRow[];
    if (contexts.length === 0) return { status: "ok", checked: 0, enabled: 0, skipped: 0 };

    const accRes = await asAny(supabase)
      .from("invitation_acceptances")
      .select("invitation_id, profile_id, decision, relationship_id, created_at, decided_at")
      .eq("decision", "accepted")
      .in(
        "relationship_id",
        contexts.map((c) => c.id),
      )
      .limit(500);
    if (accRes.error) return { status: "unavailable" };
    const acceptances = (accRes.data ?? []) as ReviewAcceptanceRow[];
    if (acceptances.length === 0) return { status: "ok", checked: contexts.length, enabled: 0, skipped: 0 };

    const invRes = await asAny(supabase)
      .from("invitations")
      .select("id, organization_id, invitation_type, relationship_slug")
      .eq("organization_id", organizationId)
      .in(
        "id",
        [...new Set(acceptances.map((a) => a.invitation_id))],
      )
      .limit(500);
    if (invRes.error) return { status: "unavailable" };

    const ids = eligibleForAutoReview({
      organizationId,
      contexts,
      acceptances,
      invitations: (invRes.data ?? []) as ReviewInvitationRow[],
      limit: AUTO_REVIEW_BATCH,
    });

    let enabled = 0;
    let skipped = 0;
    for (const id of ids) {
      const { data, error } = await asAny(supabase).rpc("set_engagement_journal_review", {
        p_engagement_id: id,
        p_enabled: true,
      });
      if (!error && data === "enabled") enabled += 1;
      else skipped += 1;
    }
    return { status: "ok", checked: contexts.length, enabled, skipped };
  } catch {
    return { status: "unavailable" };
  }
}
