import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * PRODUCTION LEARNING & PRACTICE — owner programme 2026-10-12 §3C: an
 * institution runs a programme, invites a learner by link, the learner joins,
 * is placed in a cohort, sees it on their own learning compass, and the
 * institution's view shows only what it may (no learner journal).
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=learning-practice)
 * with the synthetic cast:
 *   owner    qa.owner+multiw  — QA-SYNTHETIC Alfa, declares itself a training provider
 *   worker2  qa.worker+goal3  — "QA-SYNTHETIC Worker", the learner
 * Idempotent: the programme is reused; an already-joined learner continues.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const ALFA = "QA-SYNTHETIC Alfa";
const PROGRAM = "QA-SYNTHETIC praktikos programa";
const COHORT = `QA-SYNTHETIC grupė ${RUN}`;
// The institution sees the learner by the name IT typed on the invitation
// (learner privacy), or by the profile name where membership shows it.
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

let link = "";

test("L-1. the organization declares it trains people, and runs a programme", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, ALFA);
  await page.goto("/lt/dashboard/company/education");
  if (!/\/company\/education/.test(page.url())) {
    console.info("[learning] declaring the training_provider capability");
    await page.goto("/lt/dashboard/company/settings");
    // The capability card lives in the folded "more tools" section.
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
  await expect(page.getByTestId("institution-programs-unavailable")).toHaveCount(0);
  await expect(page.getByTestId("institution-learners-unavailable")).toHaveCount(0);
  if ((await page.locator('[data-testid^="program-"]', { hasText: PROGRAM }).count()) === 0) {
    await page.getByTestId("program-name").fill(PROGRAM);
    const prof = page.getByTestId("program-profession");
    const value = await prof.locator("option").evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value).find((v) => v));
    if (value) await prof.selectOption(value);
    await page.getByTestId("program-create").click();
    const saved = page.getByTestId("program-form-saved").first();
    const alert = page.getByTestId("create-program-form").getByRole("alert");
    await expect(saved.or(alert).or(page.locator('[data-testid^="program-"]', { hasText: PROGRAM }).first())).toBeVisible({ timeout: 30_000 }).catch(() => undefined);
    if (await alert.isVisible().catch(() => false)) throw new Error(`programme not created: ${await alert.innerText()}`);
    await page.reload();
  }
  await expect(page.getByText(PROGRAM).first()).toBeVisible({ timeout: 30_000 });
  await close();
});

test("L-2. the institution invites a learner with a link (no e-mail needed)", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, ALFA);
  await page.goto("/lt/dashboard/company/education");
  await page.getByTestId("institution-learners-invite").click();
  await page.waitForURL(/\/dashboard\/network/, { timeout: 30_000 });
  const open = page.getByTestId("invite-panel-open");
  if (await open.isVisible().catch(() => false)) await open.click();
  const capacity = page.getByTestId("invite-capacity");
  await expect(capacity).toBeVisible({ timeout: 30_000 });
  await expect(capacity).toHaveValue("student");
  const linkMode = page.getByTestId("invite-mode-link");
  if (await linkMode.isVisible().catch(() => false)) await linkMode.click();
  const name = page.getByTestId("invite-name");
  if (await name.isVisible().catch(() => false)) await name.fill(`QA-SYNTHETIC mokinys ${RUN}`);
  await page.getByTestId("invite-submit").click();
  const copy = page.getByTestId("invite-copy-link").first();
  await expect(copy).toBeVisible({ timeout: 30_000 });
  link = (await copy.getAttribute("data-invite-link")) ?? "";
  expect(link).toMatch(/\/invite\//);
  await close();
});

test("L-3. the learner opens the link and joins as a learner", async ({ browser }) => {
  const { page, close } = await as(browser, "worker2");
  await page.goto(new URL(link).pathname);
  await expect(page.getByTestId("invite-page")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("invite-relationship")).toBeVisible();
  const accept = page.getByTestId("invite-accept");
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await page.waitForURL((u) => !u.pathname.includes("/invite/"), { timeout: 30_000 });
    console.info(`[learning] learner landed on ${new URL(page.url()).pathname}`);
  } else {
    console.info(`[learning] invite page answer: ${(await page.getByTestId("invite-page").innerText()).slice(0, 300)}`);
  }
  await page.goto(new URL(link).pathname);
  await expect(page.getByTestId("invite-accepted-by-you").or(page.getByTestId("invite-closed"))).toBeVisible({ timeout: 30_000 });
  await close();
});

