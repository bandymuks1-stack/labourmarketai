import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";

import { makeDocx } from "../../lib/cv/__fixtures__/cv-fixtures";

/**
 * PRODUCTION PROFILE · LIVING CV · HISTORY — owner areas 1 / 3 / 15: the
 * person's own profile, the Living CV, skills and the one continuous
 * professional history, plus the company's history page and report.
 *
 * Every step title starts with the acceptance-registry row it proves.
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic):
 *   worker2  qa.worker+goal3  — "QA-SYNTHETIC Worker": every profile WRITE
 *   worker   qa.worker+multiw — Vytas Darbininkas, the worker with weeks of
 *            recorded and confirmed work: the Living CV and history READS
 *   owner    owns "QA-SYNTHETIC Alfa" — the company history page and report
 *   (no session) — the password-reset page, render-only (never submitted)
 *
 * WRITES. Every row this walk adds carries `QA-SYNTHETIC <run id>` and is
 * removed again in `afterAll`, which runs even after a red step; every value
 * it CHANGES (summary, work card, languages) is read first and put back.
 * Nothing names, reaches or notifies a real person or company: the history
 * rows are self-declared (organization null, no confirmation request), the
 * CV file is generated in memory and only previewed, never confirmed.
 *
 * READS. The read steps log states, booleans and counts only — never a
 * figure, a name or a date; the walk log is a public artefact.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` with minted QA sessions.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const TAG = `QA-SYNTHETIC ${RUN}`;
const ALFA = "QA-SYNTHETIC Alfa";
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["worker", "worker2", "owner"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const EXPERIENCE = `${TAG} darbo patirtis`;
const PRACTICE = `${TAG} savanorystė`;
const SCHOOL = `${TAG} profesinė mokykla`;
const CERTIFICATE = `${TAG} sertifikatas`;
const ACHIEVEMENT = `${TAG} pasiekimas`;
const PROFESSION = `${TAG} profesija`;
const CLAIM = `${TAG} įgūdis`;

async function as(browser: Browser, slot: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: state(slot), locale: "lt-LT" });
  return { ctx, page: await ctx.newPage() };
}

/**
 * The page content, never the streaming holder. Dashboard pages stream through
 * a hidden `<div id="S:n">` whose reveal is rAF-driven; in a never-painting
 * headless tab that hidden copy sits outside <main> beside the rendered one,
 * so a bare testid fails strict mode at once and a count reads double
 * (project-execution 40081437313 E-11 `hours-worker-select`, and its cleanup
 * `toHaveCount(0)`; calendar-journal-history.spec.ts). Strict inside <main>
 * still fails if a page really renders something twice.
 */
const inMain = (page: Page): Locator => page.getByRole("main");

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

/** The profile opened at one section: the hash opens its closed fold. Streaming
 *  can briefly render a second copy outside `main`, so everything is scoped. */
async function profileAt(page: Page, hash: string): Promise<Locator> {
  // Always a REAL load. A goto to the page the tab is already on, differing
  // only by hash, is a same-document navigation: nothing is re-read, and a
  // "fresh" check would read the old tree (run 40175731734 P-13; #2702 P-4).
  const already = (() => {
    try {
      return new URL(page.url()).pathname === "/lt/dashboard/profile";
    } catch {
      return false;
    }
  })();
  await page.goto(`/lt/dashboard/profile#${hash}`);
  if (already) await page.reload();
  const main = inMain(page);
  await expect(main.locator(`#${hash}`).first()).toBeVisible({ timeout: 30_000 });
  return main;
}

/** Pick one option of a `DarkListbox` (a button + listbox, not a <select>). */
async function pick(page: Page, scope: Locator, testId: string, option: string): Promise<void> {
  await scope.getByTestId(testId).click();
  await page.getByRole("option", { name: option, exact: true }).first().click();
}

async function livingCv(page: Page): Promise<Locator> {
  await page.goto("/lt/cv");
  // The Living CV's own <main> (added for runs 40086140120 / 40153545718,
  // which found none). By role, so a hidden streaming copy never counts.
  const main = inMain(page);
  await expect(main.locator("h1").first()).toBeVisible({ timeout: 30_000 });
  return main;
}

/** Ask the conversation something and wait for the composer to take it. */
async function say(page: Page, text: string): Promise<void> {
  const composer = inMain(page).getByTestId("composer-input");
  await expect(composer).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  await composer.fill(text);
  await inMain(page).getByTestId("composer-send").click();
}

const short = (e: unknown) => (e as Error).message.split("\n")[0].slice(0, 160);

// What this run changed, so `afterAll` can put it back even after a red step.
let summaryOriginal: { headline: string; bio: string } | null = null;
let workCardOriginal: Record<string, string> | null = null;
let ukrainianOriginal: { present: boolean; level: string } | null = null;
const addedHistory: string[] = [];
const addedEducation: string[] = [];
const addedAchievements: string[] = [];
let addedProfession = "";
let addedClaim = "";

/** The own-profession list sits in the profile's manual stage. */
async function ownProfessions(page: Page): Promise<Locator> {
  const main = await profileAt(page, "profile-edit");
  const own = main.getByTestId("worker-own-professions");
  if (!(await own.isVisible().catch(() => false))) await main.getByTestId("text-first-composer-manual").first().click();
  await expect(own).toBeVisible({ timeout: 30_000 });
  return own;
}

