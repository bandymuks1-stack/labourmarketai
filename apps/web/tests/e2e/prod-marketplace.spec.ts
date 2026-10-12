import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * PRODUCTION UNIVERSAL MARKETPLACE — owner programme 2026-10-12 §3D: a person
 * lists goods and offers a service; another person finds both, contacts the
 * seller in a thread, requests the service, and the provider accepts — the
 * approved model (one index, the existing messaging, no payment).
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=marketplace) with
 * the synthetic cast (both are QA viewers, so `QA-SYNTHETIC` rows are visible
 * to each other and hidden from real people):
 *   worker   qa.worker+multiw  — the seller / provider
 *   worker2  qa.worker+goal3   — the buyer
 * The walk pauses what it published at the end.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const GOODS = `QA-SYNTHETIC ${RUN} rankų darbo lentyna`;
const SERVICE = `QA-SYNTHETIC ${RUN} plytelių klojimas`;
const MSG = `QA-SYNTHETIC ${RUN}: ar lentyna dar parduodama?`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["worker", "worker2"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

async function as(browser: Browser, slot: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ storageState: state(slot), locale: "lt-LT" });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

async function firstRealOption(page: Page, testid: string): Promise<void> {
  const select = page.getByTestId(testid);
  const value = await select.locator("option").evaluateAll((os) =>
    (os as HTMLOptionElement[]).map((o) => o.value).find((v) => v !== ""),
  );
  if (value) await select.selectOption(value);
}

let listingId = "";

