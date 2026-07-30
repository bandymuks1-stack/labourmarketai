/**
 * pnpm -C apps/web dev:acceptance — run the web app against the LOCAL Supabase
 * stack only, for §14 acceptance work.
 *
 * WHY A WRAPPER AND NOT JUST `pnpm dev`. `next dev` loads `apps/web/.env.local`,
 * which legitimately points at the PRODUCTION project and carries a real
 * service-role key. The owner's acceptance scenarios include WRITES ("log
 * today's work"), so starting the ordinary dev server for acceptance work would
 * write test rows into production.
 *
 * THREE INDEPENDENT DEFENCES, because one is not enough for a write path:
 *
 *   1. THIS SCRIPT resolves the local stack itself (via `supabase status`) and
 *      refuses to spawn anything unless `assertLocalSupabaseTarget` passes.
 *   2. IT NEUTRALISES `.env.local` for the child by running Next in test mode —
 *      `@next/env` deliberately does NOT load `.env.local` when NODE_ENV is
 *      `test`, which is the documented way to stop it winning on precedence.
 *   3. THE APP re-checks at the point of use: `requireSupabaseClientEnv` and
 *      `requireSupabaseServiceEnv` call `assertAcceptanceTargetIsLocal`, so
 *      even if a value slipped through, no client is ever constructed against
 *      a non-local target.
 *
 * Defence 2 alone would be fragile: env precedence is an implementation detail
 * of a dependency. Defence 3 is the one that actually holds.
 *
 * Secrets are never printed — only the mode and the origin.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";

import {
  NonLocalTargetError,
  assertLocalSupabaseTarget,
} from "../lib/testing/local-supabase-guard";
import {
  describeLocalTarget,
  resolveLocalSupabaseEnv,
} from "../lib/testing/local-supabase-env";
import {
  ACCEPTANCE_FLAG,
  describeAcceptanceEnv,
} from "../lib/testing/acceptance-mode";

const REPO_ROOT = join(__dirname, "..", "..", "..");

function main(): void {
  let local: ReturnType<typeof resolveLocalSupabaseEnv>;
  try {
    local = resolveLocalSupabaseEnv(REPO_ROOT);
  } catch (err) {
    fail(
      "Could not resolve the local Supabase stack. Start it first:\n" +
        "  npx supabase start\n\n" +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  // Defence 1 — refuse before spawning anything at all.
  try {
    assertLocalSupabaseTarget({
      url: local.url,
      serviceKey: local.serviceKey,
      anonKey: local.anonKey,
    });
    console.info(`[acceptance] target verified: ${describeLocalTarget(local)}`);
  } catch (err) {
    if (err instanceof NonLocalTargetError) {
      fail(
        `${err.message}\n\n` +
          "Acceptance mode never runs against a cloud project. Nothing was " +
          "started and no request was made.",
      );
      return;
    }
    throw err;
  }

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    [ACCEPTANCE_FLAG]: "1",
    // Defence 2 — `@next/env` skips `.env.local` entirely in test mode, so the
    // production values cannot be re-applied over the ones injected here.
    NODE_ENV: "test",
    NEXT_PUBLIC_SUPABASE_URL: local.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: local.serviceKey,
  };

  console.info(`[acceptance] ${describeAcceptanceEnv(childEnv)}`);
  console.info("[acceptance] starting next dev — production is not reachable.");

  // Run Next's JS entry with THIS node binary rather than the `next` shim.
  // On Windows the shim is `next.cmd`, and Node 24 refuses to spawn a `.cmd`
  // without `shell: true` (EINVAL) — while `shell: true` would concatenate
  // rather than escape the arguments. Resolving the entry point sidesteps both,
  // and is identical on every platform.
  const nextEntry = require.resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [nextEntry, "dev"], {
    stdio: "inherit",
    env: childEnv,
    shell: false,
  });

  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (err) => fail(`Failed to start next dev: ${err.message}`));
}

function fail(message: string): void {
  console.error(`\n[acceptance] REFUSED\n${message}\n`);
  process.exitCode = 1;
}

main();
