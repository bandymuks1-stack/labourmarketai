import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * PRODUCTION ORGANIZATION ROSTER — the organization side of owner area 4
 * (companies and organizations) the functional registry still holds as
 * IMPLEMENTED_UNVERIFIED or PARTIAL:
 *
 *   R-1  3.21  the roster lists the organization's own worker, with a state
 *   R-2  3.22  a people file is read, previewed and committed, and the person
 *              is on the organization's roster (and opens on its own page)
 *   R-3  3.23  on/offboarding renders its members, or says it is not installed
 *   R-4  3.30  company settings: capabilities re-saved as they are, the help
 *              request form is offered (never submitted: it reaches staff)
 *   R-5  3.26  an instruction is sent to the worker, and the worker reads it
 *   R-6  3.32  an asset is issued to the worker, acknowledged, and returned
 *   R-7  1.10  another organization's manager sees none of this roster, and an
 *              anonymous caller is sent to sign in
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic):
 *   owner    owns "QA-SYNTHETIC Alfa"
 *   worker   Vytas Darbininkas, employee of Alfa
 *   manager  runs "QA-SYNTHETIC Gama" — the other organization
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=org-roster). The one
 * API call reads the worker's OWN row with the worker's own token. Failure
 * messages carry counts and states only — never names from a roster.
 *
 * Idempotent: the imported person and the asset have fixed synthetic names and
 * are reused (a rerun's import previews "already on the roster" and has
 * nothing to commit); the asset is returned at the end; the instruction note
 * carries the run id. Tests are independent so one run reports every break.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const ALFA = "QA-SYNTHETIC Alfa";
const GAMA = "QA-SYNTHETIC Gama";
const IMPORTED = "QA-SYNTHETIC Importuotas Asmuo";
const ASSET = "QA-SYNTHETIC įrankis";
const MARK = `QA-SYNTHETIC ${RUN}`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" &&
  SUPA !== "" &&
  ANON !== "" &&
  ["worker", "owner", "manager"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

async function as(browser: Browser, slot: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: state(slot), locale: "lt-LT" });
  return { ctx, page: await ctx.newPage() };
}

/** Make `orgName` the active workspace through the real header chip. */
async function useWorkspace(page: Page, orgName: string): Promise<void> {
  await page.goto("/lt/dashboard/company/people");
  const chip = page.getByTestId("workspace-chip").first();
  await expect(chip).toBeVisible({ timeout: 30_000 });
  if ((await chip.innerText()).includes(orgName)) return;
  await chip.getByRole("button").first().click();
  const menu = page.getByTestId("workspace-chip-menu");
  await menu.locator('[data-testid^="workspace-option-"]', { hasText: orgName }).first().click();
  await expect(chip).toContainText(orgName, { timeout: 30_000 });
}

async function rendered(page: Page, label: string): Promise<void> {
  expect(/\/auth\/(login|sign-?in)/.test(page.url()), `${label}: bounced to sign-in`).toBe(false);
  await expect(page.getByTestId("error-boundary-message"), `${label}: error boundary`).toHaveCount(0);
  await expect(page.getByTestId("global-error-message"), `${label}: global error`).toHaveCount(0);
}

/** The worker's own workers.id (own row, own token). */
async function ownWorkerId(): Promise<{ id: string; profileId: string }> {
  const token = bearerOf("worker");
  const sub = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub as string;
  const res = await qaApi(`/rest/v1/workers?select=id,profile_id&profile_id=eq.${encodeURIComponent(sub)}`, token);
  expect(res.status, "own worker row answered").toBe(200);
  const rows = (await res.json()) as { id: string; profile_id: string }[];
  expect(rows.length, "exactly one own worker row").toBe(1);
  return { id: rows[0].id, profileId: rows[0].profile_id };
}

test("R-1 (3.21 / 5.12). Alfa's roster lists its worker with a team state", async ({ browser }) => {
  const { id } = await ownWorkerId();
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await rendered(page, "people");
  await expect(page.getByTestId("company-people")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("company-workers-migration-blocker")).toHaveCount(0);
  const row = page.getByTestId(`company-worker-row-${id}`);
  await expect(row, "the worker is on the roster").toBeVisible({ timeout: 30_000 });
  expect(await row.getAttribute("data-team-state"), "the row carries an availability state").toMatch(/^[a-z_]+$/);
  await expect(page.getByTestId("company-team-counts")).toBeVisible();
  await ctx.close();
});

