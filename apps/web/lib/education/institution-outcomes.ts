import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Institution learner OUTCOMES — the aggregate read for an education
 * institution (owner contract 2026-09-04 §15/§19: "what did my learners
 * achieve" is a REPORT from real state, not a claim).
 *
 * The ONE caller of `institution_learner_outcomes_v1` (applied 2026-09-03,
 * no caller until this module). The function itself is the privacy boundary:
 *   - caller must MANAGE the organisation AND it must hold `training_provider`;
 *   - it returns COUNTS over the institution's active `student` contexts —
 *     never an id, a name, an employer or a request;
 *   - below 5 connected learners it returns `suppressed = true` with the
 *     four outcome counts null, so a number can never identify one person.
 * Nothing here widens that: the module passes the organisation id in and the
 * numbers out. No worker, journal, CV or profile row is read.
 *
 * Honest degradation: a missing function (`42883`, not yet applied) or any
 * error is `unavailable`, never zeros pretending to be "no outcomes".
 */

export interface InstitutionLearnerOutcomes {
  readonly learnersConnected: number;
  /** True below the k-anonymity floor: the four counts are null on purpose. */
  readonly suppressed: boolean;
  readonly activeLast30d: number | null;
  readonly withInterestSignals: number | null;
  readonly withAcceptedBookings: number | null;
  readonly withActiveEngagements: number | null;
  readonly computedAt: string;
}

export type InstitutionLearnerOutcomesRead =
  | { readonly status: "ok"; readonly outcomes: InstitutionLearnerOutcomes }
  | { readonly status: "unavailable"; readonly reason: "not_applied" | "forbidden" | "error" };

/** The floor the SQL function enforces; named here so copy can say it. */
export const OUTCOMES_K_ANONYMITY_FLOOR = 5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Pure: the SQL row → the typed read (exported for the guard). */
export function mapOutcomesRow(row: Record<string, unknown> | null | undefined): InstitutionLearnerOutcomes | null {
  if (!row) return null;
  const suppressed = row.suppressed === true;
  return {
    learnersConnected: toInt(row.learners_connected) ?? 0,
    suppressed,
    activeLast30d: suppressed ? null : toInt(row.active_last_30d),
    withInterestSignals: suppressed ? null : toInt(row.with_interest_signals),
    withAcceptedBookings: suppressed ? null : toInt(row.with_accepted_bookings),
    withActiveEngagements: suppressed ? null : toInt(row.with_active_engagements),
    computedAt: String(row.computed_at ?? ""),
  };
}

export async function readInstitutionLearnerOutcomes(
  organizationId: string,
): Promise<InstitutionLearnerOutcomesRead> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc("institution_learner_outcomes_v1", {
    p_organization_id: organizationId,
  });
  if (error) {
    if (error.code === "42883") return { status: "unavailable", reason: "not_applied" };
    if (error.code === "42501") return { status: "unavailable", reason: "forbidden" };
    return { status: "unavailable", reason: "error" };
  }
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : (data as Record<string, unknown> | null);
  const outcomes = mapOutcomesRow(row);
  return outcomes ? { status: "ok", outcomes } : { status: "unavailable", reason: "error" };
}
