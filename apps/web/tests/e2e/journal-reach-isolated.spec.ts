import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { BASE, isolatedStack, lit, onboard, signIn, signUp, sql, userId } from "./isolated-web-a-helpers";

/**
 * THE JOURNAL, FROM EVERYWHERE A WORKER IS (owner directive 2026-11-22), on
 * the THROWAWAY local stack of .github/workflows/signup-isolated.yml.
 * Synthetic person only; nothing here changes product code.
 *
 *   R-1 every worker surface (home/assistant, CV, profile, calendar, the
 *       opportunities list) leads to the journal at 390 and 1280 px — a
 *       visible link, or on a phone the header's area sheet (one more tap) —
 *       and the journal's "Earlier entries" reaches the history; the taps per
 *       page are recorded as evidence;
 *   R-2 a historical day follows the existing rule: a day long past is
 *       stored as that day; a future day is refused (lib/journal/work-date.ts);
 *   R-3 the entry survives a validation error: the refused readback keeps
 *       the words and the day, a reload brings the words back, and the
 *       detailed form keeps its text after the same refusal;
 *   R-4 voice and natural language at 390 px: a sentence that says
 *       "yesterday" opens the readback for yesterday in the assistant, and the
 *       voice journal answers with its recorder or its honest
 *       not-available state — neither scrolls sideways.
 * Screenshots: artifact `journal-day-choice` (reach-*.png).
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const RUN = Date.now().toString(36);
const W = `journal-reach-${RUN}@example.test`;
const OUT = join(process.cwd(), "test-results", "journal-day-choice");
const SIZES = [
  { label: "390", width: 390, height: 844 },
  { label: "1280", width: 1280, height: 900 },
] as const;
const SURFACES = ["/en/dashboard", "/en/cv", "/en/dashboard/profile", "/en/dashboard/planning", "/en/dashboard/opportunities"];

const isoShift = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

async function noSidewaysScroll(page: Page, what: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${what}: no sideways scroll`).toBeLessThanOrEqual(1);
}

/**
 * The way to the journal from a page: 1 = a visible link on the page (the
 * header's core row from `md`, or the page's own link); 2 = on a phone, the
 * header's ONE area button opens the sheet of every destination, and the
 * journal is in it (`conversation-header.tsx`, owner phone report 2026-11-20).
 */
async function wayToJournal(page: Page, what: string): Promise<1 | 2> {
  const direct = page.locator('a[href^="/en/dashboard/journal"]').filter({ visible: true });
  if (await direct.first().waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false)) return 1;
  const trigger = page.getByTestId("header-nav-sheet-trigger").filter({ visible: true }).first();
  await expect(trigger, `${what}: the header's area button`).toBeVisible({ timeout: 30_000 });
  await trigger.click();
  const inSheet = page.getByTestId("header-nav-sheet").locator('a[href^="/en/dashboard/journal"]');
  await expect(inSheet.first(), `${what}: the journal is in the area sheet`).toBeVisible({ timeout: 30_000 });
  return 2;
}

/** The person's "today" as the journal itself reads it (its Yesterday link). */
async function journalToday(page: Page): Promise<string> {
  await page.goto(`${BASE}/en/dashboard/journal`);
  const href = await page.getByRole("main").getByTestId("journal-day-choice-yesterday").getAttribute("href", { timeout: 60_000 });
  const y = href?.match(/date=(\d{4}-\d{2}-\d{2})/)?.[1];
  expect(y, "the journal names yesterday").toBeTruthy();
  return isoShift(y!, 1);
}

test("R-0. a worker signs up", async ({ page }) => {
  await signUp(page, BASE, W);
  await onboard(page, "work", "Synthetic Reach Worker");
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
});

