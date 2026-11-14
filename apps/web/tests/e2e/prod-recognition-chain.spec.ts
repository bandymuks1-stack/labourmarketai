import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { inviteCapGate } from "./invite-cap";
import { test, expect, type Browser, type Locator, type Page } from "./prod-walk";

/**
 * PRODUCTION — A POSITIVE RECOGNITION FROM REAL EVIDENCE, READ-ONLY (owner 2026-10-12 §4: prove
 * it with a real, allowed piece of evidence, not an empty list).
 *
 * WHY QA-SYNTHETIC BETA, NOT ALFA. `record_competency_recognition_v1` refuses an assessor that
 * ENGAGES the subject as a worker (conflict of interest, rule 4). The second synthetic worker is
 * an employee of Alfa, so Alfa is — correctly — refused ("Ši įstaiga negali įrašyti šio
 * pripažinimo šiam asmeniui", prod 2026-10-13). Beta holds no work relationship with that person,
 * so it is the honest assessor.
 *
 * NO NEW PERMANENT ROW IN PRODUCTION (owner 2026-11-14, item 7: "Pripažinimo grandinės bandymo,
 * kuris sukuria nuolatinį žurnalo įrašą, nevykdyti. Parengti saugų izoliuotą testą be produkcijos
 * duomenų užteršimo."). Nothing at the end of this chain can be removed: a signed-off journal entry
 * offers no delete, a sign-off is append-only, a recognition can only be revoked. So this walk
 * WRITES NONE OF THEM. It keeps only the reversible setup (R-1 a capability flag, R-2/R-3 the
 * learner link, R-3b the review switch) and then READS what earlier runs already left:
 *
 *   - R-3c finds an earlier signed-off QA-SYNTHETIC practice day among Beta's citable evidence and
 *     an earlier QA-SYNTHETIC recognition among the learner's own;
 *   - R-6 proves, on this build, that Beta may still cite that practice (it needs a current
 *     approval and the right to read it);
 *   - R-7 proves the learner still sees the recognition.
 *
 * The write path itself — the quick record, the sign-off in the review queue and
 * `record_competency_recognition_v1` citing it — is proven on a throwaway local stack by
 * `recognition-chain-isolated.spec.ts`, never against production. When production holds no earlier
 * record, R-6 and R-7 say so and are skipped; they never fall back to writing one.
 */
const BETA = "QA-SYNTHETIC Beta";
const LEARNER = /QA-SYNTHETIC (Worker|mokinys)/;
/** What every earlier run's practice day said (its own run id after "QA-SYNTHETIC "). */
const PRACTICE_TEXT = "praktikoje 4 valandas mūrijau blokelių pertvarą";
/** Every earlier run's recognition key began with this (run id after it). */
const RECOGNITION_PREFIX = "qa-synthetic-practice-";
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
/** What earlier runs left, read once (R-3c). */
let signedOffExists = false;
let recognitionExists = false;

/** Beta's recognition form with the learner chosen, so the evidence list is theirs. */
async function recognitionForm(page: Page) {
  await page.goto("/lt/dashboard");
  await workspace(page, BETA);
  await page.goto("/lt/dashboard/company/education");
  const form = page.getByTestId("record-recognition");
  await expect(form).toBeVisible({ timeout: 30_000 });
  await form.locator("summary").click();
  const subject = form.locator('select[name="subjectProfileId"]');
  const options = await subject.locator("option").evaluateAll((os) =>
    (os as HTMLOptionElement[]).filter((o) => o.value).map((o) => ({ v: o.value, t: (o.textContent ?? "").trim() })),
  );
  const pick = (options.find((o) => LEARNER.test(o.t)) ?? (options.length === 1 ? options[0] : undefined))?.v;
  expect(pick, `the learner is offered as the subject: ${options.map((o) => o.t).join(" | ")}`).toBeTruthy();
  await subject.selectOption(pick!);
  return form;
}

