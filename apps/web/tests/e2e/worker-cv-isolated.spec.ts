import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import {
  BASE,
  LOCAL,
  PASSWORD,
  SB_ANON,
  SB_SERVICE,
  SB_URL,
  onboard,
  setUpCompany,
  signIn,
  signUp,
} from "./isolated-web-a-helpers";

/**
 * WORKER PROFILE AND CV, AND WHO ELSE MAY SEE THEM — on the throwaway local
 * stack (.github/workflows/signup-isolated.yml). Every account is made here
 * through the public sign-up form and dies with the job.
 *
 *   G-1 owner scenario 1: a worker signs up on a phone-sized screen, fills the
 *       profile (a language, an education line, a work-experience line) and
 *       reads all three back on the CV. The stored rows are read back from the
 *       database; the page saying "saved" is not the proof.
 *   G-2 isolation: while the worker has NOT agreed to be found, a company
 *       reads none of it: not through its own row-level security, not through
 *       the discovery function, not on the person page.
 *   G-3 employer-side worker search: the worker agrees to be found and
 *       records a day of work; the company finds them from its need, narrows
 *       the list with the filters, and opens the person page. That page shows
 *       no name and makes no claim about records it did not read. The
 *       worker's private rows stay unreadable to the company.
 *
 * It refuses to run anywhere but the local stack (no synthetic accounts in
 * production). Result class: PASS_CI_ONLY, never LIVE_VERIFIED.
 */

test.skip(
  process.env.SIGNUP_ISOLATED !== "1" ||
    !LOCAL.test(BASE) ||
    SB_URL !== "http://127.0.0.1:54321" ||
    !SB_SERVICE ||
    !SB_ANON,
  "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)",
);
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const email = (who: string) => `cv.${who}.${RUN}@local.test`;

const WORKER = email("worker");
const COMPANY = email("company");
const WORKER_NAME = `Synthetic Cv Worker ${RUN}`;
const SCHOOL = `Synthetic Vocational School ${RUN}`;
const JOB_TITLE = `Bathroom tiler at Synthetic Works ${RUN}`;
const PRIVATE_WORD = `cellar${RUN}`;
const WORK_TEXT = `Tiled the bathroom floor, waterproofing in the shower at the ${PRIVATE_WORD}, 7 hours`;
const NEED_ROLE = `Wet-room finishing specialist ${RUN}`;

const PHONE = { width: 390, height: 844 };

const state: Record<string, string> = {};

/** A read with the service key: what is STORED, whoever may see it. */
async function db<T>(path: string): Promise<T> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` },
  });
  if (!r.ok) throw new Error(`local db read ${path.split("?")[0]} → ${r.status}`);
  return (await r.json()) as T;
}

async function token(address: string): Promise<string> {
  const t = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: address, password: PASSWORD }),
  });
  if (!t.ok) throw new Error(`local sign-in for an RLS read → ${t.status}`);
  return ((await t.json()) as { access_token: string }).access_token;
}

/** A REST read AS a signed-in person: what row-level security lets THEM see. */
async function readAs<T>(address: string, path: string): Promise<T> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${await token(address)}` },
  });
  if (!r.ok) throw new Error(`rls read ${path.split("?")[0]} → ${r.status}`);
  return (await r.json()) as T;
}

/** The employer discovery function, called AS the person. */
async function discoverableAs(address: string, workerId: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/list_discoverable_worker_profiles_v1`, {
    method: "POST",
    headers: {
      apikey: SB_ANON,
      Authorization: `Bearer ${await token(address)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_worker_ids: [workerId] }),
  });
  if (!r.ok) throw new Error(`discovery function → ${r.status}`);
  return (await r.json()) as Array<Record<string, unknown>>;
}

/** Click until the expected result shows: a click that lands before the page
 *  hydrated is a silent no-op, so the click is retried, never assumed. */
async function clickUntil(target: Locator, result: Locator, timeout = 60_000): Promise<void> {
  await expect(async () => {
    if (!(await result.isVisible().catch(() => false))) await target.click({ timeout: 5_000 });
    await expect(result).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout });
}

/** Choose one option of a shared listbox by its visible name. */
async function choose(page: Page, listbox: Locator, name: RegExp): Promise<void> {
  const option = page.getByRole("option", { name }).first();
  await clickUntil(listbox, option);
  await option.click();
}