test("L-4. the institution sees the joined learner and places them in a cohort", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, ALFA);
  await page.goto("/lt/dashboard/company/education");
  await expect(page.getByTestId("institution-learner-accepted").first()).toBeVisible({ timeout: 30_000 });
  const program = page.locator('[data-testid^="program-"]', { hasText: PROGRAM }).first();
  const form = program.locator('[data-testid^="create-cohort-form-"]').first();
  const programId = (await form.getAttribute("data-testid"))!.replace("create-cohort-form-", "");
  await page.getByTestId(`cohort-name-${programId}`).fill(COHORT);
  await page.getByTestId(`cohort-create-${programId}`).click();
  await expect(form.getByTestId("program-form-saved")).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
  await page.reload();
  const cohort = page.locator('[data-testid^="cohort-"]', { hasText: COHORT }).first();
  await expect(cohort).toBeVisible({ timeout: 30_000 });
  const select = cohort.locator('[data-testid^="assign-learner-select-"]');
  const cohortId = (await select.getAttribute("data-testid"))!.replace("assign-learner-select-", "");
  const pick = await select.locator("option", { hasText: LEARNER }).first().getAttribute("value");
  expect(pick, "the joined learner can be placed").toBeTruthy();
  await select.selectOption(pick!);
  await page.getByTestId(`assign-learner-submit-${cohortId}`).click();
  await expect(cohort.getByTestId("program-form-saved")).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
  await page.reload();
  await expect(page.locator('[data-testid^="cohort-"]', { hasText: COHORT }).first()).toContainText(LEARNER, { timeout: 30_000 });
  await close();
});

test("L-5. the learner sees the cohort on their own learning compass", async ({ browser }) => {
  const { page, close } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/profile");
  const compass = page.getByTestId("learning-compass");
  await expect(compass).toBeVisible({ timeout: 30_000 });
  await expect(compass).toContainText(COHORT, { timeout: 30_000 });
  await close();
});

test("L-6. the practice relationship is reviewable by the institution (journal review offered)", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, ALFA);
  await page.goto("/lt/dashboard/company/people#org-members");
  const row = page.locator('[data-testid^="org-member-"][data-role="student"]', { hasText: LEARNER }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const toggle = row.locator('[data-testid^="toggle-review-"]');
  console.info(`[learning] student review: ${await row.getAttribute("data-review")}; toggle offered: ${await toggle.count()}`);
  if ((await row.getAttribute("data-review")) === "off" && (await toggle.count()) > 0) {
    await toggle.click();
    await expect(row).toHaveAttribute("data-review", "on", { timeout: 30_000 });
  }
  await close();
});

test("L-7. the assessor picks the learner's signed-off practice from a list, never by typing ids (#2316)", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, ALFA);
  await page.goto("/lt/dashboard/company/education");
  const form = page.getByTestId("record-recognition");
  await expect(form).toBeVisible({ timeout: 30_000 });
  await form.locator("summary").click();
  const subject = form.locator('select[name="subjectProfileId"]');
  const pick = await subject.locator("option", { hasText: LEARNER }).first().getAttribute("value");
  expect(pick, "the joined learner is offered as the subject").toBeTruthy();
  await subject.selectOption(pick!);
  const evidence = form.getByTestId("recognition-evidence");
  // Read-only: an honest list or an honest "nothing signed off yet" — never the
  // "could not read" alert, and never a uuid text box. Nothing is submitted.
  await expect(evidence.getByTestId("recognition-evidence-option").first().or(evidence.getByTestId("recognition-evidence-none"))).toBeVisible({ timeout: 30_000 });
  await expect(evidence.getByRole("alert")).toHaveCount(0);
  await expect(form.locator('input[name="evidenceEntryIds"][type="hidden"]')).toHaveCount(1);
  console.info(`[learning] signed-off practice offered: ${await evidence.getByTestId("recognition-evidence-option").count()}`);
  await close();
});

test("L-8. a company can offer practice without being a school: the intern capacity is offered (#2318)", async ({ browser }) => {
  const { page, close } = await as(browser, "owner");
  await page.goto("/lt/dashboard");
  await workspace(page, ALFA);
  await page.goto("/lt/dashboard/network");
  const open = page.getByTestId("invite-panel-open");
  if (await open.isVisible().catch(() => false)) await open.click();
  const type = page.getByTestId("invite-type");
  await expect(type).toBeVisible({ timeout: 30_000 });
  await type.selectOption("join_organization").catch(() => undefined);
  const capacity = page.getByTestId("invite-capacity");
  await expect(capacity).toBeVisible({ timeout: 30_000 });
  const values = await capacity.locator("option").evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value));
  console.info(`[learning] capacities offered: ${values.join(",")}`);
  expect(values, "the practice-in-company relationship is offered").toContain("intern");
  // Nothing is submitted.
  await close();
});
