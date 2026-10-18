/**
 * JOB ALERT MODEL — which REAL, ACTIVE jobs are worth telling ONE worker about
 * (owner P0, stream N, 2026-10-01). Pure: no IO, no env, no clock of its own.
 *
 * NOT A SECOND ENGINE. The criteria are the three the owner named —
 * PROFESSION, DESIRED COUNTRIES, SALARY EXPECTATION — and each is judged with
 * exactly the rule the ONE match engine (`matchWorkerToNeed`, lib/market/
 * match-v1.ts) applies to the same fact:
 *
 *   profession  the engine's `profession_match` (the ad's profession is one the
 *               person DECLARED). The engine also admits "related" professions
 *               (`profession_related`); an alert is stricter on purpose —
 *               a notification interrupts, a board merely lists — so a related
 *               trade is on the board but never a bell.
 *   country     the engine's `mobility_match` (the ad's country is one of the
 *               person's preferred countries).
 *   salary      the engine's `pay_above_offer` rule: the person's expected
 *               minimum above the ad's offered ceiling excludes it, and ONLY
 *               when the ad quoted a comparable (EUR) ceiling. An ad with no
 *               stated or no EUR pay is UNKNOWN — never zero, never a mismatch
 *               (SEP-7: UNKNOWN != ZERO).
 *
 * MISSING PREFERENCES ARE NOT FABRICATED. A person with no declared
 * profession or no preferred country gets NO alerts — the model reports which
 * criterion is missing so the UI can ask for it. Salary is optional: without
 * it nothing is excluded on pay.
 */
import type { StoredPublicVacancyV1 } from "@/lib/vacancy-store/vacancy-read";
import { deterministicEntityId } from "@/lib/notifications/deterministic-entity-id";

export interface JobAlertCriteria {
  /** Catalogue profession slugs the person declared (any order). */
  readonly professionSlugs: readonly string[];
  /** ISO-3166 alpha-2 codes the person wants to work in. */
  readonly preferredCountries: readonly string[];
  /** Expected minimum pay in EUR, or null when not stated. */
  readonly salaryMinEur: number | null;
}

export type JobAlertMissingCriterion = "profession" | "country";

/** What a person still has to say before alerts can exist. [] = alert-ready. */
export function missingJobAlertCriteria(
  c: JobAlertCriteria,
): JobAlertMissingCriterion[] {
  const missing: JobAlertMissingCriterion[] = [];
  if (norm(c.professionSlugs).length === 0) missing.push("profession");
  if (norm(c.preferredCountries).length === 0) missing.push("country");
  return missing;
}

function norm(values: readonly string[]): string[] {
  return [
    ...new Set(
      values.map((v) => (v ?? "").trim().toLowerCase()).filter((v) => v !== ""),
    ),
  ];
}

/** An ad's offered pay ceiling, in EUR, ONLY when the publisher quoted EUR. */
export function comparableOfferedMaxEur(
  v: Pick<StoredPublicVacancyV1, "compensation">,
): number | null {
  const comp = v.compensation;
  return comp.currency === "EUR" && typeof comp.max === "number" ? comp.max : null;
}

export type JobAlertFit =
  | { readonly fits: true; readonly salaryKnown: boolean }
  | {
      readonly fits: false;
      readonly why:
        | "missing_criteria"
        | "profession"
        | "country"
        | "salary_above_offer"
        | "not_live";
    };

/** Is this ad live right now? Same rule as `searchPublicVacancies`
 *  (is_active is applied by the read; expiry is re-checked here so a row read a
 *  moment ago is never announced after it lapsed). */
export function isLiveAt(
  v: Pick<StoredPublicVacancyV1, "expiresAt">,
  nowIso: string,
): boolean {
  return v.expiresAt === null || v.expiresAt > nowIso;
}

