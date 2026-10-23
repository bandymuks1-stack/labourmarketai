import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "./prod-walk";

import { chooseWorkContextIfAsked } from "./worklog-context";

/**
 * PRODUCTION CHAT FIRST — ONE CONFIRMATION, ONE FACT (owner programme
 * 2026-10-12 §5): a worker tells the chat about their day, confirms it, and
 * a double-click, a reload and a second session never turn it into two
 * journal entries. The fact lands in the canonical journal (not only in the
 * chat transcript) and is still there in a brand-new session.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=chat-confirm-once)
 * with the synthetic worker (qa.worker+multiw).
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const TAG = `QA-SYNTHETIC ${RUN} chat`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state("worker"));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const entries = async (page: import("@playwright/test").Page) => {
  await page.goto("/lt/dashboard/journal");
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  return page.locator('[data-testid^="journal-entry-card-"]', { hasText: TAG }).count();
};

test("C-1. the day told to the chat is confirmed once and lands in the journal once", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: state("worker"), locale: "lt-LT" });
  const page = await ctx.newPage();
  await page.goto("/lt/dashboard");
  const composer = page.getByTestId("composer-input");
  await expect(composer).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  await composer.fill(`${TAG}: šiandien 7 valandas dirbau sandėlyje, komplektavau užsakymus`);
  await page.getByTestId("composer-send").click();
  const flow = page.getByTestId("worklog-flow").last();
  await expect(flow, "the chat recognises a work day and offers to record it").toBeVisible({ timeout: 45_000 });
  await chooseWorkContextIfAsked(page, /QA-SYNTHETIC Alfa/);
  await flow.getByTestId("worklog-save").click();
  // Double-click the confirmation: a consent gate must be single-use.
  await flow.getByTestId("worklog-confirm").dblclick();
  const done = page.getByTestId("worklog-done").last();
  const failed = page.getByTestId("worklog-error").or(page.getByTestId("worklog-blocked")).last();
  const settled = await expect(done.or(failed)).toBeVisible({ timeout: 45_000 }).then(() => true, () => false);
  if (settled && !(await done.isVisible())) throw new Error(`not saved: ${await failed.innerText()}`);
  if (!settled) console.info(`[chat] no done marker; chat tail: ${(await page.locator("main").innerText()).slice(-600)}`);
  expect(await entries(page), "exactly one journal entry after a double confirmation").toBe(1);
  // The transcript append is fire-and-forget; let it land before the session ends.
  await page.waitForTimeout(12_000);
  await ctx.close();
});

test("C-2. a new session sees the same single fact, and the conversation remembers it", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: state("worker"), locale: "lt-LT" });
  const page = await ctx.newPage();
  expect(await entries(page)).toBe(1);
  await page.goto("/lt/dashboard");
  // Earlier turns come back as ONE folded history block above the new chat.
  const block = page.getByTestId("chat-history-block");
  await expect(block).toBeVisible({ timeout: 30_000 });
  await block.getByRole("button").first().click();
  await expect(block).toContainText(TAG, { timeout: 30_000 });
  // Nothing re-executes on reload: still one entry.
  await page.reload();
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  expect(await entries(page)).toBe(1);
  await ctx.close();
});
