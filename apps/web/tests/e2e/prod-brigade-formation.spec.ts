import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * PRODUCTION BRIGADE FORMATION — owner programme 2026-10-12, P0 §3.
 *
 * Runs ONLY inside `.github/workflows/prod-qa-walk.yml` (PROD_QA_WALK=1) against
 * https://labourmarket.ai with sessions minted for the hard-coded synthetic
 * cast (`lib/testing/prod-qa-guard.ts`). No service-role call is made here: every
 * step is what a person does in the browser, and every assertion is what that
 * person sees.
 *
 * Cast (all `app_metadata.qa_synthetic`, organizations named QA-SYNTHETIC):
 *   owner    qa.owner+multiw   — owns "QA-SYNTHETIC Alfa"; creates the brigade
 *   worker   qa.worker+multiw  — employee of Alfa; invited, accepts (desktop)
 *   worker2  qa.worker+goal3   — employee of Alfa; invited, accepts (mobile)
 *   manager  qa.manager+multiw — owns "QA-SYNTHETIC Gama", NOT Alfa → must not see it
 *
 * The brigade is named "QA-SYNTHETIC Brigada <run>", so every metric and
 * monitor classifies it TEST, never REAL market data.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const TEAM = `QA-SYNTHETIC Brigada ${RUN}`;
const ALFA = "QA-SYNTHETIC Alfa";
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["owner", "worker", "worker2", "manager"].every((s) => existsSync(state(s)));

test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");

async function as(browser: Browser, slot: string, mobile = false): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    storageState: state(slot),
    locale: "lt-LT",
    ...(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}),
  });
  return { ctx, page: await ctx.newPage() };
}

/** Make `orgName` the active workspace through the real header chip. */
async function useWorkspace(page: Page, orgName: string): Promise<void> {
  await page.goto("/lt/dashboard/company/people");
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if ((await chip.innerText()).includes(orgName)) return;
  await chip.getByRole("button").first().click();
  const menu = page.getByTestId("workspace-chip-menu");
  await menu.locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first().click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
  await page.goto("/lt/dashboard/company/people");
}

const links: Record<string, string> = {};
let teamTestId = "";

test("1-2. owner creates the brigade in Alfa", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await expect(page.getByTestId("team-brigades-panel")).toBeVisible();
  await page.getByTestId("team-create-name").fill(TEAM);
  await page.getByTestId("team-create-submit").click();
  const card = page.locator('[data-testid^="team-brigade-"]', { hasText: TEAM });
  await expect(card).toBeVisible({ timeout: 20_000 });
  teamTestId = (await card.getAttribute("data-testid"))!;
  await ctx.close();
});

// Synthetic display names (profiles of the allowlisted cast) and the address
// each one accepts with — typed only if the product asks for it.
for (const [slot, who, email] of [
  ["worker", /Vytas Darbininkas/, "qa.worker+multiw@labourmarket.ai"],
  ["worker2", /QA-SYNTHETIC Worker/, "qa.worker+goal3@labourmarket.ai"],
] as const) {
  test(`3-4. owner invites ${slot} and gets a working link (e-mail is off)`, async ({ browser }) => {
    const { ctx, page } = await as(browser, "owner");
    await useWorkspace(page, ALFA);
    const card = page.getByTestId(teamTestId);
    const teamId = teamTestId.replace("team-brigade-", "");
    const select = page.locator(`[id="team-add-${teamId}"]`);
    await select.waitFor({ state: "attached", timeout: 30_000 }).catch(() => undefined);
    if (!(await select.count())) {
      throw new Error(`no addable-member picker on the brigade card; card ends: ${(await card.innerText()).slice(-700)}`);
    }
    const options = await select.locator("option").allInnerTexts();
    const pick = options.find((o) => who.test(o));
    expect(pick, `addable list offers ${slot}: ${options.join(" | ")}`).toBeTruthy();
    await select.selectOption({ label: pick! });
    await page.getByTestId(`team-invite-member-${teamId}`).click();
    // The owner may not be able to read the worker's address (profiles are
    // own-row only); the product then asks for it and the owner types it.
    const typed = page.getByTestId(`team-invite-email-${teamId}`);
    const asked = await Promise.race([
      typed.waitFor({ state: "visible", timeout: 20_000 }).then(() => true),
      page.getByTestId("team-invite-link").waitFor({ state: "visible", timeout: 20_000 }).then(() => false),
    ]).catch(() => false);
    if (asked) {
      await typed.fill(email);
      await page.getByTestId(`team-invite-member-${teamId}`).click();
    }
    const box = page.getByTestId("team-invite-link");
    if (!(await box.waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false))) {
      const msg = await page.getByTestId("team-brigades-msg").innerText().catch(() => "(no message)");
      throw new Error(`no invite link; the product said: ${msg}`);
    }
    const url = (await box.locator("code").innerText()).trim();
    expect(url).toMatch(/^https:\/\/labourmarket\.ai\/[a-z]{2}\/invite\//);
    links[slot] = url;
    await ctx.close();
  });
}