export function jobAlertFit(
  criteria: JobAlertCriteria,
  v: Pick<
    StoredPublicVacancyV1,
    "professionSlug" | "location" | "compensation" | "expiresAt"
  >,
  nowIso: string,
): JobAlertFit {
  if (missingJobAlertCriteria(criteria).length > 0) {
    return { fits: false, why: "missing_criteria" };
  }
  if (!isLiveAt(v, nowIso)) return { fits: false, why: "not_live" };

  const professions = norm(criteria.professionSlugs);
  const adProfession = (v.professionSlug ?? "").trim().toLowerCase();
  if (adProfession === "" || !professions.includes(adProfession)) {
    return { fits: false, why: "profession" };
  }

  const countries = norm(criteria.preferredCountries);
  const adCountry = (v.location.country ?? "").trim().toLowerCase();
  if (adCountry === "" || !countries.includes(adCountry)) {
    return { fits: false, why: "country" };
  }

  const offered = comparableOfferedMaxEur(v);
  if (offered !== null && criteria.salaryMinEur !== null) {
    if (criteria.salaryMinEur > offered) {
      return { fits: false, why: "salary_above_offer" };
    }
    return { fits: true, salaryKnown: true };
  }
  // Unknown on either side: not excluded, and not claimed as satisfied.
  return { fits: true, salaryKnown: false };
}

/** An alert is about NEW work: published (or, absent that, captured) inside the
 *  window. Older ads are on the board, never in the bell. */
export function isFreshForAlert(
  v: Pick<StoredPublicVacancyV1, "publishedAt" | "capturedAt">,
  nowIso: string,
  windowDays: number,
): boolean {
  const stamp = v.publishedAt || v.capturedAt;
  if (!stamp) return false;
  const since = new Date(
    new Date(nowIso).getTime() - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  return stamp >= since;
}

/** Days an ad counts as new. Three, so a missed daily run is still covered;
 *  exactly-once delivery is the dedupe key's job, not the window's. */
export const JOB_ALERT_WINDOW_DAYS = 3;

/** Most alerts one person receives per run. A burst of fifty fitting ads is
 *  a digest problem, not fifty bells: the newest few ring, the rest wait on the
 *  board. */
export const JOB_ALERT_MAX_PER_RUN = 3;

/** Newest-first selection of the ads to announce. Pure + deterministic. */
export function selectJobAlertVacancies<
  V extends Pick<
    StoredPublicVacancyV1,
    | "professionSlug"
    | "location"
    | "compensation"
    | "expiresAt"
    | "publishedAt"
    | "capturedAt"
    | "storeId"
  >,
>(
  criteria: JobAlertCriteria,
  candidates: readonly V[],
  nowIso: string,
): V[] {
  return candidates
    .filter(
      (v) =>
        v.storeId !== null &&
        isFreshForAlert(v, nowIso, JOB_ALERT_WINDOW_DAYS) &&
        jobAlertFit(criteria, v, nowIso).fits,
    )
    .sort((a, b) =>
      (b.publishedAt || b.capturedAt).localeCompare(a.publishedAt || a.capturedAt),
    )
    .slice(0, JOB_ALERT_MAX_PER_RUN);
}

/**
 * Exactly-once identity of one announcement: this ad, in THIS revision. The
 * store's UNIQUE (recipient, dedupe_key) turns the deterministic id into
 * "the same unchanged job is never sent again to the same person"; an ad the
 * publisher materially changed (new content hash) is a different fact.
 */
export function jobAlertEntityId(storeId: string, contentHash: string): string {
  return deterministicEntityId(`job_alert:${storeId}:${contentHash}`);
}

/** The first-layer facts a notification may carry: public-ad facts only. */
export interface JobAlertFacts {
  readonly vacancyId: string;
  readonly title: string;
  readonly country: string;
  readonly salary: string | null;
}

/** "2500-3200 EUR" / "up to 3200 EUR" — ONLY a EUR figure the publisher
 *  stated; anything else is null (unknown is never rendered as a number). */
export function formatOfferedPay(
  v: Pick<StoredPublicVacancyV1, "compensation">,
): string | null {
  const comp = v.compensation;
  if (comp.currency !== "EUR") return null;
  const min = typeof comp.min === "number" ? Math.round(comp.min) : null;
  const max = typeof comp.max === "number" ? Math.round(comp.max) : null;
  if (min !== null && max !== null) {
    return min === max ? `${max} EUR` : `${min}-${max} EUR`;
  }
  if (max !== null) return `${max} EUR`;
  if (min !== null) return `${min} EUR`;
  return null;
}

export function jobAlertFacts(
  v: Pick<
    StoredPublicVacancyV1,
    "storeId" | "titleRaw" | "location" | "compensation"
  >,
): JobAlertFacts | null {
  if (!v.storeId) return null;
  const title = (v.titleRaw ?? "").trim();
  if (title === "") return null;
  return {
    vacancyId: v.storeId,
    title: title.slice(0, 110),
    country: (v.location.country ?? "").trim().toUpperCase(),
    salary: formatOfferedPay(v),
  };
}
