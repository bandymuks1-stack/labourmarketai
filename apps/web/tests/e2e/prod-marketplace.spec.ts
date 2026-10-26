import { appendFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Page } from "./prod-walk";

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
 * `afterAll` closes the listing and pauses the service this run published,
 * even after a red step, closes and pauses the seller's synthetic listings and
 * services that earlier runs left public, then checks this run left none.
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

let listingId = "";
let serviceId = "";

test("M-1. the seller lists a handmade shelf and publishes it", async ({ browser }) => {
  const { page, close } = await as(browser, "worker");
  await page.goto("/lt/dashboard/listings");
  await expect(page.getByTestId("listings-page")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("listing-add").click();
  await page.getByTestId("listing-form-domain").selectOption("goods");
  await page.getByTestId("listing-form-kind").selectOption("sale");
  // Not a food subject: those correctly ask for a legal acknowledgement first.
  await page.getByTestId("listing-form-category").selectOption("goods_handmade");
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
  serviceId = (await row.getAttribute("data-testid"))!.replace("service-offering-row-", "");
  const status = page.getByTestId(`service-offering-status-${serviceId}`);
  if (!/aktyv|active/i.test(await status.innerText())) {
    await page.getByTestId(`service-offering-toggle-${serviceId}`).click();
  }
  await expect(page.getByTestId(`service-offering-discoverability-${serviceId}`)).toBeVisible({ timeout: 30_000 });
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
  await provider.page.waitForTimeout(5_000);
  const err = provider.page.locator(`p[role="alert"]`).filter({ hasText: /\S/ }).first();
  if (await err.isVisible().catch(() => false)) throw new Error(`accept refused: ${await err.innerText()}`);
  console.info(`[market] incoming row after accept: ${(await incoming.innerText().catch(() => "(row gone)")).slice(0, 300)}`);
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

// ── Z: leave nothing published ─────────────────────────────────────────────
//
// `afterAll`, not a last test: a serial walk stops at its first red step, and
// a run that failed half-way must still close what it opened. Each item is
// cleaned on its own and a failure is logged, never thrown over the result.
// Same steps as the Z section of `prod-marketplace-goods-services.spec.ts`,
// plus earlier runs' services and a check that this run left nothing public.

async function closeListing(page: Page, id: string): Promise<void> {
  await page.goto("/lt/dashboard/listings");
  // Scoped to <main>: the page streams in through a hidden `<div id="S:n">`
  // that a never-painting headless tab keeps outside <main> beside the
  // rendered copy, and an unscoped testid fails strict mode.
  const main = page.getByRole("main");
  await expect(main.locator(`[data-testid="my-listing-row"][id="listing-${id}"]`)).toBeVisible({ timeout: 30_000 });
  const close = main.getByTestId(`listing-close-${id}`);
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await expect(close).toHaveCount(0, { timeout: 30_000 });
  }
}

/**
 * Close what EARLIER runs left published on this slot's own listings page: a
 * run that went red before its cleanup, or one from before this cleanup
 * existed. Only the slot's own rows, only titles that carry the synthetic
 * marker and a run id, only through the page's own close control. Returns how
 * many it closed.
 */
async function closeEarlierListings(page: Page): Promise<number> {
  await page.goto("/lt/dashboard/listings");
  const main = page.getByRole("main");
  await expect(main.getByTestId("listings-page")).toBeVisible({ timeout: 30_000 });
  const open = main
    .getByTestId("my-listing-row")
    .filter({ hasText: /QA-SYNTHETIC \d+ / })
    .filter({ has: page.locator('[data-testid^="listing-close-"]') });
  let closed = 0;
  for (let i = 0; i < 25 && (await open.count()) > 0; i++) {
    const before = await open.count();
    await open.first().locator('[data-testid^="listing-close-"]').first().click();
    await expect(open).toHaveCount(before - 1, { timeout: 30_000 });
    closed++;
  }
  return closed;
}

async function pauseService(page: Page, id: string): Promise<void> {
  await page.goto("/lt/dashboard/services");
  const main = page.getByRole("main");
  const status = main.getByTestId(`service-offering-status-${id}`);
  await expect(status).toBeVisible({ timeout: 30_000 });
  if (/aktyv|active/i.test(await status.innerText())) {
    await main.getByTestId(`service-offering-toggle-${id}`).click();
    await expect(status).not.toHaveText(/aktyv|active/i, { timeout: 30_000 });
  }
}

/** A row whose status chip says ACTIVE ("Aktyvus"); paused and draft stay private. */
const activeChip = (page: Page) => page.locator('[data-testid^="service-offering-status-"]', { hasText: /aktyv|active/i });

/**
 * Pause what EARLIER runs left active on this slot's own services page (M-2
 * had no cleanup before this one). Same limits as `closeEarlierListings`: own
 * rows only, synthetic marker plus a run id, the page's own pause control.
 */
async function pauseEarlierServices(page: Page): Promise<number> {
  await page.goto("/lt/dashboard/services");
  const main = page.getByRole("main");
  await expect(main.getByTestId("service-offerings-section")).toBeVisible({ timeout: 30_000 });
  const active = main
    .locator('[data-testid^="service-offering-row-"]', { hasText: /QA-SYNTHETIC \d+ / })
    .filter({ has: activeChip(page) });
  let paused = 0;
  for (let i = 0; i < 25 && (await active.count()) > 0; i++) {
    const before = await active.count();
    await active.first().locator('[data-testid^="service-offering-toggle-"]').click();
    await expect(active).toHaveCount(before - 1, { timeout: 30_000 });
    paused++;
  }
  return paused;
}

/** The run's own check: nothing titled with this run's id is still public. */
async function runLeftNothing(page: Page): Promise<string> {
  const mine = new RegExp(`QA-SYNTHETIC ${RUN} `);
  await page.goto("/lt/dashboard/listings");
  let main = page.getByRole("main");
  await expect(main.getByTestId("listings-page")).toBeVisible({ timeout: 30_000 });
  const listings = await main
    .getByTestId("my-listing-row")
    .filter({ hasText: mine })
    .filter({ has: page.locator('[data-testid^="listing-close-"]') })
    .count();
  await page.goto("/lt/dashboard/services");
  main = page.getByRole("main");
  await expect(main.getByTestId("service-offerings-section")).toBeVisible({ timeout: 30_000 });
  const services = await main
    .locator('[data-testid^="service-offering-row-"]', { hasText: mine })
    .filter({ has: activeChip(page) })
    .count();
  if (listings + services > 0) throw new Error(`still public from this run: ${listings} listing(s), ${services} service(s)`);
  return "nothing from this run is still public";
}

/**
 * A cleanup that did not finish is its own QA problem, not the walk's result:
 * one line in the run summary (counts and step names only; the repository is
 * public), and the walk's pass or fail stays what its tests said.
 */
function reportCleanupProblem(failed: string[]): void {
  const line = `cleanup NOT finished: ${failed.join(", ")} (synthetic rows may still be public)`;
  console.info(`[cleanup] ${line}`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (!summary) return;
  try {
    appendFileSync(summary, `marketplace ${line}\n`);
  } catch {
    // The summary is a convenience; the log line above already carries it.
  }
}

test.afterAll(async ({ browser }) => {
  // Own budget: the default hook timeout is 30 s, less than one listing close,
  // and the first run after this change pauses everything earlier runs left.
  test.setTimeout(600_000);
  const jobs: { what: string; skip: boolean; run: (p: Page) => Promise<string> }[] = [
    { what: "shelf listing", skip: !listingId, run: (p) => closeListing(p, listingId).then(() => "closed") },
    { what: "service offering", skip: !serviceId, run: (p) => pauseService(p, serviceId).then(() => "paused") },
    // These two run even when M-1 or M-2 went red before it read the id.
    { what: "earlier synthetic listings", skip: false, run: (p) => closeEarlierListings(p).then((n) => `closed ${n}`) },
    { what: "earlier synthetic services", skip: false, run: (p) => pauseEarlierServices(p).then((n) => `paused ${n}`) },
    { what: "this run's check", skip: false, run: runLeftNothing },
  ];
  const failed: string[] = [];
  for (const job of jobs) {
    if (job.skip) continue;
    const { page, close } = await as(browser, "worker");
    try {
      console.info(`[cleanup] ${job.what}: ${await job.run(page)}`);
    } catch (e) {
      const first = (e as Error).message.split("\n")[0].slice(0, 160);
      console.info(`[cleanup] ${job.what}: NOT done (${first})`);
      failed.push(job.what);
    } finally {
      await close();
    }
  }
  if (failed.length > 0) reportCleanupProblem(failed);
});
