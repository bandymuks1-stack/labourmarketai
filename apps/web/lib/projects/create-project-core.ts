import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveOrganizationIdForCompany } from "@/lib/company/resolve-organization-id";

/**
 * THE one project-creation core (rebuild W5). Both existing entry points —
 * the inline form on /dashboard/projects (`createProjectAction`) and the
 * dedicated page at /dashboard/company/projects/new
 * (`createProjectContextAction`) — insert through THIS function, so there is
 * exactly one validation rule, one org-binding rule (W10: never an org-less
 * project) and one insert shape. Previously the two paths had drifted
 * (different length rules, duplicated insert code) — the audit's RC-5
 * "two create paths for the same row".
 *
 * RLS (`projects_insert`: owns_company OR is_admin) still double-enforces
 * tenancy underneath — this layer never widens anything.
 */

export const PROJECT_TITLE_MIN = 2;
export const PROJECT_TITLE_MAX = 200;

export type CreateProjectCoreResult =
  | { ok: true; id: string }
  | { ok: false; reason: "invalid_title" | "insert_failed"; code?: string; message?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export async function insertProjectForCompany(
  supabase: SupabaseClient,
  companyId: string,
  input: { title: string; city: string | null },
): Promise<CreateProjectCoreResult> {
  const title = input.title.trim();
  if (title.length < PROJECT_TITLE_MIN || title.length > PROJECT_TITLE_MAX) {
    return { ok: false, reason: "invalid_title" };
  }

  // W10: bind the canonical organization at creation so the project is never
  // left org-less (the stale state the W10 backfill corrected).
  const organizationId = await resolveOrganizationIdForCompany(supabase, companyId);

  const { data, error } = await asAny(supabase)
    .from("projects")
    .insert({
      company_id: companyId,
      organization_id: organizationId,
      title,
      city: input.city,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    return {
      ok: false,
      reason: "insert_failed",
      code: (error as { code?: string } | null)?.code,
      message: (error as { message?: string } | null)?.message,
    };
  }
  return { ok: true, id: data.id as string };
}
