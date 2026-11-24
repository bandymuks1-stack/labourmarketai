import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Pilot cohort read model (Pilot Onboarding and Measurement v1).
 *
 * Reads the three admin-only tables introduced by the DRAFT-GATED migration
 * 20260716140000_pilots_cohort_v1.sql (pilots / pilot_participants /
 * pilot_outcomes). Every read goes through the caller's own superadmin-gated
 * Supabase client — the tables' RLS SELECT policies are `public.is_admin()`
 * so a non-admin session sees zero rows even if the app gate drifted.
 *
 * Honest degradation (team-brigades.ts pattern): while the owner has NOT
 * applied the migration, the probe sees 42P01 (relation missing) and every
 * read reports { applied: false } — the admin UI then shows an honest
 * "needs migration" state and no pilot surface is faked.
 *
 * Writes NEVER happen here — they go through the SECURITY DEFINER RPCs via
 * lib/admin/pilot-actions.ts.
 */

const RELATION_NOT_FOUND_CODE = "42P01";
const RPC_NOT_FOUND_CODE = "42883";

/** Error codes that mean "the owner-gated migration is not applied". */
export function isNeedsMigrationCode(code: string | undefined): boolean {
  return code === RELATION_NOT_FOUND_CODE || code === RPC_NOT_FOUND_CODE;
}

export const PILOT_STATUSES = ["draft", "active", "closed"] as const;
export type PilotStatus = (typeof PILOT_STATUSES)[number];

/** companies.company_type vocabulary (20260612090000) + 'mixed'. */
export const PILOT_ORGANISATION_KINDS = [
  "construction",
  "staffing_agency",
  "subcontractor",
  "manufacturing",
  "services",
  "client_customer",
  "other",
  "mixed",
] as const;
export type PilotOrganisationKind = (typeof PILOT_ORGANISATION_KINDS)[number];

export const PILOT_OUTCOMES = [
  "contact_made",
  "enquiry_made",
  "booking_accepted",
  "hire_reported",
  "no_outcome",
] as const;
export type PilotOutcomeKind = (typeof PILOT_OUTCOMES)[number];

export type PilotListItem = {
  readonly id: string;
  readonly name: string;
  readonly organisationKind: PilotOrganisationKind;
  readonly status: PilotStatus;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly createdAt: string;
  readonly activeParticipants: number;
  readonly outcomeCount: number;
};

export type PilotsListData =
  | { readonly applied: false }
  | {
      readonly applied: true;
      readonly pilots: readonly PilotListItem[];
      readonly error: string | null;
    };

export type PilotParticipant = {
  readonly profileId: string;
  readonly name: string;
  readonly email: string | null;
  readonly joinedVia: "invitation" | "manual";
  readonly joinedAt: string;
  readonly leftAt: string | null;
};

export type PilotOutcomeRow = {
  readonly id: string;
  readonly outcome: PilotOutcomeKind;
  readonly participantProfileId: string | null;
  readonly participantName: string | null;
  readonly note: string | null;
  readonly createdAt: string;
};

export type PilotDetail = {
  readonly id: string;
  readonly name: string;
  readonly organisationKind: PilotOrganisationKind;
  readonly status: PilotStatus;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly createdAt: string;
  readonly participants: readonly PilotParticipant[];
  readonly outcomes: readonly PilotOutcomeRow[];
  /** Count per outcome kind over ALL ledger rows of this pilot (bounded read). */
  readonly outcomeDistribution: readonly { outcome: PilotOutcomeKind; count: number }[];
};

export type PilotDetailData =
  | { readonly kind: "needs_migration" }
  | { readonly kind: "not_found" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ok"; readonly pilot: PilotDetail };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

// Supabase may type a to-one embed as object or single-element array; normalize.
function embedded(v: unknown): { full_name: string | null; email: string | null } | null {
  const p = (Array.isArray(v) ? v[0] : v) as
    | { full_name: string | null; email: string | null }
    | null
    | undefined;
  return p ?? null;
}

function nameOf(p: { full_name: string | null; email: string | null } | null): string {
  return p?.full_name ?? (p?.email ? p.email.split("@")[0] : "—");
}

export async function listPilots(): Promise<PilotsListData> {
  const supabase = await createClient();

  const { data, error } = await asAny(supabase)
    .from("pilots")
    .select("id, name, organisation_kind, status, starts_on, ends_on, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    if (isNeedsMigrationCode(error.code)) return { applied: false };
    return { applied: true, pilots: [], error: error.message ?? "read_failed" };
  }

  const rows = (data ?? []) as {
    id: string;
    name: string;
    organisation_kind: PilotOrganisationKind;
    status: PilotStatus;
    starts_on: string | null;
    ends_on: string | null;
    created_at: string;
  }[];

  // Active-participant + outcome counts, bounded, counted in memory (the
  // list is capped at 100 pilots; counts stay honest event tallies).
  const participantCounts = new Map<string, number>();
  const outcomeCounts = new Map<string, number>();
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const [{ data: pData }, { data: oData }] = await Promise.all([
      asAny(supabase)
        .from("pilot_participants")
        .select("pilot_id, left_at")
        .in("pilot_id", ids)
        .limit(5000),
      asAny(supabase)
        .from("pilot_outcomes")
        .select("pilot_id")
        .in("pilot_id", ids)
        .limit(5000),
    ]);
    for (const p of (pData ?? []) as { pilot_id: string; left_at: string | null }[]) {
      if (p.left_at !== null) continue;
      participantCounts.set(p.pilot_id, (participantCounts.get(p.pilot_id) ?? 0) + 1);
    }
    for (const o of (oData ?? []) as { pilot_id: string }[]) {
      outcomeCounts.set(o.pilot_id, (outcomeCounts.get(o.pilot_id) ?? 0) + 1);
    }
  }

  return {
    applied: true,
    pilots: rows.map((r) => ({
      id: r.id,
      name: r.name,
      organisationKind: r.organisation_kind,
      status: r.status,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      createdAt: r.created_at,
      activeParticipants: participantCounts.get(r.id) ?? 0,
      outcomeCount: outcomeCounts.get(r.id) ?? 0,
    })),
    error: null,
  };
}

