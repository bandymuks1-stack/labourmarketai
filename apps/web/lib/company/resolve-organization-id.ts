import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve the canonical organization id for a legacy company via the bridge
 * (`organizations.legacy_company_id`).
 *
 * W10 fix: project creation historically set only `projects.company_id`, leaving
 * `organization_id` NULL — the stale state the W10 backfill corrected. Every
 * project-creation path now resolves the org here so the stale state cannot
 * recur. Returns null only if no mirror org exists yet (the mirror trigger
 * normally guarantees one); the caller still creates the project rather than
 * blocking, so this is a strict improvement over the previous org-less insert.
 */
export async function resolveOrganizationIdForCompany(
  supabase: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  if (!companyId) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("organizations")
    .select("id")
    .eq("legacy_company_id", companyId)
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
