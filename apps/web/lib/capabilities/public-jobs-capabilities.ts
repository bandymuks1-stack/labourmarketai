import "server-only";

import { z } from "zod";

import type { ExecResult } from "@/lib/conversation/executor-contract";
import {
  PUBLIC_VACANCY_PAGE_SIZE,
  readPublicVacancyPreviewWith,
  searchPublicVacancyPreviews,
  type PublicVacancyPreview,
} from "@/lib/vacancy-store/public-vacancy-preview";

import type { CapabilityAnnotations, CapabilityCaller, CapabilityDescriptor } from "./contract";

/**
 * PUBLIC JOBS — the public vacancy board for a bearer client (the phone first).
 *
 * CANONICAL CORE → MCP WRAPPER, nothing new underneath: `jobs.search` runs the
 * SAME `searchPublicVacancyPreviews` the public /jobs page runs (its cache,
 * its page size, its statement-timeout handling), and `jobs.get` the same
 * single-preview read. Both go through the caller's OWN RLS-scoped client, so
 * a bearer caller receives exactly the anonymous projection the database
 * function returns — the public boundary is enforced one layer below this
 * file (`search_public_vacancy_previews_v1` / `get_public_vacancy_preview_v1`
 * enumerate the safe columns), never widened here.
 *
 * Why these are NOT `work.find`: `work.find` is the caller's PERSONAL board
 * (ranked matches, platform demand + external cards). This is the open
 * supply a person browses before anything matches them — the first thing a
 * worker does on a phone. The two stay apart as they are on the web.
 *
 * Capability controls: read-only, idempotent, no PII in or out, rate-limited
 * and audited by the MCP door like every tool; `page` is bounded so a client
 * cannot walk the whole supply in one call; `query` and `profession` are
 * length-bounded and passed to the SQL function as parameters.
 */
const READ: CapabilityAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const MAX_PAGE = 100;

const jobsSearchInput = z
  .object({
    /** Free text matched by the SQL function (occupation, profession). */
    query: z.string().trim().max(120).optional(),
    /** Work-type slug from the professions catalogue. */
    profession: z.string().trim().max(64).optional(),
    /** 1-based; the board's own page size. */
    page: z.number().int().min(1).max(MAX_PAGE).optional(),
  })
  .strict();

const jobsGetInput = z.object({ id: z.string().uuid() }).strict();

function jobOf(caller: CapabilityCaller, v: PublicVacancyPreview) {
  return {
    id: v.id,
    professionSlug: v.professionSlug,
    occupation: v.occupation,
    employmentForm: v.employmentForm,
    workingTime: v.workingTime,
    positions: v.positions,
    compensationCurrency: v.compensationCurrency,
    compensationMin: v.compensationMin,
    compensationMax: v.compensationMax,
    sourceLanguage: v.sourceLanguage,
    publishedAt: v.publishedAt,
    /** The web page that carries the member-only details (title, employer,
     *  place, application link) for a signed-in person — the phone opens it
     *  in the browser; the app does not re-derive the member projection. */
    webPath: `/${caller.locale}/jobs/${v.id}`,
  };
}

const NOT_PROVISIONED: ExecResult = {
  ok: false,
  code: "needs_migration",
  message: "The public jobs board is not enabled on this environment. Nothing was read.",
};

const UNAVAILABLE: ExecResult = {
  ok: false,
  code: "unavailable",
  message: "The jobs board did not answer in time. That is not the same as 'no jobs' — try again.",
};

const jobsSearch: CapabilityDescriptor = {
  id: "jobs.search",
  kind: "read",
  title: "Search public jobs",
  description:
    "The public vacancy board — the same read the website's /jobs page performs, " +
    "in the same anonymous projection (no employer name, place, title or " +
    "application link; those are on each job's webPath for a signed-in person). " +
    "Optional free-text `query`, a `profession` work-type slug, and a 1-based " +
    "`page` of " +
    PUBLIC_VACANCY_PAGE_SIZE +
    ". Answers totalCount and hasMore. Reads nothing about the caller; writes nothing.",
  exposed: true,
  annotations: READ,
  inputSchema: jobsSearchInput,
  run: async (caller, input): Promise<ExecResult> => {
    const f = jobsSearchInput.parse(input);
    const page = f.page ?? 1;
    const result = await searchPublicVacancyPreviews(
      {
        query: f.query && f.query !== "" ? f.query : null,
        professionSlug: f.profession && f.profession !== "" ? f.profession : null,
        page,
      },
      caller.supabase,
    );
    if (result.status === "not_provisioned") return NOT_PROVISIONED;
    if (result.status === "unavailable") return UNAVAILABLE;
    return {
      ok: true,
      data: {
        status: "ok",
        page,
        pageSize: PUBLIC_VACANCY_PAGE_SIZE,
        totalCount: result.totalCount,
        hasMore: result.hasMore,
        jobs: result.vacancies.map((v) => jobOf(caller, v)),
      },
    };
  },
};

const jobsGet: CapabilityDescriptor = {
  id: "jobs.get",
  kind: "read",
  title: "One public job",
  description:
    "One vacancy from the public board by id, in the same anonymous projection " +
    "as jobs.search. `not_found` when no live vacancy carries the id. Writes nothing.",
  exposed: true,
  annotations: READ,
  inputSchema: jobsGetInput,
  run: async (caller, input): Promise<ExecResult> => {
    const { id } = jobsGetInput.parse(input);
    const read = await readPublicVacancyPreviewWith(caller.supabase, id);
    if (read === "not_provisioned") return NOT_PROVISIONED;
    if (read === null) {
      return {
        ok: false,
        code: "not_found",
        message: "No live public vacancy carries this id (it may have closed).",
      };
    }
    return { ok: true, data: { job: jobOf(caller, read) } };
  },
};

export const PUBLIC_JOBS_CAPABILITIES: readonly CapabilityDescriptor[] = [jobsSearch, jobsGet];
