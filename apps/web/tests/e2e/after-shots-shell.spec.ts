import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** TEMPORARY: AFTER evidence for the shell UX pass. */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);
const OUT = join(__dirname, "..", "..", "..", "..", "docs", "audits", "evidence", "owner-rebuild-after");

test.skip(!HAS_SESSION, "needs the local stack");
test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });

test("chat desktop after", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/lt/dashboard");
  await expect(page.getByTestId("composer-input")).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId("msg-assistant").first().waitFor({ timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, "chat-1440.png") });
});

test("chat mobile after", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/lt/dashboard");
  await expect(page.getByTestId("composer-input")).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId("msg-assistant").first().waitFor({ timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, "chat-360.png") });
});
