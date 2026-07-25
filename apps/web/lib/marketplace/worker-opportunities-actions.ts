"use server";

import {
  MARKETPLACE_SURFACES,
  type MarketplaceSurface,
  type MarkShownOutcome,
} from "./worker-opportunities-contract";
import { markOpportunitiesShown } from "./worker-opportunities";

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
