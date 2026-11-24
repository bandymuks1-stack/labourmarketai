/**
 * Country rules needing review (Stage 9, admin) — pure, no IO.
 *
 * Surfaces every requirement in the matrix whose confidence is
 * `needs_legal_review`, so an admin can see exactly which country/scope items
 * are not yet legally confirmed. This is the honest counterpart to the
 * provenance guard: instead of hiding uncertainty, we list it for review.
 */

import { COUNTRY_READINESS, READINESS_COUNTRIES } from "./index";
import type { ReadinessCountry, ReadinessScope } from "./types";

export interface CountryReviewItem {
  readonly country: ReadinessCountry;
  readonly scope: ReadinessScope;
  readonly requirementKey: string;
  readonly sourceUrl: string;
  readonly sourceTitle: string;
  readonly lastReviewedAt: string;
}

/** All `needs_legal_review` requirements across every country + scope. */
export function countryRulesNeedingReview(): CountryReviewItem[] {
  const out: CountryReviewItem[] = [];
  for (const country of READINESS_COUNTRIES) {
    for (const r of COUNTRY_READINESS[country].requirements) {
      if (r.confidence === "needs_legal_review") {
        out.push({
          country,
          scope: r.scope,
          requirementKey: r.key,
          sourceUrl: r.sourceUrl,
          sourceTitle: r.sourceTitle,
          lastReviewedAt: r.lastReviewedAt,
        });
      }
    }
  }
  return out;
}

/** Count of needs-review items per country (for the admin summary). */
export function reviewCountsByCountry(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of countryRulesNeedingReview()) {
    counts[item.country] = (counts[item.country] ?? 0) + 1;
  }
  return counts;
}
