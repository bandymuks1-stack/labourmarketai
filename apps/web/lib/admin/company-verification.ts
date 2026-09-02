import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { readAllCompaniesPrivateAsAdmin } from "@/lib/company/company-private-read";
import type { CompanyVerificationStatus } from "@/lib/company/company-setup";

/**
 * Admin company-verification review service.
 *
 * READ side: lists all company requests with their verification ladder + the
 * linked profile identity (email / name). Access is via the user-scoped
 * client; companies SELECT RLS (0001) allows any authenticated user to read
 * companies, and profiles SELECT RLS (0001) allows `is_admin()` to read all
 * profiles — so a real admin session sees every row, a non-admin sees only
 * their own profile join. The page itself is gated by requireSuperadmin.
 *
 * WRITE side: setCompanyVerification wraps the admin-only
 * public.admin_set_company_verification RPC (migration 20260604130000). The
 * RPC re-checks is_admin() and writes the row; this layer never grants or
 * performs a direct companies UPDATE. Degrades to needs-migration when the
 * column (42703) or RPC (42883) is absent.
 */

const UNDEFINED_COLUMN_CODE = "42703";
const UNDEFINED_FUNCTION_CODE = "42883";
const RELATION_NOT_FOUND_CODE = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/** Statuses an admin may set (never 'draft' — that's owner-only). */
export type AdminVerificationStatus =
  | "verified"
  | "unverified"
  | "pending_verification";

export const ADMIN_VERIFICATION_STATUSES: readonly AdminVerificationStatus[] = [
  "verified",
  "unverified",
  "pending_verification",
];

export interface CompanyVerificationRow {
  readonly id: string;
  readonly profileId: string | null;
  readonly legalName: string | null;
  readonly country: string | null;
  readonly registrationCode: string | null;
  readonly address: string | null;
  readonly website: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly requesterRole: string | null;
  readonly requestedAt: string | null;
  readonly verificationStatus: CompanyVerificationStatus;
  readonly verificationNote: string | null;
  readonly createdAt: string;
  /** Linked user identity (admin RLS lets us read it). */
  readonly userEmail: string | null;
  readonly userName: string | null;
}

export type CompanyVerificationListResult =
  | { kind: "ok"; rows: readonly CompanyVerificationRow[] }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export type SetVerificationResult =
  | { kind: "ok" }
  | { kind: "not-admin" }
  | { kind: "invalid" }
  | { kind: "not-found" }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

// Column list (incl. private contact columns) lives with the admin reader in
// lib/company/company-private-read.ts (K2-1).

/** Exception-review ordering: things that may need admin attention first
 *  (flagged checks + explicit escalations), then the rest, verified last. */
const STATUS_ORDER: Record<CompanyVerificationStatus, number> = {
  needs_checks: 0,
  pending_verification: 1,
  active_unverified: 2,
  unverified: 3,
  draft: 4,
  verified: 5,
};

export async function listCompanyVerificationRequests(): Promise<CompanyVerificationListResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", rows: [] };

  // K2-1: private columns through the admin reader (definer RPC once
  // 20260902210000 is applied; the direct read before that).
  const { data, error } = await readAllCompaniesPrivateAsAdmin(supabase);
  if (error) {
    if (
      error.code === UNDEFINED_COLUMN_CODE ||
      error.code === RELATION_NOT_FOUND_CODE
    ) {
      return { kind: "needs-migration" };
    }
    return { kind: "error", message: error.message };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyRows = (data ?? []) as any[];
  const profileIds = [
    ...new Set(
      companyRows.map((r) => r.profile_id).filter((v): v is string => !!v),
    ),
  ];
  const identityById = new Map<string, { email: string | null; name: string | null }>();
  if (profileIds.length > 0) {
    const { data: profiles } = await asAny(supabase)
      .from("profiles")
      .select("id, email, full_name")
      .in("id", profileIds);
    for (const p of (profiles ?? []) as {
      id: string;
      email: string | null;
      full_name: string | null;
    }[]) {
      identityById.set(p.id, { email: p.email ?? null, name: p.full_name ?? null });
    }
  }

  const rows: CompanyVerificationRow[] = companyRows.map((r) => {
    const identity = r.profile_id ? identityById.get(r.profile_id) : undefined;
    return {
      id: r.id as string,
      profileId: (r.profile_id as string | null) ?? null,
      legalName: (r.legal_name as string | null) ?? null,
      country: (r.country as string | null) ?? null,
      registrationCode: (r.registration_code as string | null) ?? null,
      address: (r.address as string | null) ?? null,
      website: (r.website as string | null) ?? null,
      contactEmail: (r.contact_email as string | null) ?? null,
      contactPhone: (r.contact_phone as string | null) ?? null,
      requesterRole: (r.requester_role as string | null) ?? null,
      requestedAt: (r.requested_at as string | null) ?? null,
      verificationStatus:
        (r.verification_status as CompanyVerificationStatus) ?? "draft",
      verificationNote: (r.verification_note as string | null) ?? null,
      createdAt: r.created_at as string,
      userEmail: identity?.email ?? null,
      userName: identity?.name ?? null,
    };
  });

  rows.sort((a, b) => {
    const so = STATUS_ORDER[a.verificationStatus] - STATUS_ORDER[b.verificationStatus];
    if (so !== 0) return so;
    return (b.requestedAt ?? b.createdAt).localeCompare(a.requestedAt ?? a.createdAt);
  });

  return { kind: "ok", rows };
}

export async function setCompanyVerification(
  companyId: string,
  status: AdminVerificationStatus,
  note: string | null,
): Promise<SetVerificationResult> {
  if (!(ADMIN_VERIFICATION_STATUSES as readonly string[]).includes(status)) {
    return { kind: "invalid" };
  }
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc(
    "admin_set_company_verification",
    {
      p_company_id: companyId,
      p_status: status,
      p_note: note?.trim() || null,
    },
  );
  if (error) {
    if (error.code === UNDEFINED_FUNCTION_CODE) return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  switch (data as string) {
    case "ok":
      return { kind: "ok" };
    case "not_admin":
      return { kind: "not-admin" };
    case "invalid_status":
      return { kind: "invalid" };
    case "not_found":
      return { kind: "not-found" };
    default:
      return { kind: "error", message: `Unexpected RPC result: ${String(data)}` };
  }
}
