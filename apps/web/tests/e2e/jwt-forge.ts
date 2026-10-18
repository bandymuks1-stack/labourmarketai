/**
 * Forge a JWT's SIGNATURE and nothing else — shared by the specs that prove a
 * door refuses a well-formed token it did not issue:
 *   - tests/e2e/auth-core-bearer.spec.ts          (the bearer API door)
 *   - tests/e2e/auth-forged-session-refusal.spec.ts (the session-cookie door)
 *
 * The same header and payload, signed with a key that is not this project's —
 * i.e. a token minted by somebody else's Supabase project.
 *
 * The obvious version of this (flip the last character of the signature) is
 * WRONG and flaked on the first run: a 32-byte HMAC is 43 base64url
 * characters, and the final character carries only two significant bits, so
 * several distinct characters decode to the identical signature. The token
 * stayed valid and the test reported a security hole that was not there.
 * Re-signing removes the ambiguity entirely.
 *
 * `E2E_LOCAL_JWT_SECRET` is forwarded only by `scripts/e2e-local.ts`; the key
 * is derived from it so it can never equal it, and a fixed stand-in covers a
 * run where it was not forwarded.
 */
import { createHmac } from "node:crypto";

export function forgeSignature(token: string): string {
  const [h, p] = token.split(".");
  const projectSecret = process.env.E2E_LOCAL_JWT_SECRET ?? "";
  const sig = createHmac("sha256", `${projectSecret || "x"}-not-this-project`)
    .update(`${h}.${p}`)
    .digest("base64url");
  return `${h}.${p}.${sig}`;
}