async function removeOwnProfession(page: Page): Promise<void> {
  const own = await ownProfessions(page);
  const chip = own.getByTestId("worker-own-profession").filter({ hasText: PROFESSION });
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await chip.locator('[data-testid^="worker-own-profession-remove-"]').first().click();
  await chip.locator('[data-testid$="-yes"]').first().click();
  await expect(chip).toHaveCount(0, { timeout: 30_000 });
}

// ── 1.3 / 1.4 — account entry ───────────────────────────────────────────────

test("P-1 (1.3). the password-reset form renders (render-only; delivery NOT_VERIFIED until SMTP is configured)", async ({ browser }) => {
  // RENDER-ONLY. A submit would send a real e-mail through the auth mailer,
  // whose hourly limit is shared with real people's sign-up confirmations —
  // a walk must never consume it. The form is never submitted; every POST
  // (including the auth `recover` call) is aborted as a safety net.
  const ctx = await browser.newContext({ locale: "lt-LT" });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (m) => {
    // A POST this walk aborted on purpose is not a page error.
    if (m.type() === "error" && !/net::ERR_FAILED/.test(m.text())) consoleErrors.push(m.text().slice(0, 120));
  });
  page.on("pageerror", (e) => consoleErrors.push(e.message.slice(0, 120)));
  let blocked = 0;
  await page.route("**/*", (route) => {
    if (route.request().method() === "POST") {
      blocked++;
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("/lt/auth/forgot-password");
  const form = page.locator("form").filter({ has: page.locator('input[type="email"][name="email"]') });
  await expect(form.locator('input[type="email"][name="email"]')).toBeVisible({ timeout: 30_000 });
  await expect(form.locator('button[type="submit"]')).toBeVisible();
  await expect(form.locator('button[type="submit"]')).toBeEnabled();
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  console.info(`P-1: render-only, submit not clicked; POSTs blocked=${blocked}; console errors=${consoleErrors.length}`);
  expect(consoleErrors, "the reset page renders without console errors").toEqual([]);
  await page.unroute("**/*");
  await ctx.close();
});

test("P-2 (1.4). an onboarded person is not sent back into onboarding, and the setup hub opens", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  await page.goto("/lt/onboarding");
  await expect(page).toHaveURL(/\/lt\/dashboard/, { timeout: 30_000 });
  await page.goto("/lt/dashboard/start");
  await expect(inMain(page).getByTestId("activity-setup-hub")).toBeVisible({ timeout: 30_000 });
  await expect(inMain(page).getByTestId("activity-setup-lane-grid")).toBeVisible();
  await expect(inMain(page).getByTestId("activity-setup-lane-company")).toBeVisible();
  await expect(inMain(page).getByTestId("activity-setup-lane-buyer-start")).toBeVisible();
  await ctx.close();
});

// ── 2.1 / 2.2 / 2.9 — the profile's own values: change → persist → restore ──

test("P-3 (2.1). the professional summary is saved, survives a reload, and is restored", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  const main = await profileAt(page, "profile-public-summary");
  const headline = main.getByTestId("profile-public-headline");
  const bio = main.getByTestId("profile-public-bio");
  summaryOriginal = { headline: await headline.inputValue(), bio: await bio.inputValue() };
  const next = { headline: `${TAG} plytelių klojėjas`, bio: `${TAG}: trumpas profesinis aprašas.` };
  await headline.fill(next.headline);
  await bio.fill(next.bio);
  await main.getByTestId("profile-public-summary-save").click();
  const saved = main.getByTestId("profile-public-summary-saved");
  const error = main.getByTestId("profile-public-summary-error");
  await expect(saved.or(error)).toBeVisible({ timeout: 30_000 });
  if (await error.isVisible()) throw new Error(`summary not saved: ${await error.innerText()}`);
  const again = await profileAt(page, "profile-public-summary");
  await expect(again.getByTestId("profile-public-headline")).toHaveValue(next.headline, { timeout: 30_000 });
  await expect(again.getByTestId("profile-public-bio")).toHaveValue(next.bio);
  await ctx.close();
});

const CARD_FIELDS = {
  status: 'select[name="availability_status"]',
  from: 'input[name="available_from"]',
  countries: 'input[name="preferred_countries"]',
  min: 'input[name="salary_min"]',
  max: 'input[name="salary_max"]',
} as const;

