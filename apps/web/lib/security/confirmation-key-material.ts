/**
 * WHICH KEY MATERIAL MAY SIGN A CONFIRMATION TOKEN — one rule for both signers
 * (`lib/conversation/dispatch.ts` and `lib/capabilities/confirmable.ts`).
 *
 * ONE PURPOSE, ONE KEY, EVERYWHERE (owner direction 2026-10-17, completing
 * 2026-10-16 P5). `CONVERSATION_TOKEN_SECRET` must be set, at least 32
 * characters (use 32 random bytes: `openssl rand -hex 32` gives 64 hex
 * characters). The `SUPABASE_SERVICE_ROLE_KEY` is NEVER used as HMAC
 * material — not in production, not in a preview, not on a developer's
 * machine:
 *
 *  · KEY SEPARATION. The service-role key is a database credential that
 *    bypasses RLS. Reusing it as HMAC material gives one secret two jobs, so
 *    rotating it after a leak silently invalidates every in-flight
 *    confirmation, and a host that should not hold the service-role key at
 *    all could not sign confirmations either.
 *  · MISCONFIGURATION MUST BE LOUD. A missing dedicated key used to look
 *    exactly like a configured one. On a self-hosted runtime (no Vercel
 *    dashboard history) that is how a forgotten env var ships unnoticed.
 *  · NO ENVIRONMENT-SHAPED HOLE. An earlier revision kept the fallback
 *    outside `NODE_ENV === "production"`. That left one path in the code
 *    that would sign with the service-role key, reachable by any process
 *    started without `NODE_ENV` — exactly the kind of start a restored host
 *    is one typo away from. The owner's invariant is "no service-role
 *    fallback remains", so the rule no longer takes an environment flag:
 *    there is nothing to flip.
 *
 * Local stacks are not disadvantaged: `.env.example` documents the variable,
 * and the two local harnesses (`scripts/dev-acceptance.ts`,
 * `scripts/e2e-local.ts`) supply a loopback-only value when none is
 * exported. Unit tests mock `@/lib/env` with a dedicated value.
 *
 * The minimum is enforced the same way everywhere. Below it the verdict is a
 * refusal that names the variable and never echoes a value.
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
  /**
   * Accepted for call-site compatibility and DELIBERATELY IGNORED: the
   * service-role key is never key material. Keeping the field (rather than
   * deleting it) makes the refusal explicit at the two signers and keeps the
   * guard that pins "no `||` fallback" meaningful.
   */
  serviceRole?: string | undefined;
  /** Kept for the same reason; the rule is identical in every environment. */
  production?: boolean;
}): KeyMaterialVerdict {
  const dedicated = input.dedicated?.trim() || undefined;
  if (!dedicated) {
    return {
      ok: false,
      reason:
        "CONVERSATION_TOKEN_SECRET is not set. Confirmation tokens are signed only with a " +
        "dedicated random value (openssl rand -hex 32); the service-role key is never used.",
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
