import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { RosterLinkCandidate } from "@/components/app/roster-link-offer-form";

/**
 * WHO a roster row may be offered to — the DATABASE's rule, read back.
 *
 * `organization_people_manager_update` admits an offer only to a profile that
 * already holds an ACTIVE engagement context or an ACTIVE membership with
 * this organization, and `organization_people_subject_decides` lets only a
 * profile with a `workers` row accept. The offer form used to list
 * `company_workers` alone, so an eligible profile that is not a legacy
 * company worker — the organization's own owner, whose name is on the
 * organization's timesheet (found on the B1 roster walk, 2026-09-17) — was
 * never offered, and a "this is me" that the policy permits looked
 * impossible. Nothing here widens authority: RLS still decides every write,
 * and a candidate outside the rule is refused by the update policy exactly as
 * before. Name similarity plays no part; the list is relationship-based.
 *
 * Bounded: one read of active engagements, one read of their worker rows.
 * A failed read is an EMPTY list (the caller merges with the legacy list), so
 * an outage never removes a working path — it only fails to widen it.
 */
export async function listRosterLinkCandidatesFromEngagements(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<readonly RosterLinkCandidate[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const ec = await db
    .from("engagement_contexts")
    .select("profile_id, profiles(full_name, email)")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .limit(200);
  if (ec.error || !Array.isArray(ec.data) || ec.data.length === 0) return [];
  const nameByProfile = new Map<string, string>();
  for (const r of ec.data as Array<{ profile_id: string | null; profiles: { full_name: string | null; email: string | null } | null }>) {
    if (!r.profile_id) continue;
    const p = r.profiles;
    nameByProfile.set(r.profile_id, p?.full_name ?? (p?.email ? p.email.split("@")[0] : r.profile_id));
  }
  if (nameByProfile.size === 0) return [];
  const w = await db
    .from("workers")
    .select("id, profile_id")
    .in("profile_id", [...nameByProfile.keys()])
    .limit(200);
  if (w.error || !Array.isArray(w.data)) return [];
  return (w.data as Array<{ id: string; profile_id: string }>).map((row) => ({
    workerId: row.id,
    profileId: row.profile_id,
    name: nameByProfile.get(row.profile_id) ?? row.profile_id,
  }));
}

/** Legacy `company_workers` list ∪ engagement-based list, one entry per worker. */
export function mergeRosterLinkCandidates(
  ...lists: ReadonlyArray<readonly RosterLinkCandidate[]>
): RosterLinkCandidate[] {
  const byWorker = new Map<string, RosterLinkCandidate>();
  for (const list of lists) for (const c of list) if (!byWorker.has(c.workerId)) byWorker.set(c.workerId, c);
  return [...byWorker.values()].sort((a, b) => a.name.localeCompare(b.name));
}