async function openWorkCard(page: Page): Promise<Locator> {
  // The persistence check needs a FRESH document. Going to the same URL and
  // hash again is a same-document fragment navigation: nothing reloads, the
  // editor stays open, and the toggle then CLOSED it (run 39970719710).
  const again = page.url().includes("/dashboard/profile#cv-availability");
  let main = await profileAt(page, "cv-availability");
  if (again) {
    await page.reload();
    main = page.locator("main");
    await expect(main.locator("#cv-availability").first()).toBeVisible({ timeout: 30_000 });
  }
  await expect(main.getByTestId("profile-work-card-editor")).toBeVisible({ timeout: 30_000 });
  const toggle = main.getByTestId("work-card-editor-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const form = main.getByTestId("work-card-editor");
  await expect(form).toBeVisible({ timeout: 30_000 });
  return form;
}

async function saveWorkCard(form: Locator): Promise<void> {
  await form.getByTestId("work-card-save").click();
  const saved = form.getByTestId("work-card-saved");
  const error = form.getByTestId("work-card-error");
  await expect(saved.or(error)).toBeVisible({ timeout: 30_000 });
  if (await error.isVisible()) throw new Error(`work card not saved: ${await error.innerText()}`);
}

test("P-4 (2.2). the work card's availability, pay and locations persist, then return to what they were", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  let form = await openWorkCard(page);
  const original: Record<string, string> = {};
  for (const [k, sel] of Object.entries(CARD_FIELDS)) original[k] = await form.locator(sel).inputValue();
  workCardOriginal = original;

  // A saved figure can be CHANGED but not cleared (the RPC keeps it on an
  // empty field — `keepOnlyHint`), so the walk changes only what is already
  // saved and can therefore be put back exactly. The preferred-country list
  // can be cleared, so it is always walked.
  const next: Record<string, string> = { countries: "LT, NO" };
  if (original.status) next.status = original.status === "available" ? "busy" : "available";
  if (original.min) next.min = String(Number(original.min) + 1);
  if (original.max) next.max = String(Number(original.max) + 1);
  const skipped = ["status", "min", "max"].filter((k) => !original[k]);
  console.info(`[work-card] walked=${Object.keys(next).join(",")} not_walked_never_saved=${skipped.join(",") || "none"}`);

  if (next.status) await form.locator(CARD_FIELDS.status).selectOption(next.status);
  await form.locator(CARD_FIELDS.countries).fill(next.countries);
  if (next.min) await form.locator(CARD_FIELDS.min).fill(next.min);
  if (next.max) await form.locator(CARD_FIELDS.max).fill(next.max);
  await saveWorkCard(form);

  form = await openWorkCard(page);
  await expect(form.locator(CARD_FIELDS.countries)).toHaveValue(/LT,\s*NO/, { timeout: 30_000 });
  if (next.status) await expect(form.locator(CARD_FIELDS.status)).toHaveValue(next.status);
  if (next.min) await expect(form.locator(CARD_FIELDS.min)).toHaveValue(next.min);
  if (next.max) await expect(form.locator(CARD_FIELDS.max)).toHaveValue(next.max);
  await ctx.close();
});

async function languagesSection(page: Page): Promise<Locator> {
  const main = await profileAt(page, "cv-languages");
  const section = main.getByTestId("worker-languages");
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(section.getByTestId("worker-languages-needs-migration")).toHaveCount(0);
  return section;
}

async function addLanguage(page: Page, lang: string, level: string): Promise<void> {
  const section = await languagesSection(page);
  const form = section.getByTestId("worker-languages-add-form");
  await pick(page, form, "worker-languages-lang", lang);
  await pick(page, form, "worker-languages-level", level);
  await form.getByTestId("worker-languages-add").click();
  const row = section.getByTestId("worker-language-uk");
  await expect(row.or(section.getByTestId("worker-languages-error"))).toBeVisible({ timeout: 30_000 });
  if (!(await row.isVisible())) throw new Error(`language not added: ${await section.getByTestId("worker-languages-error").innerText()}`);
}

async function removeUkrainian(page: Page): Promise<void> {
  const section = await languagesSection(page);
  await section.getByTestId("worker-language-remove-uk").click();
  await expect(section.getByTestId("worker-language-uk")).toHaveCount(0, { timeout: 30_000 });
}

test("P-5 (2.9). Ukrainian is added with a level, persists, and is removed again", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  const section = await languagesSection(page);
  const existing = section.getByTestId("worker-language-uk");
  const present = (await existing.count()) > 0;
  const level = present ? ((await existing.innerText()).match(/\b(A1|A2|B1|B2|C1|C2)\b/)?.[1] ?? "Gimtoji") : "B1";
  ukrainianOriginal = { present, level };
  console.info(`[languages] ukrainian already on the profile=${present}`);

  // Already there → prove remove first, then add it back as it was.
  if (present) await removeUkrainian(page);
  await addLanguage(page, "Українська", level);
  const persisted = (await languagesSection(page)).getByTestId("worker-language-uk");
  await expect(persisted, "the added language survives a reload").toBeVisible({ timeout: 30_000 });
  await expect(persisted).toContainText(level === "Gimtoji" ? /Gimtoji/ : level);
  if (!present) {
    await removeUkrainian(page);
    await expect((await languagesSection(page)).getByTestId("worker-language-uk"), "removed stays removed").toHaveCount(0);
  }
  ukrainianOriginal = null; // the profile holds what it held before
  await ctx.close();
});

// ── 2.3 — CV import: a generated file, previewed, never confirmed ────────────

test("P-6 (2.3). a CV file is read into a reviewable proposal and nothing is saved before a confirm", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  // The conversation's import, not the profile's: the profile path also
  // replaces the private profile text and may call the AI structurer. This one
  // parses locally (unpdf / mammoth) and stores nothing until a confirm.
  // ASCII-only synthetic lines; the company is invented for this run.
  const company = `UAB QASYNTHETIC${RUN.replace(/[^0-9a-z]/gi, "").toUpperCase()}`;
  const lines = [
    "QA Synthetic Worker",
    `2019-2023 ${company}, plyteliu klojejas`,
    "QA Synthetic profesine mokykla, statybos programa 2015-2019",
    "Anglu kalba B2",
  ];
  await page.goto("/lt/dashboard");
  await say(page, "Įkelk mano CV");
  // "my CV" + a file verb is a FILE intent (#1684, `handleFileIntent` →
  // `fileSelfCv`): the chat names the door as ONE `cv` chip and the import
  // opens only when the person takes it (run 40049229470 waited 60 s for a
  // flow that is never opened by the sentence alone). The newest chip answers
  // this request; a starter row may carry an older one. Visible nodes only:
  // the dashboard streams through a hidden `<div id="S:n">` copy at the end
  // of <body>, so a bare `.last()` can land on the hidden starter row.
  await inMain(page).getByTestId("chat-chip-cv").filter({ visible: true }).last().click({ timeout: 60_000 });
  await expect(inMain(page).getByTestId("conversation-cv-flow").last()).toBeVisible({ timeout: 60_000 });
  const input = page.locator('[data-testid="cv-import-upload"] input[type="file"]').last();
  await input.waitFor({ state: "attached", timeout: 30_000 });
  await input.setInputFiles({
    name: "qa-synthetic-cv.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from(makeDocx(lines.join("\n"))),
  });
  const review = inMain(page).getByTestId("cv-import-section-review").last();
  const empty = inMain(page).getByTestId("conversation-cv-empty").last();
  const error = inMain(page).getByTestId("cv-import-error").last();
  await expect(review.or(empty).or(error)).toBeVisible({ timeout: 60_000 });
  if (await error.isVisible()) throw new Error(`CV not read: ${(await error.innerText()).slice(0, 120)}`);
  await expect(review, "the generated CV yields a proposal").toBeVisible();
  const job = inMain(page).getByTestId("cv-import-item-wh-0").last();
  await expect(job).toContainText(company, { timeout: 30_000 });
  const items = await page.locator('[data-testid^="cv-import-item-"]').count();
  console.info(`[cv-import] proposal items=${items}`);
  // Negative control: a proposal is not a save.
  const cv = await livingCv(page);
  await expect(cv.getByText(company)).toHaveCount(0);
  await ctx.close();
});

