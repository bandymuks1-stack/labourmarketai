import { routing } from "../i18n/routing";

/**
 * Sanitise the `next` query parameter that the middleware attaches when it
 * bounces an unauthenticated user toward `/auth/login`. The login / signup
 * forms + the OAuth callback consult this helper before routing the user
 * after a successful sign-in / sign-up so we don't drop the user back on
 * the homepage when they wanted `/dashboard/journal`.
 *
 * Rules:
 *
 * - The value must be an INTERNAL absolute path (starts with `/`) — never a
 *   full URL, never a protocol-relative `//evil.com`. This prevents the
 *   classic open-redirect post-login.
 * - The value must NOT itself lead back to an auth surface (`/auth/...`).
 *   Otherwise a hostile link could send the user into a login → login
 *   redirect loop.
 * - When the input is missing / invalid, fall back to the locale-prefixed
 *   `/<locale>/dashboard` so the user still lands somewhere sensible.
 * - If the input is a bare `/dashboard/...` without a locale, prefix the
 *   current locale so middleware doesn't re-route again on next render.
 * - W7 slice 3: a QUERY STRING may ride along, filtered by the rules below.
 */

/**
 * W7 slice 3 — how much query string may survive an auth redirect.
 *
 * WHY A DENYLIST AND NOT AN ALLOWLIST. The workspace's whole deep-link model
 * is query state: `?result=` plus its depth (`geo`, `project`, `interaction`),
 * and every list route has its own filters (`view`/`date`/`source` on
 * planning, `editing`/`date`/`skill` on journal, `country`/`type`/`status` on
 * documents, `q`/`type`/`org`/`project` on network, `notice` on communication
 * and finance, `module` on activity). An allowlist would have to enumerate all
 * of them and would silently drop the next one somebody adds — the user would
 * land on a DIFFERENT screen after login with no explanation, which is exactly
 * the class of dishonest degradation this codebase refuses elsewhere.
 *
 * WHY THAT IS SAFE. A query string cannot change the ORIGIN of a redirect —
 * only the path can, and the path rules above are unchanged. And every one of
 * those params is already validated at its consumer (`isResultKind`,
 * `parseGeography`, `canonicalInteractionToken`, a UUID regex, the `NOTICES`
 * set). Preserving them through login grants an attacker nothing new either:
 * `/{locale}/dashboard?result=<anything>` is already reachable by sending
 * someone an ordinary link.
 *
 * WHAT THE REAL RISK IS. Credentials and one-time tokens ending up inside a
 * `?next=` value — where they get written to server logs, proxy logs and the
 * `Referer` header of every subsequent request from the login page. Those keys
 * are dropped unconditionally, along with a nested `next` (which would let a
 * hostile link chain redirects).
 */
const UNSAFE_RETURN_QUERY_KEYS: ReadonlySet<string> = new Set([
  // Nested/chained redirect.
  "next",
  // Supabase / OAuth credential material.
  "code",
  "state",
  "token",
  "token_hash",
  "access_token",
  "refresh_token",
  "provider_token",
  "id_token",
  "otp",
  // Generic secret-shaped keys.
  "password",
  "secret",
  "api_key",
  "apikey",
  "key",
  "signature",
  "sig",
  "session",
  // Auth-surface diagnostics — meaningless once we have left the login page,
  // and `trace` correlates a user to an OAuth attempt in logs.
  "error",
  "trace",
]);

/** Hard caps so a `next` can never become an unbounded log line or header. */
const MAX_RETURN_PATH_LENGTH = 1024;
const MAX_RETURN_QUERY_PARAMS = 12;

/**
 * Reject characters that let a crafted value escape the path it claims to be:
 * a backslash (browsers normalise `\` to `/`, the classic `/\evil.com` →
 * `//evil.com` protocol-relative bypass), and any control character or raw
 * whitespace (header/log injection).
 */
const FORBIDDEN_PATH_CHARS = /[\\\\\s\u0000-\u001f\u007f]/;

/**
 * Split a candidate return value into path, raw query and fragment.
 *
 * THE FRAGMENT IS KEPT, and that is not a contradiction. `getSafeReturnPath`
 * is consumed on BOTH sides: the login form and the Google button route the
 * browser themselves, where `#setup-journey` (see `worker-setup-journey.tsx`)
 * genuinely works. What cannot exist is a fragment the MIDDLEWARE captured —
 * a browser never sends one to the server — so `buildReturnValue` simply has
 * none to offer. We preserve what a caller hands us; we do not pretend the
 * middleware can observe one.
 */
