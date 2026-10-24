import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Page } from "./prod-walk";

/**
 * PRODUCTION UNIVERSAL MARKETPLACE — GOODS, RENTALS, NEEDS AND SERVICES ACROSS
 * PEOPLE AND ORGANIZATIONS (owner area 11, registry rows 6.1 / 6.2 / 6.3).
 *
 * `prod-marketplace.spec.ts` proves one person selling to another person.
 * This walk proves the rest of the universal marketplace a real user meets:
 *
 *   G   goods and work resources in all three directions — a person SELLS, a
 *       company RENTS OUT as itself, a person is LOOKING FOR something
 *       (`wanted`) — found in the ONE market index by ANOTHER organization
 *       and by a private person, each contact a thread where the other side
 *       ANSWERS and the answer arrives;
 *   S   a service found by another organization, requested, accepted with a
 *       note, and the conversation continuing both ways after acceptance.
 *
 * Several locales on purpose: the seller works in lt, the company in pl, the
 * other organization in de and the private buyer in ru — the market is one,
 * the language is the person's.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` with the synthetic cast
 * (`lib/testing/prod-qa-guard.ts`; every one is a QA viewer, so the
 * `QA-SYNTHETIC` rows are visible to each other and hidden from real people):
 *   worker   qa.worker+multiw — a private seller and service provider
 *   worker2  qa.worker+goal3  — a private buyer (no company)
 *   owner    owns "QA-SYNTHETIC Alfa" — the company that rents out as itself
 *   manager  runs "QA-SYNTHETIC Gama" — the other organization that looks
 *
 * Every step is what a person does in the browser; no API write. Titles carry
 * the run id, so a rerun never meets an earlier run's rows, and `afterAll`
 * closes every listing and pauses the service this run published, even after
 * a red step.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const ALFA = "QA-SYNTHETIC Alfa";
const GAMA = "QA-SYNTHETIC Gama";
const SALE = `QA-SYNTHETIC ${RUN} medinė kėdė`;
const RENTAL = `QA-SYNTHETIC ${RUN} pastoliai nuomai`;
const WANTED = `QA-SYNTHETIC ${RUN} ieškau dviračio`;
const SERVICE = `QA-SYNTHETIC ${RUN} dažymo darbai`;
const say = (who: string) => `QA-SYNTHETIC ${RUN} ${who}`;

const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" &&
  ["worker", "worker2", "owner", "manager"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const LOCALE: Record<string, string> = { worker: "lt", owner: "pl", manager: "de", worker2: "ru" };
const BCP47: Record<string, string> = { lt: "lt-LT", pl: "pl-PL", de: "de-DE", ru: "ru-RU" };

async function as(browser: Browser, slot: string): Promise<{ ctx: BrowserContext; page: Page; l: string }> {
  const l = LOCALE[slot];
  const ctx = await browser.newContext({ storageState: state(slot), locale: BCP47[l] });
  return { ctx, page: await ctx.newPage(), l };
}

/** Make `orgName` the active workspace through the real header chip. */
async function useWorkspace(page: Page, l: string, orgName: string): Promise<void> {
  await page.goto(`/${l}/dashboard/company/people`);
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if ((await chip.innerText()).includes(orgName)) return;
  await chip.getByRole("button").first().click();
  const menu = page.getByTestId("workspace-chip-menu");
  await menu.locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first().click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
}

