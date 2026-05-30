import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Read model for the owner's canonical org-members panel (Phase 2). All reads
 * are RLS-scoped: engagement_contexts SELECT already allows manages_organization,
 * so an owner sees their org's member engagements; company_workers/agency_workers
 * are read via owns_company/owns_agency as the source of addable workers (the
 * worker is already known to the owner via the invite/accept flow — we never
 * enumerate strangers). Writes go through the SECURITY DEFINER RPCs
 * (addOrgMember / setEngagementJournalReview), never direct table writes.
 */

export type OrgMember = {
  engagementId: string;
  name: string;
  reviewEnabled: boolean;
};

export type AddableWorker = { workerId: string; name: string };

export type OrgMembersData = {
  orgId: string;
  members: OrgMember[];
  addable: AddableWorker[];
};

function nameOf(p: { full_name: string | null; email: string | null } | null): string {
  return p?.full_name ?? (p?.email ? p.email.split("@")[0] : "—");
}

/** Resolve the org the current user owns for a given legacy company/agency id. */
async function resolveOrgId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  legacyCol: "legacy_company_id" | "legacy_agency_id",
  legacyId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq(legacyCol, legacyId)
    .maybeSingle();
  return data?.id ?? null;
}

/** Owner's org members (canonical employee engagements) + workers they can add. */
export async function getOrgMembersData(
  kind: "company" | "agency",
  legacyId: string,
): Promise<OrgMembersData | null> {
  const supabase = await createClient();
  const orgId = await resolveOrgId(
    supabase,
    kind === "company" ? "legacy_company_id" : "legacy_agency_id",
    legacyId,
  );
  if (!orgId) return null;

  type Prof = { full_name: string | null; email: string | null };
  // Supabase may type a to-one embed as object or single-element array; normalize.
  const profName = (v: unknown): string => {
    const p = (Array.isArray(v) ? v[0] : v) as Prof | null | undefined;
    return nameOf(p ?? null);
  };

  // Canonical members: active employee engagements in this org (name via the
  // engagement's profile — engagement_contexts.profile_id → profiles).
  const { data: ecRows } = await supabase
    .from("engagement_contexts")
    .select("id, profile_id, journal_review_enabled, profiles(full_name, email)")
    .eq("organization_id", orgId)
    .eq("relationship_slug", "employee")
    .eq("status", "active");

  const members: OrgMember[] = (ecRows ?? []).map((r) => ({
    engagementId: r.id as string,
    name: profName(r.profiles),
    reviewEnabled: r.journal_review_enabled === true,
  }));
  const memberProfileIds = new Set(
    (ecRows ?? []).map((r) => r.profile_id).filter((v): v is string => Boolean(v)),
  );

  // Addable: workers already linked via the legacy invite/accept flow whose
  // profile is not yet a canonical org member.
  const linkTable = kind === "company" ? "company_workers" : "agency_workers";
  const { data: linkRows } = await supabase
    .from(linkTable)
    .select("worker_id, workers(profile_id, profiles(full_name, email))")
    .eq("status", "active");
  const addable: AddableWorker[] = (linkRows ?? [])
    .map((r) => {
      const w = (Array.isArray(r.workers) ? r.workers[0] : r.workers) as
        | { profile_id: string | null; profiles: unknown }
        | null;
      const workerId = (r as { worker_id: string | null }).worker_id;
      const profileId = w?.profile_id ?? null;
      if (!workerId || !profileId || memberProfileIds.has(profileId)) return null;
      return { workerId, name: profName(w?.profiles) };
    })
    .filter((x): x is AddableWorker => x !== null);

  return { orgId, members, addable };
}
