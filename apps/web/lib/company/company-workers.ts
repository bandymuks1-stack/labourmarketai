import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Company-worker linking service (Stage 2 follow-up to PR #99).
 *
 * Mirrors lib/agency/agency-workers.ts shape exactly so the
 * dashboard surfaces stay consistent. Gracefully returns
 * { kind: "needs-migration" } when migration 0027_company_workers
 * is not yet applied (42P01 / 42883).
 */

const RPC_NOT_FOUND_CODE = "42883";
const RELATION_NOT_FOUND_CODE = "42P01";
const PERMISSION_DENIED_CODE = "42501";
/** Postgres "undefined_column" — the ops-bridge columns (migration 0030)
 *  are owner-gated and may not be applied yet; we degrade gracefully. */
const UNDEFINED_COLUMN_CODE = "42703";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export interface OwnCompany {
  readonly id: string;
  readonly legalName: string | null;
  readonly displayName: string | null;
  readonly country: string | null;
}

export interface LinkedCompanyWorker {
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

export interface CompanyWorkerInvitation {
  readonly id: string;
  readonly invitedEmail: string;
  readonly status: "pending" | "accepted" | "cancelled" | "expired";
  readonly createdAt: string;
  readonly note: string | null;
}

export type CompanyWorkersListResult =
  | { kind: "ok"; rows: readonly LinkedCompanyWorker[] }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export type CompanyInvitationsListResult =
  | { kind: "ok"; rows: readonly CompanyWorkerInvitation[] }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export type InviteCompanyWorkerResult =
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

export async function getOwnCompany(): Promise<OwnCompany | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("companies")
    .select("id, legal_name, display_name, country")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    legalName: data.legal_name ?? null,
    displayName: data.display_name ?? null,
    country: data.country ?? null,
  };
}

export async function listActiveCompanyWorkers(
  companyId: string,
): Promise<CompanyWorkersListResult> {
  const supabase = await createClient();
  const WORKER_JOIN = "workers(profile_id, display_name, profiles(email))";
  const BASE_COLS = `worker_id, status, created_at, ${WORKER_JOIN}`;
  const BRIDGE_COLS = `worker_id, status, created_at, operations_role, operations_title, journal_review_enabled, ${WORKER_JOIN}`;
  const run = (cols: string) =>
    asAny(supabase)
      .from("company_workers")
      .select(cols)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50);

  let { data, error } = await run(BRIDGE_COLS);
  // Ops-bridge columns not applied yet → retry without them (fields null).
  if (error && error.code === UNDEFINED_COLUMN_CODE) {
    ({ data, error } = await run(BASE_COLS));
  }
  if (error) {
    if (error.code === RELATION_NOT_FOUND_CODE) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  const rows: LinkedCompanyWorker[] = (data ?? []).map(
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

export async function listCompanyWorkerInvitations(
  companyId: string,
): Promise<CompanyInvitationsListResult> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase)
    .from("company_worker_invitations")
    .select("id, invited_email, status, created_at, note")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (error.code === RELATION_NOT_FOUND_CODE) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  const rows: CompanyWorkerInvitation[] = (data ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) => ({
      id: r.id as string,
      invitedEmail: r.invited_email as string,
      status: r.status as CompanyWorkerInvitation["status"],
      createdAt: r.created_at as string,
      note: (r.note as string | null) ?? null,
    }),
  );
  return { kind: "ok", rows };
}

export async function inviteCompanyWorker(
  companyId: string,
  email: string,
  note: string | null,
): Promise<InviteCompanyWorkerResult> {
  const supabase = await createClient();
  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return { kind: "ok", outcome: "invalid_email" };
  }
  const { data, error } = await asAny(supabase).rpc("invite_company_worker", {
    p_company_id: companyId,
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
  const outcome = data as InviteCompanyWorkerResult extends { outcome: infer O }
    ? O
    : never;
  return { kind: "ok", outcome };
}
