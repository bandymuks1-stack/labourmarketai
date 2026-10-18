import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * PRODUCTION CHAT CONTINUITY — owner programme 2026-10-12 §4: a person must
 * not lose the conversation after a new session, and one workspace's thread
 * never shows in another (decision 0024; schema 20261012100000).
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=chat-continuity)
 * with the synthetic cast. It asks READ-ONLY questions, so the only write is
 * the person's own transcript.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["worker2", "owner"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });

async function open(browser: Browser, slot: string): Promise<{ close: () => Promise<void>; page: Page }> {
  const ctx = await browser.newContext({ storageState: state(slot), locale: "lt-LT" });
  const page = await ctx.newPage();
  await page.goto("/lt/dashboard");
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });
  return { close: () => ctx.close(), page };
}

async function say(page: Page, text: string): Promise<void> {
  await page.getByTestId("composer-input").fill(text);
  await page.getByTestId("composer-send").click();
  await expect(page.locator("body")).toContainText(text, { timeout: 20_000 });
  // Give the fire-and-forget append time to land before the context closes.
  await page.waitForTimeout(12_000);
}

async function history(page: Page): Promise<string> {
  const block = page.getByTestId("chat-history-block");
  if (!(await block.waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false))) return "";
  const show = block.getByRole("button").first();
  if (await show.isVisible().catch(() => false)) await show.click();
  return block.innerText();
}

async function useWorkspace(page: Page, orgName: string): Promise<void> {
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if ((await chip.innerText()).includes(orgName)) return;
  await chip.getByRole("button").first().click();
  await page.getByTestId("workspace-chip-menu").locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first().click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
  await page.goto("/lt/dashboard");
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });
}

const WORKER_LINE = `QA-SYNTHETIC ${RUN}: kas mano kalendoriuje šią savaitę?`;
const ALFA_LINE = `QA-SYNTHETIC ${RUN}: kiek žmonių dirba Alfa šiandien?`;

test("a worker's question is still there after a brand-new session", async ({ browser }) => {
  const first = await open(browser, "worker2");
  await say(first.page, WORKER_LINE);
  await first.close();

  const second = await open(browser, "worker2");
  expect(await history(second.page)).toContain(WORKER_LINE);
  await second.close();
});

test("a thread written in one workspace never shows in another", async ({ browser }) => {
  const a = await open(browser, "owner");
  await useWorkspace(a.page, "QA-SYNTHETIC Alfa");
  await say(a.page, ALFA_LINE);
  await a.close();

  const b = await open(browser, "owner");
  await useWorkspace(b.page, "QA-SYNTHETIC Beta");
  expect(await history(b.page)).not.toContain(ALFA_LINE);
  await useWorkspace(b.page, "QA-SYNTHETIC Alfa");
  expect(await history(b.page)).toContain(ALFA_LINE);
  await b.close();
});
