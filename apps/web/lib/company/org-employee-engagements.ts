import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * The organization's ACTIVE employee engagements — the canonical membership
 * spine (`engagement_contexts`, 0013; review flag rerouted here by
 * 20260530140000) — with the CANONICAL journal-review flag per person.
 *
 * Read under the caller's RLS: `engagement_contexts_select` admits the
 * person's own rows and every row of an organization the caller manages, so
 * a non-manager simply reads nothing. Bounded (one page), no ranking, no
 * write. The name is the profile's stored name, or the e-mail's local part —
 * the same fallback the roster uses; nothing is invented.
 *
 * Scale (owner constraint §1b): one indexed query on
 * (organization_id, relationship_slug, status) with a hard limit; the caller
 * never receives a whole organization's history.
 */
export interface OrgEmployeeEngagement {
  readonly engagementId: string;
  readonly profileId: string;
  readonly name: string;
  readonly journalReviewEnabled: boolean;
}

export const ORG_EMPLOYEE_ENGAGEMENTS_LIMIT = 50;

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export async function listOrgEmployeeEngagements(
  organizationId: string,
): Promise<{ kind: "ok"; rows: readonly OrgEmployeeEngagement[] } | { kind: "error" }> {
  if (!UUID_RX.test(organizationId)) return { kind: "ok", rows: [] };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "error" };
  const { data, error } = await asAny(supabase)
    .from("engagement_contexts")
    .select("id, profile_id, journal_review_enabled, profiles(full_name, email)")
    .eq("organization_id", organizationId)
    .eq("relationship_slug", "employee")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(ORG_EMPLOYEE_ENGAGEMENTS_LIMIT);
  if (error) return { kind: "error" };
  const rows: OrgEmployeeEngagement[] = [];
  for (const r of (data ?? []) as {
    id: string;
    profile_id: string | null;
    journal_review_enabled: boolean | null;
    profiles: { full_name: string | null; email: string | null } | null;
  }[]) {
    if (!r.profile_id) continue;
    const name = r.profiles?.full_name?.trim() || r.profiles?.email?.split("@")[0] || `#${r.profile_id.slice(0, 6)}`;
    rows.push({
      engagementId: r.id,
      profileId: r.profile_id,
      name,
      journalReviewEnabled: r.journal_review_enabled === true,
    });
  }
  return { kind: "ok", rows };
}
