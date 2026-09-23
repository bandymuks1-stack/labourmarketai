/**
 * pnpm e2e:local — run the Playwright e2e suite against the LOCAL Supabase
 * stack with the authenticated specs enabled.
 *
 * What it does:
 *   1. Reads the local stack's URL + keys from `npx supabase status -o json`
 *      (these are the publicly-documented shared local-dev defaults, never
 *      cloud credentials).
 *   2. HARD GUARD (brief §10.2, same rule as db-fixtures-local): refuses to
 *      run unless that URL is local — the cloud project gorgitwvdzxbnaxhrsrw
 *      stays real-data-only and is never a test target.
 *   3. Boots the app on its OWN port (3100) so a developer's normal
 *      `pnpm dev` on :3000 — possibly pointed at cloud — is never reused by
 *      the tests.
 *   4. Runs `playwright test`, forwarding any extra CLI args.
 *
 * Prereqs (see docs/TESTING.md): `npx supabase start`, `npx supabase db
 * reset`, `pnpm db:fixtures:local`, `pnpm -C apps/web e2e:install`.
 *
 * A stopped stack (Docker Desktop off) exits 3 with
 * LOCAL_INTEGRATION_TEST_REQUIRES_DOCKER — an availability failure, reported
 * as one. A URL that resolves and is not local still refuses, exit 1.
 */
import { spawnSync } from "node:child_process";

import {
  LOCAL_STACK_UNAVAILABLE_EXIT_CODE,
  LocalStackUnavailableError,
  formatLocalStackUnavailable,
} from "../lib/testing/local-supabase-guard";
import { stderrExcerpt } from "../lib/testing/local-supabase-env";

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function unavailable(detail: string): never {
  console.error(
    formatLocalStackUnavailable(new LocalStackUnavailableError(detail)),
  );
  console.error(
    "Then, from the repo root: npx supabase db reset && pnpm db:fixtures:local",
  );
  process.exit(LOCAL_STACK_UNAVAILABLE_EXIT_CODE);
}

function isLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host === "::1"
  );
}

const status = spawnSync("npx", ["supabase", "status", "-o", "json"], {
  cwd: "../..",
  shell: process.platform === "win32",
  encoding: "utf8",
});
if (status.error) {
  unavailable(
    `could not run \`npx supabase status\` (${status.error.message}), so no ` +
      "local Supabase stack was found.",
  );
}
if (status.status !== 0 || !status.stdout) {
  // stderr only — never stdout, which can carry keys on a partial success.
  unavailable(
    `\`npx supabase status\` exited ${status.status ?? "without a status"}` +
      `${stderrExcerpt(status.stderr ?? "")} — the local Supabase stack is ` +
      "not running (Docker Desktop off, or `npx supabase start` not run).",
  );
}

let parsed: Record<string, string>;
try {
  parsed = JSON.parse(status.stdout.slice(status.stdout.indexOf("{")));
} catch {
  fail(`Unexpected \`supabase status\` output:\n${status.stdout}`);
}
const apiUrl = parsed.API_URL ?? "";
const anonKey = parsed.ANON_KEY ?? parsed.PUBLISHABLE_KEY ?? "";
const serviceKey = parsed.SERVICE_ROLE_KEY ?? parsed.SECRET_KEY ?? "";
// A URL that resolved is a security question first: refuse a non-local one
// before asking whether the rest of the stack is up.
if (apiUrl && !isLocalHost(new URL(apiUrl).hostname)) {
  fail(
    `Refusing: Supabase URL "${apiUrl}" is not local. The e2e suite only ` +
      "ever runs against the local stack (brief §10.2).",
  );
}
if (!apiUrl || !anonKey) {
  unavailable(
    "`npx supabase status` did not return API_URL / ANON_KEY — the local " +
      "stack is not (fully) running.",
  );
}

const PORT = process.env.E2E_PORT ?? "3100";
const env = {
  ...process.env,
  SUPABASE_TEST_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  // The LOCAL stack's JWT signing secret, forwarded for ONE purpose: the
  // auth-core spec forges a correctly-signed but EXPIRED token, which is the
  // only way to test expiry as its own failure mode rather than folding it
  // into "bad signature". Local-only by construction — the loopback assertion
  // above has already refused any non-local target before this is read.
  E2E_LOCAL_JWT_SECRET: parsed.JWT_SECRET ?? "",
  PORT,
  E2E_BASE_URL: `http://127.0.0.1:${PORT}`,
  // Tells playwright.config.ts this run shares ONE dev server and ONE fixture
  // database: single worker, no retries. See the comment in that file.
  E2E_LOCAL_STACK: "1",
};

console.log(`Local stack confirmed (${apiUrl}). Running e2e on :${PORT}…`);
const res = spawnSync(
  "pnpm",
  ["exec", "playwright", "test", ...process.argv.slice(2)],
  { stdio: "inherit", env, shell: process.platform === "win32" },
);
process.exit(res.status ?? 1);
