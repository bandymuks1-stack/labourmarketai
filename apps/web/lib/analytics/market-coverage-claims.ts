/**
 * Market-coverage public-claim invariant (Sweden market truth, 2026-08-17).
 *
 * FOUR DIFFERENT POPULATIONS exist around "companies" and they may NEVER be
 * conflated in any public or marketing surface:
 *
 *   A. `marketplace_employers` — employers represented in IMPORTED market
 *      data (`public_vacancies.employer_external_org_id` / normalized
 *      employer name). 2026-08-17 production read-back: 7,669 identified
 *      employers behind 41,606 active ads. These companies have NO
 *      relationship with LabourMarket.ai.
 *   B. `registered_organizations` — rows in `organizations` created by real
 *      sign-ups (13 on 2026-08-17).
 *   C. `active_employer_accounts` — organizations with a live
 *      `company_memberships` row (13 on 2026-08-17).
 *   D. `paying_organizations` — organizations with an active billing
 *      subscription (0 on 2026-08-17; `PAYMENTS_ENABLED=false`).
 *
 * THE RULE: population A may ONLY be described with "opportunities from …
 * employers" / coverage framing. Verbs of adoption — "use", "trust",
 * "joined", "chose", "naudoja", "pasitiki", "prisijungė" — may only be
 * attached to counts read from B/C/D tables. A claim like "7,600 companies
 * use LabourMarket.ai" is mathematically sourced from A and is therefore a
 * LIE; the guard test pins the vocabulary apart.
 *
 * Coverage numbers move daily, so public copy uses FLOOR values that a fresh
 * production count can only exceed; any re-quote must re-derive them from
 * `public_vacancies`, never from this file alone.
 *
 * ── WHY A FLOOR NEEDS A WINDOW, NOT A SPOT READING (2026-08-19) ────────────
 *
 * The original floors were derived from ONE reading on ONE day, on the
 * predicate `is_active AND lifecycle = 'published'`. Both halves of that were
 * wrong for a public claim:
 *
 *   * WRONG BASIS. The public job board (#1184/#1190) selects on
 *     `BROWSABLE_VACANCY_PREDICATE` below — a different, narrower predicate.
 *     `/jobs` renders its real total, so a visitor could read "41 000+ ...
 *     right now" on the landing, click once, and see ~40k. The claim was true
 *     about the database and false about what the visitor can get.
 *   * WRONG SHAPE. A floor taken from a single day is not a floor, it is a
 *     spot price. Reconstructed over 2026-08-15..19 the browsable pool ran
 *     40,460 → 40,089 → 37,105 → 38,181 → 39,795 and identified employers ran
 *     7,482 → 7,416 → 7,252 → 7,433 → 7,628. The shipped "7 600+" employers
 *     floor was therefore FALSE on four of those five days, and "41 000+" on
 *     all five. Ads arrive and expire continuously; the pool oscillates by
 *     ~8% inside a week.
 *
 * So a floor must survive the observed TROUGH of a measurement window, with
 * headroom on top — see `MarketMeasurement` and `floorsAreSupportedBy`.
 */

/** The four company populations, in claim-safety order. */
export const COMPANY_CLAIM_POPULATIONS = [
  "marketplace_employers",
  "registered_organizations",
  "active_employer_accounts",
  "paying_organizations",
] as const;
export type CompanyClaimPopulation = (typeof COMPANY_CLAIM_POPULATIONS)[number];

/** Verbs implying adoption of the product. Only B/C/D counts may carry
 *  them. Checked lower-case against lower-cased copy. */
export const ADOPTION_VERBS = [
  "use ",
  "uses ",
  "using ",
  "trust ",
  "trusts ",
  "joined ",
  "chose ",
  "naudoja",
  "naudojasi",
  "pasitiki",
  "prisijungė",
  "pasirinko",
] as const;

/** Populations allowed to appear with an adoption verb. */
export const ADOPTION_CLAIM_POPULATIONS: readonly CompanyClaimPopulation[] = [
  "registered_organizations",
  "active_employer_accounts",
  "paying_organizations",
];

