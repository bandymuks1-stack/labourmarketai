import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { bearerOf, qaApi } from "./prod-qa-api";
import { test, expect, type Browser, type Page } from "./prod-walk";

import { answerNoProjectIfAsked, chooseWorkContextIfAsked } from "./worklog-context";

/**
 * PRODUCTION WORK → CONFIRMATION → LIVING CV — owner programme 2026-10-12:
 * a worker records real work, the employer confirms it, and the worker sees
 * the confirmation and their Living CV reflect it.
 *
 * EVID-2 (owner clarification 2026-11-02): the worker's own record is a lawful
 * declaration and reads as declared, not employer-confirmed; the worker can
 * never write themselves in as the confirmer; a different authorised manager
 * confirms; and the confirmation raises trust without adding hours (one
 * ledger, every hour once).
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=journal-confirm)
 * with the synthetic cast: the worker is QA-SYNTHETIC Vytas (employee of
 * QA-SYNTHETIC Alfa, journal review on), the employer is Alfa's owner.
 * The entry text carries the run id, so the walk finds exactly its own entry.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const ENTRY = `QA-SYNTHETIC ${RUN}: šiandien 6 valandas mūrijau blokelių sieną objekte`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["worker", "owner"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });

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

/** The worker's own figures: Living CV confirmed entries, and the journal's hours/entries in work-in-numbers. */
async function figures(page: Page): Promise<{ confirmedEntries: number; journalHours: number; journalEntries: number }> {
  await page.goto("/lt/cv");
  await expect(page.getByTestId("cv-skills").filter({ visible: true })).toBeVisible({ timeout: 30_000 });
  // Shown only when it exists - absent means no confirmed entry, never an unknown.
  const confirmed = page.getByTestId("cv-confirmed-work").filter({ visible: true });
  const confirmedEntries = (await confirmed.count()) ? Number(await confirmed.getAttribute("data-entries")) : 0;
  await page.goto("/lt/dashboard/work-in-numbers");
  const journal = page.getByTestId("wi-experience-journal").filter({ visible: true });
  await expect(journal).toBeVisible({ timeout: 30_000 });
  return {
    confirmedEntries,
    journalHours: Number(await journal.getAttribute("data-hours")),
    journalEntries: Number(await journal.getAttribute("data-entries")),
  };
}

let entryId = "";
let declared: Awaited<ReturnType<typeof figures>> | null = null;

