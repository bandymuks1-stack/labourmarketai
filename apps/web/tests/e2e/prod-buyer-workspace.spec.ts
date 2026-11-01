import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Page } from "./prod-walk";

/**
 * PRODUCTION — THE BUYER WORKSPACE (matrix 6.4), with the ONE owner-created
 * synthetic buyer (owner decision 2026-10-26, "6.4 PIRKĖJO TESTO LEIDIMAS").
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=buyer-workspace),
 * signed in to `qa.buyer+act1@labourmarket.ai`, created by the owner with the
 * customer role in its sign-up metadata (the ordinary profile trigger wrote
 * it — no privileged grant). The walk never creates the account.
 *
 *   B-0  the account is past onboarding (completed through the shipped wizard
 *        if it is not — a synthetic name, Lithuania);
 *   B-1  the customer record: the buyer setup form saves and the workspace
 *        reads it back;
 *   B-2  a request is saved as a DRAFT and appears once in the buyer's own
 *        list, at 1280 px;
 *   B-3  the same workspace on a 390 px phone: the request is there and the
 *        page never scrolls sideways.
 *
 * Isolation: every text carries the documented fixture marker; the request
 * stays a draft, so it reaches no company, board or notification. Afterwards
 * the owner bans the account (prod-qa-fresh-provision, action=revoke,
 * who=buyer); the walk's sessions are revoked at its end like every walk's.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const NOTE = `QA-SYNTHETIC ${RUN}`;
const state = resolve(__dirname, ".storage-state.prod-qa.buyer.json");
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state);
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with the owner-created buyer");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

async function as(browser: Browser, phone = false): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({
    storageState: state,
    locale: "lt-LT",
    ...(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } }),
  });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
}

test("B-0. the buyer is past onboarding (through the shipped wizard if needed)", async ({ browser }) => {
  const { page, close } = await as(browser);
  await page.goto("/lt/dashboard/buyer");
  await settle(page);
  if (/\/onboarding/.test(new URL(page.url()).pathname)) {
    await page.getByTestId("onboarding-intent-work").click();
    await page.getByTestId("onboarding-intents-continue").click();
    await page.getByTestId("onboarding-display-name").fill("QA-SYNTHETIC Pirkėjas");
    await page.getByTestId("onboarding-country").click();
    await page.getByTestId("onboarding-country-field").locator('input:not([type="hidden"])').first().fill("Liet");
    await page.getByRole("option", { name: /^Lietuva$/ }).first().click();
    await page.getByTestId("onboarding-submit").click();
    await page.waitForURL((u) => !/\/onboarding/.test(u.pathname), { timeout: 60_000 });
    console.info("[buyer] onboarding completed through the wizard");
  } else {
    console.info("[buyer] already past onboarding");
  }
  await page.goto("/lt/dashboard/buyer");
  await settle(page);
  expect(new URL(page.url()).pathname, "the customer role opens the buyer workspace").toMatch(/\/dashboard\/buyer$/);
  await expect(page.getByTestId("buyer-dashboard")).toBeVisible({ timeout: 30_000 });
  await close();
});

test("B-1 (6.4). the buyer's customer record saves and the workspace reads it back", async ({ browser }) => {
  const { page, close } = await as(browser);
  await page.goto("/lt/dashboard/start/buyer");
  await settle(page);
  await expect(page.getByTestId("buyer-setup-form")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("buyer-setup-contact-name").fill("QA-SYNTHETIC Pirkėjas");
  await page.getByTestId("buyer-setup-country").fill("Lietuva");
  await page.getByTestId("buyer-setup-need-summary").fill(`${NOTE}: testinis pirkėjas (produkcijos walk).`);
  await page.getByTestId("buyer-setup-submit").click();
  await expect(page.getByTestId("buyer-setup-result")).toBeVisible({ timeout: 30_000 });
  await page.goto("/lt/dashboard/buyer");
  await settle(page);
  const customer = page.getByTestId("buyer-dashboard-customer-state");
  await expect(customer, "the workspace reads the saved customer record").toBeVisible({ timeout: 30_000 });
  await expect(customer).toContainText("QA-SYNTHETIC Pirkėjas");
  await close();
});

test("B-2 (6.4). a request saved as a draft appears once in the buyer's own list", async ({ browser }) => {
  const { page, close } = await as(browser);
  await page.goto("/lt/dashboard/buyer");
  await settle(page);
  const form = page.getByTestId("buyer-requests-form");
  await expect(form, "the request form is open to a set-up customer").toBeVisible({ timeout: 30_000 });
  await page.getByTestId("buyer-requests-field-title").fill(`${NOTE} užsakymas`);
  await page.getByTestId("buyer-requests-field-need-summary").fill(`${NOTE}: plytelių klojimas vonios kambaryje (testas).`);
  await page.getByTestId("buyer-requests-status-draft").check();
  await page.getByTestId("buyer-requests-submit").click();
  await expect(page.getByTestId("buyer-requests-result")).toBeVisible({ timeout: 30_000 });
  await page.goto("/lt/dashboard/buyer");
  await settle(page);
  const rows = page.locator('[data-testid^="buyer-request-row-"]', { hasText: NOTE });
  await expect(rows, "the draft is in the list exactly once").toHaveCount(1, { timeout: 30_000 });
  console.info(`[buyer] draft saved and listed once (${RUN})`);
  await close();
});

test("B-3 (6.4). on a 390 px phone the request is there and nothing scrolls sideways", async ({ browser }) => {
  const { page, close } = await as(browser, true);
  await page.goto("/lt/dashboard/buyer");
  await settle(page);
  await expect(page.locator('[data-testid^="buyer-request-row-"]', { hasText: NOTE })).toHaveCount(1, { timeout: 30_000 });
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  console.info(`[buyer] phone scrollWidth=${scroll} innerWidth=${inner}`);
  expect(scroll, "the buyer workspace is wider than a 390 px phone").toBeLessThanOrEqual(inner + 1);
  await close();
});
