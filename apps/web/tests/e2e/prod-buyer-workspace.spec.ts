import { appendFileSync, existsSync } from "node:fs";
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
 * J-13 (owner directive 2026-11-02) — a person who is NOT a customer yet
 * becomes one and reaches a provider, all through the shipped UI. Two more
 * allowlisted synthetic identities, no new account:
 *   provider    qa.worker+multiw     (slot `worker`, the marketplace walk's provider)
 *   non-buyer   qa.freshworker+act1  (slot `freshworker`, owner-created, holds no
 *                                     customer role until B-5 of its first run)
 *
 *   B-4  the provider offers a synthetic service and makes it discoverable;
 *   B-5  the non-buyer is refused the buyer workspace with the honest notice,
 *        and DISCOVERS buying from the service loop (the door the home chat
 *        hands a "reikia paslaugos" sentence) → the buyer lane of the setup
 *        hub → saves the customer record → the workspace opens;
 *   B-6  from the buyer workspace the new customer finds the provider's
 *        service, requests it, and sees the request in its own list;
 *   B-7  both pages on a 390 px phone: nothing scrolls sideways;
 *   B-8  no console error and no 401/403 answer on any page B-4..B-7 opened.
 * B-5 is honest about repeat runs: the customer role is additive and the
 * account keeps it, so a later run logs "already a customer" and proves the
 * rest (the first run's log is the conversion proof).
 *
 * Isolation: every text carries the documented fixture marker; the B-2
 * request stays a draft, so it reaches no company, board or notification.
 * QA-labelled offerings are visible only to QA viewers. `afterAll` withdraws
 * the B-6 request and pauses the B-4 service even after a red step. The
 * customer record the non-buyer saved has no delete control in the product;
 * it is synthetic, marked, and private to that account. Afterwards the owner
 * bans the accounts (prod-qa-fresh-provision, action=revoke); the walk's
 * sessions are revoked at its end like every walk's.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const NOTE = `QA-SYNTHETIC ${RUN}`;
const SERVICE = `QA-SYNTHETIC ${RUN} vonios plytelės (J-13)`;
const slot = (name: string) => resolve(__dirname, `.storage-state.prod-qa.${name}.json`);
const state = slot("buyer");
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state);
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with the owner-created buyer");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

/** J-13 steps need the provider and the non-buyer sessions as well. */
const J13 = ENABLED && ["worker", "freshworker"].every((n) => existsSync(slot(n)));

async function as(
  browser: Browser,
  phone = false,
  who = "buyer",
): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({
    storageState: slot(who),
    locale: "lt-LT",
    ...(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } }),
  });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
}

/** Completes the shipped onboarding wizard when the account was sent there
 *  (a synthetic name, Lithuania); a no-op for an account already past it. */
async function passOnboarding(page: Page, tag: string, name: string): Promise<void> {
  if (!/\/onboarding/.test(new URL(page.url()).pathname)) {
    console.info(`[${tag}] already past onboarding`);
    return;
  }
  await page.getByTestId("onboarding-intent-work").click();
  await page.getByTestId("onboarding-intents-continue").click();
  await page.getByTestId("onboarding-display-name").fill(name);
  await page.getByTestId("onboarding-country").click();
  await page.getByTestId("onboarding-country-field").locator('input:not([type="hidden"])').first().fill("Liet");
  await page.getByRole("option", { name: /^Lietuva$/ }).first().click();
  await page.getByTestId("onboarding-submit").click();
  await page.waitForURL((u) => !/\/onboarding/.test(u.pathname), { timeout: 60_000 });
  console.info(`[${tag}] onboarding completed through the wizard`);
}

test("B-0. the buyer is past onboarding (through the shipped wizard if needed)", async ({ browser }) => {
  const { page, close } = await as(browser);
  await page.goto("/lt/dashboard/buyer");
  await settle(page);
  await passOnboarding(page, "buyer", "QA-SYNTHETIC Pirkėjas");
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

// ── J-13: a non-customer becomes a customer and reaches a provider ──────────

let serviceId = "";
let requested = false;
/** B-8: what any J-13 page reported — auth/permission console errors and
 *  refused (401/403) answers. Every other console error is logged, not judged. */
const faults: string[] = [];
const AUTH_ERROR = /\b(401|403|42501)\b|unauthori[sz]ed|forbidden|permission denied|jwt|not authenticated/i;

function watch(page: Page, who: string): void {
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text().slice(0, 160);
    if (AUTH_ERROR.test(text)) faults.push(`${who} console: ${text}`);
    else console.info(`[j13] ${who} console error (not auth): ${text}`);
  });
  page.on("response", (r) => {
    if (r.status() === 401 || r.status() === 403) {
      const u = new URL(r.url());
      faults.push(`${who} ${r.status()} ${u.host}${u.pathname}`);
    }
  });
}

