import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireSupabaseClientEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * RSC / server-action / route-handler Supabase client. Uses the anon key but
 * is scoped to the signed-in user via their auth cookies, so RLS applies as
 * that user. Must be created per request (cookies are request-bound).
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabaseClientEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch (e) {
          // Called from a Server Component where cookies are read-only —
          // expected and safe; the same setAll is invoked again from
          // the route handler / server action where it WILL succeed,
          // and session refresh also happens in middleware. We log the
          // non-secret error fields so a real cookie-write failure on
          // the route-handler path (where setAll IS supposed to work)
          // doesn't fail silently. NEVER log cookie names, values,
          // tokens, or the cookiesToSet array itself.
          const err =
            e instanceof Error
              ? { name: e.name, message: e.message }
              : { name: "unknown", message: String(e) };
          console.error("[supabase/server] cookies.setAll suppressed", err);
        }
      },
    },
  });
}