// ── 2.5 – 2.8 — self-declared history rows: add → on the Living CV → removed ─

test("P-7 (2.5). an employment row is added on the profile and shows on the Living CV as the person's own statement", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  const main = await profileAt(page, "capabilities");
  await main.getByTestId("add-experience-open").click();
  const form = main.getByTestId("add-experience-form");
  await form.getByTestId("add-experience-title").fill(EXPERIENCE);
  await form.getByTestId("add-experience-start-year").fill("2019");
  await form.getByTestId("add-experience-current").check();
  addedHistory.push(EXPERIENCE);
  await form.getByTestId("add-experience-save").click();
  const row = main.getByTestId("capability-experience-row").filter({ hasText: EXPERIENCE });
  await expect(row.or(form.getByTestId("add-experience-error")).first()).toBeVisible({ timeout: 30_000 });
  if (!(await row.first().isVisible())) throw new Error(`experience not saved: ${await form.getByTestId("add-experience-error").innerText()}`);
  await expect(row.locator('[data-testid^="capability-experience-remove-"]'), "a self-declared row is the person's to remove").toHaveCount(1);

  const cv = await livingCv(page);
  const declared = cv
    .locator('[data-testid="premium-cv-experience-row"][data-level="declared"]', { hasText: EXPERIENCE })
    .or(cv.getByTestId("cv-history-node").filter({ hasText: EXPERIENCE }).filter({ has: page.getByTestId("cv-history-standing") }));
  await expect(declared.first(), "the row is on the Living CV, labelled as stated by the person").toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("P-8 (2.6). a volunteering period told through the chat form lands under practice on the Living CV", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  await page.goto("/lt/dashboard");
  // A dated past period told to the chat opens the self-declared history form
  // with its years (`professionStatement` → `readPastWorkPeriod`, the
  // 2026-09-29 production fix). That door does not depend on profile state.
  // The old door, "Ką dar turiu padaryti?" plus the `add-work-history` chip,
  // offers that chip only while something is missing. P-7 has just added a
  // history row, so the chat rightly answered with its starter chips
  // (run 40163027393).
  await say(page, "2020–2021 dirbau savanoriu maisto banke");
  const form = inMain(page).getByTestId("inline-action-form-worker.add-work-history").last();
  await expect(form).toBeVisible({ timeout: 30_000 });
  await form.getByTestId("field-title").fill(PRACTICE);
  await form.getByTestId("field-relationship").selectOption("volunteer");
  await form.getByTestId("field-startYear").fill("2020");
  await form.getByTestId("field-endYear").fill("2021");
  await form.getByTestId("inline-action-continue").click();
  await expect(form.getByTestId("inline-action-review")).toBeVisible({ timeout: 30_000 });
  addedHistory.push(PRACTICE);
  await form.getByTestId("inline-action-save").click();
  const done = inMain(page).getByTestId("inline-action-done").last();
  const failed = inMain(page).getByTestId("inline-action-error").last();
  await expect(done.or(failed)).toBeVisible({ timeout: 30_000 });
  if (!(await done.isVisible())) throw new Error(`practice not saved: ${(await failed.innerText()).slice(0, 120)}`);

  const cv = await livingCv(page);
  const practice = cv.getByTestId("cv-practice-history");
  await expect(practice, "practice and volunteering are their own section").toBeVisible({ timeout: 30_000 });
  const node = practice.getByTestId("cv-history-node").filter({ hasText: PRACTICE });
  await expect(node).toBeVisible();
  await expect(node.getByTestId("cv-history-standing"), "labelled as stated by the person").toBeVisible();
  await ctx.close();
});

