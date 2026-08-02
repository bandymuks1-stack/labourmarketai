import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * W6 slice 3B — FAIL-CLOSED proof: the experience domain migration is NOT
 * applied (the production reality until the owner gate opens).
 *
 * Run with the domain rolled back:
 *   psql … -f supabase/rollbacks/20260802120000_experience_records_v1.down.sql
 *   pnpm -C apps/web run e2e:local tests/e2e/w6-experience-fail-closed.spec.ts
 *   psql … -f supabase/migrations/20260802120000_experience_records_v1.sql
 *
 * Guarded by W6_FAIL_CLOSED=1 so a normal suite run (domain applied) skips it
 * instead of reporting a false failure.
 */
const WORKER_STATE = join(__dirname, ".storage-state.worker.json");
const HAS_SESSION = existsSync(WORKER_STATE);

test.skip(
  !HAS_SESSION || process.env.W6_FAIL_CLOSED !== "1",
  "fail-closed run only: set W6_FAIL_CLOSED=1 with the domain migration rolled back",
);

test.use({ storageState: HAS_SESSION ? WORKER_STATE : undefined });
test.setTimeout(120_000);

test("the surface degrades to a product-level unavailable state — no crash, no fake counts", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  const response = await page.goto("/lt/dashboard/experiences");
  // The route still SERVES — a missing domain is not a 500.
  expect(response?.status()).toBeLessThan(500);
  await expect(page.getByTestId("experiences-page")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("experiences-unavailable")).toBeVisible();

  // No fabricated counts anywhere.
  await expect(page.getByTestId("experience-counts")).toHaveCount(0);
  await expect(page.getByTestId("experience-counts-positive")).toHaveCount(0);

  // No technical leakage to the user: no SQL state, no relation names, no
  // "needs_migration" jargon on the worker-facing surface.
  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const leak of [
    "needs_migration",
    "42p01",
    "42883",
    "pgrst",
    "experience_records",
    "relation",
    "postgres",
    "supabase",
  ]) {
    expect(body, `technical leak: ${leak}`).not.toContain(leak);
  }

  // And the person can still get back to work.
  await expect(page.getByTestId("experiences-back-to-chat")).toBeVisible();
});

test("mobile 375px: the unavailable state is readable and does not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/lt/dashboard/experiences");
  await expect(page.getByTestId("experiences-unavailable")).toBeVisible({ timeout: 60_000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
