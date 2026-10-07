"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { buildOwnWorkerContext } from "@/lib/opportunities/worker-subject";
import { loadJobAlertVacancies, pairReaderFor } from "@/lib/opportunities/job-alert-candidates";
import {
  jobAlertFacts,
  missingJobAlertCriteria,
  type JobAlertCriteria,
  type JobAlertMissingCriterion,
} from "@/lib/opportunities/job-alert-model";

/**
 * "KOKIŲ NAUJŲ DARBŲ MAN ATSIRADO?" — the chat's door onto the ONE job-alert
 * matching (owner 2026-10-01). Nothing here matches or ranks: the criteria are
 * the person's own (profession slugs, preferred countries, minimum pay) read
 * exactly the way the alert emitter reads them, and the ads come from the
 * canonical vacancy read through `loadJobAlertVacancies` — the same function
 * that feeds the notification bell. Chat, bell and board therefore agree on
 * what "new work for me" is.
 *
 * Honest states: no worker profile, preferences still missing (named, so the
 * chat can ask for them), a failed read (never "no new jobs"), and an empty
 * answer that really is empty. Public-ad facts only; nothing is written.
 */
export type NewJobItem = {
  readonly id: string;
  readonly title: string;
  readonly country: string;
  readonly salary: string | null;
};

export type NewJobsForChat =
  | { readonly kind: "ok"; readonly jobs: readonly NewJobItem[] }
  | { readonly kind: "empty" }
  | { readonly kind: "incomplete"; readonly missing: readonly JobAlertMissingCriterion[] }
  | { readonly kind: "no-worker" }
  | { readonly kind: "unavailable" };

export async function loadNewJobsForChat(): Promise<NewJobsForChat> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "no-worker" };
    const ctx = await buildOwnWorkerContext(supabase, user.id);
    if (!ctx) return { kind: "no-worker" };
    const criteria: JobAlertCriteria = {
      professionSlugs: ctx.subject.professionSlugs?.length
        ? [...ctx.subject.professionSlugs]
        : ctx.subject.professionSlug
          ? [ctx.subject.professionSlug]
          : [],
      preferredCountries: [...(ctx.subject.preferredCountries ?? [])],
      salaryMinEur: ctx.subject.salaryMinEur ?? null,
    };
    const missing = missingJobAlertCriteria(criteria);
    if (missing.length > 0) return { kind: "incomplete", missing };

    const nowIso = new Date().toISOString();
    const vacancies = await loadJobAlertVacancies(pairReaderFor(supabase, nowIso), criteria, nowIso);
    const jobs: NewJobItem[] = [];
    for (const v of vacancies) {
      const f = jobAlertFacts(v);
      if (f) jobs.push({ id: f.vacancyId, title: f.title, country: f.country, salary: f.salary });
    }
    return jobs.length > 0 ? { kind: "ok", jobs } : { kind: "empty" };
  } catch {
    return { kind: "unavailable" };
  }
}