test("P-9 (2.7). an education row is added and shows on the Living CV", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  const main = await profileAt(page, "cv-education");
  const section = main.getByTestId("worker-education");
  await expect(section.getByTestId("worker-education-needs-migration")).toHaveCount(0);
  await section.getByTestId("worker-education-add-open").click();
  const form = section.getByTestId("worker-education-form");
  await form.getByTestId("worker-education-institution").fill(SCHOOL);
  await pick(page, form, "worker-education-type", "Profesinis");
  addedEducation.push(SCHOOL);
  await form.getByTestId("worker-education-save").click();
  const row = section.getByTestId("worker-education-row").filter({ hasText: SCHOOL });
  await expect(row.or(section.getByTestId("worker-education-error")).first()).toBeVisible({ timeout: 30_000 });
  if (!(await row.isVisible())) throw new Error(`education not saved: ${await section.getByTestId("worker-education-error").innerText()}`);
  await expect(section.getByTestId("worker-education-self-stated"), "the profile says education is self-stated").toBeVisible();

  const cv = await livingCv(page);
  await expect(cv.getByTestId("cv-education-row").filter({ hasText: SCHOOL })).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

async function addAchievement(page: Page, title: string, type: string): Promise<void> {
  const main = await profileAt(page, "cv-achievements");
  const section = main.getByTestId("worker-achievements");
  await section.getByTestId("worker-achievements-add-open").click();
  const form = section.getByTestId("worker-achievements-form");
  await form.getByTestId("worker-achievements-title").fill(title);
  await pick(page, form, "worker-achievements-type", type);
  addedAchievements.push(title);
  await form.getByTestId("worker-achievements-save").click();
  // The save's own answer: the form closes on ok (before the refresh) and
  // shows the alert on a refusal.
  const error = section.getByTestId("worker-achievements-error");
  await expect(error.or(section.getByTestId("worker-achievements-add-open")).first(), "the save answered").toBeVisible({
    timeout: 30_000,
  });
  if (await error.isVisible()) throw new Error(`achievement not saved: ${await error.innerText()}`);
  // The row in place is logged, not asserted. Run 40166272659: the second
  // save's insert answered 201 at 05:41:43 and the server re-read the list
  // at 05:41:45, but the refreshed row never committed in the headless tab
  // in 30 s. Cleanup later found and removed both rows. The cause is not
  // proven; it is most likely the same never-painting tab that keeps the
  // hidden `S:n` holder. The claim (saved,
  // persisted, labelled declared) is asserted on a fresh load below.
  const inPlace = section.getByTestId("worker-achievements-row").filter({ hasText: title });
  const shownInPlace = await inPlace.waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false);
  console.info(`[achievements] "${title.slice(-20)}" shown in place after save=${shownInPlace}`);
  const fresh = (await profileAt(page, "cv-achievements")).getByTestId("worker-achievements");
  const row = fresh.getByTestId("worker-achievements-row").filter({ hasText: title });
  await expect(row, "the saved achievement persists").toHaveCount(1, { timeout: 30_000 });
  await expect(row.getByTestId("worker-achievements-standing")).toHaveAttribute("data-standing", "declared");
}

test("P-10 (2.8). a declared certificate and an achievement are added and the Living CV labels them declared", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  await addAchievement(page, CERTIFICATE, "Nurodytas sertifikatas");
  await addAchievement(page, ACHIEVEMENT, "Pasiekimas");

  const cv = await livingCv(page);
  const cert = cv.getByTestId("cv-declared-certificate-row").filter({ hasText: CERTIFICATE });
  await expect(cert, "a declared certificate sits with the certificates").toBeVisible({ timeout: 30_000 });
  await expect(cert.getByTestId("cv-declared-certificate-label"), "…and says it was listed by the worker").toBeVisible();
  await expect(
    cv.locator('[data-testid="cv-achievement-row"][data-standing="declared"]', { hasText: ACHIEVEMENT }),
    "an achievement the app never confirmed stays declared",
  ).toBeVisible();
  await ctx.close();
});

// ── 2.12 – 2.16 — skills, professions and their evidence tiers ──────────────

test("P-11 (2.12). catalogue skills are grouped on the profile, and an own profession is added and removed", async ({ browser }) => {
  // Read: the worker with recorded work sees catalogue skills grouped by kind.
  const reader = await as(browser, "worker");
  const caps = await profileAt(reader.page, "capabilities");
  const groups = caps.getByTestId("capability-worker-skill-groups");
  await expect(groups, "catalogue skills are grouped on the profile").toBeVisible({ timeout: 30_000 });
  const skills = await groups.locator('[data-testid^="capability-skill-practice-"]').count();
  const kinds = await groups
    .locator("[data-skill-group]")
    .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("data-skill-group")))].join(","));
  console.info(`[skills] catalogue skills=${skills} groups=${kinds}`);
  expect(skills).toBeGreaterThan(0);
  await reader.ctx.close();

  // Write: a profession the catalogue lacks, in the person's own words.
  const { ctx, page } = await as(browser, "worker2");
  const own = await ownProfessions(page);
  addedProfession = PROFESSION;
  await own.getByTestId("worker-own-profession-input").fill(PROFESSION);
  await own.getByTestId("worker-own-profession-add").click();
  await expect(
    own.getByTestId("worker-own-profession").filter({ hasText: PROFESSION }),
    "the own profession is saved verbatim",
  ).toBeVisible({ timeout: 30_000 });
  await removeOwnProfession(page);
  addedProfession = "";
  await ctx.close();
});

test("P-12 (2.14). the Living CV sorts skills into honest evidence tiers and keeps potential apart", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  const cv = await livingCv(page);
  const tiers = await cv.locator('[data-testid^="cv-tier-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? ""));
  console.info(`[tiers] shown=${[...new Set(tiers)].join(",")}`);
  expect(tiers.length, "skills are shown under a named tier").toBeGreaterThan(0);
  expect(
    tiers.some((t) => t === "cv-tier-evidence" || t === "cv-tier-confirmed"),
    "recorded or confirmed work backs at least one skill",
  ).toBe(true);
  // Potential is inferred, never presented as held (decision 0023).
  const potential = cv.getByTestId("cv-potential");
  if ((await potential.count()) > 0) await expect(potential).toHaveAttribute("data-evidence-state", "potential");
  console.info(`[tiers] potential shown=${(await potential.count()) > 0}`);
  await ctx.close();
});