test("R-2 (3.22). a people file is previewed, committed once, and the person is on the roster", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/company/people#people-import-section");
  const panel = page.getByTestId("people-import");
  await expect(panel, "the import panel (inside 'more tools')").toBeVisible({ timeout: 30_000 });
  await panel.getByTestId("people-import-relationship").selectOption("employee");
  await panel.getByTestId("people-import-file").setInputFiles({
    name: "qa-synthetic-people.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`vardas\n${IMPORTED}\n`, "utf8"),
  });
  const preview = panel.getByTestId("people-import-preview");
  const error = panel.getByTestId("people-import-error");
  await expect(preview.or(error)).toBeVisible({ timeout: 30_000 });
  if (await error.isVisible()) throw new Error(`preview refused: ${await error.innerText()}`);

  const confirm = panel.getByTestId("people-import-confirm");
  if (await confirm.isEnabled()) {
    // First run: one person to create. The receipt is the answer.
    await confirm.click();
    const receipt = panel.getByTestId("people-import-receipt");
    await expect(receipt.or(error)).toBeVisible({ timeout: 30_000 });
    if (await error.isVisible()) throw new Error(`commit refused: ${await error.innerText()}`);
  } else {
    // A rerun: the person is already on the roster, so nothing is written.
    test.info().annotations.push({ type: "note", description: "import: already on the roster (rerun)" });
  }

  // On a fresh load the person is on the organization roster and opens.
  await page.goto("/lt/dashboard/company/people#people-more");
  const person = page.locator('[data-testid^="organization-roster-person-"]', { hasText: IMPORTED }).first();
  await expect(person, "the imported person is on the roster").toBeVisible({ timeout: 30_000 });
  const pid = ((await person.getAttribute("data-testid")) ?? "").replace(/^organization-roster-person-/, "");
  expect(pid).toMatch(/^[0-9a-f-]{36}$/);
  await page.goto(`/lt/dashboard/company/people/${pid}`);
  await rendered(page, "person page");
  // Scoped to <main>: the body streams in through a hidden <div id="S:n"> whose
  // reveal is rAF-driven; in a never-painting headless tab that hidden copy can
  // sit outside <main> beside the rendered one (calendar-journal-history.spec.ts).
  const main = page.getByRole("main");
  await expect(main.getByTestId("company-person")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await expect(main.getByTestId("company-person-name")).toContainText(IMPORTED);
  await ctx.close();
});

test("R-3 (3.23). on/offboarding lists the organization's members, or says it is not installed", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/company/people#lifecycle");
  await rendered(page, "people (lifecycle)");
  // The not-installed state renders INSIDE the section, so assert the section
  // alone (a union locator matches both and fails strict mode), then read it.
  const section = page.getByTestId("company-lifecycle");
  await expect(section).toBeVisible({ timeout: 30_000 });
  const unavailable = section.getByTestId("lifecycle-unavailable");
  if ((await unavailable.count()) > 0) {
    test.info().annotations.push({ type: "note", description: "lifecycle: not installed (honest state)" });
  } else {
    await expect(section.getByTestId("lifecycle-honest-note")).toBeVisible();
    await expect(section.getByTestId("lifecycle-members")).toBeVisible();
    const n = await section.getByTestId("lifecycle-member").count();
    test.info().annotations.push({ type: "note", description: `lifecycle members: ${n}` });
  }
  await ctx.close();
});

test("R-4 (3.30). company settings save the declared capabilities as they are, and offer help", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/company/settings#company-capabilities");
  await rendered(page, "settings");
  await expect(page.getByTestId("company-settings")).toBeVisible({ timeout: 30_000 });
  const save = page.getByTestId("org-capabilities-save");
  if (await save.isVisible().catch(() => false)) {
    // Declared capabilities are settled chips and the write is grant-only (no
    // revoke), so the walk proves the control without granting anything.
    await expect(save, "nothing picked: nothing to save").toBeDisabled();
    const box = page.locator('[data-testid^="org-capability-checkbox-"]').first();
    await box.check();
    await expect(save, "a picked capability can be saved").toBeEnabled();
    await box.uncheck();
    await expect(save).toBeDisabled();
  } else {
    test.info().annotations.push({ type: "note", description: "capabilities card not offered to this role" });
  }
  // The help request reaches platform staff, so the walk only proves it is offered.
  await page.goto("/lt/dashboard/company/settings#help");
  await expect(page.getByTestId("help-request-form")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("help-request-submit")).toBeVisible();
  await ctx.close();
});

test("R-5 (3.26). an instruction sent to the worker reaches the worker", async ({ browser }) => {
  const { profileId } = await ownWorkerId();
  const body = `${MARK} instrukcija`;
  {
    const { ctx, page } = await as(browser, "owner");
    await useWorkspace(page, ALFA);
    await page.goto("/lt/dashboard/instructions");
    await rendered(page, "instructions (manager)");
    const composer = page.getByTestId("manager-instruction-composer");
    await expect(composer, "the composer (a roster to send to)").toBeVisible({ timeout: 30_000 });
    await composer.getByTestId("instruction-worker-select").selectOption(profileId);
    await composer.locator('textarea[name="body"]').fill(body);
    await composer.getByTestId("instruction-send").click();
    const sent = composer.getByTestId("instruction-sent");
    const failed = composer.getByTestId("instruction-send-failed");
    await expect(sent.or(failed)).toBeVisible({ timeout: 30_000 });
    if (await failed.isVisible()) throw new Error(`instruction refused: ${await failed.getAttribute("data-code")}`);
    await ctx.close();
  }
  {
    const { ctx, page } = await as(browser, "worker");
    await page.goto("/lt/dashboard/instructions");
    await rendered(page, "instructions (worker)");
    await expect(
      page.getByTestId("worker-instruction-card").filter({ hasText: MARK }),
      "the worker reads this run's instruction",
    ).toHaveCount(1, { timeout: 30_000 });
    await ctx.close();
  }
});

