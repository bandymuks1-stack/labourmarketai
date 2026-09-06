/**
 * Conversation "what are my search criteria?" — contract + pure logic.
 *
 * The chat must answer this question from the worker's REAL persisted state
 * (doctrine §18: no generic fallback when the system holds the facts). This
 * module is the pure half: given a snapshot of canonical rows it decides which
 * criteria are set and which important ones are missing. No IO, no i18n — the
 * server half (`criteria-summary.ts`) loads the rows and localizes.
 */

export type CriteriaSnapshot = {
  hasWorkerProfile: boolean;
  /** profile_skill_claims count (the worker-owned skill claims). */
  skillsCount: number;
  /** worker_languages codes, e.g. ["lt","en"]. */
  languages: string[];
  /** workers.preferred_countries ISO-2 codes. */
  preferredCountries: string[];
  salaryMinEur: number | null;
  salaryMaxEur: number | null;
  availabilityStatus: string | null;
  /** workers.available_from ISO date. */
  availableFrom: string | null;
  willingToRelocate: boolean | null;
  preferredContractType: string | null;
  /** worker_documents rows the worker owns. */
  documentsCount: number;
  /** workers.current_location_country ISO-2 (W6: the work-card prefill reads
   *  it; matching does not, so it is no criterion and stays optional). */
  locationCountry?: string | null;
};

/** W6: the current card as form state for `worker.save-work-card`, or the
 *  NAMED reason there is none — the form then opens blank, and a blank field
 *  is "keep", so nothing recorded is lost either way. */
export type WorkCardPrefillResult =
  | { kind: "prefill"; values: Record<string, string | boolean> }
  | { kind: "unavailable"; reason: "no_worker" | "not_authed" };

/** The criteria the matching engine actually consumes, in report order. A key
 *  is "missing" only when its absence genuinely weakens matching — mirrors the
 *  gap codes in lib/opportunities/opportunity-fit.ts, never invents new ones. */
export const CRITERIA_KEYS = [
  "skills",
  "languages",
  "countries",
  "salary",
  "availability",
  "start",
  "relocate",
  "contract",
  "documents",
] as const;
export type CriteriaKey = (typeof CRITERIA_KEYS)[number];

/** Which criteria have a real value in the snapshot. */
export function presentCriteria(s: CriteriaSnapshot): Record<CriteriaKey, boolean> {
  return {
    skills: s.skillsCount > 0,
    languages: s.languages.length > 0,
    countries: s.preferredCountries.length > 0,
    salary: s.salaryMinEur != null || s.salaryMaxEur != null,
    availability: Boolean(s.availabilityStatus),
    start: Boolean(s.availableFrom),
    relocate: s.willingToRelocate != null,
    contract: Boolean(s.preferredContractType),
    documents: s.documentsCount > 0,
  };
}

/** The IMPORTANT gaps, in the order the chat should ask about them. Only
 *  criteria that matching genuinely uses are listed as missing — a worker with
 *  no relocation answer is a gap; an empty contract preference is optional and
 *  therefore never nagged about. */
const IMPORTANT: readonly CriteriaKey[] = [
  "skills",
  "countries",
  "availability",
  "languages",
  "salary",
];

export function missingImportantCriteria(s: CriteriaSnapshot): CriteriaKey[] {
  const present = presentCriteria(s);
  return IMPORTANT.filter((k) => !present[k]);
}

export type CriteriaLine = { key: CriteriaKey; label: string; value: string };

export type CriteriaResult =
  | {
      kind: "criteria";
      intro: string;
      lines: CriteriaLine[];
      /** Localized names of important criteria that are still unset. */
      missing: string[];
      missingIntro: string | null;
    }
  | { kind: "blocked"; message: string };
