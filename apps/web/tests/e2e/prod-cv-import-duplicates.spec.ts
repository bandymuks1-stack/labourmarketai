import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";

import { makeDocx } from "../../lib/cv/__fixtures__/cv-fixtures";

import { cvRowTitles, sweepCvRows, type CvRowKind as Kind } from "./prod-cv-import-rows";

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
 * Every case gets its own answer: a slow save or a stuck step is logged and marks
 * the run failed, and the walk goes on to count from a fresh load.
 *
 * WRITES. Only `qa.worker+goal3`, the synthetic worker. Every row carries
 * `QA-SYNTHETIC R<run id>`. `afterAll` can't run in a killed or cancelled job, so
 * every row with that prefix, from any run, is removed both before the test and
 * after it, and a row still there after it fails the run. The CV file is generated
 * in memory and names nobody.
 *
 * Logs carry the tag's case word, counts and timings only; the walk log is a public
 * artefact. Runs only in `.github/workflows/prod-qa-walk.yml` with minted QA sessions.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const TAG = `QA-SYNTHETIC R${RUN}`;
const ANY_RUN = /QA-SYNTHETIC R/;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state("worker2"));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
// What fits the 30-minute walk job: at most 3 min gap + 3 min setup + 2 x 2 min sweeps
// + 15 min test + 1 min session revoke = 26 min.
test.describe.configure({ timeout: 900_000, retries: 0 });
const SWEEP_TIMEOUT = 120_000;
// Real Chrome, not Playwright's Chromium. Still headless and scripted: it is Chrome, not a person.
test.use({ actionTimeout: 30_000, channel: "chrome" });

const KINDS = ["education", "certificate"] as const;
const ROUNDS = ["lygiagretusa", "lygiagretusb", "lygiagretusc"];
const DOUBLE = "dvigubas";
const ONCE = "vienas";
// A confirm's POST took 20 s on production (run 42098444964); its saved mark can't be asked for sooner.
const SAVE_WAIT = 60_000;

const school = (name: string) => `${TAG} ${name} profesine mokykla`;
const certificate = (name: string) => `${TAG} ${name} suvirinimo sertifikatas`;
const titleOf = (kind: Kind, name: string) => (kind === "education" ? school(name) : certificate(name));
const cvFile = (names: string[]) =>
  [
    "QA Synthetic Worker",
    ...names.flatMap((n) => [`${school(n)}, statybos programa 2015-2019`, `${certificate(n)} 2021`]),
  ].join("\n");
const short = (e: unknown) => (e as Error).message.split("\n")[0].slice(0, 160);

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

/** One proposal in a review, by its title; the row's own controls are inside it. */
function item(review: Locator, kind: Kind, name: string): Locator {
  const prefix = kind === "education" ? "edu" : "cert";
  return review.locator(`[data-testid^="cv-import-item-${prefix}-"]`).filter({ hasText: titleOf(kind, name) });
}
const confirmOf = (row: Locator) => row.locator('[data-testid^="cv-import-confirm-"]');
const savedOf = (row: Locator) => row.locator('[data-testid^="cv-import-saved-"]');

const ROWS: Record<Kind, { hash: string; row: string }> = {
  education: { hash: "cv-education", row: "worker-education-row" },
  certificate: { hash: "cv-achievements", row: "worker-achievements-row" },
};

/** The stored rows' text from a real load of the profile: a same-page hash change re-reads nothing. */
async function rowsFromFreshLoad(page: Page, kind: Kind): Promise<Locator> {
  await page.goto("about:blank");
  await page.goto(`/lt/dashboard/profile#${ROWS[kind].hash}`);
  const main = inMain(page);
  await expect(main.locator(`#${ROWS[kind].hash}`).first()).toBeVisible({ timeout: 30_000 });
  const rows = main.getByTestId(ROWS[kind].row).filter({ hasText: ANY_RUN });
  await rows.first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined);
  return rows;
}

/**
 * One answer for each name, from one fresh load and the database, logged either way.
 * Soft, so that every case gets its own answer.
 */