/** Everything the page's main region renders, once its content streamed in. */
async function mainText(page: Page): Promise<string> {
  const main = page.getByRole("main").first();
  await expect(main).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  let text = "";
  await expect
    .poll(
      async () => {
        text = ((await main.textContent()) ?? "").trim();
        return text.length;
      },
      { message: "the page content rendered", timeout: 30_000 },
    )
    .toBeGreaterThan(40);
  return text;
}

/** The page is no wider than the screen (no sideways scrolling on a phone). */
async function expectNoSidewaysScroll(page: Page, what: string): Promise<void> {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over, `${what}: the page is not wider than a ${PHONE.width}px screen`).toBeLessThanOrEqual(1);
}

async function as(browser: Browser, address: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  await signIn(page, BASE, address);
  return { page, close: () => ctx.close() };
}

// ── G-1 ─────────────────────────────────────────────────────────────────────

test("G-1. a worker signs up on a phone, fills the profile, and reads it back on the CV", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: "UTC", viewport: PHONE, hasTouch: true });
  const page = await ctx.newPage();
  await signUp(page, BASE, WORKER);
  await onboard(page, "work", WORKER_NAME);
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });

  const [profile] = await db<Array<{ id: string }>>(`profiles?email=eq.${encodeURIComponent(WORKER)}&select=id`);
  expect(profile?.id, "the profile exists").toBeTruthy();
  state.profileId = profile.id;
  const [worker] = await db<Array<{ id: string }>>(`workers?profile_id=eq.${state.profileId}&select=id`);
  expect(worker?.id, "the worker record exists").toBeTruthy();
  state.workerId = worker.id;

  // A language.
  await page.goto(`${BASE}/en/dashboard/profile#cv-languages`);
  const languages = page.getByTestId("worker-languages");
  await expect(languages).toBeVisible({ timeout: 60_000 });
  await choose(page, languages.getByTestId("worker-languages-lang"), /Deutsch/i);
  await choose(page, languages.getByTestId("worker-languages-level"), /B2/);
  await languages.getByTestId("worker-languages-add").click();
  await expect(languages.getByTestId("worker-language-de"), "the language is listed").toBeVisible({ timeout: 30_000 });
  await expectNoSidewaysScroll(page, "profile");

  // An education line.
  const education = page.getByTestId("worker-education");
  await expect(education).toBeVisible({ timeout: 30_000 });
  await clickUntil(education.getByTestId("worker-education-add-open"), education.getByTestId("worker-education-form"));
  await education.getByTestId("worker-education-institution").fill(SCHOOL);
  await choose(page, education.getByTestId("worker-education-type"), /vocational/i);
  await education.getByTestId("worker-education-save").click();
  await expect(
    education.getByTestId("worker-education-row").filter({ hasText: SCHOOL }),
    "the education line is listed",
  ).toBeVisible({ timeout: 30_000 });

  // A work-experience line.
  await page.goto(`${BASE}/en/dashboard/profile#capabilities`);
  const main = page.getByRole("main");
  await clickUntil(main.getByTestId("add-experience-open"), main.getByTestId("add-experience-form"));
  await main.getByTestId("add-experience-title").fill(JOB_TITLE);
  await main.getByTestId("add-experience-start-year").fill("2019");
  await main.getByTestId("add-experience-current").check();
  await main.getByTestId("add-experience-save").click();
  await expect(
    main.getByTestId("capability-experience-row").filter({ hasText: JOB_TITLE }),
    "the experience line is listed",
  ).toBeVisible({ timeout: 30_000 });
  await expect(main.getByTestId("add-experience-error")).toHaveCount(0);

  // STORED, not only shown.
  const storedLanguages = await db<Array<{ lang: string; level: string }>>(
    `worker_languages?worker_id=eq.${state.workerId}&select=lang,level`,
  );
  expect(storedLanguages).toEqual([{ lang: "de", level: "B2" }]);
  const storedEducation = await db<Array<{ institution_name: string; education_type_slug: string }>>(
    `worker_education?profile_id=eq.${state.profileId}&select=institution_name,education_type_slug`,
  );
  expect(storedEducation).toEqual([{ institution_name: SCHOOL, education_type_slug: "vocational" }]);

  // The CV carries all three.
  await page.goto(`${BASE}/en/cv`);
  const cv = await mainText(page);
  expect(cv, "the CV names the person").toContain(WORKER_NAME);
  expect(cv, "the CV carries the education line").toContain(SCHOOL);
  expect(cv, "the CV carries the experience line").toContain(JOB_TITLE);
  await expect(page.getByTestId("cv-languages"), "the CV carries the language").toContainText(/(Deutsch|German|DE) · B2/);
  await expect(page.getByTestId("cv-back-link"), "the CV has a way back").toBeVisible();
  await expectNoSidewaysScroll(page, "CV");
  await ctx.close();
});

