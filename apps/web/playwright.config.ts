import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the M1 auth flow (slice 6). Tests are conditional —
 * each spec skips at runtime if `SUPABASE_TEST_URL` isn't set, so the gate
 * stays green until the founder configures a separate test Supabase
 * project. See docs/TESTING.md.
 *
 * Run: pnpm e2e
 */
/**
 * LOCAL-STACK RUNS ARE SERIAL, AND NEVER RETRIED.
 *
 * `scripts/e2e-local.ts` sets `E2E_LOCAL_STACK=1`. Those runs share ONE dev
 * server on :3100 and ONE fixture database, so parallel workers contend for
 * both. On 2026-07-25 three workers against one server made an authenticated
 * spec time out waiting for a control to become editable — it looked exactly
 * like a product defect, and the same spec passed on the first serial re-run.
 * Contention must never be mistakable for a bug, so the local suite runs with
 * a single worker.
 *
 * Retries are also disabled there: a retry that turns red into green hides a
 * genuinely flaky product bug behind a passing report. A local failure should
 * stay failed until someone explains it.
 */
const LOCAL_STACK = !!process.env.E2E_LOCAL_STACK;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: !LOCAL_STACK,
  workers: LOCAL_STACK ? 1 : undefined,
  /**
   * LOCAL-STACK RUNS GET A LONGER PER-TEST BUDGET.
   *
   * Same root cause as the serial-worker rule above: these runs share ONE `next
   * dev` server, which compiles each route on its first request. A cold
   * /dashboard or /dashboard/planning can exceed Playwright's 30s default
   * before `load` fires, and the failure surfaces as `page.goto: net::ERR_ABORTED`
   * or a bare timeout — which reads exactly like a broken page. It cost a full
   * debugging cycle on 2026-08-08 before the entries in question were confirmed
   * present in the database all along.
   *
   * This raises the DEADLINE only. Every individual `expect` keeps its own
   * timeout, so a genuinely missing element still fails in seconds rather than
   * hanging for two minutes.
   */
  timeout: LOCAL_STACK ? 120_000 : 30_000,
  forbidOnly: !!process.env.CI,
  retries: LOCAL_STACK ? 0 : process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
    video: "retain-on-failure",
    headless: true,
  },
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: "pnpm dev",
        url: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000/lt",
        /**
         * LOCAL-STACK RUNS REFUSE TO INHERIT A SERVER THEY DID NOT START.
         *
         * `reuseExistingServer: true` reuses whatever answers on the port. It
         * cannot tell this build from a stranger's, and :3100 is a fixed port
         * that abandoned worktrees keep claiming.
         *
         * On 2026-08-28 that cost a full session. A `next start -p 3100` left
         * over from another worktree — 22 commits behind, with the previous
         * `DetailsHashOpener` that returns early for a hash naming a section
         * INSIDE the disclosure — answered the suite instead of this build.
         * The deep-link specs saw `scrollY` stay at exactly 0 with the target
         * element present, intermittently, and it read exactly like a product
         * race in the page's own lifecycle. It was not: the same deep links
         * are deterministic 15/15 and 10/10 against a clean production build
         * of the same commit. Nothing in the product was wrong.
         *
         * Reuse now fails closed for local-stack runs: Playwright errors with
         * "port is already used" instead of quietly testing someone else's
         * code. A wrong target must never be able to look like a bug.
         */
        reuseExistingServer: !LOCAL_STACK,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
