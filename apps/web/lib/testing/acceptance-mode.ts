/**
 * ACCEPTANCE MODE — the app itself refuses to serve against production.
 *
 * WHY THIS EXISTS, GIVEN `local-supabase-guard.ts` ALREADY DOES.
 * That guard protects the standalone TEST HELPERS (session minting, dev
 * fixtures). It cannot protect the Next.js app, because the app never calls it:
 * `pnpm dev` boots, loads whatever env it finds, and serves. Since
 * `apps/web/.env.local` legitimately points at the production project and
 * carries a real service-role key, an acceptance run started in the wrong
 * directory — or with a stray `.env.local` — would quietly exercise WRITE
 * scenarios ("log today's work") against production data.
 *
 * The owner's §14 acceptance scenarios include writes, so "be careful" is not a
 * control. This makes it structural: when acceptance mode is on, the app
 * asserts its Supabase target is the local stack BEFORE it can serve a request,
 * and throws otherwise.
 *
 * WHY NOT RELY ON ENV PRECEDENCE. It would be tempting to just inject local
 * values into the child process and trust them to win. They do not reliably:
 * `@next/env` re-applies `.env.local` over a variable whose current value still
 * equals the one captured at startup, so an injected value can be silently
 * replaced by the production one. Precedence is therefore treated as untrusted
 * input, and the target is verified at the point of use instead.
 *
 * Pure and synchronous — no network, no database, unit-testable on its own.
 */

import {
  NonLocalTargetError,
  assertLocalSupabaseTarget,
  redactKey,
} from "./local-supabase-guard";

/** Set to "1" by the acceptance wrapper. Absent in normal dev and in prod. */
export const ACCEPTANCE_FLAG = "LM_ACCEPTANCE_MODE";

export type EnvLike = Record<string, string | undefined>;

/** True only for an explicit "1". Any other value is NOT acceptance mode, so a
 *  typo can never silently disable the guard by looking truthy. */
export function isAcceptanceMode(env: EnvLike): boolean {
  return env[ACCEPTANCE_FLAG] === "1";
}

/**
 * Assert an acceptance run is pointed at the local stack.
 *
 * A no-op when acceptance mode is off, so normal dev and production are
 * completely unaffected — this can never break a real deployment.
 *
 * Throws `NonLocalTargetError` when acceptance mode is on and the resolved
 * target is anything other than the local Supabase origin, including the case
 * where a production key survived alongside a local-looking URL.
 */
export function assertAcceptanceTargetIsLocal(env: EnvLike): void {
  if (!isAcceptanceMode(env)) return;

  assertLocalSupabaseTarget({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    // Both keys are checked when present: the service-role key is the one that
    // could do real damage, and the anon key is the one most likely to be left
    // behind from a previous production session.
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey:
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

/**
 * A secret-free, one-line description of what this process is pointed at.
 *
 * Printed at acceptance startup so the run is self-documenting in the evidence
 * pack. Keys are always redacted — the owner's brief requires that the mode is
 * visible and the secrets are not.
 */
export function describeAcceptanceEnv(env: EnvLike): string {
  const mode = isAcceptanceMode(env) ? "ACCEPTANCE (local-only)" : "normal";
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "[absent]";
  let origin = "[unparseable]";
  try {
    origin = new URL(url).origin;
  } catch {
    /* keep the placeholder — never echo an unparseable value back */
  }
  const service = redactKey(env.SUPABASE_SERVICE_ROLE_KEY);
  return `mode=${mode} supabase=${origin} serviceKey=${service}`;
}

/**
 * Guard an acceptance run and describe it, or explain the refusal.
 *
 * Returns the description on success. On refusal it rethrows, because a run
 * that cannot prove it is local must not continue — failing closed is the whole
 * point.
 */
export function startAcceptanceGuard(env: EnvLike): string {
  try {
    assertAcceptanceTargetIsLocal(env);
  } catch (err) {
    if (err instanceof NonLocalTargetError) {
      throw new NonLocalTargetError(
        `${err.message}\n` +
          `Acceptance mode refuses to serve against anything but the local ` +
          `Supabase stack. Start it with \`npx supabase start\` and run ` +
          `\`pnpm -C apps/web dev:acceptance\`.`,
      );
    }
    throw err;
  }
  return describeAcceptanceEnv(env);
}
