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
 */
import { spawnSync } from "node:child_process";

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
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
if (status.status !== 0 || !status.stdout) {
  fail(
    "Could not read the local Supabase stack status.\n" +
      "Start it first from the repo root:\n" +
      "  npx supabase start\n" +
      "  npx supabase db reset\n" +
      "  pnpm db:fixtures:local",
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
if (!apiUrl || !anonKey) {
  fail("supabase status did not return API_URL / ANON_KEY — is the stack up?");
}
if (!isLocalHost(new URL(apiUrl).hostname)) {
  fail(
    `Refusing: Supabase URL "${apiUrl}" is not local. The e2e suite only ` +
      "ever runs against the local stack (brief §10.2).",
  );
}

const PORT = process.env.E2E_PORT ?? "3100";
const env = {
  ...process.env,
  SUPABASE_TEST_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  PORT,
  E2E_BASE_URL: `http://127.0.0.1:${PORT}`,
};

console.log(`Local stack confirmed (${apiUrl}). Running e2e on :${PORT}…`);
const res = spawnSync(
  "pnpm",
  ["exec", "playwright", "test", ...process.argv.slice(2)],
  { stdio: "inherit", env, shell: process.platform === "win32" },
);
process.exit(res.status ?? 1);
