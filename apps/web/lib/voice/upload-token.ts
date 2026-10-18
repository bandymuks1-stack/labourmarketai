import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Short-lived, single-use, size-bounded UPLOAD TOKEN for the self-hosted
 * transcription service (services/transcribe/upload-auth.mjs verifies it).
 *
 * WHY. The advertised 25 MB / 10 minute recording cannot be proxied through
 * this app: the platform caps a function request body at ~4.5 MB and the
 * Server Action cap is 5 MB (and the global action limit must NOT be raised).
 * So after the worker is authenticated, the browser uploads DIRECTLY to the
 * service with a token minted here. The browser never sees the master secret;
 * the token expires in seconds, works once, carries its own byte cap and an
 * OPAQUE subject (no profile id ever leaves this app).
 *
 * The format is byte-identical to the service's verifier. Both sides are
 * pinned to the same test vector in `upload-token.test.ts`, which imports the
 * service module and verifies a token minted by THIS file.
 *
 *   v1.<base64url(payload)>.<base64url(HMAC-SHA256(secret, "v1." + payload))>
 */

export const UPLOAD_TOKEN_TTL_SECONDS = 120;

export interface UploadTokenClaims {
  readonly v: 1;
  readonly scope: "transcribe";
  /** Opaque subject: sha256(secret || profileId), truncated. Never the id. */
  readonly sub: string;
  readonly exp: number;
  readonly jti: string;
  readonly max: number;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Opaque, stable, non-reversible subject for the service's per-user rate limit. */
export function opaqueSubject(secret: string, profileId: string): string {
  return createHash("sha256")
    .update(`${secret}|${profileId}`)
    .digest("hex")
    .slice(0, 24);
}

export function mintUploadToken(input: {
  secret: string;
  profileId: string;
  maxBytes: number;
  nowMs?: number;
  ttlSeconds?: number;
  /** Test seam only. */
  jti?: string;
}): { token: string; claims: UploadTokenClaims } {
  const nowS = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const ttl = Math.min(input.ttlSeconds ?? UPLOAD_TOKEN_TTL_SECONDS, 300);
  const claims: UploadTokenClaims = {
    v: 1,
    scope: "transcribe",
    sub: opaqueSubject(input.secret, input.profileId),
    exp: nowS + ttl,
    jti: input.jti ?? b64u(randomBytes(16)),
    max: Math.floor(input.maxBytes),
  };
  const body = b64u(JSON.stringify(claims));
  const sig = createHmac("sha256", input.secret).update(`v1.${body}`).digest();
  return { token: `v1.${body}.${b64u(sig)}`, claims };
}
