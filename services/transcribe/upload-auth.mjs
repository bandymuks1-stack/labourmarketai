// Upload authorisation for the LabourMarket.ai transcription service.
// Pure helpers (node:crypto only, no I/O) so the SAME logic is unit-tested from
// apps/web (lib/voice/upload-token.test.ts) against the token the web app mints.
//
// WHY THIS EXISTS. The Voice Work Journal advertises 25 MB / 10 minutes. The web
// app runs on a platform whose functions cap a request body at ~4.5 MB, and the
// Server Action cap is 5 MB, so the audio cannot be proxied through Next. The
// browser therefore uploads DIRECTLY to this service. It must do so without ever
// seeing the master secret, so the web app (after authenticating the worker)
// mints a SHORT-LIVED, SINGLE-USE, SIZE-BOUNDED token signed with the shared
// secret (HMAC-SHA256). The service verifies it here.
//
// Token format:  v1.<base64url(payload-json)>.<base64url(hmac)>
//   payload = { v:1, scope:"transcribe", sub:<opaque subject>, exp:<unix s>,
//               jti:<unique id>, max:<byte cap> }
//   hmac    = HMAC-SHA256(secret, "v1." + base64url(payload-json))
//
// Guarantees: constant-time signature check; hard expiry (and a hard maximum
// lifetime so a mis-minted far-future token is refused); single use (jti is
// remembered until it expires); the byte cap in the token can only LOWER the
// service cap; the subject is opaque (no profile id leaves the web app).

import { createHmac, timingSafeEqual } from "node:crypto";

export const TOKEN_PREFIX = "v1";
/** A token may not live longer than this, whatever its `exp` claims. */
export const MAX_TOKEN_LIFETIME_S = 300;

const b64u = (buf) => Buffer.from(buf).toString("base64url");

/** Sign a payload (used by the web app's minter AND by tests). */
export function signUploadToken(secret, payload) {
  const body = b64u(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${TOKEN_PREFIX}.${body}`).digest();
  return `${TOKEN_PREFIX}.${body}.${b64u(sig)}`;
}

/**
 * Verify a token. Returns { ok:true, claims } or { ok:false, code } where code
 * is one of: malformed | bad_signature | expired | too_long_lived | bad_scope.
 * Replay is NOT checked here (stateful) - see createReplayGuard().
 */
export function verifyUploadToken(secret, token, nowMs = Date.now()) {
  if (typeof token !== "string") return { ok: false, code: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return { ok: false, code: "malformed" };
  const [, body, sig] = parts;
  const want = createHmac("sha256", secret).update(`${TOKEN_PREFIX}.${body}`).digest();
  let given;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return { ok: false, code: "malformed" };
  }
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return { ok: false, code: "bad_signature" };
  }
  let claims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, code: "malformed" };
  }
  if (!claims || claims.v !== 1 || typeof claims.exp !== "number" || typeof claims.jti !== "string" || typeof claims.sub !== "string") {
    return { ok: false, code: "malformed" };
  }
  if (claims.scope !== "transcribe") return { ok: false, code: "bad_scope" };
  const nowS = Math.floor(nowMs / 1000);
  if (nowS > claims.exp) return { ok: false, code: "expired" };
  if (claims.exp - nowS > MAX_TOKEN_LIFETIME_S) return { ok: false, code: "too_long_lived" };
  return { ok: true, claims };
}

/** Single-use guard: remembers each jti until the token would have expired. */
export function createReplayGuard() {
  const seen = new Map(); // jti -> expiry (unix s)
  return {
    /** true = first use (accepted); false = replay. */
    consume(claims, nowMs = Date.now()) {
      const nowS = Math.floor(nowMs / 1000);
      for (const [k, exp] of seen) if (exp < nowS) seen.delete(k);
      if (seen.has(claims.jti)) return false;
      seen.set(claims.jti, claims.exp);
      return true;
    },
    size: () => seen.size,
  };
}

/** The effective byte cap: a token can only LOWER the service's cap. */
export function effectiveByteCap(serviceCap, claims) {
  const t = Number(claims?.max);
  return Number.isFinite(t) && t > 0 ? Math.min(serviceCap, t) : serviceCap;
}

/** Parse ALLOWED_ORIGINS (comma-separated, exact origins; '*' is refused). */
export function parseAllowedOrigins(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "*")
    .map((s) => s.replace(/\/$/, ""));
}

/**
 * CORS decision. `origin` is the request's Origin header (undefined for a
 * server-to-server caller). Returns { allowed, headers } - headers are set ONLY
 * for an exact allowlisted origin; there is never a wildcard.
 */
export function corsFor(origin, allowedOrigins) {
  if (!origin) return { present: false, allowed: true, headers: {} };
  const clean = String(origin).replace(/\/$/, "");
  if (!allowedOrigins.includes(clean)) return { present: true, allowed: false, headers: { vary: "Origin" } };
  return {
    present: true,
    allowed: true,
    headers: {
      "access-control-allow-origin": clean,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type, x-idempotency-key",
      "access-control-max-age": "600",
      vary: "Origin",
    },
  };
}

/** Per-subject sliding-window limiter (in memory; the service is single-instance). */
export function createSubjectLimiter(limit, windowMs = 60_000) {
  const buckets = new Map();
  return {
    /** true = limited. */
    hit(subject, nowMs = Date.now()) {
      const hits = (buckets.get(subject) || []).filter((t) => nowMs - t < windowMs);
      if (hits.length >= limit) {
        buckets.set(subject, hits);
        return true;
      }
      hits.push(nowMs);
      buckets.set(subject, hits);
      if (buckets.size > 5000) {
        for (const [k, v] of buckets) if (!v.some((t) => nowMs - t < windowMs)) buckets.delete(k);
      }
      return false;
    },
  };
}

/** Bounded transcript-cache retention (privacy audit 2026-10-06). */
export const CACHE_TTL_DEFAULT_S = 600;
export const CACHE_TTL_HARD_MAX_S = 3600;
export function cacheTtlSeconds(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return CACHE_TTL_DEFAULT_S;
  return Math.min(Math.floor(n), CACHE_TTL_HARD_MAX_S);
}