async function expectOneRowEach(page: Page, label: string, names: string[]): Promise<void> {
  for (const kind of KINDS) {
    const shown = await (await rowsFromFreshLoad(page, kind)).allInnerTexts();
    const stored = await cvRowTitles(kind);
    for (const name of names) {
      const title = titleOf(kind, name);
      const rows = shown.filter((t) => t.includes(title)).length;
      const db = stored.filter((t) => t === title).length;
      console.info(`[result] ${label} ${name} ${kind}: rows=${rows} db=${db} ${rows === 1 && db === 1 ? "PASS" : "FAIL"}`);
      expect.soft(rows, `${label} ${name} ${kind}: rows after a fresh load`).toBe(1);
      expect.soft(db, `${label} ${name} ${kind}: rows in the database`).toBe(1);
    }
  }
}

/** The server actions a tab sent and the ones still open, so a pass can't hide a click that did nothing. */
function trackActions(page: Page): { sent: () => number; open: () => number } {
  let sent = 0;
  let closed = 0;
  const isAction = (r: { method(): string; headers(): Record<string, string> }) =>
    r.method() === "POST" && Boolean(r.headers()["next-action"]);
  page.on("request", (r) => {
    if (isAction(r)) sent++;
  });
  const close = (r: Parameters<typeof isAction>[0]) => {
    if (isAction(r)) closed++;
  };
  page.on("requestfinished", close);
  page.on("requestfailed", close);
  return { sent: () => sent, open: () => sent - closed };
}

/** A step that got stuck fails the run but doesn't take the later cases' answers with it. */
async function attempt(label: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (e) {
    console.info(`[stopped] ${label}: ${short(e)}`);
    expect.soft(short(e), `${label} did not finish`).toBe("");
  }
}

async function as(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: state("worker2"), locale: "lt-LT" });
  return { ctx, page: await ctx.newPage() };
}

test("#3102: confirming a CV's education and certificate leaves one row each", async ({ browser }) => {
  console.info(`[browser] ${browser.browserType().name()} ${browser.version()} channel=chrome`);
  const { ctx, page } = await as(browser);

  await attempt("case 1", async () => {
    const review = await importCv(page, cvFile([ONCE]));
    for (const kind of KINDS) {
      await expect(item(review, kind, ONCE), "the CV yields this proposal").toHaveCount(1, { timeout: 30_000 });
      const before = (await cvRowTitles(kind)).filter((t) => t === titleOf(kind, ONCE)).length;
      console.info(`[control] a proposal is not a save: ${kind} rows before the confirm=${before}`);
      expect.soft(before).toBe(0);
    }
    for (const kind of KINDS) {
      const row = item(review, kind, ONCE);
      await confirmOf(row).click();
      await expect(savedOf(row)).toBeVisible({ timeout: SAVE_WAIT });
    }
    await expectOneRowEach(page, "case 1", [ONCE]);
  });

  await attempt("case 2", async () => {
    const review = await importCv(page, cvFile([ONCE]));
    for (const kind of KINDS) {
      const row = item(review, kind, ONCE);
      await confirmOf(row).click();
      await expect(savedOf(row), "a second confirm answers as saved").toBeVisible({ timeout: SAVE_WAIT });
    }
    await expectOneRowEach(page, "case 2", [ONCE]);
  });

  const text = cvFile([...ROUNDS, DOUBLE]);
  const tabB = await ctx.newPage();
  const actionsA = trackActions(page);
  const actionsB = trackActions(tabB);

  await attempt("case 3a", async () => {
    let reviewA = await importCv(page, text);
    let reviewB = await importCv(tabB, text);
    for (const name of ROUNDS) {
      for (const kind of KINDS) {
        await attempt(`case 3a ${name} ${kind}`, async () => {
          // A saved row refreshes the page behind it; a review that didn't survive is opened again.
          if ((await confirmOf(item(reviewA, kind, name)).count()) === 0) {
            console.info(`[parallel] ${name} ${kind}: first tab opened the review again`);
            reviewA = await importCv(page, text);
          }
          if ((await confirmOf(item(reviewB, kind, name)).count()) === 0) {
            console.info(`[parallel] ${name} ${kind}: second tab opened the review again`);
            reviewB = await importCv(tabB, text);
          }
          const rowA = item(reviewA, kind, name);
          const rowB = item(reviewB, kind, name);
          const sentBefore = actionsA.sent() + actionsB.sent();
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
          const started = Date.now();
          const [clickA, clickB] = await Promise.all([fire(rowA), fire(rowB)]);
          // Both answers are back, however slow, before anything else happens in these tabs.
          await expect
            .poll(() => actionsA.open() + actionsB.open(), { timeout: SAVE_WAIT, intervals: [500] })
            .toBe(0)
            .catch(() => console.info(`[parallel] ${name} ${kind}: an action still open after ${SAVE_WAIT} ms`));
          const savedA = await savedOf(rowA).waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false);
          const savedB = await savedOf(rowB).waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false);
          console.info(
            `[parallel] ${name} ${kind}: clicks ${Math.abs(clickA - clickB)} ms apart, actions sent=${actionsA.sent() + actionsB.sent() - sentBefore}, ` +
              `answered in ${Date.now() - started} ms, saved marks ${savedA}/${savedB}`,
          );
        });
      }
    }
  });
  await attempt("case 3a counts", () => expectOneRowEach(page, "case 3a", ROUNDS));

  await attempt("case 3b", async () => {
    const review = await importCv(page, text);
    for (const kind of KINDS) {
      const row = item(review, kind, DOUBLE);
      const sentBefore = actionsA.sent();
      await confirmOf(row).dblclick();
      await expect
        .poll(() => actionsA.open(), { timeout: SAVE_WAIT, intervals: [500] })
        .toBe(0)
        .catch(() => console.info(`[double-click] ${kind}: an action still open after ${SAVE_WAIT} ms`));
      const saved = await savedOf(row).waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false);
      console.info(`[double-click] ${kind}: actions sent=${actionsA.sent() - sentBefore}, saved mark ${saved}`);
    }
  });
  await attempt("case 3b counts", () => expectOneRowEach(page, "case 3b", [DOUBLE]));

  // Every case once more, from a new load after all the writes: what it left stayed as it was.
  await attempt("persistence", () => expectOneRowEach(page, "persisted", [ONCE, ...ROUNDS, DOUBLE]));

  await ctx.close();
});

