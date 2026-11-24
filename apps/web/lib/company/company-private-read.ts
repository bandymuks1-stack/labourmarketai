import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Company rows WITH their private columns (contact_email, contact_phone,
 * address, registration_code, vat_number, requester_role, verification_note,
 * requested_at) — K2-1 v2, 2026-09-24 (supersedes the unapplied #1430
 * draft, which predated #1859's member access).
 *
 * After migration 20260924120000_companies_contact_minimization_v2 the
 * `authenticated` grant on `public.companies` keeps only the discovery
 * columns, and the full row comes through ONE SECURITY DEFINER reader,
 * `read_companies_private_v1()`: the rows its caller may already open — the
 * creator, an active membership in `ROLES_THAT_OPEN` of the organization bound
 * to the company, or a platform admin. The callers keep their own filters and
 * their own finer checks (govern vs open) on top of it.
 *
 * Until that migration is applied the function does not exist (42883 /
 * PGRST202) and the read FALLS BACK to the direct table select that works
 * today, so the same code is correct before and after apply and nothing
 * degrades in between. ORDER: this code deploys BEFORE the migration applies —
 * the other way round, today's direct select of a private column answers 42501.
 *
 * Returns the raw `{ data, error }` shape the callers already handle, so their
 * needs-migration / error branches stay untouched.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

const UNDEFINED_FUNCTION_CODES = new Set(["42883", "PGRST202"]);

export const COMPANY_PRIVATE_READER = "read_companies_private_v1";

/** The full column list the owner / member / admin surfaces render. */
export const COMPANY_PRIVATE_SELECT =
  "id, profile_id, legal_name, display_name, company_type, country, registration_code, address, website, contact_email, contact_phone, requester_role, verification_status, verification_note, requested_at, created_at";

// `data` stays untyped exactly as the `asAny` table reads it replaces were.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReadResult = { data: any; error: { code?: string; message: string } | null };

/**
 * Reads companies with private columns: `columns` selected, `shape` applies
 * the caller's own filters / order / cardinality to whichever source answers.
 */
export async function readCompaniesPrivate(
  supabase: SupabaseClient,
  columns: string,
  shape: (query: AnyQuery) => PromiseLike<ReadResult>,
): Promise<ReadResult> {
  const client = supabase as AnyQuery;
  const viaReader = await shape(client.rpc(COMPANY_PRIVATE_READER).select(columns));
  if (!viaReader.error) return viaReader;
  if (!UNDEFINED_FUNCTION_CODES.has(viaReader.error.code ?? "")) return viaReader;
  // Migration not applied yet: the direct read still works (full grant).
  return shape(client.from("companies").select(columns));
}
