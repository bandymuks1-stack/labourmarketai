import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { validateOperationsRoleAssignment } from "@/lib/operations/assign-operations-role";
import type { SetJournalReviewOutcome } from "@/lib/operations/journal-review-actions";

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
  /** Whether an active 'employee' engagement_context links this worker to the
   *  company's mirrored organization (migration 0033 per-row read). False until
   *  the owner provisions the bridge (migration 0032 RPC) or the read RPC is
   *  applied. The journal-review toggle stays disabled until this is true. */
  readonly engagementContextLinked: boolean;
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
  // Per-row engagement-context read (migration 0033): which workers already
  // have an active 'employee' engagement_context linking them to the org.
  // Owner/admin-scoped RPC; degrades to an empty set (every row unlinked) when
  // 0033 is not applied yet (42883) or the caller is not the owner.
  const linkedWorkerIds = await readEngagementLinkedWorkerIds(
    supabase,
    "company_worker_engagement_links",
    "p_company_id",
    companyId,
  );
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
      engagementContextLinked: linkedWorkerIds.has(r.worker_id as string),
    }),
  );
  return { kind: "ok", rows };
}

/**
 * Shared per-row engagement read used by company + agency lists. Calls the
 * owner/admin-scoped SECURITY DEFINER read RPC (migration 0033) and returns the
 * set of worker_ids that have an active 'employee' engagement_context link.
 * Always degrades to an empty set (every row honestly "not connected") when the
 * RPC is missing (42883) or any error occurs — it never throws and never
 * fabricates a link.
 */
async function readEngagementLinkedWorkerIds(
  supabase: SupabaseClient,
  rpcName: "company_worker_engagement_links" | "agency_worker_engagement_links",
  paramName: "p_company_id" | "p_agency_id",
  orgId: string,
): Promise<ReadonlySet<string>> {
  const { data, error } = await asAny(supabase).rpc(rpcName, {
    [paramName]: orgId,
  });
  if (error || !Array.isArray(data)) return new Set<string>();
  // The RPC returns setof uuid → an array of strings (or { ...: uuid } rows
  // depending on the driver). Normalise both shapes.
  const ids = data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((row: any) =>
      typeof row === "string" ? row : (row?.[rpcName] ?? row?.worker_id ?? null),
    )
    .filter((v: unknown): v is string => typeof v === "string");
  return new Set<string>(ids);
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

export type AssignCompanyWorkerRoleResult =
  | {
      kind: "ok";
      outcome:
        | "assigned"
        | "cleared"
        | "not_owner"
        | "not_linked"
        | "invalid_role"
        | "review_not_allowed";
    }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

/**
 * Assign (or clear) an operations role/title on a company↔worker
 * relationship via the owner/admin-scoped `assign_company_worker_role` RPC
 * (migration 0031). Journal review is never enabled here — review rights
 * cannot come from a stored label until the engagement-context bridge ships;
 * the RPC and this wrapper reject any review-enable attempt.
 *
 * `operationsRole = null` (or blank) clears the assignment. Ownership is
 * re-validated server-side inside the SECURITY DEFINER RPC.
 */
export async function assignCompanyWorkerRole(
  companyId: string,
  workerId: string,
  operationsRole: string | null,
  operationsTitle: string | null = null,
): Promise<AssignCompanyWorkerRoleResult> {
  // Fail fast with the same rules the RPC enforces (pure, no IO).
  const check = validateOperationsRoleAssignment({
    operationsRole,
    operationsTitle,
  });
  if (!check.ok) {
    return { kind: "ok", outcome: check.reason };
  }
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc("assign_company_worker_role", {
    p_company_id: companyId,
    p_worker_id: workerId,
    p_operations_role: check.action === "clear" ? null : check.role,
    p_operations_title: check.action === "clear" ? null : check.title,
    p_journal_review_enabled: false,
  });
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE) return { kind: "needs-migration" };
    if (error.code === PERMISSION_DENIED_CODE) {
      return { kind: "ok", outcome: "not_owner" };
    }
    return { kind: "error", message: error.message };
  }
  const outcome =
    data as AssignCompanyWorkerRoleResult extends { outcome: infer O }
      ? O
      : never;
  return { kind: "ok", outcome };
}

export type ProvisionEngagementContextResult =
  | {
      kind: "ok";
      outcome:
        | "connected"
        | "already_connected"
        | "not_owner"
        | "not_linked"
        | "profile_missing"
        | "role_not_assigned"
        | "role_not_allowed"
        | "organization_missing";
    }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

/**
 * Owner/admin-only: provision (idempotently) an active `employee`
 * engagement_context linking a company↔worker relationship to the company's
 * mirrored organization, via the SECURITY DEFINER RPC
 * `provision_company_worker_engagement_context` (migration 0032). This makes
 * the relationship **bridge-ready**; it does NOT enable journal review.
 * Ownership is re-validated server-side inside the RPC; the wrapper degrades
 * to `needs-migration` (42883) until 0032 is applied.
 */
export async function provisionCompanyWorkerEngagementContext(
  companyId: string,
  workerId: string,
): Promise<ProvisionEngagementContextResult> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc(
    "provision_company_worker_engagement_context",
    { p_company_id: companyId, p_worker_id: workerId },
  );
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE) return { kind: "needs-migration" };
    if (error.code === PERMISSION_DENIED_CODE) {
      return { kind: "ok", outcome: "not_owner" };
    }
    return { kind: "error", message: error.message };
  }
  const outcome =
    data as ProvisionEngagementContextResult extends { outcome: infer O }
      ? O
      : never;
  return { kind: "ok", outcome };
}

export type SetJournalReviewResult =
  | { kind: "ok"; outcome: SetJournalReviewOutcome }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

/**
 * Owner/admin-only: enable or disable journal review for a company↔worker
 * relationship via the SECURITY DEFINER RPC `set_company_worker_journal_review`
 * (migration 0033). Enabling is gated server-side on a real active 'employee'
 * engagement_context (review is never enabled from a stored label); disabling
 * is always allowed. Ownership is re-validated inside the RPC; the wrapper
 * degrades to `needs-migration` (42883) until 0033 is applied.
 */
export async function setCompanyWorkerJournalReview(
  companyId: string,
  workerId: string,
  enabled: boolean,
): Promise<SetJournalReviewResult> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc(
    "set_company_worker_journal_review",
    { p_company_id: companyId, p_worker_id: workerId, p_enabled: enabled },
  );
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE) return { kind: "needs-migration" };
    if (error.code === PERMISSION_DENIED_CODE) {
      return { kind: "ok", outcome: "not_owner" };
    }
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", outcome: data as SetJournalReviewOutcome };
}
