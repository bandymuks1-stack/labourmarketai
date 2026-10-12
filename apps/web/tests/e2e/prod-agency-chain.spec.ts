import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * PRODUCTION AGENCY CHAIN — owner programme 2026-10-12 §3B: an agency sets up
 * its organization, brings a person onto its roster, connects a client, sees
 * the client's shared need, offers its person, the client answers, and the
 * agency sees the outcome and can talk to the client.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=agency-chain) with
 * the synthetic cast:
 *   agency  qa.agency+multiw  — sets up "QA-SYNTHETIC Agentūra" (once; later runs reuse it)
 *   worker  qa.worker+multiw  — Vytas Darbininkas, joins the agency roster
 *   owner   qa.owner+multiw   — QA-SYNTHETIC Alfa, the client
 * Every step is idempotent: a rerun finds the org, roster link and active
 * connection from earlier runs and continues from there.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const AGENCY = "QA-SYNTHETIC Agentūra";
const ALFA = "QA-SYNTHETIC Alfa";
const OWNER_EMAIL = "qa.owner+multiw@labourmarket.ai";
const WORKER_EMAIL = "qa.worker+multiw@labourmarket.ai";
const NEED_ROLE = `QA-SYNTHETIC suvirintojai ${RUN}`;
const MSG = `QA-SYNTHETIC ${RUN}: kada galėtų pradėti?`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["agency", "worker", "owner"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

async function as(browser: Browser, slot: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ storageState: state(slot), locale: "lt-LT" });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

async function workspace(page: Page, orgName: string): Promise<boolean> {
  const chip = page.getByTestId("workspace-chip").first();
  if (!(await chip.waitFor({ state: "visible", timeout: 30_000 }).then(() => true, () => false))) return false;
  if ((await chip.innerText()).includes(orgName)) return true;
  await chip.getByRole("button").first().click();
  const option = page.getByTestId("workspace-chip-menu").locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first();
  if (!(await option.waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false))) {
    await page.keyboard.press("Escape");
    return false;
  }
  await option.click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
  return true;
}

let requestId = "";