for (const size of SIZES) {
  test(`R-1 (${size.label}). every worker surface shows the way to the journal; Earlier entries reaches the history`, async ({ browser }) => {
    mkdirSync(OUT, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await signIn(page, BASE, W);
    const taps: Record<string, number> = {};
    for (const path of SURFACES) {
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await noSidewaysScroll(page, `${size.label} ${path}`);
      taps[path] = await wayToJournal(page, `${size.label} ${path}`);
      // Close the area sheet again if it was opened.
      if (taps[path] === 2) await page.keyboard.press("Escape");
    }
    test.info().annotations.push({ type: "evidence", description: `${size.label} taps to the journal: ${JSON.stringify(taps)}` });
    await page.goto(`${BASE}/en/dashboard/opportunities`);
    if ((await wayToJournal(page, `${size.label} opportunities`)) === 2) {
      await page.getByTestId("header-nav-sheet").locator('a[href^="/en/dashboard/journal"]').first().click();
    } else {
      await page.locator('a[href^="/en/dashboard/journal"]').filter({ visible: true }).first().click();
    }
    await page.waitForURL(/\/en\/dashboard\/journal/, { timeout: 30_000 });
    const main = page.getByRole("main");
    await main.getByTestId("journal-day-choice-earlier").click();
    await expect(main.getByTestId("journal-entries"), `${size.label}: Earlier entries reaches the history`).toBeInViewport({ timeout: 30_000 });
    await page.screenshot({ path: join(OUT, `reach-history-${size.label}.png`) });
    await ctx.close();
  });
}

test("R-2. a long-past day is stored as that day; a future day is refused", async ({ page }) => {
  await signIn(page, BASE, W);
  const me = await userId(W);
  const today = await journalToday(page);
  const past = isoShift(today, -400);
  const main = page.getByRole("main");

  await page.goto(`${BASE}/en/dashboard/journal?date=${past}`);
  await expect(main.getByTestId("journal-quick-record-day")).toHaveAttribute("data-day", past, { timeout: 60_000 });
  await main.getByTestId("journal-quick-record-text").fill(`QA-SYNTHETIC past ${RUN}: laid paving stones`);
  await main.getByTestId("journal-quick-record-understand").click();
  await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
  await expect(main.getByTestId("worklog-date"), "R-2: the readback carries the past day").toHaveValue(past);
  await main.getByTestId("worklog-save").click();
  await main.getByTestId("worklog-confirm").click();
  await expect(main.getByTestId("worklog-done"), "R-2: the past day is accepted").toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      () =>
        sql<{ day: string }>(
          `select m.value_text as day from public.journal_entries e join public.workers w on w.id = e.worker_id
             join public.journal_entry_metrics m on m.entry_id = e.id and m.metric_slug = 'work_date'
            where w.profile_id = ${lit(me)} and e.original_text like ${lit(`%past ${RUN}%`)}`,
        ).map((r) => r.day),
      { message: "R-2: stored as the past day", timeout: 60_000 },
    )
    .toEqual([past]);
});

