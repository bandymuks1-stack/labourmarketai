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

import { doorProofFor, serverDoorKey, withDoorProof } from "./door-proof";

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
  /** Set only for a bearer token issued to a THIRD-PARTY OAuth client (the
   *  verified token carries `client_id`). First-party sessions — cookie, the
   *  app's own bearer — never carry it. Routes other than the connector door
   *  refuse such tokens (`resolveFirstPartyIdentity`). */
  readonly oauthClientId?: string;
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

/** A client id is short, printable and plain (Supabase issues UUIDs). */
const CLIENT_ID_RX = /^[A-Za-z0-9._:-]{1,200}$/;

/** What the VERIFIED token says about the OAuth client it was issued to. */
export type TokenClient =
  | { readonly kind: "first_party" }
  | { readonly kind: "oauth"; readonly clientId: string }
  | { readonly kind: "malformed" };

/**
 * Read `client_id` from a token the auth server has ALREADY verified (the
 * signature is not re-checked here — `identityFromBearer` calls this only
 * after `auth.getUser` accepted the token). FAIL CLOSED: a payload that does
 * not decode, or a `client_id` that is present but not a plain non-empty
 * string, is `malformed` and the token is refused — never quietly treated as
 * the person's own first-party session. Absent `client_id` = first party.
 */
export function tokenClientOf(token: string): TokenClient {
  const payload = token.split(".")[1];
  if (!payload) return { kind: "malformed" };
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { kind: "malformed" };
  }
  if (claims === null || typeof claims !== "object" || Array.isArray(claims)) return { kind: "malformed" };
  if (!Object.prototype.hasOwnProperty.call(claims, "client_id")) return { kind: "first_party" };
  const clientId = (claims as Record<string, unknown>).client_id;
  if (typeof clientId !== "string" || !CLIENT_ID_RX.test(clientId)) return { kind: "malformed" };
  return { kind: "oauth", clientId };
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

  // B1b DOOR PROOF. Only a token that CLAIMS a third-party OAuth client gets
  // the proof-adding fetch; every other bearer client is built exactly as
  // before (no `fetch` option at all). The claim read here is unverified and
  // only decides the wiring — the proof itself is computed below, and only
  // after the auth server has accepted the token. Until then `doorProof` is
  // null and the wrapper adds nothing. See lib/api/door-proof.ts.
  const doorKey = tokenClientOf(token).kind === "oauth" ? serverDoorKey() : null;
  let doorProof: string | null = null;

  const supabase = createSupabaseJsClient<Database>(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      ...(doorKey
        ? { fetch: withDoorProof((input, init) => globalThis.fetch(input, init), url, () => doorProof) }
        : {}),
    },
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
    const client = tokenClientOf(token);
    if (client.kind === "malformed") return { ok: false, reason: "invalid-bearer" };
    // Verified third-party token: from now on every Data API call on this
    // client carries the proof (null if the claims cannot form one → no
    // header → the database gate logs/refuses, i.e. fail closed).
    if (client.kind === "oauth" && doorKey !== null) doorProof = doorProofFor(token, doorKey);
    // The no-argument `auth.getUser()` of a session-less client has no session
    // to read and answers "no user" — so any domain helper that asks the
    // client who is calling (the cookie client's own idiom) would see an
    // anonymous caller. Answer it with THIS verification, memoised for the
    // request exactly as the cookie client memoises its own
    // (lib/supabase/server.ts). An explicit-JWT call still goes to the auth
    // server untouched.
    const realGetUser = supabase.auth.getUser.bind(supabase.auth);
    const verified = { data: { user: data.user }, error: null };
    supabase.auth.getUser = ((jwt?: string) =>
      jwt !== undefined ? realGetUser(jwt) : Promise.resolve(verified)) as typeof supabase.auth.getUser;
    return {
      ok: true,
      identity: {
        userId: data.user.id,
        transport: "bearer",
        supabase,
        ...(client.kind === "oauth" ? { oauthClientId: client.clientId } : {}),
      },
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

/** Refusal reasons of `resolveFirstPartyIdentity`: everything above, plus a
 *  valid token that belongs to a third-party OAuth client. */
export type FirstPartyIdentityFailure = ApiIdentityFailure | "client-not-permitted";

export type FirstPartyIdentityResult =
  | { readonly ok: true; readonly identity: ApiIdentity }
  | { readonly ok: false; readonly reason: FirstPartyIdentityFailure };

/**
 * Identity for every `app/api/**` route EXCEPT the connector door
 * (`/api/mcp`). A token issued to a third-party OAuth client is accepted only
 * at that door, where tool-level rules apply; anywhere else it is refused
 * with 403 — a fact about where the token may be used, not about the token.
 * Cookie sessions and the app's own bearer tokens are unaffected.
 */
export async function resolveFirstPartyIdentity(req: Request): Promise<FirstPartyIdentityResult> {
  const result = await resolveApiIdentity(req);
  if (result.ok && result.identity.oauthClientId !== undefined) {
    return { ok: false, reason: "client-not-permitted" };
  }
  return result;
}

/** HTTP status for a first-party refusal: 403 for a third-party client's
 *  token, otherwise the ONE mapping in `refusalStatus`. */
export function firstPartyRefusalStatus(reason: FirstPartyIdentityFailure): 401 | 403 | 429 | 503 {
  return reason === "client-not-permitted" ? 403 : refusalStatus(reason);
}
