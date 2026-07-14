import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireSupabaseClientEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * RSC / server-action / route-handler Supabase client. Uses the anon key but
 * is scoped to the signed-in user via their auth cookies, so RLS applies as
 * that user. Must be created per request (cookies are request-bound).
 *
 * Request-scoped via React cache(): every helper that calls createClient()
 * within one request shares ONE client, and that client's auth.getUser() is
 * memoised below. Before this, a single dashboard SSR issued 10+ identical
 * `getUser` round-trips to Supabase Auth (one per lib helper) — the dominant
 * share of the 2.3s dashboard TTFB measured in the P0 latency audit. The
 * session cannot change mid-request (middleware validates/refreshes it), so
 * one validation per request is exactly as correct. Auth-mutating routes
 * (callback exchange, logout) never read getUser before mutating, so the
 * memo can't serve a pre-mutation value.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabaseClientEnv();

  const client = createServerClient<Database>(url, anonKey, {
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

  // Memoise auth.getUser() for the lifetime of this (request-scoped) client.
  // The no-argument form validates the cookie session against Supabase Auth —
  // a network round-trip. Explicit-JWT calls are passed through unmemoised.
  const realGetUser = client.auth.getUser.bind(client.auth);
  let memo: ReturnType<typeof realGetUser> | null = null;
  client.auth.getUser = ((jwt?: string) => {
    if (jwt !== undefined) return realGetUser(jwt);
    memo ??= realGetUser();
    return memo;
  }) as typeof client.auth.getUser;

  return client;
});
