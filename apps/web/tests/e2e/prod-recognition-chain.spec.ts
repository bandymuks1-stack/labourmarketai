import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { inviteCapGate } from "./invite-cap";
import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * PRODUCTION — A POSITIVE RECOGNITION FROM REAL EVIDENCE (owner 2026-10-12 §4: prove it with a
 * real, allowed piece of evidence, not an empty list).
 *
 * WHY QA-SYNTHETIC BETA, NOT ALFA. `record_competency_recognition_v1` refuses an assessor that
 * ENGAGES the subject as a worker (conflict of interest, rule 4). The second synthetic worker is
 * an employee of Alfa, so Alfa is — correctly — refused ("Ši įstaiga negali įrašyti šio
 * pripažinimo šiam asmeniui", prod 2026-10-13). Beta holds no work relationship with that person,
 * so it is the honest assessor: it declares it trains people, connects the person as a learner,
 * signs off a practice day, and recognises a competency citing THAT signed-off entry.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=recognition-chain). One invitation per
 * run at most (the learner link); the invitation cap reports BLOCKED, never FAIL.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const BETA = "QA-SYNTHETIC Beta";
const LEARNER = /QA-SYNTHETIC (Worker|mokinys)/;
const PRACTICE = `QA-SYNTHETIC ${RUN}: praktikoje 4 valandas mūrijau blokelių pertvarą prižiūrint meistrui`;
const RECOGNITION_KEY = `qa-synthetic-practice-${RUN}`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["owner", "worker2"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });
const cap = inviteCapGate();
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

let link = "";
let practiceEntryId = "";

test("R-1. Beta declares it trains people", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, BETA);
  await page.goto("/lt/dashboard/company/education");
  if (!/\/company\/education/.test(page.url())) {
    await page.goto("/lt/dashboard/company/settings");
    const more = page.getByTestId("settings-more");
    if ((await more.getAttribute("open")) === null) await more.locator("summary").first().click();
    const box = page.getByTestId("org-capability-checkbox-training_provider");
    await expect(box).toBeVisible({ timeout: 30_000 });
    if (!(await box.isChecked())) await box.check();
    await page.getByTestId("org-capabilities-save").click();
    await expect(page.getByTestId("org-capabilities-saved")).toBeVisible({ timeout: 30_000 });
    await page.goto("/lt/dashboard/company/education");
  }
  await expect(page.getByTestId("company-education")).toBeVisible({ timeout: 30_000 });
  await close();
});

test("R-2. Beta connects the person as a learner (unless already connected)", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, BETA);
  await page.goto("/lt/dashboard/company/education");
  const form = page.getByTestId("record-recognition");
  if (await form.isVisible().catch(() => false)) {
    await form.locator("summary").click();
    const known = await form.locator('select[name="subjectProfileId"] option', { hasText: LEARNER }).count();
    if (known > 0) {
      console.info("[recognition] the learner is already connected to Beta");
      await close();
      return;
    }
  }
  await page.getByTestId("institution-learners-invite").click();
  await page.waitForURL(/\/dashboard\/network/, { timeout: 30_000 });
  const open = page.getByTestId("invite-panel-open");
  const capacity = page.getByTestId("invite-capacity");
  await expect(open.or(capacity).first()).toBeVisible({ timeout: 30_000 });
  if (await open.isVisible().catch(() => false)) await open.click();
  await expect(capacity).toHaveValue("student", { timeout: 30_000 });
  const linkMode = page.getByTestId("invite-mode-link");
  if (await linkMode.isVisible().catch(() => false)) await linkMode.click();
  await page.getByTestId("invite-submit").click();
  const copy = page.getByTestId("invite-copy-link").first();
  const refused = page.getByTestId("invite-result-limit_reached");
  await expect(copy.or(refused).first()).toBeVisible({ timeout: 30_000 });
  if (!(await copy.isVisible())) {
    await close();
    cap.check("limit_reached");
  }
  link = new URL((await copy.getAttribute("data-invite-link")) ?? "").pathname;
  await close();
});

