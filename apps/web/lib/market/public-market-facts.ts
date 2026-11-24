/**
 * PUBLIC MARKET FACTS — the deterministic half of the market-explanation
 * surface, and the ONLY payload that is allowed to leave for an external AI
 * provider today.
 *
 * ── WHY THIS MODULE EXISTS AT ALL ──────────────────────────────────────────
 *
 * `data-egress.ts` is default-deny: an external provider with no grant may
 * receive `PUBLIC` data and nothing else, and until now **no task in this
 * product was classed `PUBLIC`** — recorded in `data-sensitivity.ts` as a
 * finding, not an omission. That is why the Gemini activation gate could say,
 * truthfully, that a credential plus a price plus a live runtime still lights
 * up nothing: every task the product could run describes either a person or a
 * business's own confidential work.
 *
 * This module is the first payload for which that is not true. Every field
 * below is derived from `public_vacancies` — externally published job
 * advertisements — and is reduced to COUNTS, TAXONOMY SLUGS, PLACE NAMES and
 * DATES before it leaves this file. There is no data subject in it, no
 * employer identity, and no advertisement text.
 *
 * ── WHAT IS DELIBERATELY EXCLUDED, AND WHY ─────────────────────────────────
 *
 * `employer_name` / `employer_homepage` / `employer_external_org_id`
 *     Third-party commercial identity. Nothing in an explanation of a market
 *     needs to name the companies in it, and naming them would turn an
 *     aggregate into a directory of other people's business.
 * `title_raw` / `description_raw` / `translation_*_text`
 *     Free advertisement text. Unbounded by construction, authored by someone
 *     else, and the exact shape `SENSITIVE_FREE_TEXT` exists to keep off a
 *     wire. The taxonomy already carries what the text means.
 * `application_url` / `lat` / `lng` / `external_id` / `id`
 *     Row-level identity and precise location. An aggregate must not be
 *     re-joinable to individual rows.
 *
 * What is left is a market statistic. That is a deliberate, reviewed
 * classification, and `lib/guards/public-market-facts-payload.test.ts` pins
 * the exclusion list so a later "just add the title, it's harmless" edit is a
 * red test rather than a silent widening of an egress ceiling.
 *
 * ── HONESTY RULES (binding, tested) ────────────────────────────────────────
 *
 * 1. COUNTS ARE EXACT, RANKINGS ARE WINDOWED. `activeAds`, `newAds7d`,
 *    `newAds30d` and `adsStatingPay` come from exact database counts. The
 *    skill / city / country rankings are computed over the most recently
 *    published `RANKING_WINDOW_ADS` advertisements — a DEFINED window, never a
 *    sample. `rankingWindowCoversAll` says whether that window was the whole
 *    population, and the copy and the prompt are both required to carry the
 *    distinction. A ranking presented as if it covered everything when it
 *    covered the newest 500 is the kind of quiet over-claim §18 exists for.
 *
 * 2. PAY IS NEVER STATED OR ESTIMATED. `adsStatingPay` is carried precisely so
 *    the fact "how many of these ads state a figure" is available — and on the
 *    production data read on 2026-08-24 the answer across the whole browsable
 *    pool was ZERO. The agent's prompt is bound to it: with no figure in the
 *    data there is no honest compensation sentence, and inventing a range is
 *    the single most likely way an LLM would damage this product.
 *
 * 3. AN EMPTY MARKET IS A RESULT, NOT AN ERROR. A profession with no live ad
 *    returns facts with `activeAds: 0`. That is a true and useful answer
 *    ("nothing is being advertised for this right now"), and it must never be
 *    dressed up or hidden.
 *
 * Pure. No IO, no env, no server-only — the read lives in
 * `public-market-facts-read.ts` so this half stays testable with no database.
 */

/** The browsable population, stated once. Mirrors
 *  `BROWSABLE_VACANCY_PREDICATE` in `lib/analytics/market-coverage-claims.ts`:
 *  the predicate the public board actually serves on, so a fact derived here
 *  and a count a visitor can reach are the same population. */
export const MARKET_FACTS_PREDICATE = "is_active AND (expires_at IS NULL OR expires_at > now())";

/** How many of the most recently published ads the rankings are computed over.
 *  A bounded, DEFINED window — not a sample, and never described as one. */
export const RANKING_WINDOW_ADS = 500;

/** Most skills / cities / countries carried. Short by intent: an explanation
 *  of a market is not a data dump, and every extra row is egress. */
