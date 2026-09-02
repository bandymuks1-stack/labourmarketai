import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Company rows WITH their private columns (contact_email, contact_phone,
 * address, registration_code, requester_role, verification_note,
 * requested_at) — FINAL COMPLETION Train K2, finding K2-1.
 *
 * After migration 20260902210000 the `authenticated` table grant no longer
 * includes those columns; the owner and an admin read them through two
 * SECURITY DEFINER functions. Until the migration is applied the functions
 * do not exist (42883 / PGRST202) and these helpers FALL BACK to the direct
 * table select that works today — so the same code is correct before and
 * after apply, and nothing degrades in between.
 *
 * Both helpers return the raw `{ data, error }` shape the callers already
 * handle, so their needs-migration / error branches stay untouched.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const UNDEFINED_FUNCTION_CODES = new Set(["42883", "PGRST202"]);

/** The full column list the owner/admin surfaces render. */
export const COMPANY_PRIVATE_SELECT =
  "id, profile_id, legal_name, display_name, company_type, country, registration_code, address, website, contact_email, contact_phone, requester_role, verification_status, verification_note, requested_at, created_at";

type ReadResult = { data: unknown[] | null; error: { code?: string; message: string } | null };

/** The caller's OWN companies, private columns included (oldest first). */
export async function readOwnCompaniesPrivate(
  supabase: SupabaseClient,
  profileId: string,
): Promise<ReadResult> {
  const viaRpc = await (supabase as AnyClient).rpc("list_own_companies_private_v1");
  if (!viaRpc.error) return { data: (viaRpc.data ?? []) as unknown[], error: null };
  if (!UNDEFINED_FUNCTION_CODES.has(viaRpc.error.code ?? "")) {
    return { data: null, error: viaRpc.error };
  }
  // Migration not applied yet: the direct read still works (full grant).
  return (supabase as AnyClient)
    .from("companies")
    .select(COMPANY_PRIVATE_SELECT)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true });
}

/** Every company with private columns — ADMINS only (the RPC refuses others). */
export async function readAllCompaniesPrivateAsAdmin(
  supabase: SupabaseClient,
): Promise<ReadResult> {
  const viaRpc = await (supabase as AnyClient).rpc("admin_list_companies_private_v1");
  if (!viaRpc.error) return { data: (viaRpc.data ?? []) as unknown[], error: null };
  if (!UNDEFINED_FUNCTION_CODES.has(viaRpc.error.code ?? "")) {
    return { data: null, error: viaRpc.error };
  }
  return (supabase as AnyClient)
    .from("companies")
    .select(COMPANY_PRIVATE_SELECT)
    .order("requested_at", { ascending: false, nullsFirst: false });
}
