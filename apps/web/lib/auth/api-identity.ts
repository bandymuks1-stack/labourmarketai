import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import { createClient as createCookieClient } from "@/lib/supabase/server";
import { requireSupabaseClientEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * WHO IS CALLING `app/api/**` — the one transport seam.
 *
 * Measured before this: 9 route files, 7 resolving identity from `cookies()`,
 * and **zero** reading an `Authorization` header. Cookies are a browser
 * transport, so the canonical domain had exactly one client it could serve.
 * Android, iOS and any external AI client are blocked on that, and on nothing
 * else — the domain logic and the authorization model are already shared.
 *
 * ## The one property that matters
 *
 * This returns a **Supabase client**, not merely a user id.
 *
 * Every route today queries through an RLS-scoped client, so the database
 * decides what the caller may see. Had this resolver returned an id and left
 * routes to query some other way, authority would have moved up into the API
 * layer and the platform would have acquired a SECOND permission model — the
 * exact failure this seam exists to prevent. Scopes, organization authority
 * and visibility are NOT re-implemented here and must never be: this
 * establishes WHO, and `can_view_worker`, `manages_organization`, the SECDEF
 * RPCs and RLS keep deciding WHAT.
 *
 * ## Bearer IN ADDITION TO cookies
 *
 * No new token type, no new signing authority, no second identity system. The
 * platform already issues exactly this token to its own web client; a mobile
 * or external client simply presents it in a header instead of a cookie. The
 * web path is untouched — a request with no `Authorization` header behaves
 * exactly as it did before, byte for byte.
 *
 * Verification is delegated to the project's own auth server via
 * `auth.getUser(token)`, which checks signature, expiry and issuer. That is
 * deliberate: hand-rolling JWKS verification here would be a second place
 * where "is this token real?" is answered, and the two could disagree.
 *
 * ## Fail closed, and say which failure
 *
 * A refusal is never an anonymous request, and the three refusals are kept
 * apart because they are genuinely different facts — the #1314 lesson, where a
 * failed roles READ was reported as "you do not hold this role". A read that
 * did not answer is not proof that a profile is absent.
 */

export type ApiIdentityRefusal =
  /** No cookie session and no bearer token — the caller is anonymous. */
  | "no_credentials"
  /** A token was presented and the auth server rejected it: expired, wrong
   *  signature, wrong project, or not a user token at all. */
  | "invalid_token"
  /** The token is valid but its `sub` resolves to no `profiles` row. */
  | "no_profile"
  /** The profile lookup itself failed. NOT the same as "no profile", and it
   *  still fails closed — but it must never be reported as a fact about the
   *  caller. */
  | "identity_unavailable";

export type ApiIdentity =
  | {
      ok: true;
      /** Which transport carried the credential. Useful for telemetry; never
       *  a permission input. */
      via: "cookie" | "bearer";
      userId: string;
      /** RLS-scoped as the caller. Every downstream query MUST use this. */
      supabase: SupabaseClient<Database>;
    }
  | { ok: false; reason: ApiIdentityRefusal };

/** HTTP status for each refusal — 401 when we do not know who you are, 403
 *  when we do and you still may not proceed. */
export function refusalStatus(reason: ApiIdentityRefusal): 401 | 403 | 503 {
  switch (reason) {
    case "no_credentials":
    case "invalid_token":
      return 401;
    case "no_profile":
      return 403;
    case "identity_unavailable":
      // We could not establish identity. Saying 401/403 would assert
      // something about the caller that was never determined.
      return 503;
  }
}

/**
 * The bearer token from an `Authorization` header, or null.
 *
 * Exported for its own tests: header parsing is where a permissive regex
 * quietly becomes an auth bypass, so it is tested directly rather than only
 * through the whole resolver.
 */
export function bearerToken(headers: Headers): string | null {
  const raw = headers.get("authorization");
  if (!raw) return null;
  // Exactly one "Bearer" prefix, case-insensitive per RFC 6750, and a
  // non-empty single token. No comma-separated credentials, no whitespace
  // inside the token.
  const match = /^Bearer[ ]+([A-Za-z0-9._~+/-]+=*)$/i.exec(raw.trim());
  return match ? match[1] : null;
}

/** A client that carries the caller's bearer token on every request, so RLS
 *  applies as that user exactly as it does for the cookie client. */
function bearerClient(token: string): SupabaseClient<Database> {
  const { url, anonKey } = requireSupabaseClientEnv();
  return createSupabaseClient<Database>(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Confirm the authenticated `sub` is a real profile.
 *
 * Read through the CALLER'S client, so `profiles_select` (`id = auth.uid()`)
 * lets them see exactly their own row and nothing else. A service-role read
 * here would be a privilege escalation hiding inside a existence check.
 */
async function profileExists(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<"yes" | "no" | "unavailable"> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error) return "unavailable";
  return data ? "yes" : "no";
}

/**
 * Resolve the caller of an `app/api/**` route.
 *
 * Bearer wins when present, because presenting one is an explicit statement of
 * which identity the caller means. Otherwise the cookie session is used and
 * the behaviour is identical to before this existed.
 */
export async function resolveApiIdentity(req: Request): Promise<ApiIdentity> {
  const token = bearerToken(req.headers);

  if (token !== null) {
    const supabase = bearerClient(token);
    // Validates signature, expiry and issuer against this project's auth
    // server. A token from another Supabase project fails here, as does an
    // expired one, as does a service-role key (it carries no user).
    const { data, error } = await supabase.auth.getUser(token);
    const user = data?.user;
    if (error || !user) return { ok: false, reason: "invalid_token" };
    // Belt and braces: only a real end-user token may pass this seam. A
    // non-`authenticated` role must never reach a route as a caller.
    if (user.role !== undefined && user.role !== "authenticated") {
      return { ok: false, reason: "invalid_token" };
    }
    const exists = await profileExists(supabase, user.id);
    if (exists === "unavailable") return { ok: false, reason: "identity_unavailable" };
    if (exists === "no") return { ok: false, reason: "no_profile" };
    return { ok: true, via: "bearer", userId: user.id, supabase };
  }

  const supabase = await createCookieClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "no_credentials" };
  const exists = await profileExists(supabase, user.id);
  if (exists === "unavailable") return { ok: false, reason: "identity_unavailable" };
  if (exists === "no") return { ok: false, reason: "no_profile" };
  return { ok: true, via: "cookie", userId: user.id, supabase };
}
