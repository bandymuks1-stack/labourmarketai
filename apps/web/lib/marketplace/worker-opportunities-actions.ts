"use server";

import {
  MARKETPLACE_SURFACES,
  OPPORTUNITIES_RESULT_LIMIT,
  type MarketplaceSurface,
  type MarkShownOutcome,
  type OpportunitiesResultView,
} from "./worker-opportunities-contract";
import { resolveInterestLabels } from "@/lib/opportunities/interest-labels";
import {
  loadWorkerOpportunityMatches,
  markOpportunitiesShown,
} from "./worker-opportunities";

/**
 * The ONE server action every marketplace surface uses to report what it put
 * in front of the human. Thin by design: validation of the surface tag, then
 * straight into the canonical use case.
 *
 * Client components import THIS — never `lib/opportunities/seen`, never the
 * RPC name, never a Postgres error code. The boundary is guard-enforced by
 * `apps/web/lib/guards/canonical-marketplace-use-case.test.ts`.
 *
 * Best-effort at the call site: rendering must never break because an
 * anti-spam marker could not be written. The OUTCOME is still returned in
 * full, so nothing has to pretend the write succeeded.
 */
export async function markOpportunitiesShownAction(
  surface: MarketplaceSurface,
  shownRequestIds: readonly string[],
): Promise<MarkShownOutcome> {
  if (!MARKETPLACE_SURFACES.includes(surface)) {
    return {
      available: null,
      persisted: false,
      reason: "unexpected_error",
      marked: 0,
    };
  }
  if (!Array.isArray(shownRequestIds) || shownRequestIds.length === 0) {
    return {
      available: null,
      persisted: false,
      reason: "nothing_shown",
      marked: 0,
    };
  }
  return markOpportunitiesShown({ surface, shownRequestIds });
}

/**
 * The opportunities RESULT's single server entrypoint (W3 row 5).
 *
 * Thin, like the market result's own action: it enters the SAME canonical use
 * case every other marketplace surface enters, and projects the view onto the
 * client-safe contract shape. No second engine, no second ranking, no second
 * notion of what "new" means.
 *
 * NO ARGUMENTS, deliberately. The limit is a constant in the contract, so a
 * client cannot widen its own read by passing a bigger number to an action
 * that is, by construction, callable by anyone with a session. Authorization
 * itself is unchanged: it is RLS on the rows the gated RPC returns.
 *
 * The three cases stay DISTINCT all the way to the panel. Collapsing
 * "unapplied demand source" into "no matches" would be the surface claiming a
 * fact about data that cannot exist yet — the exact dishonesty the compact
 * card avoided by rendering nothing at all. A panel cannot render nothing, so
 * it renders the reason instead.
 */
export async function loadOpportunitiesResultAction(): Promise<OpportunitiesResultView> {
  const view = await loadWorkerOpportunityMatches({
    // The conversation window — the surface tag this result actually is.
    surface: "conversation",
    limit: OPPORTUNITIES_RESULT_LIMIT,
  });
  if (view.kind !== "ready") return { kind: "no-worker" };
  if (!view.capabilities.boardAvailable) return { kind: "unavailable" };

  return {
    kind: "ready",
    // Projected field by field: the recommendation model may grow without
    // widening what crosses this boundary.
    matches: view.matches.map((m) => ({
      requestId: m.requestId,
      roleSlug: m.roleSlug,
      country: m.country,
      locationLabel: m.locationLabel,
      startPeriod: m.startPeriod,
      basis: {
        matchedTotal: m.basis.matchedTotal,
        needTotal: m.basis.needTotal,
        matchedConfirmed: m.basis.matchedConfirmed,
      },
      salary: m.salary,
      missingSkillSlugs: m.missingSkillSlugs,
      isNew: m.isNew,
      companyName: m.companyName,
      fitStatus: m.status,
      // The worker's own signal, from the same view — never guessed, and
      // absent-key means "no signal", not "not interested".
      interestStatus: view.interestStatusByRequestId[m.requestId] ?? null,
    })),
    totalRecommendable: view.totalRecommendable,
    newCount: view.newCount,
    seenDegraded: view.capabilities.seenReadDegraded,
    // ONE resolver for this copy, server-side, shared with the job context.
    // Absent table ⇒ null ⇒ the panel renders read-only rows instead of a
    // button that cannot write.
    interestLabels: view.capabilities.interestAvailable
      ? await resolveInterestLabels()
      : null,
  };
}
