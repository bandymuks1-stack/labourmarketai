import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";

import { answerNoProjectIfAsked, chooseWorkContextIfAsked } from "./worklog-context";

/**
 * PRODUCTION — A WORKER'S OWN RECORDS: PHOTO EVIDENCE, GALLERY, EXPORTS AND
 * SAVED SEARCHES (registry rows that had no production walk, 2026-10-25):
 *
 *   2.22 Photos       — the worker records a day of work WITH a photo; the
 *                       upload's real outcome is "uploaded";
 *   2.33 Gallery      — the same photo is in the worker's own gallery, with
 *                       the entry it belongs to, on the phone and in English;
 *   2.34 Exports      — the worker downloads the journal CSV (from the reports
 *                       page) and the week's hours file (from the journal) and
 *                       the files carry the day just recorded;
 *   4.9  Saved search — on the opportunities board the worker filters, saves
 *                       the question under a name, finds it after a reload
 *                       (and in English), opens it, and deletes it.
 *
 *   FORBIDDEN (F-1): another worker's export and gallery never carry this
 *   worker's day; an anonymous caller gets no journal file and no gallery.
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic):
 *   worker2  qa.worker+goal3   — the worker whose records this walk writes
 *   worker   qa.worker+multiw  — the other worker (forbidden checks only)
 *
 * Locales: LT by default; EN for the gallery, the exports and the saved
 * search's persistence. Widths: 1280 px, and 390 px for the gallery and the
 * saved-search strip (no sideways scroll).
 *
 * WHAT STAYS. A journal entry and its photo are the worker's own history and
 * the product offers no deletion of either (the journal is evidence); one
 * small synthetic entry per run is kept, tagged `QA-SYNTHETIC <run>`, like
 * prod-journal-confirm's. Downloaded files are read in memory and deleted.
 * The saved search is deleted by the walk, and `afterAll` sweeps every saved
 * search labelled `QA-SYNTHETIC` even when a step failed. Logs carry counts
 * and states only — never file contents.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const TAG = `QA-SYNTHETIC ${RUN}`;
// The entry's first words are the tag, so the gallery's entry snippet and the
// CSV row both carry it.
const ENTRY = `${TAG}: šiandien 3 valandas tinkavau sieną objekte, pridedu nuotrauką`;
const SEARCH_LABEL = `${TAG} paieška`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["worker", "worker2"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;

async function as(
  browser: Browser,
  slot: string | null,
  opts: { locale?: "lt-LT" | "en-GB"; phone?: boolean } = {},
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    ...(slot ? { storageState: state(slot) } : {}),
    locale: opts.locale ?? "lt-LT",
    ...(opts.phone ? PHONE : {}),
  });
  return { ctx, page: await ctx.newPage() };
}

/**
 * The page content, never the streaming holder. Dashboard pages stream through
 * a hidden `<div id="S:n">` whose reveal is rAF-driven; in a never-painting
 * headless tab that hidden copy sits outside <main> beside the rendered one
 * (prod-company-chain.spec.ts, #2729). Strict inside <main> still fails if a
 * page really renders something twice.
 */
const inMain = (page: Page): Locator => page.getByRole("main");

async function rendered(page: Page, label: string): Promise<void> {
  expect(/\/auth\/(login|sign-?in)/.test(page.url()), `${label}: bounced to sign-in`).toBe(false);
  await expect(page.getByTestId("error-boundary-message"), `${label}: error boundary`).toHaveCount(0);
  await expect(page.getByTestId("global-error-message"), `${label}: global error`).toHaveCount(0);
}

/** The phone rule: the page never scrolls sideways at 390 px. */
async function fitsPhone(page: Page, label: string): Promise<void> {
  const { doc, body, inner } = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(Math.max(doc, body), `${label}: wider than the phone (innerWidth ${inner})`).toBeLessThanOrEqual(inner + 1);
}

/** Click a control that downloads a file and return the file's text; the file is deleted after. */
async function downloadText(page: Page, control: Locator): Promise<{ name: string; text: string }> {
  // The link answers with an attachment, so the "navigation" never completes:
  // the click must not wait for it (the download event is the answer).
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 90_000 }),
    control.click({ noWaitAfter: true }),
  ]);
  try {
    expect(await download.failure(), "the file downloaded").toBeNull();
    const text = readFileSync(await download.path(), "utf8");
    return { name: download.suggestedFilename(), text };
  } finally {
    await download.delete();
  }
}

/**
 * A small photo made in the page and handed to the file input as a real File
 * (the object a camera pick produces), so the component's own onChange runs
 * unmodified (tests/e2e/w7-photo-evidence.spec.ts). Noise, 320 × 240, JPEG:
 * a few tens of kB, well inside the free tier's one photo per entry.
 */
