import "server-only";

import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import { requireSupabaseClientEnv } from "@/lib/env";
import { publicCvFromRow, type PublicOrganizationCv } from "./public-organization-cv-model";

/**
 * THE PUBLIC COMPANY LIVING CV (register 3.36).
 *
 * Owner rulings 2026-11-16 / 2026-11-17: aggregated data only, a minimum group
 * of 5 people, only while the public profile is on, no personal data — and NOT
 * through service-role access. Every figure is computed INSIDE the database by
 * `get_public_organization_cv_v1` (migration 20261117060000): SECURITY
 * DEFINER, fixed search_path, gated on the organization's own
 * public_profile_enabled, k >= 5 per block, internal projects and #3421's
 * education rule applied, hours rounded to 10, numbers and months only.
 *
 * This module holds no service-role key and reads no table: it calls that one
 * function with the ANONYMOUS key — exactly what any visitor could call — and
 * re-checks the shape (`publicCvFromRow`) so a widened function cannot widen
 * the page. The client carries no cookie, so the read can be cached.
 */
async function readPublicOrganizationCvUncached(organizationId: string): Promise<PublicOrganizationCv | null> {
  let url: string;
  let anonKey: string;
  try {
    ({ url, anonKey } = requireSupabaseClientEnv());
  } catch {
    return null;
  }
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.rpc("get_public_organization_cv_v1" as never, {
    p_organization_id: organizationId,
  } as never);
  // Not applied yet, refused, or nothing to show: the section renders nothing.
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return publicCvFromRow(data[0] as Record<string, unknown>);
}

/** How long one public read is reused. Switching the public profile off still
 *  hides the whole page at once: the page's own opt-in read is not cached. */
export const PUBLIC_CV_REVALIDATE_SECONDS = 300;

/**
 * THE ONLY EXPORT THE PAGE USES: one database call per organization per
 * PUBLIC_CV_REVALIDATE_SECONDS, however many anonymous views (R2 P2 on #3464).
 */
export const readPublicOrganizationCv = unstable_cache(
  readPublicOrganizationCvUncached,
  ["public-organization-cv-v2"],
  { revalidate: PUBLIC_CV_REVALIDATE_SECONDS },
);
