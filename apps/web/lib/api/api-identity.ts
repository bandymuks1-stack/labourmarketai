import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseClientEnv } from "@/lib/env";
import {
  clientKeyFromHeaders,
  rateLimit,
  rateLimitCheck,
} from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

/**
 * AUTH-CORE API BOUNDARY — the one door into `app/api/**`.
 *
 * ## What this is for
 *
 * labourmarket.ai is ONE product with more than one client. Today the only
 * caller is the web app, which authenticates with cookies. Android, iOS and a
 * ChatGPT/MCP app cannot send cookies, and before this module every
 * `app/api/**` route resolved identity from `cookies()` — so the canonical
 * domain was reachable from exactly one transport.
 *
 * This module makes the SAME domain reachable over `Authorization: Bearer`
 * without creating a second product behind it.
 *
 * ## The separation that makes it safe
 *
 *   AUTHENTICATION / TRANSPORT   →  establish WHO is calling   ← this file
 *   DATABASE / RLS / DOMAIN      →  decide WHAT they may do    ← unchanged
 *
 * The resolver returns the caller's OWN RLS-scoped Supabase client and nothing
 * else. It re-implements no scope, no role, no organization authority: those
 * already live in the database (RLS, `belongs_to_organization`, the SECDEF
 * RPCs, `grants_worker_visibility`) and in the domain helpers the routes
 * already call (`ownsWorker`, …). A design that moved any of that up into the
 * API layer would create a SECOND permission model, which is the exact failure
 * this seam exists to prevent.
 *
 * Consequence, and it is the property to protect: **a bearer caller can never
 * do more than the same person's web session.** Both paths produce an
 * anon-key client carrying that user's own JWT, so Postgres evaluates the same
 * policies for both. There is no service-role path here, on either transport.
 *
 * ## Why one resolver and not nine
 *
 * Nine routes parsing their own `Authorization` header is nine chances to
 * forget expiry, to accept a token from another project, or to treat a failed
 * verification as an anonymous request. `lib/guards/api-auth-boundary.test.ts`
 * fails CI if a route starts parsing the header itself.
 *
 * ## Fail closed, and never fall back
 *
 * A PRESENT-but-invalid `Authorization` header is 401 — it never falls through
 * to the cookie session. Silently serving a cookie identity to a caller who
 * asked to be identified by a token is how a client ends up believing it acted
 * as A while the server acted as B. This is the same distinction #1314 drew
 * for roles: a failed read is "unknown", never a factual answer.
 */

/** Which transport established the caller's identity. Diagnostics only — it
 *  MUST NOT be used to widen or narrow what the caller may do. */
export type ApiTransport = "cookie" | "bearer";

export type ApiIdentity = {
  /** `auth.users.id` of the verified caller. Never client-supplied. */
  readonly userId: string;
  readonly transport: ApiTransport;
  /** The caller's own client. Every query through it is subject to RLS as
   *  that user — exactly as the cookie-backed client always was. */
  readonly supabase: SupabaseClient<Database>;
};

export type ApiIdentityResult =
  | { readonly ok: true; readonly identity: ApiIdentity }
  | { readonly ok: false; readonly reason: ApiIdentityFailure };

/**
 * Why identity could not be established. Every judgement ABOUT THE CREDENTIAL
 * maps to 401 at the route — the distinction is for the server's own reasoning
 * and for tests, and is deliberately NOT echoed to the caller: telling an
 * attacker whether a token was expired, malformed or from another project is
 * an oracle.
 *
 * Two values are NOT judgements about the credential and get their own status
 * (see `refusalStatus`):
 *
 *   - `identity-unavailable`: the auth server could not be asked. Saying 401
 *     would assert something about the caller that was never determined, and a
 *     client that believes it would discard a perfectly valid session. The
 *     same lesson as #1314: a failed read is "unknown", never a fact.
 *   - `rate-limited`: a brake, not a verdict. 429 tells a legitimate client to
 *     back off instead of throwing its credentials away.
 */
export type ApiIdentityFailure =
  | "no-credentials"
  | "malformed-bearer"
  | "invalid-bearer"
  | "rate-limited"
  | "identity-unavailable";

/**
 * The ONE mapping from refusal to HTTP status, so no route invents its own.
 * Credential judgements are indistinguishable on the wire (all 401, one body);
 * only "we could not judge" (503) and "stop asking so fast" (429) differ,
 * because neither says anything about the token an attacker could learn from.
 */
export function refusalStatus(reason: ApiIdentityFailure): 401 | 429 | 503 {
  switch (reason) {
    case "no-credentials":
    case "malformed-bearer":
    case "invalid-bearer":
      return 401;
    case "rate-limited":
      return 429;
    case "identity-unavailable":
      return 503;
  }
}

const BEARER_RX = /^Bearer\s+(\S+)$/i;

/**
 * A JWT has three dot-separated non-empty base64url segments (RFC 7515
 * compact serialization — `A-Z a-z 0-9 - _` and nothing else; Supabase signs
 * standard JWS, so a legitimate token can never contain `+ / =` or any other
 * byte). This is a CHEAP pre-filter, not verification — it exists so an
 * anonymous flood of garbage strings cannot each cost a network round-trip to
 * the auth server. Anything that passes it is still verified
 * cryptographically below. The charset strictness is grafted from #1336's
 * review: it widens the rejected set without excluding any real token.
 */
const B64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;

function looksLikeJwt(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => B64URL_SEGMENT.test(p));
}

/** What an `Authorization` header is, before anything is verified. */
export type BearerHeader =
  | { readonly kind: "absent" }
  | { readonly kind: "malformed" }
  | { readonly kind: "token"; readonly token: string };