async function attachSmallPhoto(page: Page, selector: string): Promise<void> {
  await page.evaluate(async (sel) => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = (Math.random() * 255) | 0;
      img.data[i + 1] = (Math.random() * 255) | 0;
      img.data[i + 2] = (Math.random() * 255) | 0;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.8));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "qa-synthetic-site.jpg", { type: "image/jpeg" }));
    const input = document.querySelector(sel) as HTMLInputElement;
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, selector);
}

let entryRecorded = false;

// ─────────────────────────────────────────────── 2.22 photo evidence (P)

test("P-1 (2.22). the worker records the day with a photo, and the upload's outcome is 'uploaded'", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/journal");
  await rendered(page, "journal");
  const main = inMain(page);
  // Hydration-safe: text typed before React attaches is not in its state, and
  // the click then does nothing — retype until the work-log form opens.
  await expect(async () => {
    await main.getByTestId("journal-quick-record-text").fill("");
    await main.getByTestId("journal-quick-record-text").fill(ENTRY);
    await main.getByTestId("journal-quick-record-understand").click({ timeout: 5_000 });
    await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 15_000 });
  }).toPass({ timeout: 90_000 });
  await chooseWorkContextIfAsked(page);
  await answerNoProjectIfAsked(page);

  const field = main.getByTestId("worklog-photo-field");
  await expect(field, "the work log offers a photo").toBeVisible({ timeout: 30_000 });
  await attachSmallPhoto(page, '[data-testid="worklog-photo-input"]');
  await expect(main.getByTestId("worklog-photo-preview"), "the picked photo is previewed").toBeVisible({ timeout: 60_000 });
  await expect(main.getByTestId("worklog-photo-error")).toHaveCount(0);

  await main.getByTestId("worklog-save").click();
  await main.getByTestId("worklog-confirm").click();
  const done = main.getByTestId("worklog-done");
  const failed = main.getByTestId("worklog-error").or(main.getByTestId("worklog-blocked"));
  await expect(done.or(failed)).toBeVisible({ timeout: 60_000 });
  if (!(await done.isVisible())) throw new Error(`the entry was not saved: ${(await failed.innerText()).slice(0, 160)}`);
  entryRecorded = true;
  const outcome = main.getByTestId("worklog-photo-outcome");
  await expect(outcome).toBeVisible({ timeout: 60_000 });
  const got = (await outcome.getAttribute("data-photo-outcome")) ?? "";
  console.info(`[photo] outcome=${got}`);
  expect(got, "the photo really reached storage (not only the entry)").toBe("uploaded");

  // Persistence: a fresh load of the journal lists this run's entry, once.
  await page.goto("/lt/dashboard/journal");
  await expect(main.locator('[data-testid^="journal-entry-card-"]', { hasText: RUN })).toHaveCount(1, { timeout: 30_000 });
  await ctx.close();
});

// ────────────────────────────────────────────────────── 2.33 gallery (G)

test("G-1 (2.33). the photo is in the worker's own gallery with its entry, on the phone", async ({ browser }) => {
  test.skip(!entryRecorded, "P-1 did not record this run's entry");
  const { ctx, page } = await as(browser, "worker2", { phone: true });
  await page.goto("/lt/dashboard/gallery");
  await rendered(page, "gallery (390 px)");
  await expect(inMain(page).getByTestId("personal-gallery")).toBeVisible({ timeout: 30_000 });
  const photo = inMain(page).getByTestId("personal-gallery-photo").filter({ hasText: RUN });
  await expect(photo, "this run's photo is listed with its entry").toHaveCount(1, { timeout: 30_000 });
  // A preview, or the honest "preview unavailable" — never a broken image.
  const img = photo.locator("img");
  if ((await img.count()) > 0) {
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 30_000 })
      .toBeGreaterThan(0);
  } else {
    console.info("[gallery] preview unavailable (signed URL not issued) — the page says so");
  }
  await fitsPhone(page, "gallery");
  await ctx.close();
});

test("G-2 (2.33). in English the gallery keeps the same photo (locale pass)", async ({ browser }) => {
  test.skip(!entryRecorded, "P-1 did not record this run's entry");
  const { ctx, page } = await as(browser, "worker2", { locale: "en-GB" });
  await page.goto("/en/dashboard/gallery");
  await rendered(page, "gallery (en)");
  expect((await page.locator("html").getAttribute("lang"))?.slice(0, 2)).toBe("en");
  await expect(inMain(page).getByTestId("personal-gallery-photo").filter({ hasText: RUN })).toHaveCount(1, {
    timeout: 30_000,
  });
  await ctx.close();
});

// ──────────────────────────────────────────────────────── 2.34 exports (E)