test("A-1. the agency has its own organization (set up once, through the product)", async ({ browser }) => {
  const { page, close } = await as(browser, "agency");
  await page.goto("/lt/dashboard");
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  if (/\/onboarding/.test(page.url())) {
    console.info("[agency] first sign-in: onboarding");
    await page.getByTestId("onboarding-intent-agency").click();
    await page.getByTestId("onboarding-intents-continue").click();
    await page.getByTestId("onboarding-country").click();
    await page.locator("[data-testid$='country-search']").first().fill("Lietuva");
    await page.getByRole("option", { name: /Lietuva/ }).first().click();
    await page.getByTestId("onboarding-submit").click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  }
  await page.goto("/lt/dashboard");
  if (!(await workspace(page, AGENCY))) {
    console.info("[agency] creating the agency organization");
    await page.goto("/lt/dashboard/start/company?type=staffing_agency");
    await page.getByTestId("company-setup-legal-name").fill(AGENCY);
    await page.getByTestId("company-setup-country").selectOption("LT");
    await page.getByTestId("company-setup-save-draft").click();
    await expect(page.getByTestId("company-setup-result")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("company-setup-go-workspace").click();
    await page.goto("/lt/dashboard");
    expect(await workspace(page, AGENCY), "the new agency is the workspace").toBe(true);
  }
  await page.goto("/lt/dashboard/company/partners");
  await expect(page.getByTestId("agency-bridge-section")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("agency-bridge-gated")).toHaveCount(0);
  await close();
});

test("A-2. the agency puts a person on its roster; the person accepts", async ({ browser }) => {
  const agency = await as(browser, "agency");
  await agency.page.goto("/lt/dashboard");
  await workspace(agency.page, AGENCY);
  await agency.page.goto("/lt/dashboard/company/people#company-team");
  const linked = agency.page.locator('[data-testid^="company-worker-row-"]', { hasText: /Vytas/ });
  if ((await linked.count()) === 0) {
    await agency.page.getByTestId("company-workers-invite-email").fill(WORKER_EMAIL);
    await agency.page.getByTestId("company-workers-invite-submit").click();
    const result = agency.page.getByTestId("company-workers-invite-result");
    await expect(result).toBeVisible({ timeout: 30_000 });
    console.info(`[agency] roster invite: ${await result.innerText()}`);
    const link = await agency.page.getByTestId("company-workers-invite-link").isVisible().catch(() => false);
    console.info(`[agency] hand-over link shown: ${link}`);

    const worker = await as(browser, "worker");
    await worker.page.goto("/lt/dashboard");
    const accept = worker.page.locator('[data-testid^="worker-invitation-accept-company-"]').first();
    await expect(accept).toBeVisible({ timeout: 30_000 });
    await accept.click();
    await expect(worker.page.locator('[data-testid^="worker-invitation-accept-company-"]')).toHaveCount(0, { timeout: 30_000 });
    await worker.close();
    await agency.page.reload();
  }
  await expect(linked.first()).toBeVisible({ timeout: 30_000 });
  await agency.close();
});

test("A-3. the agency connects the client (link), the client accepts", async ({ browser }) => {
  const agency = await as(browser, "agency");
  await agency.page.goto("/lt/dashboard");
  await workspace(agency.page, AGENCY);
  await agency.page.goto("/lt/dashboard/company/partners");
  const rows = agency.page.getByTestId("agency-bridge-connection-row").filter({ hasText: /Alfa|qa\.owner/ });
  const active = rows.filter({ has: agency.page.locator('[data-testid^="agency-bridge-message-"]') });
  if ((await active.count()) > 0) {
    console.info("[agency] connection with Alfa already active");
    await agency.close();
    return;
  }
  let link = "";
  if ((await rows.count()) === 0) {
    await agency.page.getByTestId("agency-bridge-invite-form").locator('input[name="email"]').fill(OWNER_EMAIL);
    await agency.page.getByTestId("agency-bridge-invite-submit").click();
    await expect(agency.page.getByTestId("agency-bridge-delivery")).toBeVisible({ timeout: 30_000 });
    link = (await agency.page.getByTestId("agency-bridge-invite-link").inputValue().catch(() => "")) ?? "";
  } else {
    // Pending from an earlier run: ask for a fresh link to hand over.
    const getLink = rows.first().locator('[data-testid^="agency-bridge-get-link-"], [data-testid^="agency-bridge-new-link-"]').first();
    if (await getLink.isVisible().catch(() => false)) {
      await getLink.click();
      link = (await agency.page.getByTestId("agency-bridge-invite-link").inputValue({ timeout: 30_000 }).catch(() => "")) ?? "";
    }
  }
  console.info(`[agency] client invitation link handed over: ${link ? "yes" : "no"}`);
  await agency.close();

  const owner = await as(browser, "owner");
  if (link) {
    await owner.page.goto(new URL(link).pathname);
    const accept = owner.page.getByTestId("invite-accept");
    if (await accept.waitFor({ state: "visible", timeout: 20_000 }).then(() => true, () => false)) {
      await accept.click();
      await owner.page.waitForURL(/partners/, { timeout: 30_000 }).catch(() => undefined);
    }
  }
  await owner.page.goto("/lt/dashboard");
  await workspace(owner.page, ALFA);
  await owner.page.goto("/lt/dashboard/company/partners");
  const invite = owner.page.getByTestId("client-bridge-invite-row").filter({ hasText: /Agentūra/ }).first();
  await expect(invite).toBeVisible({ timeout: 30_000 });
  await invite.locator('[data-testid^="client-bridge-accept-"]').click();
  await expect(owner.page.getByTestId("client-bridge-active-row").filter({ hasText: /Agentūra/ })).toBeVisible({ timeout: 30_000 });
  await owner.close();
});

test("A-4. the client posts a need and shares it with the agency", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, ALFA);
  await page.goto("/lt/dashboard/company/needs?audience=need#demand-intake");
  await page.getByTestId("demand-role").fill(NEED_ROLE);
  await page.getByTestId("demand-description").fill(`QA-SYNTHETIC ${RUN}: synthetic need for the production agency walk, 1 person.`);
  await page.getByTestId("demand-next").click();
  const size = page.getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("1");
  await page.getByTestId("demand-next").click();
  await page.getByTestId("demand-create").click();
  const done = page.getByTestId("demand-done");
  const limit = page.getByTestId("demand-open-need-limit");
  await expect(done.or(limit)).toBeVisible({ timeout: 30_000 });
  console.info(`[agency] client need: ${(await done.isVisible()) ? "created" : "open-need limit — the open need is shared"}`);

  await page.goto("/lt/dashboard/company/partners");
  const activeRow = page.getByTestId("client-bridge-active-row").filter({ hasText: /Agentūra/ }).first();
  await expect(activeRow).toBeVisible({ timeout: 30_000 });
  const shared = activeRow.getByTestId("client-bridge-shared-row");
  const form = activeRow.getByTestId("client-bridge-share-form");
  if (await form.isVisible().catch(() => false)) {
    const select = form.locator('select[name="requestId"]');
    const options = await select.locator("option").evaluateAll((os) =>
      (os as HTMLOptionElement[]).filter((o) => o.value).map((o) => ({ v: o.value, t: o.textContent ?? "" })),
    );
    const pick = options.find((o) => o.t.includes(RUN)) ?? options[0];
    if (pick) {
      requestId = pick.v;
      await select.selectOption(pick.v);
      await form.getByTestId("client-bridge-share-submit").click();
      await expect(shared.first()).toBeVisible({ timeout: 30_000 });
    }
  }
  expect(await shared.count(), "a need is shared with the agency").toBeGreaterThan(0);
  console.info(`[agency] shared request ${requestId || "(earlier share)"}`);
  await close();
});