export const MARKET_FACTS_TOP_N = 8;

export interface MarketCount {
  /** A taxonomy slug, a city name or an ISO-3166-1 alpha-2 country code. */
  readonly key: string;
  readonly ads: number;
}

/**
 * The complete payload. Nothing outside this interface may reach the agent —
 * the input schema in `registry/agents/market-explanation.ts` is `.strict()`
 * over exactly these fields.
 */
export interface PublicMarketFacts {
  /** Catalogue profession slug the facts are about (e.g. `electrician`). */
  readonly professionSlug: string;
  /** When the underlying counts were read (ISO 8601, UTC). */
  readonly measuredAtIso: string;
  /** Exact count of browsable advertisements for this profession. */
  readonly activeAds: number;
  /** Of those, published in the last 7 / 30 days. Exact. */
  readonly newAds7d: number;
  readonly newAds30d: number;
  /** Advertisements carrying ANY compensation figure. See honesty rule 2. */
  readonly adsStatingPay: number;
  /** Ads the rankings below were computed over (≤ RANKING_WINDOW_ADS). */
  readonly rankingWindowAds: number;
  /** True when that window was the entire population — so the rankings are
   *  complete rather than "among the newest N". */
  readonly rankingWindowCoversAll: boolean;
  /** Recognized skills, most-advertised first, within the ranking window. */
  readonly topSkills: readonly MarketCount[];
  /** Cities, most-advertised first, within the ranking window. */
  readonly topCities: readonly MarketCount[];
  /** Countries, most-advertised first, within the ranking window. */
  readonly countries: readonly MarketCount[];
}

/** The minimum a row must expose for the ranking pass. Deliberately four
 *  fields — the read selects exactly these and the type makes a fifth a
 *  compile error rather than a review question. */
export interface MarketRankingRow {
  readonly skill_slugs: readonly string[] | null;
  readonly city: string | null;
  readonly country: string | null;
  readonly published_at: string | null;
}

function tally(values: readonly (string | null | undefined)[]): MarketCount[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const key = raw.trim();
    if (key === "") continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, ads]) => ({ key, ads }))
    // Count descending, then key ascending — a total order, so the same data
    // always renders in the same sequence and a diff of two readings is
    // meaningful rather than incidental.
    .sort((a, b) => b.ads - a.ads || a.key.localeCompare(b.key))
    .slice(0, MARKET_FACTS_TOP_N);
}

export interface MarketFactCounts {
  readonly activeAds: number;
  readonly newAds7d: number;
  readonly newAds30d: number;
  readonly adsStatingPay: number;
}

/**
 * Assemble the payload from exact counts plus the ranking window.
 *
 * `rankingWindowCoversAll` is derived, never passed in: it is true only when
 * the window actually held every browsable ad. A caller cannot assert
 * completeness it did not achieve.
 */
export function buildPublicMarketFacts(args: {
  readonly professionSlug: string;
  readonly measuredAtIso: string;
  readonly counts: MarketFactCounts;
  readonly windowRows: readonly MarketRankingRow[];
}): PublicMarketFacts {
  const { professionSlug, measuredAtIso, counts, windowRows } = args;
  const rankingWindowAds = windowRows.length;
  return {
    professionSlug,
    measuredAtIso,
    activeAds: counts.activeAds,
    newAds7d: counts.newAds7d,
    newAds30d: counts.newAds30d,
    adsStatingPay: counts.adsStatingPay,
    rankingWindowAds,
    rankingWindowCoversAll:
      rankingWindowAds > 0 && rankingWindowAds >= counts.activeAds,
    topSkills: tally(windowRows.flatMap((r) => r.skill_slugs ?? [])),
    topCities: tally(windowRows.map((r) => r.city)),
    countries: tally(windowRows.map((r) => r.country)),
  };
}

/**
 * Is there enough here for an explanation to be worth asking for?
 *
 * Below this the honest answer is the deterministic panel alone: an LLM
 * paragraph over three advertisements reads as authority the data cannot
 * support, and it would spend a real token budget to do it. The threshold is
 * a product judgement, stated as a number so it can be argued with.
 */
export const MIN_ADS_FOR_EXPLANATION = 10;

export function marketIsExplainable(facts: PublicMarketFacts): boolean {
  return facts.activeAds >= MIN_ADS_FOR_EXPLANATION;
}
