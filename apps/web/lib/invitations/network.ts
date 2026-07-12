import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * "Mano tinklas" read layer (core-network area B) — bounded, RLS-scoped
 * reads only. The network surface is a SUB-SURFACE of the person/company
 * context (a dashboard module page), never a second dashboard: it lists
 * real relationships and real invitations, and links every row to its real
 * home surface.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type SentInvitationRow = {
  id: string;
  invitationType: string;
  invitedEmail: string;
  invitedName: string | null;
  status: string;
  deliveryStatus: string;
  createdAt: string;
  expiresAt: string;
  resendCount: number;
  organizationId: string | null;
  projectId: string | null;
  personalMessage: string | null;
};

export type SentInvitationsRead =
  | { status: "ok"; items: SentInvitationRow[] }
  | { status: "needs-migration" }
  | { status: "error" };

/** The caller's own sent invitations (RLS: inviter-or-admin), newest first. */
export async function listMySentInvitations(): Promise<SentInvitationsRead> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase)
    .from("invitations")
    .select(
      "id, invitation_type, invited_email, invited_name, status, delivery_status, created_at, expires_at, resend_count, organization_id, project_id, personal_message",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (error.code === "42P01") return { status: "needs-migration" };
    return { status: "error" };
  }
  type Row = {
    id: string;
    invitation_type: string;
    invited_email: string;
    invited_name: string | null;
    status: string;
    delivery_status: string;
    created_at: string;
    expires_at: string;
    resend_count: number;
    organization_id: string | null;
    project_id: string | null;
    personal_message: string | null;
  };
  return {
    status: "ok",
    items: ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      invitationType: r.invitation_type,
      invitedEmail: r.invited_email,
      invitedName: r.invited_name,
      status: computeDisplayStatus(r.status, r.expires_at),
      deliveryStatus: r.delivery_status,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      resendCount: r.resend_count,
      organizationId: r.organization_id,
      projectId: r.project_id,
      personalMessage: r.personal_message,
    })),
  };
}

/** A pending row past its expiry reads as expired — no stale "pending". */
function computeDisplayStatus(status: string, expiresAt: string): string {
  if (status === "pending" && Date.parse(expiresAt) <= Date.now()) {
    return "expired";
  }
  return status;
}

export type IncomingInvitationRow = {
  id: string;
  invitationType: string;
  personalMessage: string | null;
  proposedRole: string | null;
  createdAt: string;
  expiresAt: string;
  organizationName: string | null;
  projectTitle: string | null;
  inviterName: string | null;
};

export type IncomingInvitationsRead =
  | { status: "ok"; items: IncomingInvitationRow[] }
  | { status: "needs-migration" }
  | { status: "error" };

/** Pending invitations addressed to the caller's own verified email. */
export async function listInvitationsForMe(): Promise<IncomingInvitationsRead> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc("list_invitations_for_me_v1");
  if (error) {
    if (error.code === "42883") return { status: "needs-migration" };
    return { status: "error" };
  }
  type Item = {
    id: string;
    invitation_type: string;
    personal_message: string | null;
    proposed_role: string | null;
    created_at: string;
    expires_at: string;
    organization_name: string | null;
    project_title: string | null;
    inviter_name: string | null;
  };
  const items = ((data?.items ?? []) as Item[]).map((i) => ({
    id: i.id,
    invitationType: i.invitation_type,
    personalMessage: i.personal_message,
    proposedRole: i.proposed_role,
    createdAt: i.created_at,
    expiresAt: i.expires_at,
    organizationName: i.organization_name,
    projectTitle: i.project_title,
    inviterName: i.inviter_name,
  }));
  return { status: "ok", items };
}

export type NetworkPerson = {
  workerId: string;
  /** Profile id — used ONLY by the permission-gated message flow (the
   *  server action re-checks contact permission); never a contact channel. */
  profileId: string | null;
  displayName: string;
  city: string | null;
  country: string | null;
};

export type NetworkCompany = {
  organizationId: string;
  displayName: string;
  organizationType: string;
  country: string | null;
};

export type PeopleCompanySearchResult = {
  people: NetworkPerson[];
  companies: NetworkCompany[];
};

/**
 * People & companies search — RLS does the privacy work: the workers read
 * goes through the fail-closed `can_view_worker` SELECT policy (only
 * consented-discoverable people or real work relationships come back), and
 * organizations expose only their public display fields. No email, no
 * phone, no exact address is selected — ever.
 */
export async function searchPeopleAndCompanies(
  query: string,
): Promise<PeopleCompanySearchResult> {
  const q = query.trim();
  if (q.length < 2 || q.length > 80) return { people: [], companies: [] };
  // Escape PostgREST pattern characters — the term is a literal.
  const term = q.replace(/[%_,()]/g, " ").trim();
  if (!term) return { people: [], companies: [] };
  const supabase = await createClient();

  const [workersRes, orgsRes] = await Promise.all([
    asAny(supabase)
      .from("workers")
      .select("id, profile_id, full_name, city, country")
      .ilike("full_name", `%${term}%`)
      .limit(20),
    asAny(supabase)
      .from("organizations")
      .select("id, display_name, legal_name, organization_type, country")
      .or(`display_name.ilike.%${term}%,legal_name.ilike.%${term}%`)
      .limit(20),
  ]);

  type WorkerRow = {
    id: string;
    profile_id: string | null;
    full_name: string | null;
    city: string | null;
    country: string | null;
  };
  type OrgRow = {
    id: string;
    display_name: string | null;
    legal_name: string | null;
    organization_type: string;
    country: string | null;
  };

  const people: NetworkPerson[] = workersRes.error
    ? []
    : ((workersRes.data ?? []) as WorkerRow[])
        .filter((w) => (w.full_name ?? "").trim().length > 0)
        .map((w) => ({
          workerId: w.id,
          profileId: w.profile_id,
          displayName: w.full_name as string,
          city: w.city,
          country: w.country,
        }));
  const companies: NetworkCompany[] = orgsRes.error
    ? []
    : ((orgsRes.data ?? []) as OrgRow[])
        .map((o) => ({
          organizationId: o.id,
          displayName: (o.display_name ?? o.legal_name ?? "").trim(),
          organizationType: o.organization_type,
          country: o.country,
        }))
        .filter((o) => o.displayName.length > 0);
  return { people, companies };
}

export type NetworkRelationship = {
  engagementId: string;
  relationshipSlug: string;
  organizationName: string | null;
  startedAt: string | null;
  title: string | null;
};

/** The caller's own active engagements (their side of the network). */
export async function listMyEngagements(): Promise<NetworkRelationship[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await asAny(supabase)
    .from("engagement_contexts")
    .select("id, relationship_slug, started_at, title, organizations(display_name, legal_name)")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  type Row = {
    id: string;
    relationship_slug: string;
    started_at: string | null;
    title: string | null;
    organizations: { display_name: string | null; legal_name: string | null } | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    engagementId: r.id,
    relationshipSlug: r.relationship_slug,
    organizationName:
      r.organizations?.display_name ?? r.organizations?.legal_name ?? null,
    startedAt: r.started_at,
    title: r.title,
  }));
}
