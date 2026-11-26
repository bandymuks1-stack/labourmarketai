import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { BASE, isolatedStack, lit, onboard, signIn, signUp, sql, userId } from "./isolated-web-a-helpers";

/**
 * WORK JOURNAL DATE CHOICE (owner P1, 2026-11-21) on the THROWAWAY local stack
 * of .github/workflows/signup-isolated.yml. Synthetic person only.
 *
 *   D-1 the journal opens with the day choice: Today is chosen, Yesterday,
 *       A week ago, Calendar and Earlier entries are offered;
 *   D-2 Yesterday: the recorder asks about that day, and the saved entry's
 *       work date is yesterday while it was created today (one history,
 *       decision 0025: the real work day and the creation time stay apart);
 *   D-3 Calendar: the native date picker takes a past day and the
 *       recorder follows it; a future day is not offered;
 *   D-4 Earlier entries leads to the entry list, where yesterday's entry is;
 *   D-5 screenshots at 375 and 1280 px (artifact `journal-day-choice`).
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const RUN = Date.now().toString(36);
const W = `day-choice-worker-${RUN}@example.test`;
const TEXT = `QA-SYNTHETIC day ${RUN}: tiled the bathroom floor`;
const OUT = join(process.cwd(), "test-results", "journal-day-choice");

const dateOf = (href: string | null): string | null => href?.match(/[?&]date=(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;

test("D-1..D-4. the journal opens with the day; yesterday's entry keeps its work date; calendar; earlier entries", async ({ page }) => {
  await signUp(page, BASE, W);
  await onboard(page, "work", "Synthetic Day Worker");
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  const me = await userId(W);

  await page.goto(`${BASE}/en/dashboard/journal`);
  const main = page.getByRole("main");
  const choice = main.getByTestId("journal-day-choice");
  await expect(choice, "D-1: the day choice is on the journal").toBeVisible({ timeout: 60_000 });
  await expect(choice).toHaveAttribute("data-choice", "today");
  await expect(main.getByTestId("journal-day-choice-today")).toHaveAttribute("aria-current", "date");
  for (const k of ["yesterday", "weekAgo", "other", "earlier"]) {
    await expect(main.getByTestId(`journal-day-choice-${k}`), `D-1: ${k} is offered`).toBeVisible();
  }

  const yesterday = dateOf(await main.getByTestId("journal-day-choice-yesterday").getAttribute("href"));
  const weekAgo = dateOf(await main.getByTestId("journal-day-choice-weekAgo").getAttribute("href"));
  expect(yesterday, "D-1: yesterday links to a day").toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(weekAgo, "D-1: a week ago links to a day").toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const today = new Date(Date.parse(`${yesterday}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  expect(new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10)).toBe(weekAgo);
  await expect(main.getByTestId("journal-day-choice-input"), "D-3: no future day").toHaveAttribute("max", today);

  // D-2 Yesterday.
  await main.getByTestId("journal-day-choice-yesterday").click();
  await page.waitForURL(new RegExp(`date=${yesterday}`), { timeout: 30_000 });
  await expect(main.getByTestId("journal-day-choice")).toHaveAttribute("data-choice", "yesterday");
  await expect(main.getByTestId("journal-quick-record-day"), "D-2: the recorder asks about yesterday").toHaveAttribute(
    "data-day",
    yesterday!,
  );
  await main.getByTestId("journal-quick-record-text").fill(TEXT);
  await main.getByTestId("journal-quick-record-understand").click();
  await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
  await main.getByTestId("worklog-save").click();
  await main.getByTestId("worklog-confirm").click();
  const done = main.getByTestId("worklog-done");
  await expect(done.or(main.getByTestId("worklog-error")).or(main.getByTestId("worklog-blocked"))).toBeVisible({ timeout: 30_000 });
  await expect(done, "D-2: the entry is saved").toBeVisible();
  await expect
    .poll(
      () =>
        sql<{ work_date: string; fresh: boolean }>(
          // The work day is the entry's `work_date` metric (lib/journal/actions.ts).
          `select m.value_text as work_date, (e.created_at > now() - interval '10 minutes') as fresh
             from public.journal_entries e join public.workers w on w.id = e.worker_id
             join public.journal_entry_metrics m on m.entry_id = e.id and m.metric_slug = 'work_date'
            where w.profile_id = ${lit(me)} and e.superseded_by is null and e.original_text like ${lit(`%${RUN}%`)}`,
        ),
      { message: "D-2: the entry's work date is yesterday and it was created now", timeout: 60_000 },
    )
    .toEqual([{ work_date: yesterday, fresh: true }]);

  // D-3 Calendar: ten days back through the native picker.
  const tenBack = new Date(Date.parse(`${today}T00:00:00Z`) - 10 * 86_400_000).toISOString().slice(0, 10);
  await page.goto(`${BASE}/en/dashboard/journal`);
  // The native date input changes the day only through React's onChange: a
  // fill that lands before the day choice hydrates sets the value and fires
  // nothing, so the URL never moves. Wait for React to own the input first
  // (the same check integrated-fixes uses for the journal composer).
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="journal-day-choice-input"]');
      return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
    },
    undefined,
    { timeout: 30_000 },
  );
  await main.getByTestId("journal-day-choice-input").fill(tenBack);
  await page.waitForURL(new RegExp(`date=${tenBack}`), { timeout: 30_000 });
  await expect(main.getByTestId("journal-day-choice")).toHaveAttribute("data-choice", "other");
  await expect(main.getByTestId("journal-quick-record-day"), "D-3: the recorder follows the picked day").toHaveAttribute(
    "data-day",
    tenBack,
  );

  // D-4 Earlier entries.
  await main.getByTestId("journal-day-choice-earlier").click();
  await expect(main.getByTestId("journal-entries"), "D-4: the entry list").toBeInViewport({ timeout: 30_000 });
  await expect(main.getByTestId("journal-entries"), "D-4: yesterday's entry is in it").toContainText(RUN, { timeout: 30_000 });
});

test("D-6. the started entry survives a day change and the readback", async ({ page }) => {
  await signIn(page, BASE, W);
  await page.goto(`${BASE}/en/dashboard/journal`);
  const main = page.getByRole("main");
  const DRAFT = `QA-SYNTHETIC draft ${RUN}: painted the hall for 3 hours`;
  await main.getByTestId("journal-quick-record-text").fill(DRAFT);
  // A day change remounts the recorder; the words stay.
  await main.getByTestId("journal-day-choice-yesterday").click();
  await expect(main.getByTestId("journal-day-choice")).toHaveAttribute("data-choice", "yesterday", { timeout: 30_000 });
  await expect(main.getByTestId("journal-quick-record-text"), "D-6: the words survive the day change").toHaveValue(DRAFT);
  // The readback is open; another page and back reopens it, for the day now chosen.
  await main.getByTestId("journal-quick-record-understand").click();
  await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
  await page.goto(`${BASE}/en/dashboard`);
  await page.goto(`${BASE}/en/dashboard/journal`);
  await main.getByTestId("journal-day-choice-weekAgo").click();
  await expect(main.getByTestId("journal-day-choice")).toHaveAttribute("data-choice", "weekAgo", { timeout: 30_000 });
  await expect(main.getByTestId("worklog-flow"), "D-6: the readback comes back after another page").toBeVisible({ timeout: 30_000 });
  // Starting over keeps the words in the field.
  await main.getByTestId("journal-quick-record-restart").click();
  await expect(main.getByTestId("journal-quick-record-text")).toHaveValue(DRAFT);
});

test("D-5. screenshots at 375 and 1280 px", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  for (const size of [
    { label: "375", width: 375, height: 812 },
    { label: "1280", width: 1280, height: 900 },
  ]) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await signIn(page, BASE, W);
    for (const view of [
      { key: "today", choice: null },
      { key: "yesterday", choice: "yesterday" },
    ]) {
      await page.goto(`${BASE}/en/dashboard/journal`);
      const main = page.getByRole("main");
      await expect(main.getByTestId("journal-day-choice")).toBeVisible({ timeout: 60_000 });
      if (view.choice) {
        await main.getByTestId(`journal-day-choice-${view.choice}`).click();
        await expect(main.getByTestId("journal-day-choice")).toHaveAttribute("data-choice", view.choice, { timeout: 30_000 });
      }
      const box = await main.getByTestId("journal-day-choice").boundingBox();
      expect(box && box.x + box.width <= size.width + 1, `${size.label}: the day choice fits the screen`).toBe(true);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${size.label}: no sideways scroll`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: join(OUT, `journal-${view.key}-${size.label}.png`) });
    }
    await context.close();
  }
});
