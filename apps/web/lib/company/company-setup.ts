import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { emitServerFunnelEvent } from "@/lib/telemetry/server-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

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

// Shared client-safe constants (CompanyType, COMPANY_TYPES,
// COMPANY_COUNTRY_CODES, isKnownCountryCode) live in
// company-profile-shared.ts so the client form can import them without
// pulling in this server-only module; re-exported here for server callers.
export * from "./company-profile-shared";
import {
  COMPANY_TYPES,
  isKnownCountryCode,
  type CompanyType,
} from "./company-profile-shared";
import { resolveCompanyLegalParams } from "./company-legal-lock";

export type { CompanyLegalFields } from "./company-legal-lock";
export { resolveCompanyLegalParams } from "./company-legal-lock";

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
  readonly companyType: CompanyType;
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
  readonly companyType?: string;
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
  /** Country was not one of the known countries.code values. The UI maps
   *  this to a calm localized message — never the raw FK/RPC error text. */
  | { kind: "invalid-country" }
  | { kind: "error"; message: string };

const SELECT_COLUMNS =
  "id, profile_id, legal_name, display_name, company_type, country, registration_code, address, website, contact_email, contact_phone, requester_role, verification_status, verification_note, requested_at, created_at";

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
      companyType: (r.company_type as CompanyType | null) ?? "other",
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
  // Read the current row first so a VERIFIED company's legal fields can be
  // locked (never overwritten by a self-service save). A read failure /
  // missing migration leaves `verified` null and the save proceeds normally.
  const existing = await getOwnCompany();
  const verifiedRow =
    existing.kind === "ok" && existing.row?.verificationStatus === "verified"
      ? existing.row
      : null;

  const legal = resolveCompanyLegalParams({
    inputLegalName: input.legalName,
    inputCountry: input.country,
    inputRegistrationCode: input.registrationCode,
    inputAddress: input.address,
    verified: verifiedRow,
  });

  const name = legal.legalName;
  if (name.length < 2 || name.length > 200) {
    return {
      kind: "invalid",
      message: "Company legal name must be between 2 and 200 characters.",
    };
  }
  // Country is validated BEFORE any DB call: only seeded countries.code
  // values may reach the RPC (the mirror trigger copies companies.country
  // into organizations.country, which has an FK to countries(code) — free
  // text used to surface as a raw organizations_country_fkey crash). A
  // locked (verified) country is already a stored, valid value — skip.
  const rawCountry = legal.country;
  if (!legal.locked && rawCountry !== null && !isKnownCountryCode(rawCountry)) {
    return { kind: "invalid-country" };
  }
  const rawType = input.companyType?.trim().toLowerCase() || null;
  if (
    rawType !== null &&
    !(COMPANY_TYPES as readonly string[]).includes(rawType)
  ) {
    return { kind: "invalid", message: "Unknown company type." };
  }

  const supabase = await createClient();
  const params = {
    p_legal_name: name,
    p_country: rawCountry,
    p_registration_code: legal.registrationCode,
    p_address: legal.address,
    p_website: input.website?.trim() || null,
    p_contact_email: input.contactEmail?.trim() || null,
    p_contact_phone: input.contactPhone?.trim() || null,
    p_requester_role: input.requesterRole?.trim() || null,
    p_submit: input.submit,
  };
  let { data, error } = await asAny(supabase).rpc("save_company_setup_v2", {
    ...params,
    p_company_type: rawType,
  });
  if (error && error.code === RPC_NOT_FOUND_CODE) {
    // v2 (migration 20260612090000) not applied yet — fall back to the v1
    // RPC so the profile itself still saves; the type is kept client-side
    // only until the migration lands.
    console.warn(
      "save_company_setup_v2 missing; falling back to v1 (company_type not persisted)",
    );
    ({ data, error } = await asAny(supabase).rpc("save_company_setup", params));
  }
  if (error) {
    if (
      error.code === RPC_NOT_FOUND_CODE ||
      error.code === UNDEFINED_COLUMN_CODE
    ) {
      return { kind: "needs-migration" };
    }
    // Defense-in-depth: a country problem from ANY path (the v2 RPC's
    // allowlist check or the organizations_country_fkey mirror) is mapped to
    // the calm localized message — the raw technical text never reaches UI.
    if (
      error.message?.includes("invalid_country") ||
      error.message?.includes("organizations_country_fkey")
    ) {
      return { kind: "invalid-country" };
    }
    // Never surface raw Postgres/PostgREST text to the user; log it for
    // diagnostics and return a generic, localizable failure instead.
    console.error("save_company_setup failed:", error.code, error.message);
    return { kind: "error", message: "save_failed" };
  }
  // W14 mid-funnel: emit organization_created ONLY when this save CREATED the
  // company (the pre-save read found none). An update, or a save whose
  // pre-read failed (`existing.kind !== "ok"`), emits nothing — ambiguity is
  // never counted as a creation. Fire-and-forget.
  if (existing.kind === "ok" && !existing.row) {
    emitServerFunnelEvent(FUNNEL_EVENTS.organizationCreated, {
      source: "company-setup",
      metadata: { surface: "company_setup", entity_type: "company" },
    });
  }
  return { kind: "ok", companyId: data as string };
}
