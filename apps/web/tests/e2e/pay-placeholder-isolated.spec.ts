import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { BASE, isolatedStack, onboard, recordJournal, signIn, signUp } from "./isolated-web-a-helpers";

/**
 * NO EXAMPLE PAY FIGURES (decision 0032, lane A 2026-11-22), on the THROWAWAY
 * local stack of .github/workflows/signup-isolated.yml. Synthetic person only.
 *
 *   P-1 the Living CV work card (/dashboard/profile): the salary fields show
 *       their labels and no "1500" / "2500";
 *   P-2 the chat's work-card form ("I can work from Monday" opens it): the
 *       same — at 390 and 1280 px, screenshots in the `journal-day-choice`
 *       artifact (pay-*.png);
 *   P-3 rates and prices (owner-approved number clean-up): the public project
 *       cost calculator, the services page and the listings page carry no
 *       placeholder that names a sum of money, in any input in the markup.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const RUN = Date.now().toString(36);
const W = `pay-hint-${RUN}@example.test`;
const OUT = join(process.cwd(), "test-results", "journal-day-choice");
const SIZES = [
  { label: "390", width: 390, height: 844 },
  { label: "1280", width: 1280, height: 900 },
] as const;

async function noExampleFigures(page: Page, scope: ReturnType<Page["locator"]>, what: string): Promise<void> {
  const numbers = scope.locator('input[type="number"]');
  await expect(numbers.first(), `${what}: the salary fields are there`).toBeVisible({ timeout: 30_000 });
  const placeholders = await numbers.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).placeholder));
  for (const p of placeholders) expect(p, `${what}: no example figure`).not.toMatch(/^\d/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${what}: no sideways scroll`).toBeLessThanOrEqual(1);
}

test("P-0. a worker signs up", async ({ page }) => {
  await signUp(page, BASE, W);
  await onboard(page, "work", "Synthetic Pay Worker");
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  // Setup: one journal entry, so the Living CV has recorded work behind the card.
  await recordJournal(page, BASE, `QA-SYNTHETIC pay ${RUN}: tiled the bathroom floor for 6 hours`);
});

for (const size of SIZES) {
  test(`P-1/P-2 (${size.label}). the work card and the chat form show no example pay`, async ({ browser }) => {
    mkdirSync(OUT, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await signIn(page, BASE, W);

    // P-1 the Living CV work card. Its editor sits inside the profile's
    // closed "details" disclosure; the section's own deep link opens it
    // (DetailsHashOpener), as the other worker walks do. Required, never skipped.
    await page.goto(`${BASE}/en/dashboard/profile#work-card-editor-section`);
    const toggle = page.getByRole("main").getByTestId("work-card-editor-toggle");
    await expect(toggle, "P-1: the work card editor is on the worker's profile").toBeVisible({ timeout: 60_000 });
    const editor = page.getByRole("main").getByTestId("work-card-editor");
    await expect(async () => {
      if (!(await editor.isVisible())) await toggle.click();
      await expect(editor).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
    await editor.locator('input[name="salary_min"]').scrollIntoViewIfNeeded();
    await noExampleFigures(page, editor, `${size.label} work card`);
    await page.screenshot({ path: join(OUT, `pay-work-card-${size.label}.png`) });

    // P-2 the chat's work-card form.
    await page.goto(`${BASE}/en/dashboard`);
    const input = page.getByTestId("composer-input").filter({ visible: true }).first();
    const send = page.getByTestId("composer-send").filter({ visible: true }).first();
    await expect(input).toBeVisible({ timeout: 120_000 });
    await expect(async () => {
      await input.fill("I can work from Monday");
      await expect(send).toBeEnabled({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
    await send.click();
    const salary = page.getByLabel("Salary from (€)").filter({ visible: true }).last();
    await expect(salary, "P-2: the chat opens the work-card form").toBeVisible({ timeout: 60_000 });
    // The chat form is the inline action card (components/app/conversation/inline-action-form.tsx), not a <form>.
    const form = page
      .locator('[data-testid^="inline-action-form-"]')
      .filter({ has: page.getByTestId("field-salaryMin") })
      .filter({ visible: true })
      .last();
    await salary.scrollIntoViewIfNeeded();
    await noExampleFigures(page, form, `${size.label} chat work-card form`);
    await page.screenshot({ path: join(OUT, `pay-chat-form-${size.label}.png`) });
    await ctx.close();
  });
}

const MONEY = /(\d[\d\s.,]*\s*(€|eur\b|eur\/)|€\s*\d)/iu;

async function placeholders(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("input[placeholder], textarea[placeholder]")).map(
      (e) => (e as HTMLInputElement).placeholder,
    ),
  );
}

for (const size of SIZES) {
  test(`P-3 (${size.label}). rates and prices carry no example money`, async ({ browser }) => {
    mkdirSync(OUT, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    // The public calculator, signed out.
    await page.goto(`${BASE}/en/calculators/project-cost`);
    await page.waitForLoadState("networkidle").catch(() => {});
    expect((await placeholders(page)).filter((p) => MONEY.test(p)), `${size.label} calculator`).toEqual([]);
    await page.screenshot({ path: join(OUT, `pay-calculator-${size.label}.png`) });
    // The signed-in services and listings pages.
    await signIn(page, BASE, W);
    for (const path of ["/en/dashboard/services", "/en/dashboard/listings"]) {
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      const found = (await placeholders(page)).filter((p) => MONEY.test(p));
      test.info().annotations.push({ type: "evidence", description: `${size.label} ${path} → ${new URL(page.url()).pathname}` });
      expect(found, `${size.label} ${path}`).toEqual([]);
      await page.screenshot({ path: join(OUT, `pay-${path.split("/").pop()}-${size.label}.png`) });
    }
    await ctx.close();
  });
}
