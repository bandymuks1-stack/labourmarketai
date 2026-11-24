import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  REVIEW_READ_LIMIT,
  isReviewMigrationMissingCode,
  isValidReviewCycleStatus,
  isValidReviewEvidenceKind,
  isValidReviewStatus,
  type PerformanceReviewRow,
  type ReviewCycleRow,
  type ReviewEvidenceLinkRow,
} from "@/lib/reviews/reviews-model";

/**
 * Development & Performance Reviews read service (v1).
 *
 * Reads ONLY the new review tables with the caller's RLS-scoped client. RLS
 * is deliberately NARROW (subject, reviewer, org governance owner/admin,
 * platform admin) and this module never widens it: there is no TypeScript
 * filter that could accidentally admit a reader the policy refuses, because
 * every read is a plain SELECT and the policy decides.
 *
 * NOTHING IS SCORED, RANKED OR AGGREGATED here. There is no average, no
 * distribution, no comparison across people — by doctrine.
 *
 * INTERNAL ONLY: this layer never sends anything anywhere.
 *
 * Honest degradation: while the human-gated migration is not applied the
 * reads see 42P01 and report { kind: "needs-migration" }.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

type RawRow = Record<string, unknown>;

const CYCLE_COLUMNS =
  "id, organization_id, name, period_start, period_end, status";
const REVIEW_COLUMNS =
  "id, cycle_id, organization_id, subject_profile_id, reviewer_profile_id, status, worker_input, worker_input_at, manager_input, manager_input_at, manager_input_by, development_plan, follow_up_date, closed_at, created_at, review_cycles(name)";

function toCycle(r: RawRow): ReviewCycleRow | null {
  const status = String(r.status ?? "");
  if (!isValidReviewCycleStatus(status)) return null;
  return {
    id: String(r.id),
    organizationId: String(r.organization_id),
    name: String(r.name ?? ""),
    periodStart: String(r.period_start),
    periodEnd: String(r.period_end),
    status,
  };
}

function toReview(r: RawRow): PerformanceReviewRow | null {
  const status = String(r.status ?? "");
  if (!isValidReviewStatus(status)) return null;
  const cycle = r.review_cycles as { name?: string } | null;
  return {
    id: String(r.id),
    cycleId: String(r.cycle_id),
    cycleName: String(cycle?.name ?? ""),
    organizationId: String(r.organization_id),
    subjectProfileId: String(r.subject_profile_id),
    reviewerProfileId: String(r.reviewer_profile_id),
    status,
    workerInput: (r.worker_input as string | null) ?? null,
    workerInputAt: (r.worker_input_at as string | null) ?? null,
    managerInput: (r.manager_input as string | null) ?? null,
    managerInputAt: (r.manager_input_at as string | null) ?? null,
    managerInputBy: (r.manager_input_by as string | null) ?? null,
    developmentPlan: (r.development_plan as string | null) ?? null,
    followUpDate: (r.follow_up_date as string | null) ?? null,
    closedAt: (r.closed_at as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

export type ReviewsOverviewResult =
  | { readonly kind: "not-authed" }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "error" }
  | {
      readonly kind: "ok";
      readonly cycles: readonly ReviewCycleRow[];
      readonly reviews: readonly PerformanceReviewRow[];
      readonly evidence: readonly ReviewEvidenceLinkRow[];
      /** Reviews where the viewer is the SUBJECT — their own record. */
      readonly asSubject: readonly PerformanceReviewRow[];
      /** Reviews where the viewer is the named REVIEWER. */
      readonly asReviewer: readonly PerformanceReviewRow[];
      readonly viewerProfileId: string;
    };

/** Everything the reviews section renders, in three bounded reads. */
export async function getReviewsOverview(): Promise<ReviewsOverviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const cycles = await asAny(supabase)
    .from("review_cycles")
    .select(CYCLE_COLUMNS)
    .order("period_start", { ascending: false })
    .limit(REVIEW_READ_LIMIT);
  if (cycles.error) {
    return isReviewMigrationMissingCode(cycles.error.code)
      ? { kind: "needs-migration" }
      : { kind: "error" };
  }

  const reviews = await asAny(supabase)
    .from("performance_reviews")
    .select(REVIEW_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(REVIEW_READ_LIMIT);
  if (reviews.error) {
    return isReviewMigrationMissingCode(reviews.error.code)
      ? { kind: "needs-migration" }
      : { kind: "error" };
  }

  const rows = ((reviews.data ?? []) as RawRow[])
    .map(toReview)
    .filter((r): r is PerformanceReviewRow => r !== null);

  const evidence: ReviewEvidenceLinkRow[] = [];
  if (rows.length > 0) {
    const links = await asAny(supabase)
      .from("review_evidence_links")
      .select("id, review_id, kind, ref_id, note, created_at")
      .in(
        "review_id",
        rows.map((r) => r.id),
      )
      .limit(REVIEW_READ_LIMIT);
    if (!links.error) {
      for (const r of (links.data ?? []) as RawRow[]) {
        const kind = String(r.kind ?? "");
        if (!isValidReviewEvidenceKind(kind)) continue;
        evidence.push({
          id: String(r.id),
          reviewId: String(r.review_id),
          kind,
          refId: String(r.ref_id),
          note: (r.note as string | null) ?? null,
          createdAt: String(r.created_at),
        });
      }
    }
  }

  return {
    kind: "ok",
    cycles: ((cycles.data ?? []) as RawRow[])
      .map(toCycle)
      .filter((c): c is ReviewCycleRow => c !== null),
    reviews: rows,
    evidence,
    asSubject: rows.filter((r) => r.subjectProfileId === user.id),
    asReviewer: rows.filter((r) => r.reviewerProfileId === user.id),
    viewerProfileId: user.id,
  };
}
