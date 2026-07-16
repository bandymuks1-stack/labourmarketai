import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Teams / brigades on the org spine (product-tree branch 13, §8.3) +
 * Trust Connect Teams v1 (consent, team details, enquiries).
 *
 * A team/brigade is an organizations ROW (organization_type='team', migration
 * 20260705220000) — NOT a new table and NOT a parallel org system. Membership
 * is the EXISTING engagement_contexts 'employee' relationship. Trust Connect
 * v1 changes HOW that relationship comes to exist from this surface: the
 * owner now sends a canonical `join_team` INVITATION (20260712200000) and the
 * worker's own acceptance creates the engagement — the accept IS the consent.
 * No direct membership write remains on this surface.
 *
 * Membership provenance is derived honestly from the invitations ledger the
 * owner can already read (inviter-or-admin RLS): a member whose profile
 * accepted a join_team invitation for this team shows as consent-recorded;
 * anyone else shows as added earlier without a recorded acceptance. Nothing
 * is backfilled and no consent history is ever invented for old rows.
 *
 * Honest degradation everywhere: while an owner-gated migration is not
 * applied, the probe sees 42883/42P01 and the surface reports the honest
 * "prepared, not enabled" state — nothing is faked:
 *   - 20260705220000 missing → { applied: false } (no team surface at all);
 *   - 20260712200000 missing → invitations/provenance report not-enabled;
 *   - 20260716120000 missing → team details report not-enabled;
 *   - 20260716121000 missing → enquiry inbox reports not-enabled.
 */

const RPC_NOT_FOUND_CODE = "42883";
const RELATION_NOT_FOUND_CODE = "42P01";
const UNDEFINED_COLUMN_CODE = "42703";

type DB = Awaited<ReturnType<typeof createClient>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

// Narrow, explicit cast for RPCs not yet in the generated Database type
// (the repo's existing pattern — see lib/operations/org-membership.ts).
function rpc(supabase: DB, name: string, args: Record<string, unknown>) {
  return (
    supabase.rpc as unknown as (
      n: string,
      a: Record<string, unknown>,
    ) => Promise<{
      data: unknown;
      error: { message: string; code?: string } | null;
    }>
  )(name, args);
}

/** How a member's presence in the team is recorded. Derived, never invented:
 *  'invited' = an accepted join_team invitation exists for this profile+team;
 *  'direct'  = the engagement predates the invitation flow (no recorded
 *              acceptance);
 *  'unknown' = the invitations model is not applied, so provenance cannot be
 *              read at all. */
export type MemberProvenance = "invited" | "direct" | "unknown";

export type TeamMember = {
  readonly engagementId: string;
  readonly profileId: string;
  readonly name: string;
  readonly provenance: MemberProvenance;
};

export type TeamCapabilitySkill = {
  readonly slug: string;
  readonly membersDeclared: number;
  readonly membersConfirmed: number;
};

export type TeamAvailabilityStatus =
  | "available_now"
  | "available_from"
  | "not_available";

export type TeamDetails = {
  readonly availabilityStatus: TeamAvailabilityStatus;
  readonly availableFrom: string | null;
  readonly deployableSizeMin: number | null;
  readonly deployableSizeMax: number | null;
  readonly destinationCountries: readonly string[] | null;
  readonly accommodationNeeded: boolean;
  readonly transportOwn: boolean;
  readonly maxTripDays: number | null;
  readonly note: string | null;
  readonly updatedAt: string | null;
};

export type TeamEnquiry = {
  readonly id: string;
  readonly status: string;
  readonly message: string;
  readonly startDate: string | null;
  readonly expectedEndDate: string | null;
  readonly createdAt: string;
  readonly proposerName: string | null;
  readonly proposerCompanyName: string | null;
};

export type TeamBrigade = {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly members: readonly TeamMember[];
  /** Read-only honest counts from members' existing worker_skills; null when
   *  the summary RPC could not be read (never fabricated). */
  readonly capability: readonly TeamCapabilitySkill[] | null;
  /** Company-linked workers not yet members of THIS team. */
  readonly addable: readonly AddableTeamWorker[];
  /** Team-scoped details (20260716120000); null = not saved yet OR the
   *  migration is not applied (see detailsApplied on the parent). */
  readonly details: TeamDetails | null;
  /** Enquiries addressed to this team (20260716121000); empty when none or
   *  when the migration is not applied (see enquiriesApplied). */
  readonly enquiries: readonly TeamEnquiry[];
};

export type AddableTeamWorker = {
  readonly workerId: string;
  readonly profileId: string;
  readonly name: string;
  /** An open join_team invitation for this worker+team already exists. */
  readonly invitePending: boolean;
};

