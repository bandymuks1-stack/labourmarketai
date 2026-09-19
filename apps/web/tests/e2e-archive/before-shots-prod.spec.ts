import { test } from "@playwright/test";
import { join } from "node:path";

/** TEMPORARY: BEFORE evidence from REAL production (public pages only). */
const OUT = join(__dirname, "..", "..", "..", "..", "docs", "audits", "evidence", "owner-rebuild-before");
const PROD = "https://labourmarket.ai";

test.describe("BEFORE — production public", () => {
  test("landing desktop", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${PROD}/lt`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(OUT, "prod-landing-hero-1440.png") });
    await page.screenshot({ path: join(OUT, "prod-landing-full-1440.png"), fullPage: true });
  });

  test("landing mobile", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${PROD}/lt`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: join(OUT, "prod-landing-hero-390.png") });
    await page.screenshot({ path: join(OUT, "prod-landing-full-390.png"), fullPage: true });
  });

  test("login desktop + mobile", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${PROD}/lt/auth/login`, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(OUT, "prod-login-1440.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, "prod-login-390.png") });
  });
});
