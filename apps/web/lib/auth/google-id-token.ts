/**
 * First-party Google ID-token sign-in — pure validation helpers.
 *
 * Flow (single-domain policy 2026-07-19, no Supabase-hosted redirect):
 *
 *   1. Google Identity Services (GIS) runs on https://labourmarket.ai and
 *      returns a signed ID token (JWT credential) to the page.
 *   2. The browser POSTs { credential, nonce, next } ONLY to the
 *      same-origin endpoint /api/auth/google.
 *   3. The server confirms the token's signature/claims via Google's
 *      tokeninfo endpoint, checks audience / issuer / expiry / nonce,
 *      then performs the Supabase signInWithIdToken exchange with the
 *      cookie-bound SSR client. Supabase re-verifies the token
 *      signature and nonce independently.
 *
 * The browser therefore never NAVIGATES through <ref>.supabase.co —
 * the only external surface the user sees is accounts.google.com.
 *
 * PURE module: no fetch/env — the route injects verified claims.
 */

/** Subset of Google tokeninfo claims this flow validates. */
export type GoogleIdTokenClaims = {
  aud?: string;
  iss?: string;
  exp?: string | number;
  nonce?: string;
  email?: string;
  email_verified?: string | boolean;
  sub?: string;
};

export type ClaimValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Issuers Google documents for ID tokens. */
const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

/**
 * Validate the decoded claims of a Google ID token against the expected
 * audience (our OAuth client id) and the per-attempt nonce. `nowSeconds`
 * is injectable for tests. Signature validity is established by the
 * caller (Google tokeninfo returns claims only for validly-signed
 * tokens) and re-checked by Supabase during signInWithIdToken.
 */
export function validateGoogleIdTokenClaims(
  claims: GoogleIdTokenClaims,
  expected: { clientId: string; nonce: string },
  nowSeconds: number = Math.floor(Date.now() / 1000),
): ClaimValidationResult {
  if (!expected.clientId) return { ok: false, reason: "client_id_unconfigured" };
  if (claims.aud !== expected.clientId) {
    return { ok: false, reason: "audience_mismatch" };
  }
  if (!claims.iss || !GOOGLE_ISSUERS.includes(claims.iss)) {
    return { ok: false, reason: "issuer_mismatch" };
  }
  const exp = typeof claims.exp === "string" ? Number(claims.exp) : claims.exp;
  if (!exp || !Number.isFinite(exp) || exp <= nowSeconds) {
    return { ok: false, reason: "token_expired" };
  }
  if (!expected.nonce || claims.nonce !== expected.nonce) {
    return { ok: false, reason: "nonce_mismatch" };
  }
  if (!claims.sub) return { ok: false, reason: "missing_subject" };
  return { ok: true };
}

/** Shape of the POST /api/auth/google request body. */
export type GoogleSignInBody = {
  credential?: unknown;
  nonce?: unknown;
  next?: unknown;
};

/** Narrow the untrusted body. Returns null when structurally invalid. */
export function parseGoogleSignInBody(
  body: unknown,
): { credential: string; nonce: string; next: string | null } | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as GoogleSignInBody;
  if (typeof b.credential !== "string" || b.credential.length < 20) return null;
  // A JWT is three dot-separated base64url segments; cheap structural check
  // so garbage never reaches the network validation step.
  if (b.credential.split(".").length !== 3) return null;
  if (typeof b.nonce !== "string" || !/^[0-9a-f]{16,64}$/i.test(b.nonce)) {
    return null;
  }
  const next = typeof b.next === "string" ? b.next : null;
  return { credential: b.credential, nonce: b.nonce, next };
}

/**
 * Same-origin CSRF gate for the auth endpoint: the Origin header of the
 * POST must match the request's own origin (host serving the API). GIS
 * JS-callback mode means the POST is issued by our own page, so a
 * cross-site Origin is always hostile. A missing Origin header is
 * rejected too — every modern browser sends it on cross-origin POSTs,
 * and our own same-origin fetch always includes it.
 */
export function isAllowedAuthOrigin(
  originHeader: string | null,
  requestOrigin: string,
): boolean {
  if (!originHeader) return false;
  return originHeader === requestOrigin;
}
