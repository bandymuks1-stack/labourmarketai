import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";

import { makeDocx } from "../../lib/cv/__fixtures__/cv-fixtures";

/**
 * CV IMPORT, NO DOUBLE ROWS (#3102, owner 2026-11-05): the real review of a CV
 * file, in real Chrome, on production. The confirm reads the person's rows and
 * inserts only when the same one isn't there. The tables have no unique key, so
 * two confirms at the same moment may both read "not there"; this walk counts.
 *
 * Each case runs for education and for a certificate:
 *   1. imported and confirmed once: one row;
 *   2. the same CV imported again and confirmed: still one row;
 *   3. two tabs of one browser confirm the same proposal at the same moment,
 *      three rounds, and a double click: one row each.
 *
 * Case 3 may well fail. A failure is the finding, reported with its count: the
 * fix (a unique key) is a separate owner decision, so don't weaken the assertion.
 *
 * WRITES. Only `qa.worker+goal3`, the synthetic worker. Every row carries
 * `QA-SYNTHETIC R<run id>`. `afterAll` can't run in a killed or cancelled job, so
 * every row with that prefix, from any run, is removed both before the test and
 * after it, and a row still there after it fails the run. The CV file is generated
 * in memory and names nobody.
 *
 * Logs carry the tag, counts and timings only; the walk log is a public artefact.
 * Runs only in `.github/workflows/prod-qa-walk.yml` with minted QA sessions.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const TAG = `QA-SYNTHETIC R${RUN}`;
// Only this walk writes this prefix; other walks' rows read `QA-SYNTHETIC <run id>`.
const ANY_RUN = /QA-SYNTHETIC R/;
// Each hook is capped so that the slowest case still fits the 30-minute walk job.
const SWEEP_TIMEOUT = 300_000;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state("worker2"));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ timeout: 600_000, retries: 0 });
// Real Chrome, not Playwright's Chromium. Still headless and scripted: it is Chrome, not a person.
test.use({ actionTimeout: 30_000, channel: "chrome" });

const ROUNDS = 3;
const school = (name: string) => `${TAG} ${name} profesine mokykla`;
const certificate = (name: string) => `${TAG} ${name} suvirinimo sertifikatas`;
const cvFile = (names: string[]) =>
  [
    "QA Synthetic Worker",
    ...names.flatMap((n) => [`${school(n)}, statybos programa 2015-2019`, `${certificate(n)} 2021`]),
  ].join("\n");

const inMain = (page: Page): Locator => page.getByRole("main");

/** The conversation's import: it parses locally and stores nothing until a confirm. */
async function importCv(page: Page, text: string): Promise<Locator> {
  await page.goto("/lt/dashboard");
  const composer = inMain(page).getByTestId("composer-input");
  await expect(composer).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  await composer.fill("Įkelk mano CV");
  await inMain(page).getByTestId("composer-send").click();
  await inMain(page).getByTestId("chat-chip-cv").filter({ visible: true }).last().click({ timeout: 60_000 });
  await expect(inMain(page).getByTestId("conversation-cv-flow").last()).toBeVisible({ timeout: 60_000 });
  const input = page.locator('[data-testid="cv-import-upload"] input[type="file"]').last();
  await input.waitFor({ state: "attached", timeout: 30_000 });
  await input.setInputFiles({
    name: "qa-synthetic-cv.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(makeDocx(text)),
  });
  const review = inMain(page).getByTestId("cv-import-section-review").last();
  const error = inMain(page).getByTestId("cv-import-error").last();
  await expect(review.or(error)).toBeVisible({ timeout: 60_000 });
  if (await error.isVisible()) throw new Error(`CV not read: ${(await error.innerText()).slice(0, 120)}`);
  return review;
}

type Kind = "education" | "certificate";
const titleOf = (kind: Kind, name: string) => (kind === "education" ? school(name) : certificate(name));
/** One proposal in a review, by its title; the row's own controls are inside it. */
function item(review: Locator, kind: Kind, name: string): Locator {
  const prefix = kind === "education" ? "edu" : "cert";
  return review.locator(`[data-testid^="cv-import-item-${prefix}-"]`).filter({ hasText: titleOf(kind, name) });
}
const confirmOf = (row: Locator) => row.locator('[data-testid^="cv-import-confirm-"]');
const savedOf = (row: Locator) => row.locator('[data-testid^="cv-import-saved-"]');