test("A-5. the agency sees the shared need and offers its person", async ({ browser }) => {
  const { page, close } = await as(browser, "agency");
  await page.goto("/lt/dashboard");
  await workspace(page, AGENCY);
  await page.goto("/lt/dashboard/company/partners");
  const row = page.getByTestId("agency-bridge-shared-row").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const form = row.getByTestId("agency-bridge-offer-form");
  await expect(form, "the roster person can be offered").toBeVisible({ timeout: 20_000 });
  const select = form.locator('select[name="workerId"]');
  const value = await select.locator("option", { hasText: /Vytas/ }).first().getAttribute("value");
  expect(value).toBeTruthy();
  await select.selectOption(value!);
  await form.locator('input[name="note"]').fill(`QA-SYNTHETIC ${RUN}: gali pradėti nuo pirmadienio`);
  await form.getByTestId("agency-bridge-offer-submit").click();
  await page.waitForTimeout(5_000);
  const error = page.getByTestId("agency-bridge-error");
  if (await error.isVisible().catch(() => false)) console.info(`[agency] offer answer: ${await error.innerText()}`);
  await page.reload();
  const progress = page.getByTestId("agency-bridge-progress");
  await expect(progress).toBeVisible({ timeout: 30_000 });
  console.info(`[agency] progress: ${(await progress.innerText()).replace(/\s+/g, " ").slice(0, 400)}`);
  await expect(page.getByTestId("agency-bridge-progress-row").first()).toBeVisible({ timeout: 30_000 });
  await close();
});

test("A-6. the client answers the offer", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, ALFA);
  await page.goto(`/lt/dashboard/company/scouting${requestId ? `?request=${requestId}` : ""}`);
  const offers = page.getByTestId("scouting-agency-offers");
  await expect(offers).toBeVisible({ timeout: 30_000 });
  const accept = offers.locator('[data-testid^="offer-accept-"]').first();
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await expect(page.getByTestId("offer-decision-done")).toBeVisible({ timeout: 30_000 });
  } else {
    console.info("[agency] no open offer to answer (decided in an earlier run)");
  }
  await close();
});

test("A-7. the agency sees the decision and talks to the client in one thread", async ({ browser }) => {
  const { page, close } = await as(browser, "agency");
  await page.goto("/lt/dashboard");
  await workspace(page, AGENCY);
  await page.goto("/lt/dashboard/company/partners");
  await expect(page.locator('[data-testid^="agency-bridge-decision-"]').first()).toBeVisible({ timeout: 30_000 });
  console.info(`[agency] decision: ${await page.locator('[data-testid^="agency-bridge-decision-"]').first().getAttribute("data-testid")}`);
  const conn = page.getByTestId("agency-bridge-connection-row").filter({ hasText: /Alfa|qa\.owner/ }).first();
  await conn.locator('[data-testid^="agency-bridge-message-"]').click();
  await page.waitForURL(/\/dashboard\/communication\//, { timeout: 30_000 });
  const input = page.getByTestId("communication-composer-input");
  await input.fill(MSG);
  await input.locator("xpath=ancestor::form").locator('button[type="submit"]').click();
  await expect(input).toHaveValue("", { timeout: 20_000 });
  await expect(page.locator("main")).toContainText(MSG, { timeout: 20_000 });
  await close();
});
