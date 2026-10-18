import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** TEMPORARY: BEFORE evidence — authenticated surfaces on the current code. */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);
const OUT = join(__dirname, "..", "..", "..", "..", "docs", "audits", "evidence", "owner-rebuild-before");

test.skip(!HAS_SESSION, "needs the local stack");
test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

test("chat + topbar desktop", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lt/dashboard");
  await expect(page.getByTestId("composer-input")).toBeEnabled({ timeout: 60_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, "auth-chat-1440.png") });
});

test("chat mobile + menu", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lt/dashboard");
  await expect(page.getByTestId("composer-input")).toBeEnabled({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(OUT, "auth-chat-390.png") });
});

test("profile desktop + mobile", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.goto("/lt/dashboard/profile");
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(OUT, "auth-profile-1440.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, "auth-profile-390.png") });
});

test("journal page", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lt/dashboard/journal");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(OUT, "auth-journal-1440.png") });
});

test("market map page", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lt/dashboard/market-map");
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(OUT, "auth-marketmap-1440.png") });
});