test("R-6 (3.32). an asset is issued to the worker, acknowledged by them, and returned", async ({ browser }) => {
  const { id: workerId } = await ownWorkerId();
  const owner = await as(browser, "owner");
  await useWorkspace(owner.page, ALFA);
  await owner.page.goto("/lt/dashboard/assets");
  await rendered(owner.page, "assets (manager)");
  const registry = owner.page.getByTestId("assets-registry");
  await expect(registry).toBeVisible({ timeout: 30_000 });
  await expect(registry.getByTestId("assets-preapply")).toHaveCount(0);
  await expect(registry.getByTestId("assets-no-org")).toHaveCount(0);

  const row = () => owner.page.getByTestId("asset-row").filter({ hasText: ASSET }).first();
  if ((await owner.page.getByTestId("asset-row").filter({ hasText: ASSET }).count()) === 0) {
    const org = registry.getByTestId("asset-org");
    if (await org.isVisible().catch(() => false)) {
      // The option is the organization's full name ("… Alfa (testinis
      // subjektas)"); match it by text like the other walks do.
      const value = await org.locator("option", { hasText: ALFA }).first().getAttribute("value");
      expect(value, "Alfa is one of the organizations the owner manages").toBeTruthy();
      await org.selectOption(value!);
    }
    await registry.getByTestId("asset-type").selectOption({ index: 0 });
    await registry.getByTestId("asset-name").fill(ASSET);
    await registry.getByTestId("asset-create").click();
    await expect(registry.getByTestId("assets-msg")).toBeVisible({ timeout: 30_000 });
    await owner.page.goto("/lt/dashboard/assets");
  }
  await expect(row(), "the asset persists").toBeVisible({ timeout: 30_000 });

  // A leftover issue from an interrupted run is returned first.
  if (await row().getByTestId("asset-return-toggle").isVisible().catch(() => false)) {
    await row().getByTestId("asset-return-toggle").click();
    await row().getByTestId("asset-return-submit").click();
    await owner.page.waitForTimeout(2_000);
    await owner.page.goto("/lt/dashboard/assets");
  }
  await row().getByTestId("asset-issue-toggle").click();
  await row().getByTestId("asset-worker").selectOption(workerId);
  await row().getByTestId("asset-issue-submit").click();
  await expect(owner.page.getByTestId("assets-msg")).toBeVisible({ timeout: 30_000 });

  const worker = await as(browser, "worker");
  await worker.page.goto("/lt/dashboard/assets");
  await rendered(worker.page, "assets (worker)");
  const mine = worker.page.getByTestId("my-assets-list").locator("li", { hasText: ASSET }).first();
  await expect(mine, "the worker sees the issued asset").toBeVisible({ timeout: 30_000 });
  const ack = mine.getByTestId("asset-acknowledge");
  if (await ack.isVisible().catch(() => false)) {
    await ack.click();
    await expect(worker.page.getByTestId("my-assets-msg")).toBeVisible({ timeout: 30_000 });
  }
  await worker.ctx.close();

  // Cleanup: the asset comes back, so a rerun can issue it again.
  await owner.page.goto("/lt/dashboard/assets");
  await row().getByTestId("asset-return-toggle").click();
  await row().getByTestId("asset-return-submit").click();
  await expect(owner.page.getByTestId("assets-msg")).toBeVisible({ timeout: 30_000 });
  await owner.page.goto("/lt/dashboard/assets");
  await expect(row().getByTestId("asset-return-toggle"), "the asset is back in the store").toHaveCount(0, {
    timeout: 30_000,
  });
  await owner.ctx.close();
});

test("R-7 (1.10). another organization sees none of Alfa's roster; an anonymous caller is sent to sign in", async ({ browser }) => {
  const { id } = await ownWorkerId();
  {
    const { ctx, page } = await as(browser, "manager");
    await useWorkspace(page, GAMA);
    await rendered(page, "people (Gama)");
    await expect(page.getByTestId(`company-worker-row-${id}`), "Alfa's worker is not on Gama's roster").toHaveCount(0);
    await page.goto("/lt/dashboard/company/people#people-more");
    await expect(
      page.locator('[data-testid^="organization-roster-person-"]', { hasText: IMPORTED }),
      "Alfa's imported person is not on Gama's roster",
    ).toHaveCount(0);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ locale: "lt-LT" });
    const page = await ctx.newPage();
    await page.goto("/lt/dashboard/company/people");
    await expect(page, "anonymous → sign-in").toHaveURL(/\/auth\/(login|sign-?in)/, { timeout: 30_000 });
    await ctx.close();
  }
});
