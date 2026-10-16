/**
 * WHICH KEY MATERIAL MAY SIGN A CONFIRMATION TOKEN — one rule for both signers
 * (`lib/conversation/dispatch.ts` and `lib/capabilities/confirmable.ts`).
 *
 * PRODUCTION REQUIRES A DEDICATED KEY. `CONVERSATION_TOKEN_SECRET` must be set,
 * at least 32 characters (use 32 random bytes: `openssl rand -hex 32` gives 64
 * hex characters). The `SUPABASE_SERVICE_ROLE_KEY` fallback is refused there:
 *
 *  · KEY SEPARATION. The service-role key is a database credential that
 *    bypasses RLS. Reusing it as HMAC material gives one secret two jobs, so
 *    rotating it after a leak silently invalidates every in-flight
 *    confirmation, and a host that should not hold the service-role key at
 *    all could not sign confirmations either.
 *  · MISCONFIGURATION MUST BE LOUD. A missing dedicated key used to look
 *    exactly like a configured one. On a self-hosted runtime (no Vercel
 *    dashboard history) that is how a forgotten env var ships unnoticed.
 *
 * Outside production (dev, `next dev`, unit tests) the fallback stays, so a
 * fresh checkout against a local stack keeps working without extra setup.
 *
 * This only DECIDES; the callers throw. Refusing to mint a token is the safe
 * direction — the action does not run and the person sees an error.
 */
export const MIN_DEDICATED_SECRET_LENGTH = 32;

export type KeyMaterialVerdict =
  | { ok: true; material: string }
  | { ok: false; reason: string };

export function confirmationKeyMaterial(input: {
  dedicated: string | undefined;
  serviceRole: string | undefined;
  production: boolean;
}): KeyMaterialVerdict {
  const dedicated = input.dedicated?.trim() || undefined;
  if (input.production) {
    if (!dedicated) {
      return {
        ok: false,
        reason:
          "CONVERSATION_TOKEN_SECRET is not set. Production refuses to sign confirmation " +
          "tokens with SUPABASE_SERVICE_ROLE_KEY — set a dedicated random value.",
      };
    }
    if (dedicated.length < MIN_DEDICATED_SECRET_LENGTH) {
      return {
        ok: false,
        reason: `CONVERSATION_TOKEN_SECRET is shorter than ${MIN_DEDICATED_SECRET_LENGTH} characters.`,
      };
    }
    return { ok: true, material: dedicated };
  }
  const material = dedicated || input.serviceRole;
  if (!material) {
    return {
      ok: false,
      reason: "set CONVERSATION_TOKEN_SECRET (or, outside production, SUPABASE_SERVICE_ROLE_KEY).",
    };
  }
  return { ok: true, material };
}
