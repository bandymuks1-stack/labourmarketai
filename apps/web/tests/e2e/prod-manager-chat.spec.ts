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

/**
 * THE CHAT'S THREE P0 FIXES IN PRODUCTION (owner order 2026-11-24): #3776
 * (a request for the other space), #3790 (the first screen names the context
 * and lists nothing) and #3783 (no generic menu as an answer). The walk runs
 * on `desktop`, `phone` (390) and `phone-375`: the screen comes from the
 * dispatch through the walk fixture (this spec never reads it), and every step below
 * also checks that the screen does not scroll sideways (e).
 */
const MENU = /Galiu padėti su |Čia galiu padėti su /;

/** (e) The page fits its screen: no sideways scroll at 375, 390 or desktop. */
async function fits(page: Page, where: string): Promise<void> {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  console.info(`[manager-chat] ${where}: scrollWidth=${scroll} innerWidth=${inner}`);
  expect(scroll, `${where} scrolls sideways (${scroll} > ${inner})`).toBeLessThanOrEqual(inner + 1);
}

/** The chips of the newest answer (chip rows render only on the newest message). */
const chips = (page: Page) => page.locator('[data-testid^="chat-chip-"]:visible');

test("C-6. (a) the first screen names the organization and lists no menu", async ({ browser }) => {
  const { page, close } = await open(browser);
  await expect(page.getByText(new RegExp(`Veikiate kaip: ${ALFA}`)).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText(MENU);
  await fits(page, "first screen");
  await close();
});

test("C-7. (b) 'mano cv' and 'mano kalendorius' in the organization: the other-space line and ONE switch action", async ({ browser }) => {
  const { page, close } = await open(browser);
  await ask(page, "mano cv", /Jūsų CV yra asmeninėje erdvėje/, MENU);
  await expect(chips(page)).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator('[data-testid="chat-chip-xs:cv"], [data-testid="chat-chip-link:/cv"]').last()).toBeVisible();
  await fits(page, "mano cv");
  await ask(page, "mano kalendorius", /Jūsų kalendorius yra asmeninėje erdvėje/, MENU);
  await expect(chips(page)).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator('[data-testid="chat-chip-xs:calendar"], [data-testid="chat-chip-link:/dashboard/planning"]').last()).toBeVisible();
  await fits(page, "mano kalendorius");
  await close();
});

test("C-8. (c) a clear request gets its concrete action, never a menu", async ({ browser }) => {
  const { page, close } = await open(browser);
  // Opens the project form: nothing is submitted, the walk only sees it.
  await ask(page, "Noriu sukurti projektą", /Naujas projektas\./, MENU);
  await expect(page.locator('[data-testid="inline-action-form-company.create-project"]').last()).toBeVisible({ timeout: 30_000 });
  await fits(page, "create project");
  await close();
  const second = await open(browser);
  await ask(
    second.page,
    "Rodyk kandidatus",
    /Štai jūsų poreikiai ir žmonės už jų\.|Jūsų įmonė dar neaprašė poreikio/,
    /Galiu padėti su |Čia galiu padėti su |nepavyko nuskaityti jūsų įmonės poreikių/,
  );
  await fits(second.page, "candidates");
  await second.close();
});

test("C-9. (d) an unclear request gets exactly one clarifying question", async ({ browser }) => {
  const { page, close } = await open(browser);
  await ask(page, "CV", /Jūsų CV ar kandidato\?/, MENU);
  // The answer is ONE question: one question mark in the newest assistant turn.
  const answer = (await page.getByTestId("msg-assistant").filter({ hasText: "Jūsų CV ar kandidato?" }).last().innerText()).trim();
  console.info(`[manager-chat] unclear CV answer: ${answer.replace(/\s+/g, " ")}`);
  expect(answer.match(/\?/g) ?? [], `one question in: ${answer}`).toHaveLength(1);
  await expect(chips(page)).toHaveCount(2, { timeout: 20_000 });
  await fits(page, "unclear CV");
  await close();
});

/**
 * C-10. (b) THE SWITCH ACTION OPENS /cv. Tapping it switches the QA owner to
 * their personal space (the same server-validated switch as the workspace
 * chip) and opens the CV page. The walk then switches back to the
 * organization, so the next walk starts where this one did.
 */
test("C-10. (b) the switch action opens the person's CV, then the walk returns to the organization", async ({ browser }) => {
  const { page, close } = await open(browser);
  try {
    await ask(page, "mano cv", /Jūsų CV yra asmeninėje erdvėje/, MENU);
    await page.locator('[data-testid="chat-chip-xs:cv"], [data-testid="chat-chip-link:/cv"]').last().click();
    await page.waitForURL(/\/lt\/cv(\?|#|$)/, { timeout: 45_000 });
    await fits(page, "/cv after the switch");
  } finally {
    await close();
    const back = await open(browser);
    await expect(back.page.getByTestId("workspace-chip").first()).toContainText(ALFA, { timeout: 30_000 });
    await back.close();
  }
});

test("C-11. publication phrases open the existing need form with the original words", async ({ browser }) => {
  for (const phrase of ["post a need", "create a new job ad", "I want to post a job ad for 3 welders"]) {
    const { page, close } = await open(browser);
    try {
      await page.getByTestId("composer-input").fill(phrase);
      await page.getByTestId("composer-send").click();
      const form = page.getByTestId("inline-action-form-company.create-demand").last();
      await expect(form, `${phrase}: opens demand intake, not job search`).toBeVisible({ timeout: 45_000 });
      await expect(form.locator("textarea").first(), "the form belongs to this request").toHaveValue(phrase);
      await fits(page, "publication phrase");
      // No submit or confirmation: the existing published-need journey is unchanged.
    } finally {
      await close();
    }
  }
});

test("C-12. Dutch and German job-search phrases reach the worker's opportunities", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: state("worker2"), locale: "lt-LT" });
  try {
    const page = await ctx.newPage();
    await page.goto("/lt/dashboard");
    const chip = page.getByTestId("workspace-chip").first();
    await expect(chip).toBeVisible({ timeout: 30_000 });
    if (!(await chip.innerText()).includes("Asmeninė erdvė")) {
      await chip.getByRole("button").first().click();
      await page.getByTestId("workspace-chip-menu").locator('[data-testid^="workspace-option-"]', { hasText: "Asmeninė erdvė" }).first().click();
      await expect(chip).toContainText("Asmeninė erdvė", { timeout: 30_000 });
      await page.goto("/lt/dashboard");
    }
    for (const phrase of ["werk zoeken", "Arbeit finden"]) {
      // Reset the existing result panel: the previous search cannot satisfy this request.
      await page.goto("/lt/dashboard?result=calendar");
      await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("opportunities-view")).toHaveCount(0);
      const replies = page.getByTestId("msg-assistant");
      const before = await replies.count();
      await page.getByTestId("composer-input").fill(phrase);
      await page.getByTestId("composer-send").click();
      await expect.poll(() => replies.count(), { timeout: 45_000 }).toBeGreaterThan(before);
      await expect(page.getByTestId("opportunities-view").first()).toBeVisible({ timeout: 45_000 });
      await expect(replies.last()).not.toContainText(/Nesupratau|Ką tiksliai norėtum|Galiu padėti su /);
      await expect(page.getByTestId("inline-action-form-company.create-demand")).toHaveCount(0);
      await fits(page, "worker job search");
    }
  } finally {
    await ctx.close();
  }
});
