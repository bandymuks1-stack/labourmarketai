"use server";

import { markOpportunitiesSeen } from "@/lib/opportunities/seen";

/**
 * Server action for the opportunity seen markers (Job Recommendation Engine
 * surfacing). Fired on mount by <MarkOpportunitiesSeen/> wherever a
 * recommendation is actually RENDERED (dashboard card, opportunities board,
 * journal context block) — rendering IS the read event, which is what keeps
 * the aggregate "new matching jobs" spine signal honest and non-spammy.
 *
 * Best-effort by design: rollout-safe no-op while the owner-gated
 * worker_opportunity_seen migration is unapplied, and a failure must never
 * affect the page. No revalidation — a seen marker changes only the NEXT
 * request's "new" derivation, never the current render.
 */
export async function markOpportunitiesSeenAction(
  requestIds: readonly string[],
): Promise<void> {
  if (!Array.isArray(requestIds) || requestIds.length === 0) return;
  try {
    await markOpportunitiesSeen(requestIds);
  } catch {
    // Fire-and-forget: seen marking must never break a surface.
  }
}
