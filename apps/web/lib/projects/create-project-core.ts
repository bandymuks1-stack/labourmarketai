import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveOrganizationIdForCompany } from "@/lib/company/resolve-organization-id";
import { resolveCountryCode } from "@/lib/location/country-model";

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
  | { ok: false; reason: "invalid_title" | "country_required" | "insert_failed"; code?: string; message?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export async function insertProjectForCompany(
  supabase: SupabaseClient,
  companyId: string,
  input: { title: string; city: string | null; country?: string | null },
): Promise<CreateProjectCoreResult> {
  const title = input.title.trim();
  if (title.length < PROJECT_TITLE_MIN || title.length > PROJECT_TITLE_MAX) {
    return { ok: false, reason: "invalid_title" };
  }
  // A project with a place carries its COUNTRY as an ISO code, never guessed
  // (owner decision 2026-11-12, Swedish employer audit J-1): every project was
  // created with `projects.country` NULL, so no country reading could place
  // it. A project with no place at all may stay without one; a typed value
  // that is not a country is refused rather than dropped.
  const country = resolveCountryCode(input.country ?? null);
  if ((input.country?.trim() && !country) || (input.city?.trim() && !country)) {
    return { ok: false, reason: "country_required" };
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
      country,
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

/**
 * Compensating delete for a project the CALLER just created in the same
 * request (a follow-up write failed, G-7). True only when the database
 * confirms a row was actually removed — an RLS-filtered or failed delete is
 * NOT a rollback, and the caller must then report the project as existing.
 */
export async function rollbackCreatedProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<boolean> {
  try {
    const { data, error } = await asAny(supabase)
      .from("projects")
      .delete()
      .eq("id", projectId)
      .select("id");
    return !error && Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}