const ROWS: Record<Kind, { hash: string; row: string; remove: string }> = {
  education: {
    hash: "cv-education",
    row: "worker-education-row",
    remove: '[data-testid^="worker-education-remove-"]',
  },
  certificate: {
    hash: "cv-achievements",
    row: "worker-achievements-row",
    remove: '[data-testid^="worker-achievements-remove-"]',
  },
};

/** A real load of the profile at one section: a same-page hash change re-reads nothing. */
async function section(page: Page, kind: Kind): Promise<Locator> {
  await page.goto("about:blank");
  await page.goto(`/lt/dashboard/profile#${ROWS[kind].hash}`);
  const main = inMain(page);
  await expect(main.locator(`#${ROWS[kind].hash}`).first()).toBeVisible({ timeout: 30_000 });
  return main;
}

/** How many stored rows this title has, read from a fresh page. */
async function rowCount(page: Page, kind: Kind, name: string): Promise<number> {
  const rows = (await section(page, kind)).getByTestId(ROWS[kind].row).filter({ hasText: titleOf(kind, name) });
  await rows.first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
  return rows.count();
}

/** The count for one case, logged either way. Soft, so every case gets its own answer. */
async function expectOneRow(page: Page, label: string, kind: Kind, name: string): Promise<void> {
  const count = await rowCount(page, kind, name);
  console.info(`[result] ${label} ${kind}: rows=${count} ${count === 1 ? "PASS" : "FAIL"}`);
  expect.soft(count, `${label} ${kind}: rows`).toBe(1);
}

/** The server actions a tab really sent, so a pass can't hide a click that did nothing. */
function countActions(page: Page): () => number {
  let n = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) n++;
  });
  return () => n;
}

async function as(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: state("worker2"), locale: "lt-LT" });
  return { ctx, page: await ctx.newPage() };
}

test("#3102: confirming a CV's education and certificate leaves one row each", async ({ browser }) => {
  console.info(`[browser] ${browser.browserType().name()} ${browser.version()} channel=chrome`);
  const { ctx, page } = await as(browser);

  await test.step("case 1: imported and confirmed once", async () => {
    const text = cvFile(["vienas"]);
    const review = await importCv(page, text);
    for (const kind of ["education", "certificate"] as const) {
      await expect(item(review, kind, "vienas"), "the CV yields this proposal").toHaveCount(1, { timeout: 30_000 });
    }
    const before = await rowCount(page, "education", "vienas");
    console.info(`[control] a proposal is not a save: education rows before the confirm=${before}`);
    expect.soft(before).toBe(0);
    const again = await importCv(page, text);
    for (const kind of ["education", "certificate"] as const) {
      const row = item(again, kind, "vienas");
      await confirmOf(row).click();
      await expect(savedOf(row)).toBeVisible({ timeout: 30_000 });
    }
    for (const kind of ["education", "certificate"] as const) await expectOneRow(page, "case 1", kind, "vienas");
  });

  await test.step("case 2: the same CV imported again and confirmed", async () => {
    const review = await importCv(page, cvFile(["vienas"]));
    for (const kind of ["education", "certificate"] as const) {
      const row = item(review, kind, "vienas");
      await confirmOf(row).click();
      await expect(savedOf(row), "a second confirm answers as saved").toBeVisible({ timeout: 30_000 });
    }
    for (const kind of ["education", "certificate"] as const) await expectOneRow(page, "case 2", kind, "vienas");
  });

  const rounds = Array.from({ length: ROUNDS }, (_, i) => `lygiagretus${"abcdefgh"[i]}`);
  const text = cvFile([...rounds, "dvigubas"]);
  const tabB = await ctx.newPage();

  await test.step("case 3a: two tabs confirm the same proposal at the same moment", async () => {
    const actionsA = countActions(page);
    const actionsB = countActions(tabB);
    const reviewA = await importCv(page, text);
    const reviewB = await importCv(tabB, text);
    for (const name of rounds) {
      for (const kind of ["education", "certificate"] as const) {
        const rowA = item(reviewA, kind, name);
        const rowB = item(reviewB, kind, name);
        const sentBefore = actionsA() + actionsB();
        // The same wall clock in both tabs: a real click on the real button, without
        // Playwright's checks spreading the two apart. Each tab keeps its own click time.
        const at = Date.now() + 500;
        const fire = (row: Locator) =>
          confirmOf(row).evaluate((el, when) => {
            return new Promise<number>((done) => {
              setTimeout(() => {
                (el as HTMLElement).click();
                done(Date.now());
              }, when - Date.now());
            });
          }, at);
        const [clickA, clickB] = await Promise.all([fire(rowA), fire(rowB)]);
        await expect(savedOf(rowA)).toBeVisible({ timeout: 30_000 });
        await expect(savedOf(rowB)).toBeVisible({ timeout: 30_000 });
        console.info(`[parallel] ${name} ${kind}: clicks ${Math.abs(clickA - clickB)} ms apart, actions sent=${actionsA() + actionsB() - sentBefore}`);
      }
    }
    for (const name of rounds) {
      for (const kind of ["education", "certificate"] as const) await expectOneRow(page, `case 3a ${name}`, kind, name);
    }
  });

  await test.step("case 3b: a double click on the confirm", async () => {
    const actions = countActions(page);
    const review = await importCv(page, text);
    for (const kind of ["education", "certificate"] as const) {
      const row = item(review, kind, "dvigubas");
      const sentBefore = actions();
      await confirmOf(row).dblclick();
      await expect(savedOf(row)).toBeVisible({ timeout: 30_000 });
      console.info(`[double-click] ${kind}: actions sent=${actions() - sentBefore}`);
    }
    for (const kind of ["education", "certificate"] as const) await expectOneRow(page, "case 3b", kind, "dvigubas");
  });

  await ctx.close();
});