test("R-3. the person accepts the learning relationship", async ({ browser }) => {
  test.skip(!link, "already connected");
  const { page, close } = await as(browser, "worker2");
  await page.goto(link);
  const accept = page.getByTestId("invite-accept");
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await page.waitForURL((u) => !u.pathname.includes("/invite/"), { timeout: 30_000 });
  }
  await close();
});

test("R-3b. Beta switches review on for the learner through the audited manual door", async ({ browser }) => {
  // Automatic review is for EMPLOYEES who accepted knowingly (owner decision 1); a learner's
  // review is the institution's explicit choice, exactly like L-6 in the learning walk.
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, BETA);
  await page.goto("/lt/dashboard/company/people#org-members");
  const row = page.locator('[data-testid^="org-member-"][data-role="student"]', { hasText: LEARNER }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const toggle = row.locator('[data-testid^="toggle-review-"]');
  if ((await row.getAttribute("data-review")) === "off" && (await toggle.count()) > 0) {
    await toggle.click();
    await expect(row).toHaveAttribute("data-review", "on", { timeout: 30_000 });
  }
  console.info(`[recognition] Beta learner review: ${await row.getAttribute("data-review")}`);
  await close();
});

test("R-4. the learner records a practice day in the Beta learning relationship", async ({ browser }) => {
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
    const learning = opts.find((o) => o.v && /Beta/.test(o.t) && /mokin|student|praktik/i.test(o.t));
    expect(learning, `the Beta learning relationship is offered: ${opts.map((o) => o.t).join(" | ")}`).toBeTruthy();
    await context.selectOption(learning!.v);
  }
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

test("R-5. Beta signs the practice off in its review queue", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, BETA);
  await page.goto("/lt/dashboard/inbox");
  const item = page.getByTestId(`inbox-entry-${practiceEntryId}`);
  await expect(item, "the practice reaches Beta's review queue (learning relationship review on)").toBeVisible({ timeout: 30_000 });
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

test("R-6. Beta picks THAT signed-off practice from the list and records the recognition", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, BETA);
  await page.goto("/lt/dashboard/company/education");
  const form = page.getByTestId("record-recognition");
  await expect(form).toBeVisible({ timeout: 30_000 });
  await form.locator("summary").click();
  const subject = form.locator('select[name="subjectProfileId"]');
  const pick = await subject.locator("option", { hasText: LEARNER }).first().getAttribute("value");
  expect(pick, "the learner is offered as the subject").toBeTruthy();
  await subject.selectOption(pick!);
  const ours = form.locator("label", { hasText: "pertvar" }).getByTestId("recognition-evidence-option").first();
  await expect(ours, "the signed-off practice is offered as evidence").toBeVisible({ timeout: 30_000 });
  await ours.check();
  await form.locator('select[name="requirementKind"]').selectOption("skill");
  await form.locator('input[name="requirementKey"]').fill(RECOGNITION_KEY);
  await form.locator('input[name="requirementCountry"]').fill("LT");
  await form.locator('select[name="decision"]').selectOption("recognised");
  await form.locator('button[type="submit"]').click();
  const ok = form.getByTestId("recognition-ok");
  const alert = form.getByRole("alert");
  await expect(ok.or(alert).first()).toBeVisible({ timeout: 30_000 });
  if (!(await ok.isVisible())) throw new Error(`recognition not recorded: ${await alert.first().innerText()}`);
  await close();
});

test("R-7. the learner sees the recognition among their own", async ({ browser }) => {
  const { page, close } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/documents");
  const list = page.getByTestId("own-recognitions-list");
  await expect(list).toBeVisible({ timeout: 30_000 });
  await expect(list).toContainText(RECOGNITION_KEY, { timeout: 30_000 });
  await close();
});