/**
 * Classify the `Authorization` header. PURE — no network, no environment — so
 * the precedence rule that matters most can be tested without mocking the auth
 * server: **present-but-unusable is `malformed`, never `absent`.** Collapsing
 * those two is exactly how a bad token would fall through to a cookie session
 * and be served as somebody else's identity.
 */
export function classifyBearerHeader(header: string | null): BearerHeader {
  if (header === null || header.trim().length === 0) return { kind: "absent" };
  const token = BEARER_RX.exec(header.trim())?.[1];
  if (!token || !looksLikeJwt(token)) return { kind: "malformed" };
  return { kind: "token", token };
}

/**
 * Brake on failed bearer verification — and ONLY on failure.
 *
 * A valid call is already rate-limited per user by the routes that need it.
 * An INVALID one has no user to key on, so without this an anonymous caller
 * could drive unbounded verification round-trips. Keyed on the forwarded
 * client key, which `clientKeyFromHeaders` documents as a brake rather than an
 * identity — the same honest limitation as every other limiter here.
 *
 * The mechanics matter: the resolver PEEKS before verifying (an exhausted
 * budget refuses without spending a round-trip) and RECORDS only a malformed
 * header or a rejected token. A successful verification is never counted —
 * counting every attempt was measured (2026-08-29, e2e) to lock out valid
 * bearer callers after `limit` ordinary requests, which for a phone is
 * minutes of normal use. 60 failures per 5 minutes still stops a garbage
 * flood cold, while a client with a real token never touches the budget.
 * `identity-unavailable` is not recorded either: our own outage must not
 * lock the door on top of failing to answer.
 */
const BEARER_FAILURE_LIMIT = { limit: 60, windowMs: 5 * 60 * 1000 } as const;
const BEARER_FAILURE_LIMITER = "api-bearer-verify" as const;

function bearerFailureBudgetExhausted(key: string): boolean {
  return rateLimitCheck({
    name: BEARER_FAILURE_LIMITER,
    key,
    ...BEARER_FAILURE_LIMIT,
  }).limited;
}

function recordBearerFailure(key: string): void {
  rateLimit({ name: BEARER_FAILURE_LIMITER, key, ...BEARER_FAILURE_LIMIT });
}

/**
 * Verify a bearer token and build the caller's client.
 *
 * Verification uses the platform's OWN mechanism (`auth.getUser(jwt)` against
 * the project's auth server) rather than a local signature check. That is
 * deliberate: it validates signature, expiry AND the user still existing, in
 * one call, with no second copy of the project's key material to keep in step,
 * and it honours the platform's session semantics rather than a private
 * re-statement of them. The cost is one round-trip per request, which is what
 * the failure limiter above and the per-route limiters bound.
 */
async function identityFromBearer(
  token: string,
): Promise<ApiIdentityResult> {
  const { url, anonKey } = requireSupabaseClientEnv();

  // Loaded only when a bearer request actually arrives (the same pattern
  // lib/cv/extract.ts uses for its parsers). The cookie path — which is every
  // browser request — must not pay for a library it never touches, in bundle
  // size or in dev-server compile time.
  const { createClient: createSupabaseJsClient } = await import(
    "@supabase/supabase-js"
  );

  const supabase = createSupabaseJsClient<Database>(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      // A route handler is not a browser: nothing to persist, nothing to
      // refresh, no URL to read a session out of.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // "The auth server said no" and "the auth server could not be asked" are
  // different facts, and only the first is about the caller. gotrue-js models
  // the second as a retryable fetch error (status absent or 5xx) rather than
  // a verdict; anything thrown outright is by definition not a verdict either.
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      return { ok: false, reason: authErrorIsInfrastructure(error) ? "identity-unavailable" : "invalid-bearer" };
    }
    if (!data?.user) return { ok: false, reason: "invalid-bearer" };
    return {
      ok: true,
      identity: { userId: data.user.id, transport: "bearer", supabase },
    };
  } catch {
    return { ok: false, reason: "identity-unavailable" };
  }
}

/**
 * Whether an auth error is the infrastructure failing rather than the token
 * failing. A verdict about a token always arrives as an HTTP 4xx from the
 * auth server; no status at all means the request never completed, and a 5xx
 * means the server did not judge it.
 */
function authErrorIsInfrastructure(error: {
  name?: string;
  status?: number;
}): boolean {
  if (error.name === "AuthRetryableFetchError") return true;
  return typeof error.status !== "number" || error.status >= 500;
}

/**
 * Establish who is calling an `app/api/**` route.
 *
 * Precedence: an `Authorization` header, when present, DECIDES — valid or not.
 * Only its complete absence falls through to the cookie session, which is
 * unchanged in every respect (same `createClient()`, same `getUser()`, same
 * memoisation), so the web client cannot regress through this path.
 */
export async function resolveApiIdentity(
  req: Request,
): Promise<ApiIdentityResult> {
  const header = req.headers.get("authorization");

  const bearer = classifyBearerHeader(header);

  if (bearer.kind !== "absent") {
    const clientKey = clientKeyFromHeaders(req.headers);
    if (bearerFailureBudgetExhausted(clientKey)) {
      return { ok: false, reason: "rate-limited" };
    }

    if (bearer.kind === "malformed") {
      recordBearerFailure(clientKey);
      return { ok: false, reason: "malformed-bearer" };
    }

    const result = await identityFromBearer(bearer.token);
    // A REJECTED token is a failure the caller caused; an unreachable auth
    // server is not. Only the first spends failure budget.
    if (!result.ok && result.reason === "invalid-bearer") {
      recordBearerFailure(clientKey);
    }
    return result;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "no-credentials" };

  return { ok: true, identity: { userId: user.id, transport: "cookie", supabase } };
}
