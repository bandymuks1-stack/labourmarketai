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

test.describe.configure({ mode: "serial" });
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");

async function as(browser: Browser, slot: string, mobile = false): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    storageState: state(slot),
    locale: "lt-LT",
    ...(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}),
  });
  return { ctx, page: await ctx.newPage() };
}

/** Make Alfa the owner's active workspace through the real switcher. */
async function useWorkspace(page: Page, orgName: string): Promise<void> {
  await page.goto("/lt/dashboard/company/people");
  const active = page.getByTestId("role-switcher-active-org");
  if ((await active.count()) && (await active.innerText()).includes(orgName)) return;
  await page.getByTestId("role-switcher-toggle").click();
  await page.getByTestId("org-switcher-list").getByRole("button", { name: new RegExp(orgName) }).click();
  await page.waitForLoadState("networkidle");
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

for (const [slot, who] of [
  ["worker", /worker\+multiw|QA.*worker/i],
  ["worker2", /goal3|QA.*worker/i],
] as const) {
  test(`3-4. owner invites ${slot} and gets a working link (e-mail is off)`, async ({ browser }) => {
    const { ctx, page } = await as(browser, "owner");
    await useWorkspace(page, ALFA);
    const card = page.getByTestId(teamTestId);
    const select = card.locator("select");
    const options = await select.locator("option").allInnerTexts();
    const pick = options.find((o) => who.test(o) && !links[o]);
    expect(pick, `addable list offers ${slot}: ${options.join(" | ")}`).toBeTruthy();
    await select.selectOption({ label: pick! });
    await card.getByTestId(teamTestId.replace("team-brigade-", "team-invite-member-")).click();
    const box = page.getByTestId("team-invite-link");
    await expect(box).toBeVisible({ timeout: 20_000 });
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
    await expect(page.getByTestId("invite-accepted-by-you")).toBeVisible({ timeout: 20_000 });
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