export type TeamBrigadesData =
  | { readonly applied: false }
  | {
      readonly applied: true;
      readonly teams: readonly TeamBrigade[];
      readonly error: string | null;
      /** Canonical invitations model (20260712200000) readable — consent
       *  invitations + provenance are only shown when this is true. */
      readonly invitationsApplied: boolean;
      /** team_details (20260716120000) readable. */
      readonly detailsApplied: boolean;
      /** team_enquiries (20260716121000) readable. */
      readonly enquiriesApplied: boolean;
    };

function nameOf(p: { full_name: string | null; email: string | null } | null): string {
  return p?.full_name ?? (p?.email ? p.email.split("@")[0] : "—");
}

// Supabase may type a to-one embed as object or single-element array; normalize.
function profName(v: unknown): string {
  const p = (Array.isArray(v) ? v[0] : v) as
    | { full_name: string | null; email: string | null }
    | null
    | undefined;
  return nameOf(p ?? null);
}

function profEmail(v: unknown): string | null {
  const p = (Array.isArray(v) ? v[0] : v) as
    | { full_name: string | null; email: string | null }
    | null
    | undefined;
  return p?.email ? p.email.toLowerCase() : null;
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Readiness probe: the capability RPC only exists once the owner applied
 * 20260705220000. A nil-uuid call is a cheap no-op that returns an empty set
 * when applied and 42883 when not.
 */
async function isTeamModelApplied(supabase: DB): Promise<boolean> {
  const { error } = await rpc(supabase, "get_team_capability_summary_v1", {
    p_org_id: NIL_UUID,
  });
  if (!error) return true;
  return error.code !== RPC_NOT_FOUND_CODE;
}

type InvitationLedger = {
  readonly applied: boolean;
  /** team id → set of profile ids with an ACCEPTED join_team invitation. */
  readonly acceptedByTeam: ReadonlyMap<string, ReadonlySet<string>>;
  /** team id → set of lowercased emails with an OPEN join_team invitation. */
  readonly pendingEmailsByTeam: ReadonlyMap<string, ReadonlySet<string>>;
};

/** The owner's own join_team invitation rows (RLS: inviter-or-admin) — the
 *  honest source for membership provenance and pending-invite markers. */
export async function readInvitationLedger(
  supabase: DB,
  teamIds: readonly string[],
): Promise<InvitationLedger> {
  const { data, error } = await asAny(supabase)
    .from("invitations")
    .select("organization_id, status, expires_at, invited_email, accepted_by_profile_id")
    .eq("invitation_type", "join_team")
    .in("organization_id", teamIds)
    .limit(500);
  if (error) {
    return {
      applied: error.code !== RELATION_NOT_FOUND_CODE,
      acceptedByTeam: new Map(),
      pendingEmailsByTeam: new Map(),
    };
  }
  const accepted = new Map<string, Set<string>>();
  const pending = new Map<string, Set<string>>();
  for (const r of (data ?? []) as {
    organization_id: string | null;
    status: string;
    expires_at: string;
    invited_email: string;
    accepted_by_profile_id: string | null;
  }[]) {
    if (!r.organization_id) continue;
    if (r.status === "accepted" && r.accepted_by_profile_id) {
      const set = accepted.get(r.organization_id) ?? new Set<string>();
      set.add(r.accepted_by_profile_id);
      accepted.set(r.organization_id, set);
    } else if (r.status === "pending" && Date.parse(r.expires_at) > Date.now()) {
      const set = pending.get(r.organization_id) ?? new Set<string>();
      set.add(r.invited_email.toLowerCase());
      pending.set(r.organization_id, set);
    }
  }
  return { applied: true, acceptedByTeam: accepted, pendingEmailsByTeam: pending };
}

/** team_details rows for the caller's teams (RLS: owner/manager/admin). */
export async function readTeamDetails(
  supabase: DB,
  teamIds: readonly string[],
): Promise<{ applied: boolean; byTeam: ReadonlyMap<string, TeamDetails> }> {
  const { data, error } = await asAny(supabase)
    .from("team_details")
    .select(
      "org_id, availability_status, available_from, deployable_size_min, deployable_size_max, destination_countries, accommodation_needed, transport_own, max_trip_days, note, updated_at",
    )
    .in("org_id", teamIds);
  if (error) {
    return {
      applied:
        error.code !== RELATION_NOT_FOUND_CODE &&
        error.code !== UNDEFINED_COLUMN_CODE,
      byTeam: new Map(),
    };
  }
  const byTeam = new Map<string, TeamDetails>();
  for (const r of (data ?? []) as {
    org_id: string;
    availability_status: TeamAvailabilityStatus;
    available_from: string | null;
    deployable_size_min: number | null;
    deployable_size_max: number | null;
    destination_countries: string[] | null;
    accommodation_needed: boolean;
    transport_own: boolean;
    max_trip_days: number | null;
    note: string | null;
    updated_at: string | null;
  }[]) {
    byTeam.set(r.org_id, {
      availabilityStatus: r.availability_status,
      availableFrom: r.available_from,
      deployableSizeMin: r.deployable_size_min,
      deployableSizeMax: r.deployable_size_max,
      destinationCountries: r.destination_countries,
      accommodationNeeded: r.accommodation_needed,
      transportOwn: r.transport_own,
      maxTripDays: r.max_trip_days,
      note: r.note,
      updatedAt: r.updated_at,
    });
  }
  return { applied: true, byTeam };
}

/** Enquiry inbox for the caller's teams via the gated read model. */
async function readTeamEnquiries(
  supabase: DB,
): Promise<{ applied: boolean; byTeam: ReadonlyMap<string, TeamEnquiry[]> }> {
  const { data, error } = await rpc(
    supabase,
    "list_team_enquiries_for_my_teams_v1",
    {},
  );
  if (error) {
    return { applied: error.code !== RPC_NOT_FOUND_CODE, byTeam: new Map() };
  }
  const byTeam = new Map<string, TeamEnquiry[]>();
  const items = ((data as { items?: unknown[] } | null)?.items ?? []) as {
    id: string;
    team_org_id: string;
    status: string;
    message: string;
    start_date: string | null;
    expected_end_date: string | null;
    created_at: string;
    proposer_name: string | null;
    proposer_company_name: string | null;
  }[];
  for (const i of items) {
    const list = byTeam.get(i.team_org_id) ?? [];
    list.push({
      id: i.id,
      status: i.status,
      message: i.message,
      startDate: i.start_date,
      expectedEndDate: i.expected_end_date,
      createdAt: i.created_at,
      proposerName: i.proposer_name,
      proposerCompanyName: i.proposer_company_name,
    });
    byTeam.set(i.team_org_id, list);
  }
  return { applied: true, byTeam };
}

/**
 * Company-room read model: the caller's own team/brigade orgs (RLS-scoped
 * owner read on the EXISTING organizations table), their members (RLS-scoped
 * engagement_contexts read), the read-only capability summary, plus the
 * Trust Connect layers: invitation provenance, team details and the enquiry
 * inbox — each with its own honest applied flag.
 */
export async function getTeamBrigadesData(): Promise<TeamBrigadesData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { applied: false };

  if (!(await isTeamModelApplied(supabase))) return { applied: false };

  const { data: orgRows, error: orgError } = await asAny(supabase)
    .from("organizations")
    .select("id, display_name, legal_name, created_at")
    .eq("owner_profile_id", user.id)
    .eq("organization_type", "team")
    .order("created_at", { ascending: true })
    .limit(20);
  if (orgError) {
    if (
      orgError.code === RELATION_NOT_FOUND_CODE ||
      orgError.code === UNDEFINED_COLUMN_CODE
    ) {
      return { applied: false };
    }
    return {
      applied: true,
      teams: [],
      error: orgError.message,
      invitationsApplied: false,
      detailsApplied: false,
      enquiriesApplied: false,
    };
  }

  const teamRows = (orgRows ?? []) as {
    id: string;
    display_name: string | null;
    legal_name: string | null;
    created_at: string;
  }[];
  if (teamRows.length === 0) {
    return {
      applied: true,
      teams: [],
      error: null,
      invitationsApplied: true,
      detailsApplied: true,
      enquiriesApplied: true,
    };
  }

  const teamIds = teamRows.map((t) => t.id);

  // Members: the EXISTING canonical engagement rows — nothing else.
  const { data: ecRows } = await asAny(supabase)
    .from("engagement_contexts")
    .select("id, organization_id, profile_id, profiles(full_name, email)")
    .in("organization_id", teamIds)
    .eq("relationship_slug", "employee")
    .eq("status", "active");

  // Trust Connect layers — each degrades independently and honestly.
  const [ledger, details, enquiries] = await Promise.all([
    readInvitationLedger(supabase, teamIds),
    readTeamDetails(supabase, teamIds),
    readTeamEnquiries(supabase),
  ]);

  const membersByTeam = new Map<string, TeamMember[]>();
  for (const r of (ecRows ?? []) as {
    id: string;
    organization_id: string | null;
    profile_id: string | null;
    profiles: unknown;
  }[]) {
    if (!r.organization_id || !r.profile_id) continue;
    const list = membersByTeam.get(r.organization_id) ?? [];
    const provenance: MemberProvenance = !ledger.applied
      ? "unknown"
      : ledger.acceptedByTeam.get(r.organization_id)?.has(r.profile_id)
        ? "invited"
        : "direct";
    list.push({
      engagementId: r.id,
      profileId: r.profile_id,
      name: profName(r.profiles),
      provenance,
    });
    membersByTeam.set(r.organization_id, list);
  }

  // Invitable pool: workers ALREADY linked to the caller's company via the
  // existing invite/accept flow (company_workers, RLS owns_company). We never
  // enumerate strangers — same rule as lib/operations/org-members.ts. The
  // email is used ONLY server-side to match pending invitations; it is never
  // exported to the client.
  const { data: linkRows } = await asAny(supabase)
    .from("company_workers")
    .select("worker_id, workers(profile_id, profiles(full_name, email))")
    .eq("status", "active");
  const pool: { worker: AddableTeamWorker; email: string | null }[] = (
    (linkRows ?? []) as { worker_id: string | null; workers: unknown }[]
  )
    .map((r) => {
      const w = (Array.isArray(r.workers) ? r.workers[0] : r.workers) as
        | { profile_id: string | null; profiles: unknown }
        | null;
      if (!r.worker_id || !w?.profile_id) return null;
      return {
        worker: {
          workerId: r.worker_id,
          profileId: w.profile_id,
          name: profName(w.profiles),
          invitePending: false,
        },
        email: profEmail(w.profiles),
      };
    })
    .filter((x): x is { worker: AddableTeamWorker; email: string | null } => x !== null);

  const teams: TeamBrigade[] = [];
  for (const t of teamRows) {
    const members = membersByTeam.get(t.id) ?? [];
    const memberProfileIds = new Set(members.map((m) => m.profileId));

    // Capability summary: read-only gated RPC over members' existing
    // worker_skills. Errors → null (never a fabricated summary).
    let capability: TeamCapabilitySkill[] | null = null;
    const { data: capRows, error: capError } = await rpc(
      supabase,
      "get_team_capability_summary_v1",
      { p_org_id: t.id },
    );
    if (!capError && Array.isArray(capRows)) {
      capability = (capRows as {
        skill_slug: string | null;
        members_declared: number | null;
        members_confirmed: number | null;
      }[])
        .filter((r) => typeof r.skill_slug === "string" && r.skill_slug.length > 0)
        .map((r) => ({
          slug: r.skill_slug as string,
          membersDeclared: r.members_declared ?? 0,
          membersConfirmed: r.members_confirmed ?? 0,
        }));
    }

    const pendingEmails = ledger.pendingEmailsByTeam.get(t.id);
    teams.push({
      id: t.id,
      name:
        (t.display_name ?? "").trim() ||
        (t.legal_name ?? "").trim() ||
        "—",
      createdAt: t.created_at,
      members,
      capability,
      addable: pool
        .filter((p) => !memberProfileIds.has(p.worker.profileId))
        .map((p) => ({
          ...p.worker,
          invitePending:
            p.email !== null && (pendingEmails?.has(p.email) ?? false),
        })),
      details: details.byTeam.get(t.id) ?? null,
      enquiries: enquiries.byTeam.get(t.id) ?? [],
    });
  }

  return {
    applied: true,
    teams,
    error: null,
    invitationsApplied: ledger.applied,
    detailsApplied: details.applied,
    enquiriesApplied: enquiries.applied,
  };
}

