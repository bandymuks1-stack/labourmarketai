import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseClientEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Browser Supabase client (anon key, RLS-enforced). Use inside client
 * components. Memoized so repeated calls share one instance. Validation is
 * lazy — calling this without NEXT_PUBLIC_SUPABASE_ANON_KEY throws a clear
 * error rather than failing the build.
 */
let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  if (browserClient) return browserClient;
  const { url, anonKey } = requireSupabaseClientEnv();
  browserClient = createBrowserClient<Database>(url, anonKey);
  return browserClient;
}