// ── G-2 ─────────────────────────────────────────────────────────────────────

test("G-2. a company reads nothing of a worker who has not agreed to be found", async ({ browser }) => {
  expect(state.workerId && state.profileId).toBeTruthy();
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  await signUp(page, BASE, COMPANY);
  await onboard(page, "hire", `Synthetic Cv Company Owner ${RUN}`);
  await setUpCompany(page, `Synthetic Cv Company ${RUN}`);

  // Under the company's OWN row-level security: zero rows.
  const counts = {
    worker: (await readAs<unknown[]>(COMPANY, `workers?id=eq.${state.workerId}&select=id`)).length,
    profile: (await readAs<unknown[]>(COMPANY, `profiles?id=eq.${state.profileId}&select=id`)).length,
    languages: (await readAs<unknown[]>(COMPANY, `worker_languages?worker_id=eq.${state.workerId}&select=id`)).length,
    education: (await readAs<unknown[]>(COMPANY, `worker_education?profile_id=eq.${state.profileId}&select=id`)).length,
    skills: (await readAs<unknown[]>(COMPANY, `worker_skills?worker_id=eq.${state.workerId}&select=skill_id`)).length,
    history: (await readAs<unknown[]>(COMPANY, `engagement_contexts?profile_id=eq.${state.profileId}&select=id`)).length,
    discovery: (await discoverableAs(COMPANY, state.workerId)).length,
  };
  expect(counts, "the company reads none of the worker's rows").toEqual({
    worker: 0,
    profile: 0,
    languages: 0,
    education: 0,
    skills: 0,
    history: 0,
    discovery: 0,
  });
  // The control: the worker, under the same rules, does read their own.
  expect(
    (await readAs<unknown[]>(WORKER, `worker_languages?worker_id=eq.${state.workerId}&select=id`)).length,
    "control: own language",
  ).toBe(1);
  expect(
    (await readAs<unknown[]>(WORKER, `worker_education?profile_id=eq.${state.profileId}&select=id`)).length,
    "control: own education",
  ).toBe(1);

  // The person page, opened by its address, says only that it is unavailable.
  await page.goto(`${BASE}/en/dashboard/people/${state.workerId}`);
  await expect(page.getByTestId("person-restricted")).toBeVisible({ timeout: 60_000 });
  const text = await mainText(page);
  for (const secret of [WORKER_NAME, WORKER, SCHOOL, JOB_TITLE]) {
    expect(text, "the restricted page shows nothing of the person").not.toContain(secret);
  }
  await ctx.close();
});

// ── G-3 ─────────────────────────────────────────────────────────────────────