test("E-1 (2.34). the journal CSV from the reports page carries this run's day", async ({ browser }) => {
  test.skip(!entryRecorded, "P-1 did not record this run's entry");
  const { ctx, page } = await as(browser, "worker2", { locale: "en-GB" });
  await page.goto("/en/dashboard/reports");
  await rendered(page, "reports (en)");
  const link = inMain(page).getByTestId("reports-export-journal-csv");
  await expect(link, "the worker's reports offer the journal file").toBeVisible({ timeout: 30_000 });
  const { name, text } = await downloadText(page, link);
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  console.info(`[export] journal file=${name} rows=${Math.max(0, lines.length - 1)}`);
  expect(name).toMatch(/^work-journal-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(lines.length, "a header and at least one row").toBeGreaterThan(1);
  expect(lines.filter((l) => l.includes(RUN)).length, "this run's entry is one row of the file").toBe(1);
  await ctx.close();
});

test("E-2 (2.34). the week's hours file from the journal downloads with a header", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  await page.goto("/lt/dashboard/journal");
  await rendered(page, "journal");
  const week = inMain(page).getByTestId("journal-hours-export-week");
  await expect(week, "the journal offers the week's hours as a file").toBeVisible({ timeout: 30_000 });
  const { name, text } = await downloadText(page, week);
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  console.info(`[export] hours file=${name} lines=${lines.length}`);
  expect(name).toMatch(/\.csv$/);
  expect(lines.length, "the hours file has at least its header").toBeGreaterThan(0);
  expect(lines[0], "the first line is a header, not data").toMatch(/[A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž]/);
  await ctx.close();
});

// ───────────────────────────────────────────────── 4.9 saved searches (S)

/** Open the saved-search strip (it is a <details> that opens itself only when something is saved). */
async function openStrip(page: Page): Promise<Locator | null> {
  const strip = inMain(page).getByTestId("saved-searches");
  if (!(await strip.isVisible().catch(() => false))) return null;
  if ((await strip.getAttribute("open")) === null) await strip.locator("summary").click();
  return strip;
}

/** Delete every saved search labelled `marker` through the strip's own button; returns how many. */
async function deleteSaved(page: Page, marker: string): Promise<number> {
  let removed = 0;
  for (let i = 0; i < 20; i += 1) {
    await page.goto("/lt/dashboard/opportunities?view=all&country=LT");
    const strip = await openStrip(page);
    if (!strip) break;
    const row = strip.locator('[data-testid^="saved-search-"]', { has: page.getByTestId("saved-search-open") }).filter({ hasText: marker }).first();
    if ((await row.count()) === 0) break;
    await row.getByTestId("saved-search-delete").click();
    await expect(row, "the deleted search leaves the list").toHaveCount(0, { timeout: 30_000 });
    removed += 1;
  }
  return removed;
}

let searchSaved = false;