test("1. the worker records the day's work in the journal", async ({ browser }) => {
  const { page, close } = await as(browser, "worker");
  await page.goto("/lt/dashboard/journal");
  // Scoped to <main>: dashboard pages stream through a hidden `<div id="S:n">`
  // holder outside <main>; in a never-painting headless tab it can sit beside
  // the rendered copy, and a bare testid then fails strict mode or counts twice
  // (journal-confirm 40080278940 step 3; calendar-journal-history.spec.ts).
  const main = page.getByRole("main");
  await main.getByTestId("journal-quick-record-text").fill(ENTRY);
  await main.getByTestId("journal-quick-record-understand").click();
  await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
  await chooseWorkContextIfAsked(page, /QA-SYNTHETIC Alfa/);
  await answerNoProjectIfAsked(page);
  // The first press opens the review and writes nothing, so it says "Toliau";
  // "Išsaugoti" is said once, on the confirm press (activation audit fix #5).
  await expect(main.getByTestId("worklog-save")).toHaveText(/Toliau/);
  await main.getByTestId("worklog-save").click();
  await expect(main.getByTestId("worklog-confirm")).toHaveText(/Išsaugoti/);
  await main.getByTestId("worklog-confirm").click();
  const done = main.getByTestId("worklog-done");
  const failed = main.getByTestId("worklog-error").or(main.getByTestId("worklog-blocked"));
  await expect(done.or(failed)).toBeVisible({ timeout: 30_000 });
  if (!(await done.isVisible())) throw new Error(`the entry was not saved: ${await failed.innerText()}`);
  // The confirmation says where the entry now counts — the Living CV, as
  // recorded (not confirmed) work — links there, and asks back calmly.
  await expect(done.getByTestId("worklog-living-cv-note")).toContainText("nepatvirtint");
  await expect(done.getByTestId("worklog-living-cv-link")).toHaveAttribute("href", /\/lt\/cv$/);
  await expect(done.getByTestId("worklog-come-back")).toBeVisible();
  await page.goto("/lt/dashboard/journal");
  const card = main.locator('[data-testid^="journal-entry-card-"]', { hasText: RUN }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  entryId = (await card.getAttribute("data-testid"))!.replace("journal-entry-card-", "");
  // The worker's own declaration is recorded, and nobody has confirmed it.
  await expect(main.getByTestId(`journal-entry-status-${entryId}`).locator('li[data-step="approved"]')).toHaveCount(0);
  declared = await figures(page);
  expect(declared.journalEntries).toBeGreaterThan(0);
  await close();
});

/** A refusal: a non-2xx answer, or one of the review doors' own refusal statuses. */
async function refused(res: Response): Promise<string> {
  const body = (await res.text()).trim();
  if (!res.ok) return `http ${res.status}`;
  const status = body.replace(/^"|"$/g, "");
  expect(status, "the worker was accepted as the confirmer of their own entry").toMatch(
    /^(not_authorized|self_review_not_allowed|review_authority_not_established|no_reviewer_engagement)$/,
  );
  return status;
}

test("1b. the worker cannot write themselves in as the confirmer (EVID-2)", async () => {
  // Declaring one's own work is lawful (step 1); presenting oneself as the
  // independent confirmer is not. Step 2 then shows nothing was written: the
  // entry is still waiting in the employer's queue.
  expect(entryId).not.toBe("");
  const token = bearerOf("worker");
  await refused(
    await qaApi("/rest/v1/rpc/review_journal_entry", token, {
      method: "POST",
      body: { p_entry_id: entryId, p_decision: "approved", p_note: null },
    }),
  );
  await refused(
    await qaApi("/rest/v1/rpc/confirm_entry_and_verify_skills", token, {
      method: "POST",
      body: { p_entry_id: entryId, p_skill_ids: [randomUUID()], p_note: null },
    }),
  );
  const direct = await qaApi("/rest/v1/journal_entry_confirmations", token, {
    method: "POST",
    body: {
      entry_id: entryId,
      confirmer_id: JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")).sub,
      confirmation_scope: { action: "confirm", decision: "approved" },
    },
  });
  expect(direct.ok, "the worker was accepted as the confirmer of their own entry").toBe(false);
});

test("2. the employer finds it in the review queue and approves it", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, "QA-SYNTHETIC Alfa");
  await page.goto("/lt/dashboard/inbox");
  const main = page.getByRole("main"); // hidden streaming holder, see step 1
  const item = main.getByTestId(`inbox-entry-${entryId}`);
  await expect(item).toBeVisible({ timeout: 30_000 });
  await expect(item).toContainText(RUN);
  await main.getByTestId(`journal-approve-entry-${entryId}`).click();
  // A decided entry leaves the queue (the page refreshes after the stored
  // decision); poll with reloads until it is gone.
  await expect
    .poll(
      async () => {
        await page.goto("/lt/dashboard/inbox");
        return main.getByTestId(`inbox-entry-${entryId}`).count();
      },
      { timeout: 45_000, intervals: [3_000] },
    )
    .toBe(0);
  await close();
});

test("3. the worker sees it confirmed; trust rises, the hours do not", async ({ browser }) => {
  const { page, close } = await as(browser, "worker");
  await page.goto("/lt/dashboard/journal");
  const main = page.getByRole("main"); // hidden streaming holder, see step 1
  // The decision timeline lives in the folded details of the entry card.
  await expect(main.getByTestId(`journal-entry-status-${entryId}`).locator('li[data-step="approved"]')).toHaveCount(1, {
    timeout: 20_000,
  });
  // Strict over the VISIBLE nodes (#2721): the hidden holder is never visible.
  // One more confirmed entry on the Living CV; the journal's hours and entries
  // are exactly what the declaration already counted - a confirmation never
  // adds or duplicates hours.
  expect(declared, "step 1 did not record the declared figures").not.toBeNull();
  const after = await figures(page);
  expect(after.confirmedEntries).toBe(declared!.confirmedEntries + 1);
  expect(after.journalHours).toBe(declared!.journalHours);
  expect(after.journalEntries).toBe(declared!.journalEntries);
  await expect(main.getByTestId("work-in-numbers")).toBeVisible({ timeout: 30_000 });
  await close();
});