// What a killed or cancelled run left. It can't change this run's counts, because every
// title carries this run's id. A row that stays here is judged in `afterAll`.
test.beforeAll(async () => {
  test.setTimeout(SWEEP_TIMEOUT);
  for (const kind of KINDS) {
    try {
      const { removed, earlier, left } = await sweepCvRows(kind, TAG);
      console.info(`[cleanup before] ${kind}: removed=${removed} from_earlier_runs=${earlier} left=${left}`);
    } catch (e) {
      console.info(`[cleanup before] ${kind}: stopped (${short(e)})`);
    }
  }
});

// Wherever the walk stopped. A row left behind fails the run: it would be a false row on
// the synthetic worker's profile. The counts are printed first, so a run that stopped
// early still answers for every title it wrote.
test.afterAll(async ({ browser }) => {
  test.setTimeout(SWEEP_TIMEOUT);
  const left: string[] = [];
  for (const kind of KINDS) {
    try {
      const { removed, earlier, left: stayed, titles } = await sweepCvRows(kind, TAG);
      for (const name of [ONCE, ...ROUNDS, DOUBLE]) {
        console.info(`[stored at cleanup] ${name} ${kind}: rows=${titles.filter((t) => t === titleOf(kind, name)).length}`);
      }
      console.info(`[cleanup after] ${kind}: removed=${removed} from_earlier_runs=${earlier} left=${stayed}`);
      if (stayed !== 0) left.push(kind);
    } catch (e) {
      console.info(`[cleanup after] ${kind}: stopped (${short(e)})`);
      left.push(kind);
    }
  }
  // The person's own view agrees: from a fresh load, for the log.
  const { ctx, page } = await as(browser);
  try {
    for (const kind of KINDS) console.info(`[cleanup after] ${kind}: rows on a fresh page=${await (await rowsFromFreshLoad(page, kind)).count()}`);
  } catch (e) {
    console.info(`[cleanup after] fresh page not read (${short(e)})`);
  } finally {
    await ctx.close();
  }
  expect(left, "rows left on the synthetic worker").toEqual([]);
});
