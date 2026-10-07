/**
 * Verified-email boundary — pure helpers (WORKER_REGISTRATION_FRICTION_REMOVAL).
 *
 * PURE (no Next.js / Supabase imports) so every branch is unit-testable
 * (lib/auth/email-verification.test.ts).
 *
 * THE MODEL. Registration is frictionless: with Supabase "Confirm email" OFF a
 * new person gets a live session at once. That session proves NOTHING about
 * mailbox ownership, so a SEPARATE state decides it — the database's
 * `email_verifications_v1` (migration 20261003151000), read through
 * `my_email_verification_v1()`. Three states, never conflated:
 *
 *   registered    a session exists; the address is merely typed
 *   verified      a real proof of mailbox control exists FOR THIS ADDRESS
 *   token-proved  a single action was authorised by possession of a mailed
 *                 one-time secret (an invitation link) — no verification state
 *                 is implied or recorded
 *
 * The proof is progressive: it is requested only at the moment a
 * trust-sensitive action (claiming an invitation addressed to an email) needs
 * it — never as a gate at signup, login, onboarding, profile, CV or journal.
 * The mailed one-time link returns to the existing auth callback with
 * `flow=verify_email`; the callback calls `confirm_my_email_v1()`, which checks
 * the session was minted from that mailed token. An address is NEVER treated as
 * verified because `auth.users.email_confirmed_at`, the JWT `email` claim or
 * `profiles.email` says so.
 */

/** Marker the verification mail's redirect carries so the callback can tell a
 *  proof return from a sign-in / signup return. Bounded identifier, no secret. */
export const VERIFY_EMAIL_FLOW = "verify_email";

/** Outcomes of `confirm_my_email_v1()` the UI knows how to word. */
export const VERIFY_OUTCOMES = [
  "verified",
  "already_verified",
  "no_request",
  "no_proof",
  "email_changed",
] as const;
export type VerifyOutcome = (typeof VERIFY_OUTCOMES)[number];

/** Result query param the callback appends to the destination. */
export const VERIFY_RESULT_PARAM = "email_verify";
export type VerifyResultParam = "ok" | "failed";

export function isVerifyEmailFlow(params: URLSearchParams): boolean {
  return params.get("flow") === VERIFY_EMAIL_FLOW;
}

/** `ok` for an address that is now (or already was) verified, `failed` for
 *  everything else — including an outcome this build does not know (a newer
 *  database must never be rendered as success). */
export function verifyOutcomeToParam(outcome: unknown): VerifyResultParam {
  return outcome === "verified" || outcome === "already_verified" ? "ok" : "failed";
}

/** Parse the callback's result param; anything else is "no result". */
export function parseVerifyResult(value: string | null | undefined): VerifyResultParam | null {
  return value === "ok" || value === "failed" ? value : null;
}

/** The `emailRedirectTo` for the proof mail: our callback with the flow marker
 *  and, when the person was in the middle of something, a `next` that survives
 *  the inbox round trip (sanitised by `getSafeReturnPath` in the callback). */
export function buildVerifyEmailRedirectTo(
  origin: string,
  locale: string,
  nextPath: string | null | undefined,
): string {
  const url = new URL(`${origin.replace(/\/$/, "")}/${locale}/auth/callback`);
  url.searchParams.set("flow", VERIFY_EMAIL_FLOW);
  if (nextPath) url.searchParams.set("next", nextPath);
  return url.toString();
}

/** What the UI may say about an address. `verified` is TRUE only when the
 *  database said so explicitly; every other shape (error, null, missing field,
 *  string "true") is unverified — fail-closed, never rendered as verified. */
export function isEmailVerifiedRead(read: unknown): boolean {
  return (
    typeof read === "object" &&
    read !== null &&
    (read as { verified?: unknown }).verified === true
  );
}