/** A market-coverage claim assembled ONLY from population A framing. */
export interface MarketCoverageClaim {
  readonly activeVacanciesFloor: number;
  readonly identifiedEmployersFloor: number;
  readonly regions: number;
  readonly country: "Sweden";
}

/**
 * SUPERSEDED 2026-08-19 — kept as the provenance record of what shipped, and
 * as the negative fixture the guard test rejects. Derived from a single
 * reading on `PUBLISHED_VACANCY_PREDICATE`; both floors were false against the
 * browsable pool on every day of the 2026-08-15..19 window. Not rendered
 * anywhere: `SWEDEN_COVERAGE_2026_08_19` is the live claim.
 */
export const SWEDEN_COVERAGE_2026_08_17: MarketCoverageClaim = {
  activeVacanciesFloor: 41000,
  identifiedEmployersFloor: 7600,
  regions: 21,
  country: "Sweden",
};

/**
 * The predicate the PUBLIC JOB BOARD selects on — `count_public_vacancies_v1`,
 * `search_public_vacancy_previews_v1`, `get_public_vacancy_preview_v1` and
 * `list_public_vacancy_sitemap_v1` all share it. A public coverage claim must
 * be derived from THIS and nothing else, because this is the only population a
 * visitor can actually reach.
 *
 * Kept as a value rather than a comment so the guard test can assert that a
 * measurement was taken on it.
 */
export const BROWSABLE_VACANCY_PREDICATE =
  "is_active AND (expires_at IS NULL OR expires_at > now())";

/**
 * The superseded basis. Counts rows the job board refuses to serve — expired
 * ads still flagged `is_active` with `lifecycle = 'published'` (6,465 of them
 * on 2026-08-19). Exported so the guard can reject it by name.
 */
export const PUBLISHED_VACANCY_PREDICATE = "is_active AND lifecycle = 'published'";

/**
 * A dated production read-back over a WINDOW, not a single moment.
 *
 * `*Low` is the lowest value observed across the window — the number a floor
 * has to survive. `*Latest` is the most recent spot reading, recorded so the
 * gap between "what it is today" and "what we promise" stays visible.
 */
export interface MarketMeasurement {
  /** ISO date (UTC) of the latest reading in the window. */
  readonly measuredAt: string;
  /** MUST be `BROWSABLE_VACANCY_PREDICATE`. */
  readonly basis: string;
  /** How many days of readings back the lows. A spot reading is not a floor. */
  readonly windowDays: number;
  readonly activeVacanciesLow: number;
  readonly activeVacanciesLatest: number;
  readonly identifiedEmployersLow: number;
  readonly identifiedEmployersLatest: number;
  /** Stable across the whole window, so quoted exactly rather than as a floor. */
  readonly regions: number;
}

/**
 * Minimum margin a floor must keep below the observed low. The shipped
 * employers floor once sat 32 above a daily-moving count — a countdown, not a
 * floor. Three percent of ~7.3k is ~220 employers of real slack.
 */
export const MIN_FLOOR_HEADROOM_RATIO = 0.03;

/**
 * Production read-back 2026-08-19 06:14 UTC, browsable basis, five-day window
 * (2026-08-15..19; earlier days predate the bulk import and carry no signal).
 *
 *   vacancies  40,460 · 40,089 · 37,105 · 38,181 · 39,795   low 37,105
 *   employers   7,482 ·  7,416 ·  7,252 ·  7,433 ·  7,628   low  7,252
 *   regions        21 ·     21 ·     21 ·     21 ·     21   stable
 *
 * Spot check the same moment: 39,743 browsable rows against 46,208 on the
 * published basis — a 6,465-row gap of expired ads. Employers counted by
 * identity per `lib/employers/employer-identity.ts` (registry id first, name
 * only as fallback), never by `distinct employer_name`.
 */
export const SWEDEN_MEASUREMENT_2026_08_19: MarketMeasurement = {
  measuredAt: "2026-08-19",
  basis: BROWSABLE_VACANCY_PREDICATE,
  windowDays: 5,
  activeVacanciesLow: 37105,
  activeVacanciesLatest: 39743,
  identifiedEmployersLow: 7252,
  identifiedEmployersLatest: 7621,
  regions: 21,
};

