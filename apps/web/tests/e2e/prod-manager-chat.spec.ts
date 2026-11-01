import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Page } from "./prod-walk";

/**
 * PRODUCTION — A MANAGER RUNS THE DAY FROM THE CHAT (owner programme
 * 2026-10-12 §7). READ answers only: who is free / planned, what waits for
 * confirmation, how the projects stand, what is on the calendar (with
 * conflicts) — each in plain Lithuanian, each answered by the SAME domain
 * reads the pages use (no second AI core). Writes stay behind their strong
 * confirmations and are walked elsewhere (journal-confirm, chat-confirm-once).
 *
 * The answers are matched by the product's own sentence openings
 * (conversation.chat.capacityIntro / confirmIntro / riskIntro / agendaTitle),
 * and an unreadable source must say so ("…nepavyko…"), never "nothing".
 */
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state("owner"));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const ALFA = "QA-SYNTHETIC Alfa";

async function open(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ storageState: state("owner"), locale: "lt-LT" });
  const page = await ctx.newPage();
  await page.goto("/lt/dashboard");
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if (!(await chip.innerText()).includes(ALFA)) {
    await chip.getByRole("button").first().click();
    await page.getByTestId("workspace-chip-menu").locator('[data-testid^="workspace-option-"]', { hasText: ALFA }).first().click();
    await expect(chip).toContainText(ALFA, { timeout: 30_000 });
    await page.goto("/lt/dashboard");
  }
  await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  return { page, close: () => ctx.close() };
}

/** How many times `re` occurs in `s`, and where the last one starts. */
function occurrences(s: string, re: RegExp): { n: number; last: number } {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let n = 0;
  let last = -1;
  for (const m of s.matchAll(g)) {
    n += 1;
    last = m.index ?? -1;
  }
  return { n, last };
}

/**
 * Ask, then wait for the product's own answer opening (or its honest "could
 * not read"). The answer is detected as one MORE occurrence of the opening
 * than before the question, anywhere on the page. It used to be looked for
 * only in the text after the page's old length, but the chat thread sits
 * above the workspace panel in the DOM, so a new answer lands in the middle
 * of the body text, not at its end (run 39982749535 read the panel's
 * "… Projektai Pridėti užduotį" as "no answer").
 */
async function ask(page: Page, text: string, answer: RegExp, unavailable: RegExp): Promise<string> {
  const body = () => page.locator("body").innerText();
  const start = await body();
  const answersBefore = occurrences(start, answer).n;
  const refusalsBefore = occurrences(start, unavailable).n;
  await page.getByTestId("composer-input").fill(text);
  await page.getByTestId("composer-send").click();
  try {
    await expect
      .poll(
        async () => {
          const now = await body();
          return occurrences(now, answer).n > answersBefore || occurrences(now, unavailable).n > refusalsBefore;
        },
        { timeout: 45_000, intervals: [1_000] },
      )
      .toBe(true);
  } catch (err) {
    // Name what the chat said instead (run 39605716305 timed out with no trace).
    const now = await body();
    const asked = now.lastIndexOf(text);
    const after = asked >= 0 ? now.slice(asked, asked + 500) : now.slice(-500);
    console.info(`[manager-chat] "${text}" → no answer in 45 s; after the question the page showed: ${after.replace(/\s+/g, " ")}`);
    throw err;
  }
  const now = await body();
  const hit = occurrences(now, answer);
  const answered = hit.n > answersBefore;
  const shown = answered
    ? now.slice(hit.last, hit.last + 400).replace(/\s+/g, " ")
    : now.slice(Math.max(0, occurrences(now, unavailable).last), occurrences(now, unavailable).last + 300).replace(/\s+/g, " ");
  console.info(`[manager-chat] "${text}" → ${shown}`);
  expect(answered, `"${text}" was answered (not "could not read"): ${shown}`).toBe(true);
  return shown;
}

test("C-1. who is free / working this week", async ({ browser }) => {
  const { page, close } = await open(browser);
  await ask(page, "Kas laisvas šią savaitę?", /Komanda .{3,40}\(\d+ žm\.\):/, /Komandos prieinamumo dabar nuskaityti nepavyko/);
  await close();
});

test("C-2. what waits for my confirmation", async ({ browser }) => {
  const { page, close } = await open(browser);
  await ask(page, "Ką reikia patvirtinti?", /Laukia patvirtinimo įrašų: \d+|Laukiančių darbo įrašų nėra/, /Patvirtinimų dabar nuskaityti nepavyko/);
  await close();
});

test("C-3. how the projects stand", async ({ browser }) => {
  const { page, close } = await open(browser);
  await ask(page, "Kokia projektų būklė?", /Projektų būklė \(\d+ aktyv\.\):|Aktyvių projektų kol kas nėra/, /Projektų būklės dabar nuskaityti nepavyko/);
  await close();
});

test("C-4. what is planned (and what collides) on the calendar", async ({ browser }) => {
  const { page, close } = await open(browser);
  await ask(page, "Kas suplanuota kalendoriuje?", /Artimiausių \d+ d\. planas:|Artimiausioms \d+ d\. suplanuotų įsipareigojimų nėra/, /kalendoriaus dabar nuskaityti nepavyko|nepavyko perskaityti/i);
  await close();
});

test("C-5. a brand-new session still has the manager's questions", async ({ browser }) => {
  await new Promise((r) => setTimeout(r, 10_000));
  const { page, close } = await open(browser);
  const block = page.getByTestId("chat-history-block");
  await expect(block).toBeVisible({ timeout: 30_000 });
  const show = block.getByRole("button").first();
  if (await show.isVisible().catch(() => false)) await show.click();
  await expect(block).toContainText("Kokia projektų būklė?", { timeout: 20_000 });
  await close();
});