test("R-3. the entry survives a validation error, in the readback, after a reload, and in the detailed form", async ({ page }) => {
  await signIn(page, BASE, W);
  const me = await userId(W);
  const today = await journalToday(page);
  const future = isoShift(today, 5);
  const WORDS = `QA-SYNTHETIC refused ${RUN}: fitted two doors`;
  const main = page.getByRole("main");

  // Quick recorder: a future day in the readback is refused; nothing is lost.
  await page.goto(`${BASE}/en/dashboard/journal`);
  await main.getByTestId("journal-quick-record-text").fill(WORDS);
  await main.getByTestId("journal-quick-record-understand").click();
  await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
  await main.getByTestId("worklog-date").fill(future);
  await main.getByTestId("worklog-save").click();
  // Preparing the confirmation is asynchronous: wait for its button or an
  // early refusal, then confirm (the server's date rule refuses at the save).
  const confirm = main.getByTestId("worklog-confirm");
  await expect(confirm.or(main.getByTestId("worklog-error"))).toBeVisible({ timeout: 30_000 });
  if (await confirm.isVisible()) await confirm.click();
  await expect(main.getByTestId("worklog-error"), "R-3: the future day is refused on screen").toBeVisible({ timeout: 30_000 });
  await expect(main.getByTestId("worklog-flow"), "R-3: the readback stays open").toBeVisible();
  await expect(main.getByTestId("worklog-date"), "R-3: the day stays as entered").toHaveValue(future);
  expect(
    sql<{ n: number }>(
      `select count(*)::int as n from public.journal_entries e join public.workers w on w.id = e.worker_id
        where w.profile_id = ${lit(me)} and e.original_text like ${lit(`%refused ${RUN}%`)}`,
    )[0]?.n,
    "R-3: nothing was stored",
  ).toBe(0);
  // A reload brings the words back (the tab's kept draft).
  await page.reload();
  await expect(main.getByTestId("worklog-flow").or(main.getByTestId("journal-quick-record-text"))).toBeVisible({ timeout: 60_000 });
  await main.getByTestId("journal-quick-record-restart").click({ timeout: 5_000 }).catch(() => {});
  await expect(main.getByTestId("journal-quick-record-text"), "R-3: the words survive the reload").toHaveValue(WORDS);

  // Detailed form: the same refusal keeps the text. Its compose stage has no
  // date field; it takes the day from `?date=` (as the calendar does) and
  // sends it with a direct save.
  await page.goto(`${BASE}/en/dashboard/journal?compose=full&date=${future}`);
  const form = main.getByTestId("journal-compose-full");
  await expect(form).toBeVisible({ timeout: 60_000 });
  const text = form.locator("textarea").first();
  // Fill only once React owns the form: a fill and save that land before
  // hydration submit natively and the re-rendered form has no text (the same
  // check journal-day-choice D-3 and integrated-fixes use).
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="journal-compose-full"] textarea');
      return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
    },
    undefined,
    { timeout: 30_000 },
  );
  await text.fill(WORDS);
  await main.getByTestId("journal-save-entry").first().click();
  await expect(main.getByTestId("journal-save-error"), "R-3: the detailed form refuses the future day").toBeVisible({ timeout: 30_000 });
  await expect(text, "R-3: the detailed form keeps the text").toHaveValue(WORDS);
});

test("R-4. at 390 px: natural language opens yesterday's readback in the assistant; the voice journal answers", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await signIn(page, BASE, W);
  const today = await journalToday(page);

  await page.goto(`${BASE}/en/dashboard`);
  const input = page.getByTestId("composer-input").filter({ visible: true }).first();
  await expect(input, "R-4: the assistant is open").toBeVisible({ timeout: 120_000 });
  const send = page.getByTestId("composer-send").filter({ visible: true }).first();
  const SENTENCE = `Yesterday I tiled the bathroom floor for 6 hours QA-SYNTHETIC ${RUN}`;
  // The composer takes input only once it is live (same pattern as assistant-intent-isolated).
  await expect(async () => {
    await input.fill(SENTENCE);
    await expect(send).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await send.click();
  const flow = page.getByTestId("worklog-flow").filter({ visible: true }).last();
  await expect(flow, "R-4: the sentence opens the work-log readback").toBeVisible({ timeout: 60_000 });
  await expect(flow.getByTestId("worklog-date"), "R-4: for yesterday").toHaveValue(isoShift(today, -1));
  await noSidewaysScroll(page, "390 assistant readback");
  await page.screenshot({ path: join(OUT, "reach-natural-language-390.png") });

  await page.goto(`${BASE}/en/dashboard/journal/voice`);
  const voice = page.getByTestId("voice-recorder").or(page.getByTestId("voice-unavailable")).filter({ visible: true }).first();
  await expect(voice, "R-4: the voice journal shows its recorder or says it is not available").toBeVisible({ timeout: 60_000 });
  await noSidewaysScroll(page, "390 voice journal");
  await page.screenshot({ path: join(OUT, "reach-voice-390.png") });
  await ctx.close();
});
