import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * PRODUCTION — THE REVIEW SENTENCE ON EVERY STAFF ACCEPT PATH (owner decision
 * 1, 2026-10-12). Before the automation may switch work review on, every
 * surface that accepts a staff invitation must show the person, BEFORE they
 * accept, that a manager of that organization can read and sign off the work
 * they record — and must pass the notice version only then.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=staff-review-notice)
 * with the synthetic cast: QA-SYNTHETIC Alfa's owner invites the second
 * synthetic worker (addressed, three invitations), then:
 *   - a SIGNED-OUT browser opens one link: landing + signup form show the
 *     sentence (nothing is submitted — no account is created);
 *   - the worker accepts one on the invite page, one in the network list and
 *     one from the chat card, each showing the sentence first.
 * The onboarding finish needs a brand-new account and is a HUMAN check
 * (docs: the report's manual scenario), not claimed here.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const ALFA = "QA-SYNTHETIC Alfa";
const INVITEE = process.env.PROD_QA_INVITEE_EMAIL ?? "";
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" && INVITEE.length > 3 && ["owner", "worker2"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

async function as(browser: Browser, slot: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ storageState: state(slot), locale: "lt-LT" });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

async function workspace(page: Page, orgName: string): Promise<void> {
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if ((await chip.innerText()).includes(orgName)) return;
  await chip.getByRole("button").first().click();
  await page.getByTestId("workspace-chip-menu").locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first().click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
}

const links: string[] = [];

test("N-1. the employer invites the worker as staff, addressed, three times", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, ALFA);
  for (let i = 0; i < 3; i += 1) {
    await page.goto("/lt/dashboard/network");
    const open = page.getByTestId("invite-panel-open");
    if (await open.isVisible().catch(() => false)) await open.click();
    const type = page.getByTestId("invite-type");
    await expect(type).toBeVisible({ timeout: 30_000 });
    await type.selectOption("join_team");
    const emailMode = page.getByTestId("invite-mode-email");
    if (await emailMode.isVisible().catch(() => false)) await emailMode.click();
    const org = page.getByTestId("invite-organization");
    if (await org.isVisible().catch(() => false)) await org.selectOption({ label: ALFA }).catch(() => undefined);
    const capacity = page.getByTestId("invite-capacity");
    if (await capacity.isVisible().catch(() => false)) {
      const values = await capacity.locator("option").evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value));
      if (values.includes("employee")) await capacity.selectOption("employee");
    }
    await page.getByTestId("invite-emails").fill(INVITEE);
    const message = page.getByTestId("invite-message");
    if (await message.isVisible().catch(() => false)) await message.fill(`QA-SYNTHETIC ${RUN} #${i + 1}`);
    await page.getByTestId("invite-submit").click();
    const copy = page.getByTestId("invite-copy-link").first();
    const refused = page.locator('[data-testid^="invite-result-"]').filter({ hasNot: copy });
    await expect(copy.or(refused).first()).toBeVisible({ timeout: 30_000 });
    if (!(await copy.isVisible())) throw new Error(`invitation ${i + 1} not created: ${await page.getByTestId("invite-result").innerText()}`);
    const link = (await copy.getAttribute("data-invite-link")) ?? "";
    expect(link).toMatch(/\/invite\//);
    links.push(new URL(link).pathname);
  }
  await close();
});

test("N-2. signed out: the landing and the signup form show the sentence before anything is accepted", async ({ browser }) => {
  const ctx = await browser.newContext({ locale: "lt-LT" });
  const page = await ctx.newPage();
  await page.goto(links[0]);
  await expect(page.getByTestId("invite-anon-review-notice")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("invite-anon-review-notice")).toContainText(ALFA);
  await page.getByTestId("invite-register").click();
  await page.waitForURL(/\/auth\/signup/, { timeout: 30_000 });
  const notice = page.getByTestId("signup-review-notice");
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice).toContainText(ALFA);
  // Nothing is submitted: no account is created by this walk.
  await ctx.close();
});

test("N-3. the invite page shows it and the accept carries it", async ({ browser }) => {
  const { page, close } = await as(browser, "worker2");
  await page.goto(links[0]);
  const notice = page.getByTestId("invite-review-notice");
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice).toContainText(ALFA);
  await expect(page.locator('input[name="reviewNotice"]')).toHaveCount(1);
  await page.getByTestId("invite-accept").click();
  await page.waitForURL((u) => !u.pathname.includes("/invite/"), { timeout: 30_000 });
  await page.goto(links[0]);
  await expect(page.getByTestId("invite-accepted-by-you").or(page.getByTestId("invite-closed"))).toBeVisible({ timeout: 30_000 });
  await close();
});

test("N-4. the network list shows it on the row and the accept carries it", async ({ browser }) => {
  const { page, close } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/network");
  const notice = page.locator('[data-testid^="incoming-invitation-review-notice-"]').first();
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice).toContainText(ALFA);
  const id = (await notice.getAttribute("data-testid"))!.replace("incoming-invitation-review-notice-", "");
  await page.getByTestId(`incoming-invitation-accept-${id}`).click();
  await expect(page.getByTestId("incoming-invitations-notice")).toBeVisible({ timeout: 30_000 });
  console.info(`[review-notice] network accept: ${await page.getByTestId("incoming-invitations-notice").innerText()}`);
  await close();
});

test("N-5. the chat card shows it, and the confirmed accept carries it", async ({ browser }) => {
  const { page, close } = await as(browser, "worker2");
  await page.goto("/lt/dashboard");
  const composer = page.getByTestId("composer-input");
  await expect(composer).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  await composer.fill("Mano kvietimai");
  await page.getByTestId("composer-send").click();
  const card = page.getByTestId("conversation-invitation-action").filter({ has: page.getByTestId("conversation-invitation-review-notice") }).first();
  await expect(card).toBeVisible({ timeout: 45_000 });
  await expect(card.getByTestId("conversation-invitation-review-notice")).toContainText(ALFA);
  await card.getByTestId("conversation-invitation-accept").click();
  await card.getByTestId("conversation-invitation-confirm").click();
  const done = page.getByTestId("conversation-invitation-done").last();
  await expect(done).toBeVisible({ timeout: 45_000 });
  console.info(`[review-notice] chat accept outcome: ${await done.getAttribute("data-outcome")}`);
  await close();
});
