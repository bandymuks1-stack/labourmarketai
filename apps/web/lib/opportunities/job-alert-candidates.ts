import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  searchPublicVacancies,
  type StoredPublicVacancyV1,
} from "@/lib/vacancy-store/vacancy-read";
import {
  selectJobAlertVacancies,
  type JobAlertCriteria,
} from "./job-alert-model";

/**
 * The candidate READ behind job alerts. It is the CANONICAL vacancy read —
 * `searchPublicVacancies` (active + not-expired predicate, the country and
 * profession indexes, newest first) — asked once per (profession x country)
 * the person declared. No second jobs query, no second "is it active" rule.
 *
 * The caller chooses the client: the worker's OWN session client (RLS, what
 * the board uses) for the read-time path, the service-role client for the
 * sweep. Either way the rows are public-ad rows.
 */

type VacancyDbClient = Pick<SupabaseClient, "from">;

/** Bounded fan-out: at most this many (profession x country) reads per person. */
export const JOB_ALERT_MAX_PAIRS = 8;

/** Per pair: the newest ads only — an alert is about NEW work. */
const PER_PAIR_LIMIT = 20;

export type JobAlertPairReader = (
  country: string,
  professionSlug: string,
) => Promise<readonly StoredPublicVacancyV1[]>;

/** Reader over a client; a failed read is an empty answer for that pair (the
 *  alert path never throws into a render or aborts a sweep). */
export function pairReaderFor(
  client: VacancyDbClient,
  nowIso: string,
): JobAlertPairReader {
  return async (country, professionSlug) => {
    try {
      const res = await searchPublicVacancies(client, {
        country,
        professionSlug,
        query: null,
        limit: PER_PAIR_LIMIT,
        nowIso,
      });
      return res.status === "ok" ? res.vacancies : [];
    } catch {
      return [];
    }
  };
}

export function criteriaPairs(
  criteria: JobAlertCriteria,
): { country: string; professionSlug: string }[] {
  const pairs: { country: string; professionSlug: string }[] = [];
  for (const professionSlug of criteria.professionSlugs) {
    for (const country of criteria.preferredCountries) {
      const c = country.trim().toUpperCase();
      const p = professionSlug.trim().toLowerCase();
      if (!c || !p) continue;
      if (pairs.some((x) => x.country === c && x.professionSlug === p)) continue;
      pairs.push({ country: c, professionSlug: p });
    }
  }
  return pairs.slice(0, JOB_ALERT_MAX_PAIRS);
}

/** The ads to announce to ONE person: canonical read per pair, then the pure
 *  selection (live, fresh, fits profession + country + salary, newest first,
 *  capped). */
export async function loadJobAlertVacancies(
  read: JobAlertPairReader,
  criteria: JobAlertCriteria,
  nowIso: string,
): Promise<StoredPublicVacancyV1[]> {
  const pairs = criteriaPairs(criteria);
  if (pairs.length === 0) return [];
  const lists = await Promise.all(
    pairs.map((p) => read(p.country, p.professionSlug)),
  );
  const byId = new Map<string, StoredPublicVacancyV1>();
  for (const v of lists.flat()) {
    if (v.storeId && !byId.has(v.storeId)) byId.set(v.storeId, v);
  }
  return selectJobAlertVacancies(criteria, [...byId.values()], nowIso);
}