export async function getPilotDetail(pilotId: string): Promise<PilotDetailData> {
  const supabase = await createClient();

  const { data: pilot, error } = await asAny(supabase)
    .from("pilots")
    .select("id, name, organisation_kind, status, starts_on, ends_on, created_at")
    .eq("id", pilotId)
    .maybeSingle();

  if (error) {
    if (isNeedsMigrationCode(error.code)) return { kind: "needs_migration" };
    return { kind: "error", message: error.message ?? "read_failed" };
  }
  if (!pilot) return { kind: "not_found" };

  const [{ data: pData, error: pError }, { data: oData, error: oError }] =
    await Promise.all([
      asAny(supabase)
        .from("pilot_participants")
        .select(
          "profile_id, joined_via, joined_at, left_at, profiles(full_name, email)",
        )
        .eq("pilot_id", pilotId)
        .order("joined_at", { ascending: true })
        .limit(500),
      asAny(supabase)
        .from("pilot_outcomes")
        .select(
          "id, outcome, participant_profile_id, note, created_at, profiles!pilot_outcomes_participant_profile_id_fkey(full_name, email)",
        )
        .eq("pilot_id", pilotId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  if (pError || oError) {
    const msg = pError?.message ?? oError?.message ?? "read_failed";
    return { kind: "error", message: msg };
  }

  const participants: PilotParticipant[] = (
    (pData ?? []) as {
      profile_id: string;
      joined_via: "invitation" | "manual";
      joined_at: string;
      left_at: string | null;
      profiles: unknown;
    }[]
  ).map((p) => {
    const prof = embedded(p.profiles);
    return {
      profileId: p.profile_id,
      name: nameOf(prof),
      email: prof?.email ?? null,
      joinedVia: p.joined_via,
      joinedAt: p.joined_at,
      leftAt: p.left_at,
    };
  });

  const outcomes: PilotOutcomeRow[] = (
    (oData ?? []) as {
      id: string;
      outcome: PilotOutcomeKind;
      participant_profile_id: string | null;
      note: string | null;
      created_at: string;
      profiles: unknown;
    }[]
  ).map((o) => ({
    id: o.id,
    outcome: o.outcome,
    participantProfileId: o.participant_profile_id,
    participantName: o.participant_profile_id ? nameOf(embedded(o.profiles)) : null,
    note: o.note,
    createdAt: o.created_at,
  }));

  const distribution = PILOT_OUTCOMES.map((outcome) => ({
    outcome,
    count: outcomes.filter((o) => o.outcome === outcome).length,
  }));

  const row = pilot as {
    id: string;
    name: string;
    organisation_kind: PilotOrganisationKind;
    status: PilotStatus;
    starts_on: string | null;
    ends_on: string | null;
    created_at: string;
  };

  return {
    kind: "ok",
    pilot: {
      id: row.id,
      name: row.name,
      organisationKind: row.organisation_kind,
      status: row.status,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      createdAt: row.created_at,
      participants,
      outcomes,
      outcomeDistribution: distribution,
    },
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProfileLookupResult =
  | { readonly kind: "found"; readonly profileId: string; readonly name: string }
  | { readonly kind: "not_found" }
  | { readonly kind: "invalid" };

/**
 * Admin-safe participant lookup: resolve an EXISTING profile by exact email
 * or by profile id. Admin RLS on `profiles` allows the read; nothing is
 * created here and no partial/fuzzy search is offered (no enumeration aid).
 */
export async function findProfileForPilot(
  query: string,
): Promise<ProfileLookupResult> {
  const q = query.trim();
  if (q.length < 3 || q.length > 254) return { kind: "invalid" };

  const supabase = await createClient();
  const sel = asAny(supabase).from("profiles").select("id, full_name, email");
  const { data, error } = UUID_RE.test(q)
    ? await sel.eq("id", q).maybeSingle()
    : await sel.eq("email", q.toLowerCase()).maybeSingle();

  if (error || !data) return { kind: "not_found" };
  const row = data as { id: string; full_name: string | null; email: string | null };
  return {
    kind: "found",
    profileId: row.id,
    name: nameOf({ full_name: row.full_name, email: row.email }),
  };
}