function splitReturnValue(raw: string): {
  path: string;
  query: string;
  hash: string;
} {
  const hashAt = raw.indexOf("#");
  const beforeHash = hashAt === -1 ? raw : raw.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : raw.slice(hashAt);
  const q = beforeHash.indexOf("?");
  if (q === -1) return { path: beforeHash, query: "", hash };
  return {
    path: beforeHash.slice(0, q),
    query: beforeHash.slice(q + 1),
    hash,
  };
}

/** A fragment may not smuggle control characters or whitespace into a header. */
function safeHash(hash: string): string {
  if (!hash || hash === "#") return "";
  return FORBIDDEN_PATH_CHARS.test(hash) ? "" : hash;
}

/** Drop credential-shaped and chaining params; cap the rest. */
function filterReturnQuery(query: string): string {
  if (!query) return "";
  const out = new URLSearchParams();
  let kept = 0;
  for (const [key, value] of new URLSearchParams(query)) {
    if (kept >= MAX_RETURN_QUERY_PARAMS) break;
    if (!key) continue;
    if (UNSAFE_RETURN_QUERY_KEYS.has(key.toLowerCase())) continue;
    if (value.length === 0) continue;
    out.append(key, value);
    kept += 1;
  }
  return out.toString();
}

/** Validate the PATH half. Returns null when it must not be honoured. */
function safePathOrNull(path: string): string | null {
  if (path.length === 0) return null;
  // Protocol-relative or full URL — block.
  if (path.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
  // Must be an absolute internal path.
  if (!path.startsWith("/")) return null;
  // Backslash / control / whitespace — see FORBIDDEN_PATH_CHARS.
  if (FORBIDDEN_PATH_CHARS.test(path)) return null;
  // A percent-encoded separator would decode into one of the shapes above.
  if (/%2f|%5c|%00/i.test(path)) return null;
  // Reject anything that takes the user back into the auth flow itself —
  // login → login is the classic redirect loop.
  if (/^\/(?:[a-z]{2}\/)?auth(?:\/|$)/.test(path.toLowerCase())) return null;
  return path;
}

export function getSafeReturnPath(
  input: string | null | undefined,
  locale: string,
): string {
  const fallback = `/${locale}/dashboard`;

  if (typeof input !== "string") return fallback;
  const raw = input.trim();
  if (raw.length === 0) return fallback;
  if (raw.length > MAX_RETURN_PATH_LENGTH) return fallback;

  const { path, query, hash } = splitReturnValue(raw);
  const safePath = safePathOrNull(path);
  if (safePath === null) return fallback;

  const safeQuery = filterReturnQuery(query);
  const suffix = `${safeQuery ? `?${safeQuery}` : ""}${safeHash(hash)}`;

  // If the path already carries a known locale prefix, accept as-is.
  const parts = safePath.split("/").filter(Boolean);
  const maybeLocale = parts[0];
  const isKnownLocale = (routing.locales as readonly string[]).includes(
    maybeLocale,
  );
  if (isKnownLocale) return `${safePath}${suffix}`;

  // Otherwise prefix the active locale so the next render doesn't trigger
  // another locale redirect (middleware sets cookies on the prefixed path).
  return `/${locale}${safePath}${suffix}`;
}

/** Same idea but for callers that need an internal href stripped of locale. */
export function isSafeReturnPath(input: string | null | undefined): boolean {
  if (typeof input !== "string") return false;
  const raw = input.trim();
  if (raw.length === 0) return false;
  if (raw.length > MAX_RETURN_PATH_LENGTH) return false;
  const { path } = splitReturnValue(raw);
  return safePathOrNull(path) !== null;
}

/**
 * Build the `next` value the middleware attaches when it bounces an
 * unauthenticated user to login. Pathname AND query, so a deep link like
 * `/en/dashboard?result=experiences&interaction=…` survives the round trip
 * instead of collapsing to `/en/dashboard`.
 *
 * Returns null when there is nothing worth carrying (the sanitiser would have
 * rejected it anyway), so the caller can omit the param entirely rather than
 * attach a `next` that resolves to the default destination.
 */
export function buildReturnValue(
  pathname: string,
  search: string,
): string | null {
  if (safePathOrNull(pathname) === null) return null;
  const query = filterReturnQuery(search.startsWith("?") ? search.slice(1) : search);
  const value = query ? `${pathname}?${query}` : pathname;
  return value.length > MAX_RETURN_PATH_LENGTH ? pathname : value;
}
