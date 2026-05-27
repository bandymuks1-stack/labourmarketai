/**
 * Job Postings v1 — type model.
 *
 * Mirrors the `public.job_demands` shape (0001 schema) and the
 * `public.projects` parent table. Pure types; no Supabase / network
 * imports.
 */

export type JobPostingStatus = "open" | "paused" | "filled" | "closed";

export type JobPostingVisibility =
  | "public"
  | "agencies_only"
  | "direct_only";

export const JOB_POSTING_STATUSES: readonly JobPostingStatus[] = [
  "open",
  "paused",
  "filled",
  "closed",
];

export const JOB_POSTING_VISIBILITIES: readonly JobPostingVisibility[] = [
  "public",
  "agencies_only",
  "direct_only",
];

/** What the UI sends when creating a posting. */
export interface JobPostingInput {
  /** Required. Trimmed + capped server-side. */
  readonly roleTitle: string;
  /** Optional, defaults to 1. Clamped to 1..500 server-side. */
  readonly headcountNeeded?: number;
  /** Optional ISO date (YYYY-MM-DD). */
  readonly startDate?: string;
  /** Optional. Salary in EUR, clamped to 0..1_000_000. */
  readonly salaryOfferedEur?: number;
  /** Optional. List of ISO-3166-1 alpha-2 country codes, capped at 10. */
  readonly preferredCountries?: readonly string[];
  /** Default 'public'. */
  readonly visibility?: JobPostingVisibility;
  /** Optional project title; defaults to roleTitle so the user does
   *  not have to invent a separate project concept on day one. */
  readonly projectTitle?: string;
  /** Optional housing flag for the project. */
  readonly housingProvided?: boolean;
}

/** What the read-side returns to the page. Joins through
 *  job_demands → projects → companies so the dashboard can render
 *  the project title without a second round-trip. */
export interface JobPostingRow {
  readonly id: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly roleTitle: string;
  readonly headcountNeeded: number | null;
  readonly status: JobPostingStatus;
  readonly visibility: JobPostingVisibility;
  readonly preferredCountries: readonly string[] | null;
  readonly salaryOfferedEur: number | null;
  readonly startDate: string | null;
  readonly createdAtIso: string;
  readonly updatedAtIso: string;
}

/** Tagged-result error codes the action layer may return. The UI
 *  maps each code to a precise LT/EN message via i18n keys. */
export type JobPostingErrorCode =
  | "not_authenticated"
  | "not_a_company_role"
  | "no_company_for_profile"
  | "invalid_input"
  | "permission_denied"
  | "insert_failed"
  | "update_failed"
  | "not_found";

export type JobPostingResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; code: JobPostingErrorCode; message: string };

// Server-side validation bounds (also enforced in `job-postings.ts`).
export const ROLE_TITLE_MAX = 200;
export const PROJECT_TITLE_MAX = 200;
export const HEADCOUNT_MIN = 1;
export const HEADCOUNT_MAX = 500;
export const SALARY_MIN_EUR = 0;
export const SALARY_MAX_EUR = 1_000_000;
export const PREFERRED_COUNTRIES_MAX = 10;
export const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
