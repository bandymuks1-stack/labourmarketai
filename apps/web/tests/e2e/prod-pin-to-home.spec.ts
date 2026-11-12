import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Page } from "./prod-walk";

/**
 * PRODUCTION — PIN TO HOME: "MY SPACE" (owner contract 2026-09-04 §4C). A worker who keeps
 * using the same thing is asked once whether to keep it on the home screen, says yes, finds
 * it above the conversation in a new session, uses it, and removes it again.
 *
 * No production walk covered this before 2026-11-12 (Lane F inventory). Runs only in
 * `.github/workflows/prod-qa-walk.yml` (spec=pin-to-home) with the synthetic worker
 * (qa.worker+multiw). Dispatch only, never in the rotation.
 *
 * WRITES one `workspace_pins` row of the synthetic worker and removes it in P-3; `afterAll`
 * removes it again if a step stopped early. Nothing else is written: the sentence used is a
 * read ("Ieškau darbo" opens the job search answer).
 *
 * The "used often" count is a per-browser convenience kept in localStorage, never a stored
 * fact (lib/workspace/pins-model.ts). The walk seeds two earlier uses in that browser and
 * performs the third itself, so one sentence reaches the question a person meets on the
 * third use.
 */
const REF = "jobs";
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state("worker"));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

async function home(page: Page) {
  await page.goto("/lt/dashboard");
  await expect(page.getByRole("main").getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
}

const row = (page: Page) => page.getByRole("main").getByTestId("my-space-row");

/** Remove the walk's pin if it is there (a stopped earlier run, or the end of this one). */
async function unpinIfPinned(page: Page): Promise<boolean> {
  if (!(await row(page).isVisible().catch(() => false))) return false;
  await row(page).getByTestId("my-space-manage").click();
  const chip = page.getByRole("main").getByTestId(`chat-chip-unpin:${REF}`).last();
  if (!(await chip.isVisible({ timeout: 10_000 }).catch(() => false))) return false;
  await chip.click();
  await expect(page.getByRole("main").getByText("Pašalinta iš Mano erdvės.").last()).toBeVisible({ timeout: 30_000 });
  return true;
}

test("P-1. the third use is answered with one question, and yes puts it on the home screen", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: state("worker"), locale: "lt-LT" });
  const page = await ctx.newPage();
  await home(page);
  if (await unpinIfPinned(page)) console.info("[pin] a pin left by an earlier run was removed first");
  // Two earlier uses in this browser, and no earlier "asked" mark for this reference.
  await page.evaluate((ref) => {
    const now = Date.now();
    localStorage.setItem("lm.myspace.usage.v1", JSON.stringify({ [ref]: [now - 120_000, now - 60_000] }));
    localStorage.removeItem("lm.myspace.asked.v1");
  }, REF);
  await home(page);
  const main = page.getByRole("main");
  await main.getByTestId("composer-input").fill("Ieškau darbo");
  await main.getByTestId("composer-send").click();
  const yes = main.getByTestId(`chat-chip-pin:${REF}`).last();
  await expect(yes, "the chat asks whether to keep the often-used thing").toBeVisible({ timeout: 45_000 });
  await expect(main.getByText("Šį veiksmą naudoji dažnai. Pridėti į Mano erdvę?").last()).toBeVisible();
  await expect(row(page), "nothing is pinned before the person says yes").toHaveCount(0);
  await yes.click();
  await expect(main.getByText("Pridėta į Mano erdvę — rasi viršuje.").last()).toBeVisible({ timeout: 30_000 });
  await expect(row(page).getByTestId("my-space-pin")).toHaveCount(1);
  await ctx.close();
});

test("P-2. a new session still has it, and pressing it does what the sentence did", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: state("worker"), locale: "lt-LT" });
  const page = await ctx.newPage();
  await home(page);
  const pin = row(page).getByTestId("my-space-pin");
  await expect(pin, "the pin is a stored fact, not a browser memory").toHaveCount(1, { timeout: 30_000 });
  const before = (await page.getByRole("main").innerText()).length;
  await pin.click();
  await expect
    .poll(async () => (await page.getByRole("main").innerText()).length, { timeout: 45_000, message: "the pin answers in the conversation" })
    .toBeGreaterThan(before);
  await expect(page.getByTestId("global-error-message")).toHaveCount(0);
  await expect(page.getByTestId("error-boundary-message")).toHaveCount(0);
  await ctx.close();
});

test("P-3. the person removes it, and it stays removed", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: state("worker"), locale: "lt-LT" });
  const page = await ctx.newPage();
  await home(page);
  expect(await unpinIfPinned(page), "the manage door offers to remove the pin").toBe(true);
  await expect(row(page)).toHaveCount(0);
  await home(page);
  await expect(row(page), "still removed after a fresh load").toHaveCount(0);
  await ctx.close();
});

test.afterAll(async ({ browser }) => {
  if (!ENABLED) return;
  const ctx = await browser.newContext({ storageState: state("worker"), locale: "lt-LT" });
  const page = await ctx.newPage();
  try {
    await home(page);
    if (await unpinIfPinned(page)) console.info("[pin] cleanup removed a pin a stopped step had left");
  } catch (error) {
    console.info(`[pin] cleanup could not run: ${String(error).split("\n")[0]}`);
  }
  await ctx.close();
});
