import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Agency-worker linking service (Stage 2 PR 2).
 *
 * Reads:
 *   - getOwnAgencyId() — the agency row owned by the current user.
 *   - listActiveAgencyWorkers(agency) — rows in public.agency_workers
 *     joined to workers + profiles; RLS lets the agency owner see them
 *     via owns_agency(agency_id).
 *   - listAgencyWorkerInvitations(agency) — pending invitations table
 *     rows. Gracefully returns { kind: "needs-migration" } when the
 *     0025 migration is not yet applied (Postgres 42P01).
 *
 * Writes:
 *   - inviteAgencyWorker(agency, email, note) — wraps
 *     public.invite_agency_worker RPC. Gracefully returns
 *     { kind: "needs-migration" } when the RPC is missing (42883).
 *
 * Privacy / safety:
 *   - Every call goes through the user-scoped supabase client. RLS +
 *     owns_agency(p_agency_id) inside the RPC enforce ownership; this
 *     layer never escalates to service-role.
 *   - The RPC never reveals whether a `workers` row exists for an
 *     arbitrary email — `already_linked` is only returned when the
 *     caller owns the agency. Non-owners get `not_owner`.
 */

const RPC_NOT_FOUND_CODE = "42883"; // function does not exist
const RELATION_NOT_FOUND_CODE = "42P01"; // table does not exist
const PERMISSION_DENIED_CODE = "42501";
/** Postgres "undefined_column" — ops-bridge columns (migration 0030) are
 *  owner-gated and may not be applied yet; degrade gracefully. */
const UNDEFINED_COLUMN_CODE = "42703";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export interface OwnAgency {
  readonly id: string;
  readonly legalName: string | null;
  readonly country: string | null;
}

export interface LinkedAgencyWorker {
  readonly workerId: string;
  readonly profileId: string;
  readonly status: string | null;
  readonly displayName: string | null;
  readonly email: string | null;
  readonly createdAt: string;
  /** Ops-bridge fields (migration 0030); null/false until applied + set. */
  readonly operationsRole: string | null;
  readonly operationsTitle: string | null;
  readonly journalReviewEnabled: boolean;
}

export interface AgencyWorkerInvitation {
  readonly id: string;
  readonly invitedEmail: string;
  readonly status: "pending" | "accepted" | "cancelled" | "expired";
  readonly createdAt: string;
  readonly note: string | null;
}

export type AgencyWorkersListResult =
  | { kind: "ok"; rows: readonly LinkedAgencyWorker[] }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export type AgencyInvitationsListResult =
  | { kind: "ok"; rows: readonly AgencyWorkerInvitation[] }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export type InviteAgencyWorkerResult =
  | {
      kind: "ok";
      outcome:
        | "invited"
        | "already_pending"
        | "already_linked"
        | "not_owner"
        | "invalid_email";
    }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export async function getOwnAgency(): Promise<OwnAgency | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("agencies")
    .select("id, legal_name, country")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    legalName: data.legal_name ?? null,
    country: data.country ?? null,
  };
}

export async function listActiveAgencyWorkers(
  agencyId: string,
): Promise<AgencyWorkersListResult> {
  const supabase = await createClient();
  const WORKER_JOIN = "workers(profile_id, display_name, profiles(email))";
  const BASE_COLS = `worker_id, status, created_at, ${WORKER_JOIN}`;
  const BRIDGE_COLS = `worker_id, status, created_at, operations_role, operations_title, journal_review_enabled, ${WORKER_JOIN}`;
  const run = (cols: string) =>
    asAny(supabase)
      .from("agency_workers")
      .select(cols)
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(50);

  let { data, error } = await run(BRIDGE_COLS);
  if (error && error.code === UNDEFINED_COLUMN_CODE) {
    ({ data, error } = await run(BASE_COLS));
  }
  if (error) {
    if (error.code === RELATION_NOT_FOUND_CODE) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  const rows: LinkedAgencyWorker[] = (data ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) => ({
      workerId: r.worker_id as string,
      profileId: (r.workers?.profile_id as string) ?? "",
      status: (r.status as string | null) ?? null,
      displayName: (r.workers?.display_name as string | null) ?? null,
      email: (r.workers?.profiles?.email as string | null) ?? null,
      createdAt: r.created_at as string,
      operationsRole: (r.operations_role as string | null) ?? null,
      operationsTitle: (r.operations_title as string | null) ?? null,
      journalReviewEnabled: r.journal_review_enabled === true,
    }),
  );
  return { kind: "ok", rows };
}

export async function listAgencyWorkerInvitations(
  agencyId: string,
): Promise<AgencyInvitationsListResult> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase)
    .from("agency_worker_invitations")
    .select("id, invited_email, status, created_at, note")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (error.code === RELATION_NOT_FOUND_CODE) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  const rows: AgencyWorkerInvitation[] = (data ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) => ({
      id: r.id as string,
      invitedEmail: r.invited_email as string,
      status: r.status as AgencyWorkerInvitation["status"],
      createdAt: r.created_at as string,
      note: (r.note as string | null) ?? null,
    }),
  );
  return { kind: "ok", rows };
}

export async function inviteAgencyWorker(
  agencyId: string,
  email: string,
  note: string | null,
): Promise<InviteAgencyWorkerResult> {
  const supabase = await createClient();
  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return { kind: "ok", outcome: "invalid_email" };
  }
  const { data, error } = await asAny(supabase).rpc("invite_agency_worker", {
    p_agency_id: agencyId,
    p_email: trimmed,
    p_note: note?.trim() || null,
  });
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE) return { kind: "needs-migration" };
    if (error.code === PERMISSION_DENIED_CODE) {
      return { kind: "ok", outcome: "not_owner" };
    }
    return { kind: "error", message: error.message };
  }
  const outcome = data as InviteAgencyWorkerResult extends { outcome: infer O }
    ? O
    : never;
  return { kind: "ok", outcome };
}