/** Create a listing through the real form, publish it, return its id. */
async function publishListing(
  page: Page,
  l: string,
  f: { domain: string; kind: string; category: string; title: string; asOrganization?: boolean },
): Promise<string> {
  await page.goto(`/${l}/dashboard/listings`);
  // Scoped to <main>: see `findInMarket`.
  const main = page.getByRole("main");
  await expect(main.getByTestId("listings-page")).toBeVisible({ timeout: 30_000 });
  await main.getByTestId("listing-add").click();
  await main.getByTestId("listing-form-domain").selectOption(f.domain);
  await main.getByTestId("listing-form-kind").selectOption(f.kind);
  await main.getByTestId("listing-form-category").selectOption(f.category);
  if (f.asOrganization) {
    // The company publishes as ITSELF — the form must offer it.
    const publisher = main.getByTestId("listing-form-publisher");
    await expect(publisher, "the form offers the company as publisher").toBeVisible({ timeout: 30_000 });
    await publisher.selectOption("organization");
  }
  await main.getByTestId("listing-form-title").fill(f.title);
  await main.getByTestId("listing-form-description").fill(`${say("aprašymas")}. Kaunas.`);
  await main.getByTestId("listing-form-country").fill("LT");
  await main.getByTestId("listing-form-save").click();
  const row = main.getByTestId("my-listing-row").filter({ hasText: f.title }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const id = (await row.getAttribute("id"))!.replace("listing-", "");
  await main.getByTestId(`listing-activate-${id}`).click();
  await expect(main.getByTestId(`listing-activate-${id}`)).toHaveCount(0, { timeout: 30_000 });
  if (f.asOrganization) {
    await expect(row.getByTestId("my-listing-publisher"), "the row says it was published by the company").toBeVisible();
  }
  return id;
}

/** Send one message in the open thread; fail with the composer's own reason. */
async function send(page: Page, text: string): Promise<void> {
  const input = page.getByTestId("communication-composer-input");
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(text);
  await input.locator("xpath=ancestor::form").locator('button[type="submit"]').click();
  const sent = await expect(input).toHaveValue("", { timeout: 30_000 }).then(() => true, () => false);
  if (!sent) {
    const why = await page.getByTestId("communication-composer-error").innerText().catch(() => "(no error shown)");
    throw new Error(`the message was not sent: ${why}`);
  }
  await expect(page.locator("main")).toContainText(text, { timeout: 30_000 });
}

/** The other side finds the thread in their own inbox, opens it and sees `text`. */
async function receive(page: Page, l: string, threadPath: string, text: string): Promise<void> {
  const id = threadPath.split("/").pop()!;
  await page.goto(`/${l}/dashboard/communication`);
  const link = page.locator(`a[href*="/dashboard/communication/${id}"]`).first();
  await expect
    .poll(
      async () => {
        await page.reload();
        return link.count();
      },
      { timeout: 45_000, intervals: [3_000] },
    )
    .toBeGreaterThan(0);
  await link.click();
  await page.waitForURL(new RegExp(`/dashboard/communication/${id}`), { timeout: 30_000 });
  await expect(page.locator("main")).toContainText(text, { timeout: 30_000 });
}

/** Find `title` in the one market under `group`; return its card. */
async function findInMarket(page: Page, l: string, group: string, title: string) {
  await page.goto(`/${l}/dashboard/listings`);
  // Scoped to <main>: the page streams in through a hidden `<div id="S:n">`
  // whose reveal is rAF-driven; in a never-painting headless tab that hidden
  // copy sits outside <main> beside the rendered one, and an unscoped testid
  // fails strict mode at once (run 40054092916 G-4: `listings-page` in <main>
  // plus `.nth(1)` outside it; calendar-journal-history.spec.ts). Strict
  // inside <main> still fails if the page itself renders twice.
  const main = page.getByRole("main");
  await expect(main.getByTestId("listings-page")).toBeVisible({ timeout: 30_000 });
  await main.getByTestId(`market-group-${group}`).click().catch(() => undefined);
  const card = main.getByTestId("market-browse-row").filter({ hasText: title }).first();
  await expect(card, `"${group}" shows the row`).toBeVisible({ timeout: 30_000 });
  return card;
}

let saleId = "";
let rentalId = "";
let wantedId = "";
let rentalThread = "";
let saleThread = "";
let serviceId = "";
let serviceThread = "";

// ── G: goods and work resources ────────────────────────────────────────────

test("G-1. a private seller lists a chair for sale", async ({ browser }) => {
  const { ctx, page, l } = await as(browser, "worker");
  saleId = await publishListing(page, l, { domain: "goods", kind: "sale", category: "goods_household", title: SALE });
  await ctx.close();
});

test("G-2. a company rents out scaffolding as itself", async ({ browser }) => {
  const { ctx, page, l } = await as(browser, "owner");
  await useWorkspace(page, l, ALFA);
  rentalId = await publishListing(page, l, {
    domain: "work_resource",
    kind: "rental",
    category: "equipment",
    title: RENTAL,
    asOrganization: true,
  });
  await ctx.close();
});

test("G-3. a private person says what they are looking for", async ({ browser }) => {
  const { ctx, page, l } = await as(browser, "worker2");
  wantedId = await publishListing(page, l, { domain: "goods", kind: "wanted", category: "goods_other", title: WANTED });
  await ctx.close();
});

test("G-4. another organization finds all three in the one market and asks the company", async ({ browser }) => {
  const { ctx, page, l } = await as(browser, "manager");
  await useWorkspace(page, l, GAMA);
  const sale = await findInMarket(page, l, "goods", SALE);
  await expect(sale.getByTestId("market-row-actor")).toHaveAttribute("data-actor-kind", "person");
  const wanted = await findInMarket(page, l, "goods", WANTED);
  await expect(wanted.getByTestId(`listing-enquire-${wantedId}`)).toBeVisible();
  const rental = await findInMarket(page, l, "goods", RENTAL);
  // Published by the company: the row is never dressed as a private person.
  await expect(rental.getByTestId("market-row-actor")).not.toHaveAttribute("data-actor-kind", "person");
  await rental.getByTestId(`listing-enquire-${rentalId}`).click();
  await page.waitForURL(/\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 30_000 });
  rentalThread = new URL(page.url()).pathname;
  await send(page, say("Gama: ar pastoliai laisvi kitą savaitę?"));
  await ctx.close();
});

