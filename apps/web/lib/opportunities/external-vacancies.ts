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
  readSupplyLastRefreshedAt,
  type VacancySearchFiltersV1,
} from "@/lib/vacancy-store/vacancy-read";
import {
  classifySourceFreshness,
  type SourceFreshnessV1,
} from "@/lib/vacancy-sources/source-freshness";
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
  /**
   * How recently the supply behind these cards was re-confirmed at the
   * publisher. The board renders a notice for every state except `current`,
   * so an ad that has not been re-confirmed is never shown as though it had.
   */
  readonly freshness: SourceFreshnessV1;
}

/** Most ads the board loads per render. The board is a shortlist, not an
 *  archive — a worker who wants more refines the search. */
const BOARD_LIMIT = 20;

/** Extra profile-directed candidates fetched beyond the newest page. Without
 *  this, the shortlist is drawn ONLY from the newest ads overall, and a
 *  worker whose profession sits deeper in the supply never sees it (TEST A of
 *  the opportunity-realization doctrine: the same supply must become MORE
 *  useful as the profile says more). Retrieval only — ranking stays the one
 *  engine below, and the rendered shortlist stays capped at BOARD_LIMIT. */
const PROFILE_POOL_LIMIT = 30;

export async function loadExternalVacancyCards(
  client: VacancyDbClient,
  subject: MatchSubject,
  options: Pick<
    VacancySearchFiltersV1,
    "country" | "professionSlug" | "query" | "nowIso"
  >,
): Promise<ExternalVacanciesResultV1> {
  const explicitProfession = options.professionSlug ?? null;
  const result = await searchPublicVacancies(client, {
    country: options.country ?? null,
    professionSlug: explicitProfession,
    query: options.query ?? null,
    limit: BOARD_LIMIT,
    nowIso: options.nowIso,
  });

  if (result.status === "not_provisioned") {
    return {
      available: false,
      cards: [],
      freshness: classifySourceFreshness({
        lastRefreshedAt: null,
        nowIso: options.nowIso ?? new Date().toISOString(),
        unavailable: true,
      }),
    };
  }

  // Age of the supply, read through the same client and the same active/expiry
  // predicate as the cards above — it describes THESE rows, not a wider view.
  const refreshed = await readSupplyLastRefreshedAt(client, {
    country: options.country ?? null,
    nowIso: options.nowIso ?? new Date().toISOString(),
  });
  const freshness = classifySourceFreshness({
    lastRefreshedAt: refreshed.lastRefreshedAt,
    nowIso: options.nowIso ?? new Date().toISOString(),
    unavailable: refreshed.status === "not_provisioned",
  });

  // Profile-directed pool: when the person has a declared profession and the
  // board is not already narrowed (no explicit profession filter, no free-text
  // query), also fetch ads IN that profession. This is what lets a profile
  // enrichment change which ads the shortlist is drawn from, instead of the
  // shortlist forever being "the 20 newest ads of any kind".
  const profileProfession = subject.professionSlug ?? null;
  let profilePool = [] as (typeof result.vacancies)[number][];
  if (
    !explicitProfession &&
    !(options.query && options.query.trim().length > 0) &&
    profileProfession
  ) {
    const extra = await searchPublicVacancies(client, {
      country: options.country ?? null,
      professionSlug: profileProfession,
      query: null,
      limit: PROFILE_POOL_LIMIT,
      nowIso: options.nowIso,
    });
    if (extra.status === "ok") profilePool = [...extra.vacancies];
  }

  // Merge + dedupe by publisher identity — the newest page and the
  // profile-directed pool can overlap.
  const byKey = new Map<string, (typeof result.vacancies)[number]>();
  for (const v of [...result.vacancies, ...profilePool]) {
    byKey.set(`${v.providerKey}:${v.externalId}`, v);
  }

  const cards = [...byKey.values()]
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
    .sort((a, b) => compareMatches(a.match, b.match))
    // The board stays a shortlist: the pool widened WHICH ads compete, the
    // cap keeps HOW MANY render unchanged.
    .slice(0, BOARD_LIMIT);

  return { available: true, cards, freshness };
}
