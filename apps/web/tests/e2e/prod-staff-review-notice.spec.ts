import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { inviteCapGate } from "./invite-cap";
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
 * synthetic worker (addressed; one invitation per path, since only one may be
 * pending per address), then:
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
const cap = inviteCapGate();
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

/**
 * ONE pending staff invitation per address is the product rule
 * (`duplicate_pending`), so every path gets its own invitation, created right
 * before that path accepts it. Answers the link, or null when one is already
 * pending for the address (then the pending one is what the next step accepts).
 */
async function inviteWorker(browser: Browser, tag: string): Promise<string | null> {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, ALFA);
  await page.goto("/lt/dashboard/network");
  // The panel renders closed (its title is the trigger) or already open;
  // wait for either before deciding — a not-yet-hydrated page shows neither.
  const open = page.getByTestId("invite-panel-open");
  const type = page.getByTestId("invite-type");
  await expect(open.or(type).first()).toBeVisible({ timeout: 30_000 });
  if (await open.isVisible().catch(() => false)) await open.click();
  await expect(type).toBeVisible({ timeout: 30_000 });
  await type.selectOption("join_team");
  const emailMode = page.getByTestId("invite-mode-email");
  if (await emailMode.isVisible().catch(() => false)) await emailMode.click();
  const org = page.getByTestId("invite-organization");
  if (await org.isVisible().catch(() => false)) {
    const value = await org.locator("option", { hasText: ALFA }).first().getAttribute("value");
    expect(value, "Alfa is one of the organizations the owner manages").toBeTruthy();
    await org.selectOption(value!);
  }
  const capacity = page.getByTestId("invite-capacity");
  if (await capacity.isVisible().catch(() => false)) {
    const values = await capacity.locator("option").evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value));
    if (values.includes("employee")) await capacity.selectOption("employee");
  }
  await page.getByTestId("invite-emails").fill(INVITEE);
  const message = page.getByTestId("invite-message");
  if (await message.isVisible().catch(() => false)) await message.fill(`QA-SYNTHETIC ${RUN} ${tag}`);
  await page.getByTestId("invite-submit").click();
  const copy = page.getByTestId("invite-copy-link").first();
  const duplicate = page.getByTestId("invite-result-duplicate_pending");
  await expect(copy.or(duplicate).first()).toBeVisible({ timeout: 30_000 }).catch(() => undefined);
  let link: string | null = null;
  if (await copy.isVisible().catch(() => false)) {
    link = new URL((await copy.getAttribute("data-invite-link")) ?? "").pathname;
  } else if (!(await duplicate.isVisible().catch(() => false))) {
    const answer = await page.getByTestId("invite-result").innerText().catch(() => "?");
    await close();
    cap.check(answer);
    throw new Error(`invitation ${tag} not created: ${await page.getByTestId("invite-result").innerText().catch(() => "?")}`);
  }
  console.info(`[review-notice] ${tag}: ${link ? "created" : "one already pending"}`);
  await close();
  return link;
}

let link = "";

test("N-1. the network list shows it on the row and the accept carries it", async ({ browser }) => {
  await inviteWorker(browser, "network");
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

test("N-2. signed out: the landing and the signup form show the sentence before anything is accepted", async ({ browser }) => {
  link = (await inviteWorker(browser, "invite-page")) ?? "";
  expect(link, "a fresh invitation link (the network step accepted the pending one)").toMatch(/\/invite\//);
  const ctx = await browser.newContext({ locale: "lt-LT" });
  const page = await ctx.newPage();
  await page.goto(link);
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
  await page.goto(link);
  const notice = page.getByTestId("invite-review-notice");
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(notice).toContainText(ALFA);
  await expect(page.locator('input[name="reviewNotice"]')).toHaveCount(1);
  await page.getByTestId("invite-accept").click();
  await page.waitForURL((u) => !u.pathname.includes("/invite/"), { timeout: 30_000 });
  await page.goto(link);
  await expect(page.getByTestId("invite-accepted-by-you").or(page.getByTestId("invite-closed"))).toBeVisible({ timeout: 30_000 });
  await close();
});

test("N-4. the chat card shows it, and the confirmed accept carries it", async ({ browser }) => {
  await inviteWorker(browser, "conversation");
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