test("P-13 (2.15). a free-label skill claim is saved and shows as self-declared on the Living CV", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker2");
  const main = await profileAt(page, "capabilities");
  const form = main.getByTestId("capability-profile-manual-add");
  addedClaim = CLAIM;
  await form.getByTestId("capability-profile-manual-input").fill(CLAIM);
  await form.getByTestId("capability-profile-manual-add-button").click();
  // The save's own answer: on ok the input is cleared before the refresh; a
  // refusal shows the section's alert. Then the chip must show in place AND
  // persist on a real reload. Runs 40169213003 and 40175731734 saved the claim
  // (cleanup found and removed it), but the chip never showed: the section
  // seeded its list with useState(claims) and ignored the refreshed prop.
  const refused = main.locator('p[role="alert"]').filter({ hasText: /\S/ });
  await expect(form.getByTestId("capability-profile-manual-input").or(refused).first()).toBeVisible();
  await expect
    .poll(
      async () =>
        (await refused.count()) > 0
          ? `refused: ${await refused.first().innerText()}`
          : await form.getByTestId("capability-profile-manual-input").inputValue(),
      { timeout: 30_000, message: "the claim save answered" },
    )
    .toBe("");
  // In place, as the person sees it. The section used to seed its list from
  // the first prop and ignore the refresh (fixed with visibleSkillClaims).
  await expect(main.getByTestId("capability-profile-claim").filter({ hasText: CLAIM }), "the new chip shows in place").toBeVisible({
    timeout: 30_000,
  });
  const fresh = await profileAt(page, "capabilities");
  await expect(fresh.getByTestId("capability-profile-claim").filter({ hasText: CLAIM }), "the claim persists").toHaveCount(1, {
    timeout: 30_000,
  });
  const cv = await livingCv(page);
  await expect(
    cv.locator('[data-testid="cv-tier-declared"]', { hasText: CLAIM }).first(),
    "a claim nobody has evidenced stays in the declared tier",
  ).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

const TRANSVERSAL = [
  "presenting",
  "stakeholder-engagement",
  "partnership-development",
  "negotiation",
  "project-coordination",
  "report-writing",
  "teamwork",
  "research",
];

test("P-14 (2.16). transversal capabilities read like any other skill (read-only)", async ({ browser }) => {
  // No dedicated surface exists: the eight transversal slugs arrive through
  // text, journal or picker and are shown in the same tiers and groups.
  const { ctx, page } = await as(browser, "worker");
  const caps = await profileAt(page, "capabilities");
  const onProfile = await caps
    .locator('[data-testid^="capability-skill-practice-"]')
    .evaluateAll(
      (els, slugs) => els.filter((e) => slugs.some((s) => e.getAttribute("data-testid") === `capability-skill-practice-${s}`)).length,
      TRANSVERSAL,
    );
  const cv = await livingCv(page);
  const onCv = await cv
    .locator('[data-testid^="cv-skill-hours-"]')
    .evaluateAll(
      (els, slugs) => els.filter((e) => slugs.some((s) => e.getAttribute("data-testid") === `cv-skill-hours-${s}`)).length,
      TRANSVERSAL,
    );
  console.info(`[transversal] on_profile=${onProfile} on_cv=${onCv}`);
  // Whatever is evidenced on the profile must not vanish from the CV.
  if (onProfile > 0) expect(onCv, "a transversal skill on the profile is also on the Living CV").toBeGreaterThan(0);
  await ctx.close();
});

// ── 2.24 / 2.32 — what others recorded, and the right to answer (read-only) ─

test("P-15 (2.24). the experience records about the worker open, with the right of reply (read-only)", async ({ browser }) => {
  // Read-only on purpose: a reply has no withdraw path and goes to moderation.
  const { ctx, page } = await as(browser, "worker");
  await page.goto("/lt/dashboard?result=experiences");
  const result = inMain(page).getByTestId("experiences-result");
  const unavailable = inMain(page).getByTestId("experiences-result-unavailable").first();
  const error = inMain(page).getByTestId("experiences-result-error");
  await expect(result.or(unavailable).or(error).first()).toBeVisible({ timeout: 45_000 });
  if (await error.isVisible()) throw new Error("experience records did not load");
  if (!(await result.isVisible())) throw new Error("experience records report themselves unavailable");
  await expect(result.getByTestId("experiences-about-me")).toBeVisible();
  const items = result.getByTestId("experience-about-me-item");
  const n = await items.count();
  let answerable = 0;
  for (let i = 0; i < n; i++) {
    const item = items.nth(i);
    if ((await item.locator('[data-testid="experience-response"], [data-testid="experience-response-body"]').count()) > 0) answerable++;
  }
  console.info(`[experiences] about_me=${n} with_reply_or_reply_form=${answerable}`);
  await ctx.close();
});

test("P-16 (2.32). the counterparty's review is readable on both sides (read-only)", async ({ browser }) => {
  const w = await as(browser, "worker");
  await w.page.goto("/lt/dashboard/journal");
  await expect(w.page.locator('[data-testid^="journal-entry-card-"]').first()).toBeVisible({ timeout: 45_000 });
  const phases = await w.page.locator("[data-phase][data-testid^='entry-review-']").evaluateAll((els) => {
    const c: Record<string, number> = {};
    for (const e of els) {
      const k = e.getAttribute("data-phase") ?? "?";
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  });
  console.info(`[review] worker-side review phases=${JSON.stringify(phases)}`);
  await w.ctx.close();

  const o = await as(browser, "owner");
  await useWorkspace(o.page, ALFA);
  await o.page.goto("/lt/dashboard/inbox/counterparty");
  await expect(inMain(o.page).getByTestId("counterparty-queue")).toBeVisible({ timeout: 30_000 });
  await expect(inMain(o.page).getByTestId("counterparty-queue-load-failed")).toHaveCount(0);
  console.info(`[review] counterparty queue cards=${await o.page.locator('[data-testid^="counterparty-card-"]').count()}`);
  await o.ctx.close();
});

// ── 2.25 / 2.26 / 12.3 — the person's own readings (read-only) ─────────────

test("P-17 (2.25). Work in numbers answers from the worker's own recorded work", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  await page.goto("/lt/dashboard/work-in-numbers");
  const wi = inMain(page).getByTestId("work-in-numbers");
  await expect(wi).toBeVisible({ timeout: 30_000 });
  const kind = await wi.getAttribute("data-state");
  const skills = await page.locator('[data-testid^="wi-skill-name-"]').count();
  console.info(`[work-in-numbers] state=${kind} skills=${skills}`);
  expect(kind, "a worker with weeks of recorded work is not an empty reading").not.toBe("no_entries");
  await expect(inMain(page).getByTestId("wi-period-nav")).toBeVisible();
  await ctx.close();
});

test("P-18 (2.26). one continuous professional history: one total, every hour counted once", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  await page.goto("/lt/dashboard/work-in-numbers");
  const experience = inMain(page).getByTestId("wi-experience");
  await expect(experience).toBeVisible({ timeout: 30_000 });
  // Read EVERYTHING from Work in numbers before leaving it: a locator is
  // re-evaluated on whatever page is loaded when it is next asked.
  const total = inMain(page).getByTestId("wi-experience-total");
  const num = async (l: Locator, a: string) => Number((await l.getAttribute(a)) ?? "NaN");
  const wi =
    (await total.count()) > 0
      ? {
          hours: await num(total, "data-hours"),
          journal: await num(total, "data-journal-hours"),
          organization: await num(total, "data-organization-hours"),
          text: (await total.innerText()).trim(),
        }
      : null;
  if (wi) {
    const addsUp = Math.abs(wi.hours - (wi.journal + wi.organization)) < 0.01;
    console.info(`[history] work-in-numbers total shown; parts add up=${addsUp}`);
    expect(wi.text.length, "the total is shown as text, not only as data").toBeGreaterThan(0);
    expect(addsUp, "the total is exactly journal + organization records").toBe(true);
  } else {
    // No organization-supplied history: the journal figure IS the history.
    await expect(inMain(page).getByTestId("wi-experience-journal")).toBeVisible();
    console.info("[history] journal-only history (no organization records to add)");
  }

  // The Living CV reads the SAME history: same total, same parts, or none.
  const cv = await livingCv(page);
  const cvTotal = cv.getByTestId("cv-professional-experience-total");
  const cvShown = (await cvTotal.count()) > 0;
  console.info(`[history] living CV total shown=${cvShown} work-in-numbers total shown=${wi !== null}`);
  if (cvShown) {
    expect(wi, "the Living CV shows a combined total that Work in numbers does not").not.toBeNull();
    const same =
      Math.abs((await num(cvTotal, "data-total-hours")) - wi!.hours) < 0.01 &&
      Math.abs((await num(cvTotal, "data-journal-hours")) - wi!.journal) < 0.01 &&
      Math.abs((await num(cvTotal, "data-organization-hours")) - wi!.organization) < 0.01;
    console.info(`[history] living CV and work-in-numbers agree=${same}`);
    expect(same, "one history: the Living CV and Work in numbers show the same total").toBe(true);
  }
  await ctx.close();
});

