import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the M1 auth flow (slice 6). Tests are conditional —
 * each spec skips at runtime if `SUPABASE_TEST_URL` isn't set, so the gate
 * stays green until the founder configures a separate test Supabase
 * project. See docs/TESTING.md.
 *
 * Run: pnpm e2e
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
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
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