test("G-5. the company finds the question in its inbox and answers", async ({ browser }) => {
  const { ctx, page, l } = await as(browser, "owner");
  await receive(page, l, rentalThread, say("Gama: ar pastoliai laisvi kitą savaitę?"));
  await send(page, say("Alfa: taip, laisvi nuo pirmadienio"));
  await ctx.close();
});

test("G-6. the other organization receives the company's answer", async ({ browser }) => {
  const { ctx, page, l } = await as(browser, "manager");
  await receive(page, l, rentalThread, say("Alfa: taip, laisvi nuo pirmadienio"));
  await ctx.close();
});

test("G-7. a private buyer asks the private seller about the chair", async ({ browser }) => {
  const { ctx, page, l } = await as(browser, "worker2");
  const sale = await findInMarket(page, l, "goods", SALE);
  await sale.getByTestId(`listing-enquire-${saleId}`).click();
  await page.waitForURL(/\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 30_000 });
  saleThread = new URL(page.url()).pathname;
  await send(page, say("pirkėjas: ar kėdė dar parduodama?"));
  await ctx.close();
});

test("G-8. the seller answers the buyer, and the buyer receives it", async ({ browser }) => {
  const seller = await as(browser, "worker");
  await receive(seller.page, seller.l, saleThread, say("pirkėjas: ar kėdė dar parduodama?"));
  await send(seller.page, say("pardavėjas: taip, galima atsiimti šeštadienį"));
  await seller.ctx.close();

  const buyer = await as(browser, "worker2");
  await receive(buyer.page, buyer.l, saleThread, say("pardavėjas: taip, galima atsiimti šeštadienį"));
  await buyer.ctx.close();
});