// ── #3003 (owner P0-2, 2026-11-03): the customer's own door. Read-only. When
// the ACTIVE role is customer outside an organization workspace, the header's
// "More" and the phone sheet open with "Mano užklausos" (/dashboard/buyer),
// and no destination appears twice. It asserts strictly: an account whose
// active role is not customer fails here, which names that state.
test("B-3b (#3003). the customer finds \"Mano užklausos\" first in More and on the phone sheet", async ({ browser }) => {
  for (const phone of [false, true]) {
    const { page, close } = await as(browser, phone);
    await page.goto("/lt/dashboard/buyer");
    await settle(page);
    if (phone) {
      await page.getByTestId("header-nav-sheet-trigger").click();
    } else {
      await page.getByTestId("header-nav-more").click();
    }
    const list = page.getByTestId(phone ? "header-nav-sheet" : "header-nav-more-menu");
    await expect(list).toBeVisible({ timeout: 30_000 });
    const door = list.getByTestId(phone ? "header-nav-sheet-area:buyer" : "header-nav-more-area:buyer");
    const hrefs = await list
      .locator(phone ? '[data-testid^="header-nav-sheet-"]' : '[data-testid^="header-nav-more-"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    console.info(`[nav] buyer ${phone ? "sheet" : "More"}: ${hrefs.join(" ")}`);
    await expect(door).toHaveAttribute("href", "/lt/dashboard/buyer");
    expect(new Set(hrefs).size, `duplicate destinations: ${hrefs.join(" ")}`).toBe(hrefs.length);
    await close();
  }
});

test("B-4 (6.1). the provider offers a service and makes it discoverable", async ({ browser }) => {
  test.skip(!J13, "J-13 needs the provider and the non-buyer sessions (slots worker, freshworker)");
  const { page, close } = await as(browser, false, "worker");
  watch(page, "provider");
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
  // The visibility line renders for a draft too; wait until it says others
  // can find it, so the context never closes while the publish is in flight.
  // The publish can queue behind the save's refresh (prod-marketplace run
  // 41721656743), so re-click if it never lands.
  await expect(async () => {
    if (!/aktyv|active/i.test(await status.innerText())) {
      await page.getByTestId(`service-offering-toggle-${serviceId}`).click();
    }
    await expect(page.getByTestId(`service-offering-discoverability-${serviceId}`)).toHaveAttribute(
      "data-visibility",
      "visible",
      { timeout: 10_000 },
    );
  }).toPass({ timeout: 45_000 });
  await close();
});

test("B-5 (6.4). a non-customer discovers buying and becomes a customer through the shipped UI", async ({ browser }) => {
  test.skip(!J13, "J-13 needs the provider and the non-buyer sessions (slots worker, freshworker)");
  const { page, close } = await as(browser, false, "freshworker");
  watch(page, "non-buyer");
  await page.goto("/lt/dashboard/buyer");
  await settle(page);
  await passOnboarding(page, "non-buyer", "QA-SYNTHETIC Naujas pirkėjas");
  await page.goto("/lt/dashboard/buyer");
  await settle(page);
  if (/\/dashboard\/buyer$/.test(new URL(page.url()).pathname)) {
    // The role is additive and stays: an earlier run already converted this
    // account. Said plainly; the rest of the journey is still proven.
    console.info("[non-buyer] already a customer (converted by an earlier run)");
  } else {
    const notice = page.getByTestId("access-refusal-notice");
    await expect(notice, "the refusal names the missing space instead of a silent bounce").toBeVisible({ timeout: 30_000 });
    // The redirect carries the token (`require-role.ts`); the notice exposes
    // the parsed role (`lib/auth/access-notice.ts`), never the raw token.
    expect(new URL(page.url()).searchParams.get("notice")).toBe("needs_customer_role");
    await expect(notice).toHaveAttribute("data-reason", "customer");
    // Discovery: the service loop (the home chat's door for a needed service)
    // offers the buyer lane — the setup hub's own form.
    await page.goto("/lt/dashboard/service-requests");
    await settle(page);
    await page.getByTestId("marketplace-connection-buyer").click();
    await page.waitForURL(/\/dashboard\/start\/buyer/, { timeout: 30_000 });
    console.info("[non-buyer] reached the buyer lane from the service loop");
  }
  await page.goto("/lt/dashboard/start/buyer");
  await settle(page);
  await expect(page.getByTestId("buyer-setup-form")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("buyer-setup-contact-name").fill("QA-SYNTHETIC Naujas pirkėjas");
  await page.getByTestId("buyer-setup-country").fill("Lietuva");
  await page.getByTestId("buyer-setup-need-summary").fill(`${NOTE}: J-13 testinis užsakovas.`);
  await page.getByTestId("buyer-setup-submit").click();
  await expect(page.getByTestId("buyer-setup-result")).toBeVisible({ timeout: 30_000 });
  await page.goto("/lt/dashboard/buyer");
  await settle(page);
  expect(new URL(page.url()).pathname, "the saved customer record opens the buyer workspace").toMatch(/\/dashboard\/buyer$/);
  await expect(page.getByTestId("buyer-dashboard-customer-state")).toContainText("QA-SYNTHETIC Naujas pirkėjas", { timeout: 30_000 });
  console.info(`[non-buyer] customer workspace open (${RUN})`);
  await close();
});

test("B-6 (6.4 → 6.1). the new customer finds the provider from the workspace, requests it, sees it listed", async ({ browser }) => {
  test.skip(!J13 || !serviceId, "needs B-4's service and B-5's customer");
  const { page, close } = await as(browser, false, "freshworker");
  watch(page, "non-buyer");
  await page.goto("/lt/dashboard/buyer");
  await settle(page);
  await page.getByTestId("buyer-dashboard-find-provider").click();
  await page.waitForURL(/\/dashboard\/service-requests/, { timeout: 30_000 });
  const offer = page.getByTestId("marketplace-offer-row").filter({ hasText: SERVICE }).first();
  await expect(offer, "the provider's active service is discoverable").toBeVisible({ timeout: 30_000 });
  await offer.getByTestId("marketplace-offer-message").fill(`${NOTE}: vonia 6 m² (J-13 testas)`);
  await offer.getByTestId("marketplace-offer-request").click();
  await expect(offer.getByTestId("marketplace-offer-requested")).toBeVisible({ timeout: 30_000 });
  requested = true;
  await page.reload();
  await settle(page);
  const out = page.getByTestId("marketplace-outgoing-row").filter({ hasText: SERVICE });
  await expect(out, "the request is in the customer's own list exactly once").toHaveCount(1, { timeout: 30_000 });
  console.info(`[non-buyer] request sent and listed once (${RUN})`);
  await close();
});

test("B-7. the buyer workspace and the request list fit a 390 px phone", async ({ browser }) => {
  test.skip(!J13 || !requested, "needs B-6's request");
  const { page, close } = await as(browser, true, "freshworker");
  watch(page, "non-buyer phone");
  for (const path of ["/lt/dashboard/buyer", "/lt/dashboard/service-requests"]) {
    await page.goto(path);
    await settle(page);
    const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    console.info(`[non-buyer] ${path} phone scrollWidth=${scroll} innerWidth=${inner}`);
    expect(scroll, `${path} is wider than a 390 px phone`).toBeLessThanOrEqual(inner + 1);
  }
  await expect(page.getByTestId("marketplace-outgoing-row").filter({ hasText: SERVICE })).toHaveCount(1, { timeout: 30_000 });
  await close();
});

test("B-8. no console error and no refused (401/403) answer on the J-13 pages", async () => {
  test.skip(!J13, "J-13 needs the provider and the non-buyer sessions (slots worker, freshworker)");
  console.info(`[j13] faults: ${faults.length}`);
  expect(faults, faults.join("\n")).toEqual([]);
});

/** A cleanup problem is reported, never turned into the walk's verdict. */
function reportCleanupProblem(failed: string[]): void {
  const line = `cleanup NOT finished: ${failed.join(", ")} (synthetic rows may still be open)`;
  console.info(`[cleanup] ${line}`);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (!summary) return;
  try {
    appendFileSync(summary, `buyer-workspace ${line}\n`);
  } catch {
    // The log line above already carries it.
  }
}

test.afterAll(async ({ browser }) => {
  if (!J13) return;
  test.setTimeout(240_000);
  const jobs: { what: string; who: string; skip: boolean; run: (p: Page) => Promise<string> }[] = [
    {
      what: "J-13 request",
      who: "freshworker",
      skip: false,
      run: async (p) => {
        await p.goto("/lt/dashboard/service-requests");
        const open = p
          .getByTestId("marketplace-outgoing-row")
          .filter({ hasText: SERVICE })
          .filter({ has: p.getByTestId("marketplace-outgoing-withdraw") });
        if ((await open.count()) === 0) return "nothing open";
        await open.first().getByTestId("marketplace-outgoing-withdraw").click();
        await expect(open).toHaveCount(0, { timeout: 30_000 });
        return "withdrawn";
      },
    },
    {
      what: "J-13 service",
      who: "worker",
      skip: !serviceId,
      run: async (p) => {
        await p.goto("/lt/dashboard/services");
        const main = p.getByRole("main");
        const status = main.getByTestId(`service-offering-status-${serviceId}`);
        await expect(status).toBeVisible({ timeout: 30_000 });
        if (/aktyv|active/i.test(await status.innerText())) {
          await main.getByTestId(`service-offering-toggle-${serviceId}`).click();
          await expect(status).not.toHaveText(/aktyv|active/i, { timeout: 30_000 });
        }
        return "paused";
      },
    },
  ];
  const failed: string[] = [];
  for (const job of jobs) {
    if (job.skip) continue;
    const { page, close } = await as(browser, false, job.who);
    try {
      console.info(`[cleanup] ${job.what}: ${await job.run(page)}`);
    } catch (e) {
      console.info(`[cleanup] ${job.what}: NOT done (${(e as Error).message.split("\n")[0].slice(0, 160)})`);
      failed.push(job.what);
    } finally {
      await close();
    }
  }
  if (failed.length > 0) reportCleanupProblem(failed);
});
