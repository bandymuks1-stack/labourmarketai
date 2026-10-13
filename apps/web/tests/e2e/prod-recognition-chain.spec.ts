import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * PRODUCTION — A POSITIVE RECOGNITION FROM REAL EVIDENCE (owner 2026-10-12 §4).
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=recognition-chain). It creates NO
 * invitation: it uses the learning relationship the learning-practice walk established
 * (QA-SYNTHETIC Alfa, the second synthetic worker as learner), so the inviter's invitation cap
 * never blocks it.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const ALFA = "QA-SYNTHETIC Alfa";
const LEARNER = /QA-SYNTHETIC (Worker|mokinys)/;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["owner", "worker2"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

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

/* ── POSITIVE RECOGNITION (owner 2026-10-12 §4: prove it with a REAL, allowed
   piece of evidence, not an empty list). The learner records practice in the
   learning relationship, the institution signs it off, the assessor picks THAT
   entry (never a uuid), records the recognition, and the learner sees it. ── */
const PRACTICE = `QA-SYNTHETIC ${RUN}: praktikoje 4 valandas mūrijau blokelių pertvarą prižiūrint meistrui`;
const RECOGNITION_KEY = `qa-synthetic-practice-${RUN}`;
let practiceEntryId = "";

test("L-9. the learner records a practice day in the learning relationship", async ({ browser }) => {
  const { page, close } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/journal");
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  await page.getByTestId("journal-quick-record-text").fill(PRACTICE);
  await page.getByTestId("journal-quick-record-understand").click();
  await expect(page.getByTestId("worklog-flow")).toBeVisible({ timeout: 45_000 });
  const context = page.locator('[data-testid="worklog-context"]');
  if ((await context.count()) > 0) {
    const opts = await context.locator("option").evaluateAll((os) =>
      (os as HTMLOptionElement[]).map((o) => ({ v: o.value, t: (o.textContent ?? "").trim() })),
    );
    console.info(`[learning] contexts offered: ${opts.map((o) => o.t).join(" | ")}`);
    const learning = opts.find((o) => o.v && /mokin|student|praktik/i.test(o.t) && /Alfa/.test(o.t));
    expect(learning, "the learning relationship with Alfa is offered as a context").toBeTruthy();
    await context.selectOption(learning!.v);
  }
  // Several projects in that relationship: the product asks which one (or "not project work").
  // Practice here is not a project's hours, so the walk says so explicitly.
  const project = page.getByTestId("worklog-project");
  if (await project.isVisible().catch(() => false)) {
    const values = await project.locator("option").evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value));
    await project.selectOption(values[values.length - 1]);
  }
  await page.getByTestId("worklog-save").click();
  const confirmBtn = page.getByTestId("worklog-confirm");
  const early = page.getByTestId("worklog-error").or(page.getByTestId("worklog-blocked"));
  await expect(confirmBtn.or(early).first()).toBeVisible({ timeout: 45_000 });
  if (!(await confirmBtn.isVisible())) throw new Error(`practice not ready to confirm: ${await early.first().innerText()}`);
  await confirmBtn.click();
  const done = page.getByTestId("worklog-done");
  const failed = page.getByTestId("worklog-error").or(page.getByTestId("worklog-blocked"));
  await expect(done.or(failed)).toBeVisible({ timeout: 45_000 });
  if (!(await done.isVisible())) throw new Error(`practice not saved: ${await failed.innerText()}`);
  await page.goto("/lt/dashboard/journal");
  const card = page.locator('[data-testid^="journal-entry-card-"]', { hasText: RUN }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  practiceEntryId = (await card.getAttribute("data-testid"))!.replace("journal-entry-card-", "");
  await close();
});

test("L-10. the institution signs the practice off in its review queue", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, ALFA);
  await page.goto("/lt/dashboard/inbox");
  const item = page.getByTestId(`inbox-entry-${practiceEntryId}`);
  await expect(item).toBeVisible({ timeout: 30_000 });
  await page.getByTestId(`journal-approve-entry-${practiceEntryId}`).click();
  await expect
    .poll(
      async () => {
        await page.goto("/lt/dashboard/inbox");
        return page.getByTestId(`inbox-entry-${practiceEntryId}`).count();
      },
      { timeout: 45_000, intervals: [3_000] },
    )
    .toBe(0);
  await close();
});

test("L-11. the assessor picks that signed-off practice and records the recognition", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, ALFA);
  await page.goto("/lt/dashboard/company/education");
  const form = page.getByTestId("record-recognition");
  await expect(form).toBeVisible({ timeout: 30_000 });
  await form.locator("summary").click();
  const subject = form.locator('select[name="subjectProfileId"]');
  const pick = await subject.locator("option", { hasText: LEARNER }).first().getAttribute("value");
  expect(pick).toBeTruthy();
  await subject.selectOption(pick!);
  const option = form.getByTestId("recognition-evidence-option");
  await expect(option.first(), "the signed-off practice is offered as evidence").toBeVisible({ timeout: 30_000 });
  const offered = await option.count();
  const ours = form.locator("label", { hasText: "pertvar" }).getByTestId("recognition-evidence-option").first();
  await (await ours.count() ? ours : option.first()).check();
  await form.locator('select[name="requirementKind"]').selectOption("skill");
  await form.locator('input[name="requirementKey"]').fill(RECOGNITION_KEY);
  await form.locator('input[name="requirementCountry"]').fill("LT");
  await form.locator('select[name="decision"]').selectOption("recognised");
  await form.getByRole("button", { name: /./ }).last().click();
  const ok = form.getByTestId("recognition-ok");
  const alert = form.getByRole("alert");
  await expect(ok.or(alert).first()).toBeVisible({ timeout: 30_000 });
  if (!(await ok.isVisible())) throw new Error(`recognition not recorded: ${await alert.first().innerText()}`);
  console.info(`[learning] evidence offered=${offered}; recognition recorded`);
  await close();
});

test("L-12. the learner sees the recognition among their own", async ({ browser }) => {
  const { page, close } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/documents");
  const list = page.getByTestId("own-recognitions-list");
  await expect(list).toBeVisible({ timeout: 30_000 });
  await expect(list).toContainText(RECOGNITION_KEY, { timeout: 30_000 });
  await close();
});