test("G-9. the seller answers the person's 'looking for' listing", async ({ browser }) => {
  const { ctx, page, l } = await as(browser, "worker");
  const wanted = await findInMarket(page, l, "goods", WANTED);
  await wanted.getByTestId(`listing-enquire-${wantedId}`).click();
  await page.waitForURL(/\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const thread = new URL(page.url()).pathname;
  await send(page, say("turiu dviratį, kurio ieškai"));
  await ctx.close();

  const asker = await as(browser, "worker2");
  await receive(asker.page, asker.l, thread, say("turiu dviratį, kurio ieškai"));
  await asker.ctx.close();
});

// ── S: a service, from another organization, request → answer → thread ─────

test("S-1. the provider offers a service and makes it discoverable", async ({ browser }) => {
  const { ctx, page, l } = await as(browser, "worker");
  await page.goto(`/${l}/dashboard/services`);
  await expect(page.getByTestId("service-offerings-section")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("service-offering-add").click();
  await page.getByTestId("service-offering-title").fill(SERVICE);
  await page.getByTestId("service-offering-category").fill("painting");
  await page.getByTestId("service-offering-country").fill("LT");
  await page.getByTestId("service-offering-rate").fill("12 EUR/m²");
  await page.getByTestId("service-offering-save").click();
  const row = page.locator('[data-testid^="service-offering-row-"]', { hasText: SERVICE }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  serviceId = (await row.getAttribute("data-testid"))!.replace("service-offering-row-", "");
  const status = page.getByTestId(`service-offering-status-${serviceId}`);
  if (!/aktyv|active/i.test(await status.innerText())) {
    await page.getByTestId(`service-offering-toggle-${serviceId}`).click();
  }
  // The discoverability line renders for draft and paused rows too: wait for
  // the row itself to say ACTIVE before the next actor looks for it.
  await expect(status).toHaveText(/aktyv|active/i, { timeout: 30_000 });
  await expect(page.getByTestId(`service-offering-discoverability-${serviceId}`)).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("S-2. another organization finds the service in the market and requests it", async ({ browser }) => {
  const { ctx, page, l } = await as(browser, "manager");
  await useWorkspace(page, l, GAMA);
  const card = await findInMarket(page, l, "services", SERVICE);
  await expect(card.getByTestId("market-row-actor")).toHaveAttribute("data-actor-kind", "service_provider");
  await card.getByRole("link").last().click();
  await page.waitForURL(/\/dashboard\/service-requests/, { timeout: 30_000 });
  const offer = page.getByTestId("marketplace-offer-row").filter({ hasText: SERVICE }).first();
  await expect(offer).toBeVisible({ timeout: 30_000 });
  await offer.getByTestId("marketplace-offer-message").fill(say("Gama: biuras 40 m², kitą mėnesį"));
  await offer.getByTestId("marketplace-offer-request").click();
  await expect(offer.getByTestId("marketplace-offer-requested")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("S-3. the provider sees the request with its message and accepts with a note", async ({ browser }) => {
  const { ctx, page, l } = await as(browser, "worker");
  await page.goto(`/${l}/dashboard/service-requests`);
  const incoming = page.getByTestId("marketplace-incoming-row").filter({ hasText: say("Gama: biuras 40 m²") }).first();
  await expect(incoming).toBeVisible({ timeout: 30_000 });
  await incoming.getByTestId("marketplace-incoming-note").fill(say("tiekėjas: tinka, atvyksiu apžiūrėti"));
  await incoming.getByTestId("marketplace-incoming-accept").click();
  await expect
    .poll(
      async () => {
        await page.reload();
        return page
          .getByTestId("marketplace-incoming-row")
          .filter({ hasText: say("Gama: biuras 40 m²") })
          .getByTestId("marketplace-incoming-message-cta")
          .count();
      },
      { timeout: 45_000, intervals: [3_000] },
    )
    .toBeGreaterThan(0);
  await ctx.close();
});

test("S-4. the requester sees the acceptance and its note, opens the thread and writes", async ({ browser }) => {
  const { ctx, page, l } = await as(browser, "manager");
  await page.goto(`/${l}/dashboard/service-requests`);
  const out = page.getByTestId("marketplace-outgoing-row").filter({ hasText: SERVICE }).first();
  await expect(out).toBeVisible({ timeout: 30_000 });
  await expect(out.getByTestId("marketplace-outgoing-note")).toContainText(say("tiekėjas: tinka"), { timeout: 30_000 });
  await out.getByTestId("marketplace-outgoing-message-cta").click();
  await page.waitForURL(/\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 30_000 });
  serviceThread = new URL(page.url()).pathname;
  await send(page, say("Gama: ar tinka antradienis 10 val.?"));
  await ctx.close();
});

test("S-5. the provider receives it and answers; the requester receives the answer", async ({ browser }) => {
  const provider = await as(browser, "worker");
  await receive(provider.page, provider.l, serviceThread, say("Gama: ar tinka antradienis 10 val.?"));
  await send(provider.page, say("tiekėjas: tinka, iki antradienio"));
  await provider.ctx.close();

  const requester = await as(browser, "manager");
  await receive(requester.page, requester.l, serviceThread, say("tiekėjas: tinka, iki antradienio"));
  await requester.ctx.close();
});

// ── Z: leave nothing published ─────────────────────────────────────────────
//
// `afterAll`, not a last test: a serial walk stops at its first red step, and
// a run that failed half-way must still close what it opened. Each item is
// cleaned on its own and a failure is logged, never thrown over the result.

async function closeListing(page: Page, l: string, id: string): Promise<void> {
  await page.goto(`/${l}/dashboard/listings`);
  // Scoped to <main> (hidden streaming copy, see `findInMarket`; run
  // 40054092916 left the rental listing open on exactly this line).
  const main = page.getByRole("main");
  await expect(main.locator(`[data-testid="my-listing-row"][id="listing-${id}"]`)).toBeVisible({ timeout: 30_000 });
  const close = main.getByTestId(`listing-close-${id}`);
  if (await close.isVisible().catch(() => false)) {
    await close.click();
    await expect(close).toHaveCount(0, { timeout: 30_000 });
  }
}

/**
 * Close what EARLIER runs of a synthetic walk left published on this slot's own
 * listings page: a run that went red before its cleanup reached a row (run
 * 40054092916 left Alfa's rental open). Only the slot's own rows, only titles
 * that carry the synthetic marker and a run id, only through the page's own
 * close control. Returns how many it closed.
 */
async function closeEarlierListings(page: Page, l: string): Promise<number> {
  await page.goto(`/${l}/dashboard/listings`);
  const main = page.getByRole("main");
  await expect(main.getByTestId("listings-page")).toBeVisible({ timeout: 30_000 });
  const open = main
    .getByTestId("my-listing-row")
    .filter({ hasText: /QA-SYNTHETIC \d+ / })
    .filter({ has: page.locator('[data-testid^="listing-close-"]') });
  let closed = 0;
  for (let i = 0; i < 10 && (await open.count()) > 0; i++) {
    const before = await open.count();
    await open.first().locator('[data-testid^="listing-close-"]').first().click();
    await expect(open).toHaveCount(before - 1, { timeout: 30_000 });
    closed++;
  }
  return closed;
}

async function pauseService(page: Page, l: string, id: string): Promise<void> {
  await page.goto(`/${l}/dashboard/services`);
  const status = page.getByTestId(`service-offering-status-${id}`);
  await expect(status).toBeVisible({ timeout: 30_000 });
  if (/aktyv|active/i.test(await status.innerText())) {
    await page.getByTestId(`service-offering-toggle-${id}`).click();
    await expect(status).not.toHaveText(/aktyv|active/i, { timeout: 30_000 });
  }
}

test.afterAll(async ({ browser }) => {
  // Own budget: the default hook timeout is 30 s, less than one listing close
  // (company-chain run 39960149411 lost its cleanup to it).
  test.setTimeout(300_000);
  const jobs: { what: string; slot: string; org: string | null; id: string; run: (p: Page, l: string, id: string) => Promise<void> }[] = [
    { what: "sale listing", slot: "worker", org: null, id: saleId, run: closeListing },
    { what: "rental listing", slot: "owner", org: ALFA, id: rentalId, run: closeListing },
    { what: "wanted listing", slot: "worker2", org: null, id: wantedId, run: closeListing },
    { what: "service offering", slot: "worker", org: null, id: serviceId, run: pauseService },
  ];
  for (const job of jobs) {
    if (!job.id) continue;
    const { ctx, page, l } = await as(browser, job.slot);
    try {
      if (job.org) await useWorkspace(page, l, job.org);
      await job.run(page, l, job.id);
      console.info(`[cleanup] ${job.what}: closed`);
      if (job.run === closeListing) {
        const earlier = await closeEarlierListings(page, l);
        if (earlier > 0) console.info(`[cleanup] ${job.what}: closed ${earlier} left open by earlier runs`);
      }
    } catch (e) {
      const first = (e as Error).message.split("\n")[0].slice(0, 160);
      console.info(`[cleanup] ${job.what}: NOT closed (${first})`);
    } finally {
      await ctx.close();
    }
  }
});