/** Removes this walk's rows from any run. Returns the kinds it could not prove clean. */
async function sweep(browser: Browser, when: string): Promise<string[]> {
  const { ctx, page } = await as(browser);
  const left: string[] = [];
  try {
    for (const kind of ["education", "certificate"] as const) {
      let removed = 0;
      let earlier = 0;
      let stayed = -1;
      try {
        for (let i = 0; i < 40; i++) {
          const rows = (await section(page, kind)).getByTestId(ROWS[kind].row).filter({ hasText: ANY_RUN });
          await rows.first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
          const before = await rows.count();
          if (before === 0) break;
          const fromEarlierRun = !(await rows.first().innerText()).includes(TAG);
          await rows.first().locator(ROWS[kind].remove).first().click();
          await expect.poll(() => rows.count(), { timeout: 30_000 }).toBeLessThan(before);
          removed++;
          if (fromEarlierRun) earlier++;
        }
        // From a fresh load, not the page that was just changed.
        const fresh = (await section(page, kind)).getByTestId(ROWS[kind].row).filter({ hasText: ANY_RUN });
        await fresh.first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
        stayed = await fresh.count();
      } catch (e) {
        console.info(`[cleanup ${when}] ${kind}: stopped (${(e as Error).message.split("\n")[0].slice(0, 160)})`);
      }
      console.info(`[cleanup ${when}] ${kind}: removed=${removed} from_earlier_runs=${earlier} left=${stayed < 0 ? "unknown" : stayed}`);
      if (stayed !== 0) left.push(kind);
    }
  } finally {
    await ctx.close();
  }
  return left;
}

// What a killed or cancelled run left. It can't change this run's counts, because
// every title carries this run's id, so a row that stays here is judged in `afterAll`.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(SWEEP_TIMEOUT);
  await sweep(browser, "before");
});

// Wherever the walk stopped. A row left behind fails the run: it would be a false
// row on the synthetic worker's profile.
test.afterAll(async ({ browser }) => {
  test.setTimeout(SWEEP_TIMEOUT);
  expect(await sweep(browser, "after"), "rows left on the synthetic worker").toEqual([]);
});