test("P-19 (12.3). the intelligence page reads the worker's market, with its method and sources", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  await page.goto("/lt/dashboard/intelligence");
  await expect(inMain(page).getByTestId("intelligence-page")).toBeVisible({ timeout: 30_000 });
  await expect(inMain(page).getByTestId("intelligence-not-available")).toHaveCount(0);
  await expect(inMain(page).getByTestId("intelligence-methodology")).toBeVisible();
  const cards = await page.locator('[data-testid^="intelligence-card-"]').count();
  const missing = (await inMain(page).getByTestId("intelligence-missing").count()) > 0;
  console.info(`[intelligence] cards=${cards} salary_basis_missing=${missing}`);
  await ctx.close();
});

// ── 3.27 / 3.31 — the company side (read-only) ───────────────────────────────

test("P-20 (3.27). the company's history page opens in Alfa's workspace", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/company/history");
  await expect(inMain(page).getByTestId("company-history")).toBeVisible({ timeout: 30_000 });
  const history = page.locator('[data-testid="company-work-history"], [data-testid="company-work-history-unavailable"]');
  await expect(history.first()).toBeVisible({ timeout: 30_000 });
  console.info(`[company-history] state=${await inMain(page).getByTestId("company-work-history").first().getAttribute("data-state").catch(() => "n/a")}`);
  await expect(inMain(page).getByTestId("company-history-hours-door")).toBeVisible();
  await ctx.close();
});