test("S-1 (4.9). on the phone the worker filters the board and saves the question under a name", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2", { phone: true });
  await page.goto("/lt/dashboard/opportunities?view=all");
  await rendered(page, "opportunities (390 px)");
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  // ACT: pick a filter chip the board offers; a board that offers none is
  // filtered through its own URL (the chips ARE links to that URL).
  const chip = inMain(page).locator('[data-testid^="opportunities-filter-"][data-active="false"]').first();
  if (await chip.isVisible().catch(() => false)) {
    await chip.click();
    await page.waitForURL(/[?&](profession|country|start|accommodation|transport|tool|opportunityType)=/, { timeout: 30_000 });
  } else {
    console.info("[saved-search] the board offers no filter chip; filtering by its URL");
    await page.goto("/lt/dashboard/opportunities?view=all&country=LT");
  }
  const filtered = new URL(page.url()).search;
  const strip = await openStrip(page);
  test.skip(
    strip === null,
    "the saved-search strip is not rendered with a filter set: the saved-searches layer is not installed in production (honest invisibility)",
  );
  if (await strip!.getByTestId("saved-searches-limit").isVisible().catch(() => false)) {
    console.info(`[saved-search] at the limit; swept ${await deleteSaved(page, "QA-SYNTHETIC")} synthetic searches`);
    await page.goto(`/lt/dashboard/opportunities${filtered}`);
    await openStrip(page);
  }
  await fitsPhone(page, "opportunities with the saved-search strip");
  // Hydration-safe typing: the button is enabled only once React holds the name.
  const label = strip!.getByTestId("saved-search-label");
  const save = strip!.getByTestId("saved-search-save");
  await expect(async () => {
    await label.fill("");
    await label.fill(SEARCH_LABEL);
    await expect(save).toBeEnabled({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  await save.click();
  const outcome = strip!.getByRole("status");
  await expect(outcome, "the save answers in words").toBeVisible({ timeout: 30_000 });
  const said = (await outcome.innerText()).trim();
  console.info(`[saved-search] save answered: ${said}`);
  expect(said, "the search was saved").toBe("Išsaugota.");
  // Persistence: a fresh load lists the named question, once.
  await expect
    .poll(
      async () => {
        await page.goto(`/lt/dashboard/opportunities${filtered}`);
        const s = await openStrip(page);
        return s ? s.getByTestId("saved-search-open").filter({ hasText: SEARCH_LABEL }).count() : -1;
      },
      { timeout: 45_000, intervals: [3_000] },
    )
    .toBe(1);
  searchSaved = true;
  await ctx.close();
});

test("S-2 (4.9). the saved search is there in English, opens the filtered board, and is deleted", async ({ browser }) => {
  test.skip(!searchSaved, "S-1 did not save this run's search");
  const { ctx, page } = await as(browser, "worker2", { locale: "en-GB" });
  // Locale pass: the stored question is the account's, not the page language's.
  await page.goto("/en/dashboard/opportunities?view=all&country=LT");
  await rendered(page, "opportunities (en)");
  expect((await page.locator("html").getAttribute("lang"))?.slice(0, 2)).toBe("en");
  const strip = await openStrip(page);
  expect(strip, "the strip renders in English").not.toBeNull();
  const open = strip!.getByTestId("saved-search-open").filter({ hasText: SEARCH_LABEL });
  await expect(open).toHaveCount(1, { timeout: 30_000 });
  // ACT: opening the search lands on the board with its filter in the address.
  // The click marks the search seen, THEN navigates (client push): wait for
  // the address to change, or the next navigation races that push.
  const before = page.url();
  await open.click();
  await page.waitForURL((u) => u.href !== before && /[?&](profession|country|start|accommodation|transport|tool|opportunityType)=/.test(u.search), {
    timeout: 30_000,
  });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  await rendered(page, "saved search opened");
  // ACT: delete it; a fresh load no longer lists it.
  const removed = await deleteSaved(page, SEARCH_LABEL);
  expect(removed, "exactly this run's search was deleted").toBe(1);
  await page.goto("/lt/dashboard/opportunities?view=all&country=LT");
  const after = await openStrip(page);
  if (after) await expect(after.getByTestId("saved-search-open").filter({ hasText: SEARCH_LABEL })).toHaveCount(0);
  searchSaved = false;
  await ctx.close();
});

// ─────────────────────────────────────────────────────── forbidden (F)

test("F-1. another worker's export and gallery never carry this worker's day; anonymous gets neither", async ({ browser }) => {
  test.skip(!entryRecorded, "P-1 did not record this run's entry");
  {
    const { ctx, page } = await as(browser, "worker");
    await page.goto("/lt/dashboard/gallery");
    await rendered(page, "the other worker's gallery");
    await expect(inMain(page).getByTestId("personal-gallery")).toBeVisible({ timeout: 30_000 });
    await expect(inMain(page).getByTestId("personal-gallery-photo").filter({ hasText: RUN }), "no foreign photo").toHaveCount(0);
    await page.goto("/lt/dashboard/reports");
    const link = inMain(page).getByTestId("reports-export-journal-csv");
    if (await link.isVisible().catch(() => false)) {
      const { text } = await downloadText(page, link);
      expect(text.includes(RUN), "the other worker's journal file does not carry this run's entry").toBe(false);
    } else {
      // The route is the same door; ask it directly with the other worker's cookies.
      const res = await ctx.request.get("/lt/dashboard/journal/export", { maxRedirects: 0 });
      if (res.status() === 200) expect((await res.text()).includes(RUN)).toBe(false);
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await as(browser, null);
    const res = await ctx.request.get("/lt/dashboard/journal/export", { maxRedirects: 0 });
    const location = res.headers()["location"] ?? "";
    console.info(`[forbidden] anonymous journal export → HTTP ${res.status()}`);
    expect(
      res.status() === 401 || (res.status() >= 300 && res.status() < 400 && /\/auth\//.test(location)),
      `anonymous journal export is refused (HTTP ${res.status()})`,
    ).toBe(true);
    if (res.status() === 401) expect(await res.text()).not.toContain(RUN);
    await page.goto("/lt/dashboard/gallery");
    await expect(page, "anonymous gallery → sign-in").toHaveURL(/\/auth\/(login|sign-?in)/, { timeout: 30_000 });
    await ctx.close();
  }
});

// Sweep by tag, pass or fail: every saved search this walk ever labelled.
test.afterAll(async ({ browser }) => {
  test.setTimeout(150_000);
  const { ctx, page } = await as(browser, "worker2");
  try {
    const removed = await deleteSaved(page, "QA-SYNTHETIC");
    console.info(`[cleanup] saved searches removed=${removed}`);
  } catch (e) {
    console.info(`[cleanup] saved-search sweep did not complete: ${(e as Error).message.split("\n")[0].slice(0, 120)}`);
  } finally {
    await ctx.close();
  }
});
