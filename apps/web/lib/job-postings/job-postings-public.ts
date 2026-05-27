import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

import type {
  JobPostingResult,
  JobPostingRow,
  JobPostingStatus,
  JobPostingVisibility,
} from "./types";

/**
 * Worker-facing job discovery v1 (Sprint A2).
 *
 * Returns the public, currently-open job_demands the authenticated
 * user is allowed to see. The job_demands_select RLS policy already
 * filters by status='open' AND visibility='public' for non-owner
 * worker sessions, so this query is the safe default — the worker
 * session will only ever receive postings it has permission to read.
 *
 * Non-goals (handled in later sprints):
 *   - matching / scoring (A3)
 *   - apply / message company (A4)
 *   - filtering by skill / country / salary range (A3 polish)
 *
 * Privacy / safety:
 *   - Uses the user-scoped client (RLS). Never imports a service-role
 *     credential.
 *   - The fetch surface is read-only; this module exports no
 *     mutating functions.
 *   - Caps the result at READ_LIMIT_MAX so a future producer cannot
 *     flood the worker dashboard.
 */

export const READ_LIMIT_DEFAULT = 12;
export const READ_LIMIT_MAX = 50;

// The generated Supabase Database type does not yet describe the
// joined project relation; cast through `any` to read the join.
// RLS still enforces row-level access at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase as unknown;
}

export interface ListOpenPublicJobPostingsInput {
  readonly limit?: number;
}

export async function listOpenPublicJobPostings(
  input: ListOpenPublicJobPostingsInput = {},
): Promise<JobPostingResult<readonly JobPostingRow[]>> {
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

  const requested = input.limit ?? READ_LIMIT_DEFAULT;
  const limit = Math.max(1, Math.min(READ_LIMIT_MAX, Math.floor(requested)));

  // Single-shot read. RLS gates the rows to status='open' AND
  // visibility='public' for non-owner sessions; the explicit filters
  // below are defence in depth (also keep the query deterministic).
  const res = await asAny(supabase)
    .from("job_demands")
    .select(
      "id, project_id, role_title, headcount_needed, status, visibility, preferred_countries, salary_offered_eur, start_date, created_at, updated_at, project:projects(id, title)",
    )
    .eq("status", "open")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (res.error) {
    const msg = res.error.message ?? "";
    if (/row level security|policy|permission denied|42501/i.test(msg)) {
      return {
        ok: false,
        code: "permission_denied",
        message:
          "Negalima nuskaityti darbo skelbimų — gali būti, kad ribojama " +
          "RLS politika arba prarasta sesija.",
      };
    }
    return {
      ok: false,
      code: "insert_failed",
      message: `Nepavyko įkelti darbo skelbimų: ${msg}`,
    };
  }

  const rows: JobPostingRow[] = (res.data ?? []).map(
    (r: Record<string, unknown>): JobPostingRow => {
      const project = r.project as { id?: string; title?: string } | null;
      return {
        id: r.id as string,
        projectId: (r.project_id as string) ?? project?.id ?? "",
        projectTitle: project?.title ?? "",
        roleTitle: ((r.role_title as string | null) ?? "").toString(),
        headcountNeeded: (r.headcount_needed as number | null) ?? null,
        status: ((r.status as string | null) ?? "open") as JobPostingStatus,
        visibility:
          ((r.visibility as string | null) ?? "public") as JobPostingVisibility,
        preferredCountries:
          (r.preferred_countries as readonly string[] | null) ?? null,
        salaryOfferedEur: (r.salary_offered_eur as number | null) ?? null,
        startDate: (r.start_date as string | null) ?? null,
        createdAtIso: r.created_at as string,
        updatedAtIso: r.updated_at as string,
      };
    },
  );

  return { ok: true, data: rows };
}