/** An earlier run's signed-off practice day, as Beta's evidence list offers it. */
function earlierPractice(form: Locator) {
  return form.locator("label", { hasText: PRACTICE_TEXT }).filter({ hasText: "QA-SYNTHETIC" }).getByTestId("recognition-evidence-option");
}

function notInProduction(what: string): void {
  test.info().annotations.push({ type: "not-in-production", description: what });
  console.info(`[recognition] NOT WRITTEN in production: ${what}`);
}

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
    // Any real learner option (the placeholder has an empty value): Beta has one learner.
    const known = (await form.locator('select[name="subjectProfileId"] option').evaluateAll((os) => (os as HTMLOptionElement[]).filter((o) => o.value).length));
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
  const name = page.getByTestId("invite-name");
  if (await name.isVisible().catch(() => false)) await name.fill("QA-SYNTHETIC mokinys (Beta)");
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

test("R-3c. what earlier runs left: a signed-off practice day, a recognition, both or neither", async ({ browser }) => {
  // Read-only. It runs AFTER R-1…R-3b: Beta shows no recognition form until it trains people
  // and has a learner. Only a definite answer counts: a failed read renders an alert (evidence)
  // or an "unavailable" note (recognitions), never the list or the explicit empty state.
  const beta = await as(browser, "owner");
  const form = await recognitionForm(beta.page);
  const evidence = form.getByTestId("recognition-evidence");
  await expect(
    evidence.getByTestId("recognition-evidence-option").first().or(evidence.getByTestId("recognition-evidence-none")),
    "the evidence read answered (a list or an explicit empty state), not unavailable",
  ).toBeVisible({ timeout: 30_000 });
  signedOffExists = (await earlierPractice(form).count()) > 0;
  await beta.close();
  const learner = await as(browser, "worker2");
  await learner.page.goto("/lt/dashboard/documents");
  const block = learner.page.getByTestId("own-recognitions");
  await expect(block).toBeVisible({ timeout: 30_000 });
  const list = block.getByTestId("own-recognitions-list");
  await expect(list.or(block.getByTestId("own-recognitions-empty")), "the learner's recognitions read answered, not unavailable").toBeVisible({ timeout: 30_000 });
  recognitionExists = (await list.count()) > 0 && (await list.innerText()).includes(RECOGNITION_PREFIX);
  await learner.close();
  console.info(`[recognition] earlier runs left: signed-off practice day=${signedOffExists} recognition=${recognitionExists}`);
});

test("R-4/R-5. the practice day and its sign-off are NOT written in production", () => {
  notInProduction(
    "the quick record of a practice day and Beta's sign-off: both permanent. Proven on the local stack by recognition-chain-isolated.spec.ts (owner 2026-11-14, item 7)",
  );
});

test("R-6. Beta may still cite an earlier signed-off QA-SYNTHETIC practice day", async ({ browser }) => {
  test.skip(!signedOffExists, "production holds no earlier signed-off QA-SYNTHETIC practice day; none is written here (owner 2026-11-14, item 7)");
  const { page, close } = await as(browser, "owner");
  const form = await recognitionForm(page);
  await expect(earlierPractice(form).first(), "the signed-off practice is offered as evidence").toBeVisible({ timeout: 30_000 });
  // Nothing is ticked or submitted: record_competency_recognition_v1 inserts a permanent row.
  notInProduction("record_competency_recognition_v1 is not called; the write is proven by recognition-chain-isolated.spec.ts");
  await close();
});

test("R-7. the learner still sees an earlier QA-SYNTHETIC recognition among their own", async ({ browser }) => {
  test.skip(!recognitionExists, "production holds no earlier QA-SYNTHETIC recognition; none is written here (owner 2026-11-14, item 7)");
  const { page, close } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/documents");
  const list = page.getByTestId("own-recognitions-list");
  await expect(list).toBeVisible({ timeout: 30_000 });
  await expect(list).toContainText(RECOGNITION_PREFIX, { timeout: 30_000 });
  await close();
});