/**
 * The live public floors. Rounded DOWN to clean steps under the window lows:
 * 35,000 sits 5.7% under the 37,105 trough, 7,000 sits 3.5% under the 7,252
 * trough. Both would have held on every day of the measured window — which is
 * the whole point, and which neither predecessor did.
 */
export const SWEDEN_COVERAGE_2026_08_19: MarketCoverageClaim = {
  activeVacanciesFloor: 35000,
  identifiedEmployersFloor: 7000,
  regions: 21,
  country: "Sweden",
};

/** The claim public surfaces must render. One import, one number. */
export const SWEDEN_COVERAGE_CURRENT = SWEDEN_COVERAGE_2026_08_19;
export const SWEDEN_MEASUREMENT_CURRENT = SWEDEN_MEASUREMENT_2026_08_19;

/** Why a floor set is not supported. Empty array = supported. */
export function floorSupportFailures(
  claim: MarketCoverageClaim,
  m: MarketMeasurement,
): string[] {
  const failures: string[] = [];
  if (m.basis !== BROWSABLE_VACANCY_PREDICATE) {
    failures.push(
      `measurement basis must be the job board predicate, got: ${m.basis}`,
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.measuredAt)) {
    failures.push(`measurement must carry an ISO date, got: ${m.measuredAt}`);
  }
  if (m.windowDays < 2) {
    failures.push(
      `a floor needs a multi-day window, got ${m.windowDays} day(s)`,
    );
  }
  const ceiling = (low: number) => low * (1 - MIN_FLOOR_HEADROOM_RATIO);
  if (claim.activeVacanciesFloor > ceiling(m.activeVacanciesLow)) {
    failures.push(
      `vacancy floor ${claim.activeVacanciesFloor} exceeds the supported ceiling ` +
        `${Math.floor(ceiling(m.activeVacanciesLow))} (window low ${m.activeVacanciesLow})`,
    );
  }
  if (claim.identifiedEmployersFloor > ceiling(m.identifiedEmployersLow)) {
    failures.push(
      `employer floor ${claim.identifiedEmployersFloor} exceeds the supported ceiling ` +
        `${Math.floor(ceiling(m.identifiedEmployersLow))} (window low ${m.identifiedEmployersLow})`,
    );
  }
  // Regions is a completeness fact (all 21 Swedish regions), not a floor.
  if (claim.regions !== m.regions) {
    failures.push(
      `regions must equal the measurement exactly: claim ${claim.regions}, measured ${m.regions}`,
    );
  }
  return failures;
}

/** A floor may never exceed what a multi-day browsable-basis window measured. */
export function floorsAreSupportedBy(
  claim: MarketCoverageClaim,
  m: MarketMeasurement,
): boolean {
  return floorSupportFailures(claim, m).length === 0;
}

/**
 * The one safe English coverage sentence. Coverage framing only — no
 * adoption verb can enter through this template.
 */
const CLAIM_NUMBER = new Intl.NumberFormat("en-US");

export function formatCoverageClaim(c: MarketCoverageClaim): string {
  return `${CLAIM_NUMBER.format(c.activeVacanciesFloor)}+ active job opportunities from ${CLAIM_NUMBER.format(c.identifiedEmployersFloor)}+ employers across all ${c.regions} Swedish regions`;
}

/**
 * Pure validator: does `copy` attach an adoption verb to a company count
 * while citing marketplace data? Used by the guard test over marketing
 * message catalogs; exported so future copy checks reuse ONE rule.
 */
export function violatesAdoptionClaimRule(copy: string): boolean {
  const lower = copy.toLowerCase();
  const mentionsCompanyCount =
    /\b\d[\d\s.,]*\+?\s*(companies|employers|įmon\w+|darbdav\w+)/i.test(copy);
  if (!mentionsCompanyCount) return false;
  return ADOPTION_VERBS.some((v) => lower.includes(v));
}