export type CreateTeamOutcome =
  | "created"
  | "invalid_team_name"
  | "not_allowed"
  | "team_limit_reached"
  | "needs_migration"
  | "error";

/** Create a team/brigade org row via the gated create_team_v1 RPC. */
export async function createTeamBrigade(
  name: string,
): Promise<{ outcome: CreateTeamOutcome; message?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { outcome: "error", message: "Not authenticated" };

  const { data, error } = await rpc(supabase, "create_team_v1", {
    p_team_name: name,
  });
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE) return { outcome: "needs_migration" };
    return { outcome: "error", message: error.message };
  }
  const code = String(data ?? "");
  if (
    code === "created" ||
    code === "invalid_team_name" ||
    code === "not_allowed" ||
    code === "team_limit_reached"
  ) {
    return { outcome: code };
  }
  return { outcome: "error", message: code || "unknown" };
}

/** The worker's own email for a company-linked worker — server-side ONLY,
 *  used to address the consent invitation; never returned to the client. */
export async function lookupLinkedWorkerEmail(
  workerId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase)
    .from("company_workers")
    .select("worker_id, workers(profile_id, profiles(full_name, email))")
    .eq("worker_id", workerId)
    .eq("status", "active")
    .limit(1);
  if (error) return null;
  const row = ((data ?? []) as { workers: unknown }[])[0];
  if (!row) return null;
  const w = (Array.isArray(row.workers) ? row.workers[0] : row.workers) as
    | { profiles: unknown }
    | null;
  return w ? profEmail(w.profiles) : null;
}
