import "server-only";

/**
 * EXTERNAL VACANCIES ON THE WORKER BOARD — the join between the vacancy store
 * and the worker's existing opportunity surface.
 *
 * DOCTRINE, restated because this is exactly where it would erode: an
 * imported vacancy is an OPPORTUNITY on the one existing board, not a second
 * product. It renders through `toCanonicalOpportunityView` (the same-contract
 * view), is matched by the ONE engine (`matchWorkerToNeed` via
 * `buildNeedFromVacancy`), and its only application route while unclaimed is
 * the publisher's own ad. No platform apply, no shortlist, no booking — those
 * capabilities are refused by `opportunityCapabilities` because the employer
 * never agreed to them.
 *
 * The read is RLS-SCOPED: this loader takes the WORKER'S OWN client, so a
 * signed-in worker sees exactly what the `authenticated` grant allows (active
 * rows). It never touches the admin client — a board that needed service_role
 * to render would mean the policy was wrong.
 *
 * Store states, handled honestly:
 *   - `not_provisioned` (migration not applied) → empty list, available=false;
 *   - provisioned but empty (no source activated) → empty list, available=true.
 * The page hides the section while the list is empty either way — an empty
 * "external ads" shell would be dead UI — but the flag keeps the two states
 * distinguishable for operators and tests.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  searchPublicVacancies,
  type VacancySearchFiltersV1,
} from "@/lib/vacancy-store/vacancy-read";
import {
  buildNeedFromVacancy,
  type VacancyMatchingGap,
} from "@/lib/vacancy-sources/vacancy-need";
import {
  toCanonicalOpportunityView,
  opportunityCapabilities,
  type CanonicalOpportunityViewV1,
  type OpportunityCapabilitiesV1,
} from "@/lib/vacancy-sources/vacancy-presentation";
import {
  matchWorkerToNeed,
  compareMatches,
  type MatchResultV1,
  type MatchSubject,
} from "@/lib/market/match-v1";

type VacancyDbClient = Pick<SupabaseClient, "from">;

/** One external ad, ready for the board: view + match + honest gaps. */
export interface ExternalOpportunityCardV1 {
  /** Stable render key: provider + the publisher's own id. */
  readonly key: string;
  readonly view: CanonicalOpportunityViewV1;
  readonly capabilities: OpportunityCapabilitiesV1;
  /** The ONE engine's verdict for this worker against this ad. */
  readonly match: MatchResultV1;
  /** Facts a platform demand would carry that this ad does not — rendered as
   *  unknowns, never silently scored as satisfied. */
  readonly matchingGaps: readonly VacancyMatchingGap[];
}

export interface ExternalVacanciesResultV1 {
  /** False ONLY when the store is not provisioned (migration unapplied). */
  readonly available: boolean;
  readonly cards: readonly ExternalOpportunityCardV1[];
}

/** Most ads the board loads per render. The board is a shortlist, not an
 *  archive — a worker who wants more refines the search. */
const BOARD_LIMIT = 20;

export async function loadExternalVacancyCards(
  client: VacancyDbClient,
  subject: MatchSubject,
  options: Pick<VacancySearchFiltersV1, "country" | "query" | "nowIso">,
): Promise<ExternalVacanciesResultV1> {
  const result = await searchPublicVacancies(client, {
    country: options.country ?? null,
    query: options.query ?? null,
    limit: BOARD_LIMIT,
    nowIso: options.nowIso,
  });

  if (result.status === "not_provisioned") {
    return { available: false, cards: [] };
  }

  const cards = result.vacancies
    .map((vacancy): ExternalOpportunityCardV1 => {
      // Skill slugs on a stored vacancy were derived by the platform's own
      // text recognizer at import time — the categorizer's tier, declared
      // rather than upgraded. An ad the recognizer could not read carries no
      // slugs, a `no_requirement_set` gap, and the engine reports
      // insufficient data instead of a fake score.
      const skillSource =
        vacancy.skillSlugs.length > 0 ? "recognized_from_text" : null;
      const { need, missingForMatching } = buildNeedFromVacancy(
        vacancy,
        skillSource,
      );
      const view = toCanonicalOpportunityView(vacancy);
      return {
        key: `${vacancy.providerKey}:${vacancy.externalId}`,
        view,
        capabilities: opportunityCapabilities(view.provenance),
        match: matchWorkerToNeed(need, subject),
        matchingGaps: missingForMatching,
      };
    })
    // Same comparator as the platform board — one ranking rule, not two.
    .sort((a, b) => compareMatches(a.match, b.match));

  return { available: true, cards };
}
