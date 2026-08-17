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
 * Coverage numbers move daily, so public copy uses FLOOR values ("41,000+",
 * "7,600+") that a fresh production count can only exceed while the import
 * cadence is live; any re-quote must re-derive them from
 * `public_vacancies`, never from this file alone.
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

/** The proven 2026-08-17 floors (production read-back). */
export const SWEDEN_COVERAGE_2026_08_17: MarketCoverageClaim = {
  activeVacanciesFloor: 41000,
  identifiedEmployersFloor: 7600,
  regions: 21,
  country: "Sweden",
};

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
