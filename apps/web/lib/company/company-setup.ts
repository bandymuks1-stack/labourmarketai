import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Company profile-request service.
 *
 * Mirrors the customer/buyer persistence shape (lib/buyer/customers.ts):
 *   - getOwnCompany() reads public.companies for the current user, including
 *     the verification ladder added in migration 20260604120000.
 *   - saveCompanySetup() wraps the public.save_company_setup RPC, which is
 *     idempotent (upsert) and ensures the 'company' profile_roles entry.
 *
 * Honesty / safety:
 *   - The RPC can NEVER set verification_status = 'verified'. A self-service
 *     submit only moves the company to 'pending_verification'. This service
 *     therefore cannot fabricate a verified company (PLATFORM_DOCTRINE §7).
 *   - Reads go through the user-scoped supabase client (RLS limits the row to
 *     the owner). INSERT/UPDATE happen exclusively through the SECURITY
 *     DEFINER RPC.
 *   - Gracefully returns kind: "needs-migration" when migration
 *     20260604120000 is not yet applied (Postgres 42703 undefined_column for
 *     the new columns, 42883 undefined_function for the RPC).
 */

const RPC_NOT_FOUND_CODE = "42883";
const UNDEFINED_COLUMN_CODE = "42703";
const RELATION_NOT_FOUND_CODE = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/** Honest verification ladder (AUTOMATIC-FIRST).
 *  - active_unverified: created + automated checks passed; usable now, not
 *    identity/registry-verified. This is the normal state after creation.
 *  - needs_checks: a basic automated check failed; still usable, flagged.
 *  - pending_verification: OPTIONAL manual-review escalation (exception path).
 *  - verified: stronger trust state — admin / real-registry only (never the
 *    client, never automatic, never "user filled the form").
 *  - draft / unverified: legacy + explicit-not-verified states, still allowed. */
export type CompanyVerificationStatus =
  | "draft"
  | "active_unverified"
  | "needs_checks"
  | "pending_verification"
  | "unverified"
  | "verified";

export const COMPANY_VERIFICATION_STATUSES: readonly CompanyVerificationStatus[] =
  [
    "draft",
    "active_unverified",
    "needs_checks",
    "pending_verification",
    "unverified",
    "verified",
  ];

/** The user's own role inside the company they are requesting. Free-text in
 *  the DB; the form offers a small honest allowlist + "other". */
export type CompanyRequesterRole =
  | "owner"
  | "director"
  | "manager"
  | "hr"
  | "other";

export const COMPANY_REQUESTER_ROLES: readonly CompanyRequesterRole[] = [
  "owner",
  "director",
  "manager",
  "hr",
  "other",
];

export interface CompanyRow {
  readonly id: string;
  readonly profileId: string;
  readonly legalName: string | null;
  readonly displayName: string | null;
  readonly country: string | null;
  readonly registrationCode: string | null;
  readonly address: string | null;
  readonly website: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly requesterRole: string | null;
  readonly verificationStatus: CompanyVerificationStatus;
  readonly verificationNote: string | null;
  readonly requestedAt: string | null;
  readonly createdAt: string;
}

export type CompanyReadResult =
  | { kind: "ok"; row: CompanyRow | null }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

export interface SaveCompanyInput {
  readonly legalName: string;
  readonly country?: string;
  readonly registrationCode?: string;
  readonly address?: string;
  readonly website?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly requesterRole?: string;
  /** AUTOMATIC-FIRST: false (default) saves the company as active_unverified /
   *  needs_checks (usable immediately). true is the OPTIONAL escalation to a
   *  manual review (→ pending_verification) — never required for basic use. */
  readonly submit: boolean;
}

export type SaveCompanyResult =
  | { kind: "ok"; companyId: string }
  | { kind: "needs-migration" }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string };

const SELECT_COLUMNS =
  "id, profile_id, legal_name, display_name, country, registration_code, address, website, contact_email, contact_phone, requester_role, verification_status, verification_note, requested_at, created_at";

export async function getOwnCompany(): Promise<CompanyReadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", row: null };
  const { data, error } = await asAny(supabase)
    .from("companies")
    .select(SELECT_COLUMNS)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error) {
    if (
      error.code === UNDEFINED_COLUMN_CODE ||
      error.code === RELATION_NOT_FOUND_CODE
    ) {
      return { kind: "needs-migration" };
    }
    return { kind: "error", message: error.message };
  }
  if (!data) return { kind: "ok", row: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any;
  return {
    kind: "ok",
    row: {
      id: r.id as string,
      profileId: r.profile_id as string,
      legalName: (r.legal_name as string | null) ?? null,
      displayName: (r.display_name as string | null) ?? null,
      country: (r.country as string | null) ?? null,
      registrationCode: (r.registration_code as string | null) ?? null,
      address: (r.address as string | null) ?? null,
      website: (r.website as string | null) ?? null,
      contactEmail: (r.contact_email as string | null) ?? null,
      contactPhone: (r.contact_phone as string | null) ?? null,
      requesterRole: (r.requester_role as string | null) ?? null,
      verificationStatus:
        (r.verification_status as CompanyVerificationStatus) ?? "active_unverified",
      verificationNote: (r.verification_note as string | null) ?? null,
      requestedAt: (r.requested_at as string | null) ?? null,
      createdAt: r.created_at as string,
    },
  };
}

export async function saveCompanySetup(
  input: SaveCompanyInput,
): Promise<SaveCompanyResult> {
  const name = input.legalName.trim();
  if (name.length < 2 || name.length > 200) {
    return {
      kind: "invalid",
      message: "Company legal name must be between 2 and 200 characters.",
    };
  }
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc("save_company_setup", {
    p_legal_name: name,
    p_country: input.country?.trim() || null,
    p_registration_code: input.registrationCode?.trim() || null,
    p_address: input.address?.trim() || null,
    p_website: input.website?.trim() || null,
    p_contact_email: input.contactEmail?.trim() || null,
    p_contact_phone: input.contactPhone?.trim() || null,
    p_requester_role: input.requesterRole?.trim() || null,
    p_submit: input.submit,
  });
  if (error) {
    if (
      error.code === RPC_NOT_FOUND_CODE ||
      error.code === UNDEFINED_COLUMN_CODE
    ) {
      return { kind: "needs-migration" };
    }
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", companyId: data as string };
}