test("G-3. the worker agrees to be found; the company finds them, filters the list, and opens an anonymous person page", async ({
  browser,
}) => {
  expect(state.workerId).toBeTruthy();

  // The worker: the visibility choice, then one day of work.
  const w = await as(browser, WORKER);
  await w.page.goto(`${BASE}/en/dashboard/privacy#visibility`);
  const section = w.page.getByTestId("privacy-visibility");
  await expect(section).toBeVisible({ timeout: 30_000 });
  await clickUntil(section.getByTestId("discoverability-open"), section.getByTestId("discoverability-grant"));
  await section.getByTestId("discoverability-grant").click();
  await expect(section.getByTestId("discoverability-granted")).toBeVisible({ timeout: 30_000 });

  await w.page.goto(`${BASE}/en/dashboard/journal`);
  const journal = w.page.getByRole("main");
  const box = journal.getByTestId("journal-quick-record-text");
  await expect(box).toBeVisible({ timeout: 60_000 });
  await box.fill(WORK_TEXT);
  await clickUntil(journal.getByTestId("journal-quick-record-understand"), journal.getByTestId("worklog-flow"));
  await journal.getByTestId("worklog-save").click();
  await journal.getByTestId("worklog-confirm").click();
  await expect(journal.getByTestId("worklog-done"), "the day of work is saved").toBeVisible({ timeout: 60_000 });
  await w.close();

  // The company: a need, then the search from that need.
  const c = await as(browser, COMPANY);
  const page = c.page;
  await page.goto(`${BASE}/en/dashboard/company/needs?audience=need#demand-intake`);
  const intake = page.getByRole("main");
  await intake.getByTestId("demand-role").fill(NEED_ROLE);
  await intake.getByTestId("demand-description").fill("Tiling and waterproofing of bathrooms in Vilnius");
  await intake.getByTestId("demand-next").click();
  const size = intake.getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("1");
  await intake.getByTestId("demand-next").click();
  await intake.getByTestId("demand-create").click();
  await expect(intake.getByTestId("demand-done")).toBeVisible({ timeout: 30_000 });
  let needId = "";
  await expect
    .poll(
      async () => {
        const [byTitle, byRole] = await Promise.all([
          db<Array<{ id: string }>>(`customer_requests?title=eq.${encodeURIComponent(NEED_ROLE)}&select=id`),
          db<Array<{ id: string }>>(`customer_requests?role_or_work_type=eq.${encodeURIComponent(NEED_ROLE)}&select=id`),
        ]);
        const ids = [...new Set([...byTitle, ...byRole].map((r) => r.id))];
        needId = ids[0] ?? "";
        return ids.length;
      },
      { message: "the need is stored", timeout: 30_000 },
    )
    .toBe(1);

  const search = `${BASE}/en/dashboard/company/scouting?request=${needId}`;
  await page.goto(search);
  const main = page.getByRole("main");
  const card = main.getByTestId(`scout-candidate-${state.workerId}`);
  await expect(card, "the worker is found from the need").toBeVisible({ timeout: 60_000 });
  const found = await mainText(page);
  for (const secret of [WORKER_NAME, WORKER, PRIVATE_WORD, SCHOOL]) {
    expect(found, "the search result shows no name, address or private text").not.toContain(secret);
  }

  // FILTERS. The worker's own country keeps them; another country drops them;
  // clearing brings them back. The filter is the server's, so the address is
  // the control: the same list is asked for again with the filter in it.
  const filters = main.getByTestId("scouting-filters");
  await expect(filters).toBeVisible();
  await filters.getByTestId("scout-filter-country-LT").click();
  await page.waitForURL(/country=LT/, { timeout: 30_000 });
  await expect(card, "filter by the worker's country keeps them").toBeVisible({ timeout: 30_000 });
  await page.goto(`${search}&country=NO`);
  await expect(main.getByTestId("scouting-filters").or(main.getByTestId("scouting-empty")).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(card, "filter by another country drops them").toHaveCount(0);
  await page.goto(search);
  await expect(card, "without a filter they are back").toBeVisible({ timeout: 30_000 });
  const skillChip = main.locator('[data-testid^="scout-filter-skill-"]').first();
  await skillChip.click();
  await page.waitForURL(/skill=/, { timeout: 30_000 });
  await expect(card, "filter by a skill their work shows keeps them").toBeVisible({ timeout: 30_000 });
  await expect(main.getByTestId("scout-filter-clear")).toBeVisible();

  // THE PERSON PAGE for a found worker: no name, and no claim about records
  // the page did not read (services, photos, recorded work).
  await page.goto(`${BASE}/en/dashboard/people/${state.workerId}`);
  await expect(page.getByTestId("person-page")).toBeVisible({ timeout: 60_000 });
  const person = await mainText(page);
  for (const secret of [WORKER_NAME, WORKER, PRIVATE_WORD, SCHOOL]) {
    expect(person, "the person page shows no name, address or private text").not.toContain(secret);
  }
  await expect(page.getByTestId("person-shared-after-work")).toBeVisible();
  await expect(page.getByTestId("person-services")).toHaveCount(0);
  await expect(page.getByTestId("person-photos")).toHaveCount(0);
  await expect(page.getByTestId("person-work")).toHaveCount(0);
  await c.close();

  // Found is not opened: the raw record, the education and the journal stay
  // unreadable under the company's own row-level security.
  const after = {
    rawWorker: (await readAs<unknown[]>(COMPANY, `workers?id=eq.${state.workerId}&select=id`)).length,
    profile: (await readAs<unknown[]>(COMPANY, `profiles?id=eq.${state.profileId}&select=id`)).length,
    education: (await readAs<unknown[]>(COMPANY, `worker_education?profile_id=eq.${state.profileId}&select=id`)).length,
    journal: (await readAs<unknown[]>(COMPANY, `journal_entries?worker_id=eq.${state.workerId}&select=id`)).length,
  };
  expect(after, "consent to be found opens no private record").toEqual({
    rawWorker: 0,
    profile: 0,
    education: 0,
    journal: 0,
  });
  const projection = await discoverableAs(COMPANY, state.workerId);
  expect(projection.length, "the discovery function now answers").toBe(1);
  for (const field of ["display_name", "bio", "headline", "profile_id", "email"]) {
    expect(projection[0], `the projection carries no ${field}`).not.toHaveProperty(field);
  }
});
