import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

import {
  COUNTRY_CODE_PATTERN,
  HEADCOUNT_MAX,
  HEADCOUNT_MIN,
  JOB_POSTING_STATUSES,
  JOB_POSTING_VISIBILITIES,
  PREFERRED_COUNTRIES_MAX,
  PROJECT_TITLE_MAX,
  ROLE_TITLE_MAX,
  SALARY_MAX_EUR,
  SALARY_MIN_EUR,
  type JobPostingInput,
  type JobPostingResult,
  type JobPostingRow,
  type JobPostingStatus,
} from "./types";

/**
 * Job Postings v1 — service module.
 *
 * Privacy / safety:
 *
 *   - All calls go through the user's authenticated Supabase client.
 *     RLS (job_demands_write + owns_company) enforces ownership; this
 *     layer adds defence-in-depth: company-role precheck, server-side
 *     sanitisation, and shape-validated tagged results.
 *   - Never imports the elevated server-side credential. Using one
 *     would bypass RLS entirely; the service module is intentionally
 *     constrained to the user session.
 *   - Never invents matching / verification / "shared by default"
 *     fields.  Status starts at 'open' and visibility at the explicit
 *     user choice.
 *   - All string inputs are trimmed and length-capped before insert.
 *   - On Supabase "row level security" / "42501" / "permission denied"
 *     errors the action returns `code: "permission_denied"` so the UI
 *     can render the precise LT/EN reason (typically: migration 0023
 *     not yet applied on prod, or the user lost their company role).
 */

// The generated Supabase Database type does not yet describe the v1
// job_demands columns through the typed client. Use a narrow `any` cast
// at the call site — RLS still enforces every row at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase as unknown;
}

function nullableTrim(value: string | undefined, max: number): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length === 0 ? null : trimmed;
}

function clampInt(
  value: number | undefined,
  lo: number,
  hi: number,
): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value)) return null;
  const i = Math.floor(value);
  if (i < lo) return lo;
  if (i > hi) return hi;
  return i;
}

function sanitiseCountries(
  countries: readonly string[] | undefined,
): string[] | null {
  if (!countries) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of countries) {
    if (typeof c !== "string") continue;
    const upper = c.trim().toUpperCase();
    if (!COUNTRY_CODE_PATTERN.test(upper)) continue;
    if (seen.has(upper)) continue;
    seen.add(upper);
    out.push(upper);
    if (out.length >= PREFERRED_COUNTRIES_MAX) break;
  }
  return out.length === 0 ? null : out;
}

function nullableIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  // Reject obviously invalid calendar dates (e.g. 2026-13-01).
  const t = Date.parse(`${trimmed}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return trimmed;
}

/** Returns the company_id owned by the authenticated user, or null
 *  if the user has no company row. */
async function resolveOwnCompanyId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const res = await supabase
    .from("companies")
    .select("id")
    .eq("profile_id", userId)
    .maybeSingle();
  if (res.error || !res.data) return null;
  return (res.data.id as string) ?? null;
}

function mapPermissionError(
  rawMessage: string | null | undefined,
): JobPostingResult<never> | null {
  const msg = rawMessage ?? "";
  if (/row level security|policy|permission denied|42501/i.test(msg)) {
    return {
      ok: false,
      code: "permission_denied",
      message:
        "Negalima vykdyti veiksmo — galimai dar nepritaikytas " +
        "0023 migracijos GRANT arba prarasta įmonės rolė.",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Read: list own postings for the dashboard.
// ---------------------------------------------------------------------------

export async function listJobPostingsForOwnCompany(): Promise<
  JobPostingResult<readonly JobPostingRow[]>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: "Sesija nutrūko. Prisijunkite iš naujo.",
    };
  }

  const companyId = await resolveOwnCompanyId(supabase, user.id);
  if (!companyId) {
    // No company yet — the dashboard shows the empty state.
    return { ok: true, data: [] };
  }

  // Pull project ids the user owns first; RLS already gates this set.
  const projects = await supabase
    .from("projects")
    .select("id, title")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (projects.error) {
    const perm = mapPermissionError(projects.error.message);
    if (perm) return perm;
    return {
      ok: false,
      code: "insert_failed",
      message: `Nepavyko įkelti projektų: ${projects.error.message}`,
    };
  }
  const projectMap = new Map<string, string>();
  for (const row of projects.data ?? []) {
    projectMap.set(row.id as string, (row.title as string | null) ?? "");
  }
  if (projectMap.size === 0) {
    return { ok: true, data: [] };
  }

  const jobs = await asAny(supabase)
    .from("job_demands")
    .select(
      "id, project_id, role_title, headcount_needed, status, visibility, preferred_countries, salary_offered_eur, start_date, created_at, updated_at",
    )
    .in("project_id", Array.from(projectMap.keys()))
    .order("created_at", { ascending: false })
    .limit(200);
  if (jobs.error) {
    const perm = mapPermissionError(jobs.error.message);
    if (perm) return perm;
    return {
      ok: false,
      code: "insert_failed",
      message: `Nepavyko įkelti darbo skelbimų: ${jobs.error.message}`,
    };
  }

  const rows: JobPostingRow[] = (jobs.data ?? []).map(
    (r: Record<string, unknown>): JobPostingRow => ({
      id: r.id as string,
      projectId: r.project_id as string,
      projectTitle: projectMap.get(r.project_id as string) ?? "",
      roleTitle: ((r.role_title as string | null) ?? "").toString(),
      headcountNeeded: (r.headcount_needed as number | null) ?? null,
      status: ((r.status as string | null) ?? "open") as JobPostingStatus,
      visibility: ((r.visibility as string | null) ?? "public") as JobPostingRow["visibility"],
      preferredCountries:
        (r.preferred_countries as readonly string[] | null) ?? null,
      salaryOfferedEur: (r.salary_offered_eur as number | null) ?? null,
      startDate: (r.start_date as string | null) ?? null,
      createdAtIso: r.created_at as string,
      updatedAtIso: r.updated_at as string,
    }),
  );

  return { ok: true, data: rows };
}

// ---------------------------------------------------------------------------
// Write: create a new posting (auto-creates a project per posting in v1).
// ---------------------------------------------------------------------------

export async function createJobPosting(
  rawInput: JobPostingInput,
): Promise<JobPostingResult<{ id: string; projectId: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: "Sesija nutrūko. Prisijunkite iš naujo.",
    };
  }

  // ---- sanitise + validate input -----------------------------------------
  const roleTitle = nullableTrim(rawInput.roleTitle, ROLE_TITLE_MAX);
  if (!roleTitle) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Pareigybė privaloma.",
    };
  }
  const projectTitle =
    nullableTrim(rawInput.projectTitle, PROJECT_TITLE_MAX) ?? roleTitle;
  const headcount = clampInt(
    rawInput.headcountNeeded ?? 1,
    HEADCOUNT_MIN,
    HEADCOUNT_MAX,
  );
  const startDate = nullableIsoDate(rawInput.startDate);
  const salary = clampInt(
    rawInput.salaryOfferedEur,
    SALARY_MIN_EUR,
    SALARY_MAX_EUR,
  );
  const countries = sanitiseCountries(rawInput.preferredCountries);
  const visibility = (
    rawInput.visibility &&
    (JOB_POSTING_VISIBILITIES as readonly string[]).includes(rawInput.visibility)
      ? rawInput.visibility
      : "public"
  ) as JobPostingInput["visibility"];

  // ---- ensure the caller owns a company ----------------------------------
  const companyId = await resolveOwnCompanyId(supabase, user.id);
  if (!companyId) {
    return {
      ok: false,
      code: "no_company_for_profile",
      message:
        "Neturite priskirtos įmonės. Atidarykite onboarding'ą ir " +
        "užregistruokite įmonę, tada bandykite iš naujo.",
    };
  }

  // ---- create a project (v1: one project per posting) --------------------
  // Projects RLS lets owners insert when company_id passes
  // owns_company(); GRANT comes from migration 0023.
  const projectInsert = await supabase
    .from("projects")
    .insert({
      company_id: companyId,
      title: projectTitle,
      status: "live",
      housing_provided: rawInput.housingProvided ?? null,
    })
    .select("id")
    .single();
  if (projectInsert.error || !projectInsert.data?.id) {
    const perm = mapPermissionError(projectInsert.error?.message);
    if (perm) return perm;
    return {
      ok: false,
      code: "insert_failed",
      message: `Projekto sukurti nepavyko: ${
        projectInsert.error?.message ?? "nežinoma klaida"
      }`,
    };
  }
  const projectId = projectInsert.data.id as string;

  // ---- create the job_demand --------------------------------------------
  const jobInsert = await asAny(supabase)
    .from("job_demands")
    .insert({
      project_id: projectId,
      role_title: roleTitle,
      headcount_needed: headcount,
      preferred_countries: countries,
      salary_offered_eur: salary,
      start_date: startDate,
      status: "open" as JobPostingStatus,
      visibility,
    })
    .select("id")
    .single();
  if (jobInsert.error || !jobInsert.data?.id) {
    const perm = mapPermissionError(jobInsert.error?.message);
    if (perm) return perm;
    return {
      ok: false,
      code: "insert_failed",
      message: `Darbo skelbimo sukurti nepavyko: ${
        jobInsert.error?.message ?? "nežinoma klaida"
      }`,
    };
  }

  return {
    ok: true,
    data: { id: jobInsert.data.id as string, projectId },
  };
}

// ---------------------------------------------------------------------------
// Write: change status of an existing posting (owner only via RLS).
// ---------------------------------------------------------------------------

export async function updateJobPostingStatus(
  id: string,
  nextStatus: JobPostingStatus,
): Promise<JobPostingResult> {
  if (!(JOB_POSTING_STATUSES as readonly string[]).includes(nextStatus)) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Neteisinga statuso reikšmė.",
    };
  }
  if (!id || typeof id !== "string") {
    return {
      ok: false,
      code: "invalid_input",
      message: "Trūksta darbo skelbimo identifikatoriaus.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: "Sesija nutrūko. Prisijunkite iš naujo.",
    };
  }

  const update = await asAny(supabase)
    .from("job_demands")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (update.error) {
    const perm = mapPermissionError(update.error.message);
    if (perm) return perm;
    return {
      ok: false,
      code: "update_failed",
      message: `Nepavyko atnaujinti statuso: ${update.error.message}`,
    };
  }
  return { ok: true };
}