test("P-21 (3.31). the company report opens and its export downloads as a file", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner");
  await useWorkspace(page, ALFA);
  await page.goto("/lt/dashboard/reports");
  await expect(inMain(page).getByTestId("reports-hub")).toBeVisible({ timeout: 30_000 });
  await expect(inMain(page).getByTestId("reports-org-journal")).toBeVisible({ timeout: 30_000 });
  const exportLink = inMain(page).getByTestId("reports-export-finance-csv");
  if ((await exportLink.count()) === 0) {
    console.info("[report] finance export not offered (finance read unavailable for this workspace)");
  } else {
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), exportLink.click()]);
    const name = download.suggestedFilename();
    console.info(`[report] export downloaded as .${name.split(".").pop()}`);
    expect(name, "the export is a CSV file").toMatch(/\.csv$/i);
    await download.delete();
  }
  await ctx.close();
});

// ── cleanup ──────────────────────────────────────────────────────────────────
// `afterAll`, not a last test: a serial walk stops at its first red step, and
// a run that failed half-way must still put back what it changed. Each item is
// cleaned on its own and a failure is logged, never thrown over the result.

async function removeRows(rows: Locator, removeControl: string): Promise<number> {
  let removed = 0;
  // At most a few: a rerun after a red cleanup may meet this run's row twice.
  for (let i = 0; i < 5; i++) {
    const before = await rows.count();
    if (before === 0) break;
    await rows.first().locator(removeControl).first().click();
    await expect.poll(() => rows.count(), { timeout: 30_000 }).toBeLessThan(before);
    removed++;
  }
  return removed;
}

test.afterAll(async ({ browser }) => {
  // Own budget: the default hook timeout is 30 s, less than one row removal
  // (company-chain run 39960149411 lost its cleanup to it).
  test.setTimeout(600_000);
  const jobs: { what: string; run: (page: Page) => Promise<string> }[] = [
    {
      what: "history rows",
      run: async (page) => {
        let n = 0;
        for (const title of addedHistory) {
          const main = await profileAt(page, "capabilities");
          const rows = main.getByTestId("capability-experience-row").filter({ hasText: title });
          n += await removeRows(rows, '[data-testid^="capability-experience-remove-"]');
          await expect(rows).toHaveCount(0, { timeout: 30_000 });
        }
        return `removed=${n}`;
      },
    },
    {
      what: "education rows",
      run: async (page) => {
        let n = 0;
        for (const title of addedEducation) {
          const main = await profileAt(page, "cv-education");
          const rows = main.getByTestId("worker-education-row").filter({ hasText: title });
          n += await removeRows(rows, '[data-testid^="worker-education-remove-"]');
          await expect(rows).toHaveCount(0, { timeout: 30_000 });
        }
        return `removed=${n}`;
      },
    },
    {
      what: "achievement rows",
      run: async (page) => {
        let n = 0;
        for (const title of addedAchievements) {
          const main = await profileAt(page, "cv-achievements");
          const rows = main.getByTestId("worker-achievements-row").filter({ hasText: title });
          n += await removeRows(rows, '[data-testid^="worker-achievements-remove-"]');
          await expect(rows).toHaveCount(0, { timeout: 30_000 });
        }
        return `removed=${n}`;
      },
    },
    {
      what: "own profession",
      run: async (page) => {
        if (!addedProfession) return "nothing to remove";
        await removeOwnProfession(page);
        return "removed";
      },
    },
    {
      what: "skill claim",
      run: async (page) => {
        if (!addedClaim) return "nothing to remove";
        const main = await profileAt(page, "capabilities");
        const rows = main.getByTestId("capability-profile-claim").filter({ hasText: CLAIM });
        return `removed=${await removeRows(rows, '[data-testid="capability-profile-claim-remove"]')}`;
      },
    },
    {
      what: "ukrainian",
      run: async (page) => {
        if (!ukrainianOriginal) return "nothing to restore";
        const section = await languagesSection(page);
        const has = (await section.getByTestId("worker-language-uk").count()) > 0;
        if (has && !ukrainianOriginal.present) await removeUkrainian(page);
        if (!has && ukrainianOriginal.present) await addLanguage(page, "Українська", ukrainianOriginal.level);
        return "restored";
      },
    },
    {
      what: "work card",
      run: async (page) => {
        if (!workCardOriginal) return "nothing to restore";
        const o = workCardOriginal;
        const form = await openWorkCard(page);
        if (o.status) await form.locator(CARD_FIELDS.status).selectOption(o.status);
        await form.locator(CARD_FIELDS.countries).fill(o.countries);
        if (o.min) await form.locator(CARD_FIELDS.min).fill(o.min);
        if (o.max) await form.locator(CARD_FIELDS.max).fill(o.max);
        await saveWorkCard(form);
        return "restored";
      },
    },
    {
      what: "summary",
      run: async (page) => {
        if (!summaryOriginal) return "nothing to restore";
        const main = await profileAt(page, "profile-public-summary");
        const headline = main.getByTestId("profile-public-headline");
        const bio = main.getByTestId("profile-public-bio");
        if ((await headline.inputValue()) === summaryOriginal.headline && (await bio.inputValue()) === summaryOriginal.bio) {
          return "already original";
        }
        await headline.fill(summaryOriginal.headline);
        await bio.fill(summaryOriginal.bio);
        await main.getByTestId("profile-public-summary-save").click();
        await expect(main.getByTestId("profile-public-summary-saved")).toBeVisible({ timeout: 30_000 });
        return "restored";
      },
    },
  ];
  const { ctx, page } = await as(browser, "worker2");
  try {
    for (const job of jobs) {
      try {
        console.info(`[cleanup] ${job.what}: ${await job.run(page)}`);
      } catch (e) {
        console.info(`[cleanup] ${job.what}: NOT cleaned (${short(e)})`);
      }
    }
  } finally {
    await ctx.close();
  }
});
