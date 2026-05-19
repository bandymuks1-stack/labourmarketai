import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseServiceEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Service-role Supabase client — BYPASSES RLS. Server-only (the
 * `server-only` import makes importing this from client code a build error).
 *
 * Use ONLY for trusted server work that legitimately needs to cross tenant
 * boundaries: lead capture from the public site, the matching engine,
 * billing webhooks, audit writes, `admin:promote`. Never expose its results
 * to a user without an explicit authorization check first.
 */
export function createAdminClient() {
  const { url, serviceRoleKey } = requireSupabaseServiceEnv();
  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
