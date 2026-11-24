import "server-only";

import { cookies } from "next/headers";

/**
 * Does this request carry a Supabase session cookie at all?
 *
 * `supabase.auth.getUser()` VALIDATES the token against the auth server, which
 * is a network round trip. The public job surface is ~39,000 indexable pages
 * plus the board that lists them, so calling it unconditionally would put one
 * Supabase auth request behind every crawler hit and every anonymous visit —
 * for a caller who provably has no session.
 *
 * `middleware.ts` already refuses to do that (`hasSupabaseAuthCookie`, "so
 * anonymous public/marketing traffic stays fast and never hits Supabase"); this
 * is the same rule applied on the server-component side, matching the cookie
 * shape `@supabase/ssr` writes (`sb-<ref>-auth-token`, possibly chunked).
 *
 * It is a FAST PATH, never an authorisation decision: a forged cookie buys
 * nothing, because the unlock is decided by `getUser()` and then by RLS.
 *
 * It lives here rather than in one page because the board and the detail page
 * need the SAME rule — two copies would be two chances to drift.
 */
export async function hasSessionCookie(): Promise<boolean> {
  const store = await cookies();
  return store
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
}