test("M-1. the seller lists a handmade shelf and publishes it", async ({ browser }) => {
  const { page, close } = await as(browser, "worker");
  await page.goto("/lt/dashboard/listings");
  await expect(page.getByTestId("listings-page")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("listing-add").click();
  await page.getByTestId("listing-form-domain").selectOption("goods");
  await page.getByTestId("listing-form-kind").selectOption("sale");
  await firstRealOption(page, "listing-form-category");
  await page.getByTestId("listing-form-title").fill(GOODS);
  await page.getByTestId("listing-form-description").fill("Ąžuolinė, 80 cm. Atsiimti Kaune.");
  await page.getByTestId("listing-form-country").fill("LT");
  await page.getByTestId("listing-form-save").click();
  const row = page.getByTestId("my-listing-row").filter({ hasText: GOODS }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  listingId = (await row.getAttribute("id"))!.replace("listing-", "");
  await page.getByTestId(`listing-activate-${listingId}`).click();
  // A food/restricted category asks for an acknowledgement; a shelf does not.
  await expect(page.getByTestId(`listing-activate-${listingId}`)).toHaveCount(0, { timeout: 30_000 });
  await close();
});

test("M-2. the provider offers a service and makes it discoverable", async ({ browser }) => {
  const { page, close } = await as(browser, "worker");
  await page.goto("/lt/dashboard/services");
  await expect(page.getByTestId("service-offerings-section")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("service-offering-add").click();
  await page.getByTestId("service-offering-title").fill(SERVICE);
  await page.getByTestId("service-offering-category").fill("tiling");
  await page.getByTestId("service-offering-country").fill("LT");
  await page.getByTestId("service-offering-rate").fill("25 EUR/m²");
  await page.getByTestId("service-offering-save").click();
  const row = page.locator('[data-testid^="service-offering-row-"]', { hasText: SERVICE }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const id = (await row.getAttribute("data-testid"))!.replace("service-offering-row-", "");
  const status = page.getByTestId(`service-offering-status-${id}`);
  if (!/aktyv|active/i.test(await status.innerText())) {
    await page.getByTestId(`service-offering-toggle-${id}`).click();
  }
  await expect(page.getByTestId(`service-offering-discoverability-${id}`)).toBeVisible({ timeout: 30_000 });
  await close();
});

test("M-3. the buyer finds the shelf among goods and asks the seller in a thread", async ({ browser }) => {
  const { page, close } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/listings");
  await page.getByTestId("market-group-goods").click().catch(() => undefined);
  const card = page.getByTestId("market-browse-row").filter({ hasText: GOODS }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByTestId(`listing-enquire-${listingId}`).click();
  await page.waitForURL(/\/dashboard\/communication\//, { timeout: 30_000 });
  const input = page.getByTestId("communication-composer-input");
  await input.fill(MSG);
  await input.locator("xpath=ancestor::form").locator('button[type="submit"]').click();
  const sent = await expect(input).toHaveValue("", { timeout: 20_000 }).then(() => true, () => false);
  if (!sent) {
    const why = await page.getByTestId("communication-composer-error").innerText().catch(() => "(no error shown)");
    throw new Error(`the buyer's message was not sent: ${why}`);
  }
  await expect(page.locator("main")).toContainText(MSG, { timeout: 20_000 });
  await close();
});

test("M-4. the seller receives the buyer's message", async ({ browser }) => {
  const { page, close } = await as(browser, "worker");
  await page.goto("/lt/dashboard/communication");
  const thread = page.locator("a[href*='/dashboard/communication/']", { hasText: /QA-SYNTHETIC|Darbinink|goal3|\(test\)/ }).first();
  await expect
    .poll(async () => {
      await page.reload();
      return (await page.locator("main").innerText()).includes(RUN);
    }, { timeout: 45_000, intervals: [3_000] })
    .toBe(true)
    .catch(async () => {
      // The inbox preview may not show message text; open the newest thread.
      await thread.click();
      await expect(page.locator("main")).toContainText(MSG, { timeout: 20_000 });
    });
  await close();
});

test("M-5. the buyer reaches the service from the market and requests it", async ({ browser }) => {
  const { page, close } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/listings");
  await page.getByTestId("market-group-services").click().catch(() => undefined);
  const card = page.getByTestId("market-browse-row").filter({ hasText: SERVICE }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole("link").last().click();
  await page.waitForURL(/\/dashboard\/service-requests/, { timeout: 30_000 });
  const offer = page.getByTestId("marketplace-offer-row").filter({ hasText: SERVICE }).first();
  await expect(offer).toBeVisible({ timeout: 30_000 });
  await offer.getByTestId("marketplace-offer-message").fill(`QA-SYNTHETIC ${RUN}: vonia 6 m², kitą savaitę`);
  await offer.getByTestId("marketplace-offer-request").click();
  await expect(offer.getByTestId("marketplace-offer-requested")).toBeVisible({ timeout: 30_000 });
  await close();
});

test("M-6. the provider accepts; both sides can open the conversation", async ({ browser }) => {
  const provider = await as(browser, "worker");
  await provider.page.goto("/lt/dashboard/service-requests");
  const incoming = provider.page.getByTestId("marketplace-incoming-row").filter({ hasText: RUN }).first();
  await expect(incoming).toBeVisible({ timeout: 30_000 });
  await incoming.getByTestId("marketplace-incoming-note").fill("Tinka, susiderinkime laiką.");
  await incoming.getByTestId("marketplace-incoming-accept").click();
  await expect
    .poll(async () => { await provider.page.reload(); return provider.page.getByTestId("marketplace-incoming-message-cta").count(); }, { timeout: 30_000, intervals: [3_000] })
    .toBeGreaterThan(0);
  await provider.close();

  const buyer = await as(browser, "worker2");
  await buyer.page.goto("/lt/dashboard/service-requests");
  const out = buyer.page.getByTestId("marketplace-outgoing-row").filter({ hasText: SERVICE }).first();
  await expect(out).toBeVisible({ timeout: 30_000 });
  await out.getByTestId("marketplace-outgoing-message-cta").click();
  await buyer.page.waitForURL(/\/dashboard\/communication\//, { timeout: 30_000 });
  await expect(buyer.page.getByTestId("communication-composer-input")).toBeVisible({ timeout: 20_000 });
  await buyer.close();
});
