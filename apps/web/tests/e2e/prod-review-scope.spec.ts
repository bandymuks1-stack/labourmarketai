import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Locator, type Page } from "./prod-walk";
import { answerNoProjectIfAsked, chooseWorkContextIfAsked } from "./worklog-context";

/**
 * ONE ORGANIZATION'S HOURS AT A TIME (#3147, decision 0024). A reviewer who belongs to
 * two organizations sees, in each organization's context, only that organization's hours;
 * the other organization's are counted as waiting elsewhere, never shown or decided here.
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic): `worker` is an employee of
 * "QA-SYNTHETIC Alfa" with journal review on; `manager` is a manager of Alfa and the
 * owner of "QA-SYNTHETIC Gama". The worker records one entry in Alfa; the manager looks
 * at it from Gama, then from Alfa, on a phone. Nobody approves it, and `afterAll` removes
 * the undecided entry. Logs carry case names and counts only. Dispatch only.
 */
const slot = (name: string) => resolve(__dirname, `.storage-state.prod-qa.${name}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["worker", "manager"].every((s) => existsSync(slot(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ timeout: 360_000, retries: 0 });
test.use({ actionTimeout: 30_000, channel: "chrome" });

const ALFA = "QA-SYNTHETIC Alfa";
const GAMA = "QA-SYNTHETIC Gama";
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const ENTRY = `QA-SYNTHETIC ${RUN}: šiandien 1 valandą tikrinau, kieno valandas matau`;
const inMain = (page: Page): Locator => page.getByRole("main");
let entryId = "";

function record(label: string, pass: boolean, detail: string): void {
  console.info(`[result] ${label}: ${pass ? "PASS" : "FAIL"} ${detail}`);
  expect.soft(pass, `${label}: ${detail}`).toBe(true);
}

async function useOrganization(page: Page, org: string): Promise<void> {
  await page.goto("/lt/dashboard/company/people");
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 60_000 });
  if ((await chip.innerText()).includes(org)) return;
  await chip.getByRole("button").first().click();
  await page.getByTestId("workspace-chip-menu").locator('[data-testid^="workspace-option-"]', { hasText: org }).first().click();
  await expect(chip).toContainText(org, { timeout: 30_000 });
}

/** What the reviewer sees of the entry in the active organization: the card, then the queue. */
async function look(page: Page) {
  await page.goto("/lt/dashboard");
  const card = page.getByTestId("organization-approvals").filter({ visible: true });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const cardState = await card.getAttribute("data-state");
  const onCard = await card.getByTestId(`quick-confirm-tap-${entryId}`).count();

  await page.goto("/lt/dashboard/inbox/quick");
  await expect(inMain(page).getByTestId("quick-detailed-link")).toBeVisible({ timeout: 60_000 });
  const inQueue = await inMain(page).getByTestId(`quick-confirm-tap-${entryId}`).count();
  const elsewhere = inMain(page).getByTestId("quick-elsewhere");
  const elsewhereText = (await elsewhere.count()) > 0 ? await elsewhere.innerText() : "";
  const unavailable = await inMain(page).getByTestId("quick-unavailable").count();
  return { cardState, onCard, inQueue, elsewhereN: Number(elsewhereText.match(/\d+/)?.[0] ?? 0), unavailable };
}

test.afterAll(async ({ browser }) => {
  if (!entryId) return;
  const ctx = await browser.newContext({ storageState: slot("worker"), locale: "lt-LT" });
  const page = await ctx.newPage();
  await page.goto("/lt/dashboard/journal");
  await expect(inMain(page).locator(`[data-testid="journal-entry-card-${entryId}"]`)).toBeVisible({ timeout: 30_000 });
  const del = inMain(page).getByTestId(`journal-entry-delete-${entryId}`);
  if ((await del.count()) === 0) {
    console.info("[cleanup] the synthetic entry is decided, so it stays");
    await ctx.close();
    return;
  }
  if (!(await del.isVisible())) await inMain(page).getByTestId(`journal-entry-more-${entryId}`).locator("summary").first().click();
  await del.click();
  await inMain(page).getByTestId(`journal-entry-delete-${entryId}-yes`).click();
  await expect(inMain(page).getByTestId(`journal-entry-deleted-${entryId}`)).toBeVisible({ timeout: 30_000 });
  console.info("[cleanup] the undecided synthetic entry was removed");
  await ctx.close();
});

test("a reviewer of two organizations sees each one's hours only in its own context", async ({ browser }: { browser: Browser }) => {
  const worker = await browser.newContext({ storageState: slot("worker"), locale: "lt-LT" });
  const wp = await worker.newPage();
  await wp.goto("/lt/dashboard/journal");
  const wm = inMain(wp);
  await wm.getByTestId("journal-quick-record-text").fill(ENTRY);
  await wm.getByTestId("journal-quick-record-understand").click();
  await expect(wm.getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
  await chooseWorkContextIfAsked(wp, /QA-SYNTHETIC Alfa/);
  await answerNoProjectIfAsked(wp);
  await wm.getByTestId("worklog-save").click();
  await wm.getByTestId("worklog-confirm").click();
  await expect(wm.getByTestId("worklog-done")).toBeVisible({ timeout: 30_000 });
  await wp.goto("/lt/dashboard/journal");
  const entryCard = wm.locator('[data-testid^="journal-entry-card-"]', { hasText: RUN }).first();
  await expect(entryCard).toBeVisible({ timeout: 30_000 });
  entryId = (await entryCard.getAttribute("data-testid"))!.replace("journal-entry-card-", "");
  await worker.close();

  const ctx = await browser.newContext({ storageState: slot("manager"), locale: "lt-LT", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const crashes: string[] = [];
  page.on("pageerror", (e) => {
    if (!e.message.includes("#418")) crashes.push(`${e.name}: ${e.message.slice(0, 60)}`);
  });

  await useOrganization(page, GAMA);
  const gama = await look(page);
  record("Gama: Alfa's entry is not on the card", gama.onCard === 0, `state=${gama.cardState} onCard=${gama.onCard}`);
  record("Gama: Alfa's entry is not in the queue", gama.inQueue === 0 && gama.unavailable === 0, `inQueue=${gama.inQueue} unavailable=${gama.unavailable}`);
  record("Gama: the queue counts it as waiting elsewhere", gama.elsewhereN >= 1, `elsewhere=${gama.elsewhereN}`);

  await useOrganization(page, ALFA);
  const alfa = await look(page);
  record("Alfa: the card says hours wait", alfa.cardState === "waiting", `state=${alfa.cardState} onCard=${alfa.onCard}`);
  record("Alfa: the entry is in the queue", alfa.inQueue > 0 && alfa.unavailable === 0, `inQueue=${alfa.inQueue} unavailable=${alfa.unavailable}`);

  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  record("no sideways scroll, no crash", !wide && crashes.length === 0, `sideways=${wide} crash=${crashes.join("/") || "none"}`);
  await ctx.close();
});