test("5-7. each worker opens the link, accepts, and is in the brigade (desktop + mobile)", async ({ browser }) => {
  for (const [slot, mobile] of [
    ["worker", false],
    ["worker2", true],
  ] as const) {
    const { ctx, page } = await as(browser, slot, mobile);
    await page.goto(links[slot]!);
    await expect(page.getByTestId("invite-page")).toBeVisible();
    await expect(page.getByTestId("invite-org")).toContainText("QA-SYNTHETIC Brigada");
    await page.getByTestId("invite-accept").click();
    // Accepting lands the person in their workspace with a notice.
    await page.waitForURL((u) => !u.pathname.includes("/invite/"), { timeout: 30_000 });
    console.info(`[brigade] ${slot} landed on ${new URL(page.url()).pathname}${new URL(page.url()).search}`);
    // Re-opening the same link is now closed, not a second membership.
    await page.goto(links[slot]!);
    await expect(page.getByTestId("invite-accepted-by-you").or(page.getByTestId("invite-closed"))).toBeVisible();
    await ctx.close();
  }
});

test("8-9. the owner sees both members, joined by their own acceptance", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  const card = page.getByTestId(teamTestId);
  await expect(card).toContainText(/2/);
  await expect(card.locator("li .text-state-success")).toHaveCount(2);
  await ctx.close();
});

test("org isolation: the owner of another company does not see Alfa's brigade", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await page.goto("/lt/dashboard/company/people");
  await expect(page.locator("body")).not.toContainText(TEAM);
  await ctx.close();
});

test("14. persistence: a brand-new owner session still shows the brigade with both members", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await expect(page.getByTestId(teamTestId)).toContainText(TEAM);
  await expect(page.getByTestId(teamTestId).locator("li .text-state-success")).toHaveCount(2);
  await ctx.close();
});

// ── §4 B2B: a buyer's need → the brigade offers → both talk → agreed in principle ──
//
// The buyer is QA-SYNTHETIC Gama (qa.manager, verified). Its need is labelled
// with the run id so the brigade picks exactly this need and never a real
// company's. "Accepted" is AGREED IN PRINCIPLE, not a contract.
const NEED_ROLE = `QA-SYNTHETIC murininkai ${RUN}`;
const GAMA = "QA-SYNTHETIC Gama";
let needId = "";
let offerId = "";

test("B2B-1. buyer (Gama) posts a need through the company demand intake", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto("/lt/dashboard/company/needs?audience=need#demand-intake");
  await page.getByTestId("demand-role").fill(NEED_ROLE);
  await page.getByTestId("demand-description").fill(`QA-SYNTHETIC ${RUN}: synthetic need for the production brigade walk, 2 people.`);
  await page.getByTestId("demand-next").click();
  const size = page.getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("2");
  await page.getByTestId("demand-next").click();
  await page.getByTestId("demand-create").click();
  await expect(page.getByTestId("demand-done")).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("B2B-2. the brigade (2 members) offers itself against exactly that need", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  const teamId = teamTestId.replace("team-brigade-", "");
  // The offer form is folded; opening it loads the offerable needs.
  await page.getByTestId(`team-demand-offer-section-${teamId}`).locator("summary").click();
  const select = page.getByTestId(`team-offer-demand-${teamId}`);
  await expect(select).toBeVisible({ timeout: 20_000 });
  const option = select.locator("option", { hasText: NEED_ROLE }).first();
  needId = (await option.getAttribute("value")) ?? "";
  expect(needId, "the brigade sees the buyer need by its name").not.toBe("");
  await select.selectOption(needId);
  await page.getByTestId(`team-offer-note-${teamId}`).fill("QA-SYNTHETIC offer: 2 people, from next month.");
  await page.getByTestId(`team-offer-submit-${teamId}`).click();
  await expect(page.getByTestId(`team-offer-sent-${teamId}`)).toContainText(NEED_ROLE, { timeout: 20_000 });
  await ctx.close();
});

test("B2B-3. buyer sees the offer, opens the thread, writes, and agrees in principle", async ({ browser }) => {
  const { ctx, page } = await as(browser, "manager");
  await useWorkspace(page, GAMA);
  await page.goto(`/lt/dashboard/company/scouting?request=${needId}`);
  const received = page.locator('[data-testid^="team-offer-received-"]', { hasText: "QA-SYNTHETIC Brigada" });
  await expect(received).toBeVisible({ timeout: 20_000 });
  offerId = (await received.getAttribute("data-testid"))!.replace("team-offer-received-", "");
  await page.getByTestId(`team-offer-message-${offerId}`).click();
  await page.waitForURL(/\/dashboard\/communication/, { timeout: 20_000 });
  await page.getByTestId("communication-composer-input").fill(`QA-SYNTHETIC ${RUN}: can you start on the 3rd?`);
  await page.getByRole("button", { name: /siųsti|send/i }).click();
  await expect(page.locator("body")).toContainText(`QA-SYNTHETIC ${RUN}: can you start on the 3rd?`, { timeout: 20_000 });
  await page.goto(`/lt/dashboard/company/scouting?request=${needId}`);
  await page.getByTestId(`team-offer-accept-${offerId}`).click();
  await expect(page.getByTestId(`team-offer-received-${offerId}`)).toContainText(/iš esmės|in principle/i, { timeout: 20_000 });
  await ctx.close();
});

test("B2B-4. the supplier sees the buyer's message and the agreed state; it survives a new session", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  const teamId = teamTestId.replace("team-brigade-", "");
  await expect(page.getByTestId(`team-offer-sent-${teamId}`)).toContainText(/iš esmės|in principle|priimt/i);
  await page.getByTestId(`team-offer-sent-message-${offerId}`).click();
  await page.waitForURL(/\/dashboard\/communication/, { timeout: 20_000 });
  await expect(page.locator("body")).toContainText(`QA-SYNTHETIC ${RUN}: can you start on the 3rd?`);
  await ctx.close();
});
