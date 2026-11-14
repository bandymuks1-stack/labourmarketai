import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * TWO EXAMPLE CVs, SCREENSHOTTED (owner decision 2026-11-14: a CI check with
 * synthetic test accounts; screenshots kept as CI artifacts).
 *
 * Runs ONLY on the throwaway local stack of the isolated CI job
 * (.github/workflows/signup-isolated.yml). Two synthetic people from two
 * different sectors sign up through the real form and fill their profile the
 * way a person does. Each CV is then checked for exactly what was entered
 * (name, education, work lines, language) and for the honesty labels, and is
 * captured at 375 px and 1440 px, light and dark: 8 images, written to
 * test-results/cv-examples/ and uploaded by the job as the `cv-examples`
 * artifact. No real person's data, nothing outside this stack.
 */

const BASE = process.env.E2E_BASE_URL ?? "";
const SB_URL = process.env.E2E_SUPABASE_URL ?? "";
const SB_SERVICE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? "";
const LOCAL = /^http:\/\/127\.0\.0\.1:\d+$/;

test.skip(
  process.env.SIGNUP_ISOLATED !== "1" || !LOCAL.test(BASE) || SB_URL !== "http://127.0.0.1:54321" || !SB_SERVICE,
  "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)",
);
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const PASSWORD = "Synthetic-Pass-2026!";
const OUT = join(process.cwd(), "test-results", "cv-examples");

interface Example {
  readonly key: string;
  readonly name: string;
  readonly school: string;
  readonly educationType: RegExp;
  readonly language: { readonly option: RegExp; readonly level: RegExp; readonly code: string; readonly shown: RegExp };
  readonly jobs: readonly { readonly title: string; readonly from: string; readonly to: string | null }[];
}

/** Two sectors on purpose: the CV is not a construction-only document. */
const EXAMPLES: readonly Example[] = [
  {
    key: "electrician",
    name: "Synthetic Example Electrician",
    school: `Synthetic Vocational Centre ${RUN}`,
    educationType: /Vocational/,
    language: { option: /Deutsch/i, level: /B2/, code: "de", shown: /(Deutsch|German|DE) · B2/ },
    jobs: [
      { title: "Electrician, residential installations", from: "2019", to: null },
      { title: "Apprentice electrician", from: "2016", to: "2019" },
    ],
  },
  {
    key: "care-assistant",
    name: "Synthetic Example Care Assistant",
    school: `Synthetic College of Health ${RUN}`,
    educationType: /^College$/,
    language: { option: /English/i, level: /C1/, code: "en", shown: /(English|EN) · C1/ },
    jobs: [
      { title: "Care assistant, residential care home", from: "2021", to: null },
      { title: "Kitchen assistant, hospital canteen", from: "2018", to: "2021" },
    ],
  },
];

async function db<T>(path: string): Promise<T> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` },
  });
  if (!r.ok) throw new Error(`local db read ${path.split("?")[0]} → ${r.status}`);
  return (await r.json()) as T;
}

/** Click until the expected result shows: a click before hydration is a no-op. */
async function clickUntil(target: Locator, result: Locator, timeout = 60_000): Promise<void> {
  await expect(async () => {
    if (!(await result.isVisible().catch(() => false))) await target.click({ timeout: 5_000 });
    await expect(result).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout });
}

async function choose(page: Page, listbox: Locator, name: RegExp): Promise<void> {
  const option = page.getByRole("option", { name }).first();
  await clickUntil(listbox, option);
  await option.click();
}

async function signUpAndOnboard(page: Page, address: string, name: string): Promise<void> {
  await page.goto(`${BASE}/en/auth/signup`);
  await page.locator('input[type="email"]').fill(address);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirm_password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/en\/onboarding/, { timeout: 60_000 });
  await page.getByTestId("onboarding-intent-work").click();
  await page.getByTestId("onboarding-intents-continue").click();
  await page.getByTestId("onboarding-display-name").fill(name);
  await page.getByTestId("onboarding-country").click();
  await page.getByRole("option", { name: /Lithuania/ }).first().click();
  await page.getByTestId("onboarding-submit").click();
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
}

async function fillProfile(page: Page, ex: Example): Promise<void> {
  // Language.
  await page.goto(`${BASE}/en/dashboard/profile#cv-languages`);
  const languages = page.getByTestId("worker-languages");
  await expect(languages).toBeVisible({ timeout: 60_000 });
  await choose(page, languages.getByTestId("worker-languages-lang"), ex.language.option);
  await choose(page, languages.getByTestId("worker-languages-level"), ex.language.level);
  await languages.getByTestId("worker-languages-add").click();
  await expect(languages.getByTestId(`worker-language-${ex.language.code}`)).toBeVisible({ timeout: 30_000 });

  // Education.
  const education = page.getByTestId("worker-education");
  await expect(education).toBeVisible({ timeout: 30_000 });
  await clickUntil(education.getByTestId("worker-education-add-open"), education.getByTestId("worker-education-form"));
  await education.getByTestId("worker-education-institution").fill(ex.school);
  await choose(page, education.getByTestId("worker-education-type"), ex.educationType);
  await education.getByTestId("worker-education-save").click();
  await expect(education.getByTestId("worker-education-row").filter({ hasText: ex.school })).toBeVisible({ timeout: 30_000 });

  // Work lines.
  for (const job of ex.jobs) {
    await page.goto(`${BASE}/en/dashboard/profile#capabilities`);
    await page.reload();
    const main = page.getByRole("main");
    await clickUntil(main.getByTestId("add-experience-open"), main.getByTestId("add-experience-form"));
    await main.getByTestId("add-experience-title").fill(job.title);
    await main.getByTestId("add-experience-start-year").fill(job.from);
    if (job.to === null) {
      await main.getByTestId("add-experience-current").check();
    } else {
      await main.getByLabel("To (month / year): YYYY").fill(job.to);
    }
    await main.getByTestId("add-experience-save").click();
    await expect(main.getByTestId("capability-experience-row").filter({ hasText: job.title })).toBeVisible({ timeout: 30_000 });
    await expect(main.getByTestId("add-experience-error")).toHaveCount(0);
  }
}

/** What the CV must say: exactly what was entered, with education marked as stated by the person. */
async function checkCv(page: Page, ex: Example): Promise<void> {
  await page.goto(`${BASE}/en/cv`);
  const main = page.getByRole("main").first();
  await expect(main).toBeVisible({ timeout: 30_000 });
  await expect(main).toContainText(ex.name, { timeout: 30_000 });
  await expect(page.getByTestId("cv-education-row").filter({ hasText: ex.school })).toBeVisible();
  await expect(page.getByTestId("cv-education-self-stated"), "education is marked as the person's own statement").toBeVisible();
  await expect(page.getByTestId("cv-languages")).toContainText(ex.language.shown);
  for (const job of ex.jobs) await expect(main, `work line "${job.title}"`).toContainText(job.title);
}

async function shoot(browser: Browser, address: string, ex: Example): Promise<void> {
  const sizes = [
    { label: "375", viewport: { width: 375, height: 812 } },
    { label: "1440", viewport: { width: 1440, height: 900 } },
  ];
  for (const theme of ["light", "dark"] as const) {
    for (const size of sizes) {
      const ctx = await browser.newContext({ viewport: size.viewport, timezoneId: "UTC" });
      await ctx.addInitScript((t) => {
        try {
          window.localStorage.setItem("theme", t);
        } catch {
          /* storage blocked: the page's default theme is captured instead */
        }
      }, theme);
      const page = await ctx.newPage();
      try {
        await page.goto(`${BASE}/en/auth/login`);
        await page.locator('input[name="email"]').fill(address);
        await page.locator('input[name="password"]').fill(PASSWORD);
        await page.locator('form button[type="submit"]').first().click();
        await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
        await checkCv(page, ex);
        await page.waitForLoadState("networkidle").catch(() => {});
        expect(await page.evaluate(() => document.documentElement.dataset.theme), "theme applied").toBe(theme);
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(over, `${ex.key} ${size.label} ${theme}: no sideways scrolling`).toBeLessThanOrEqual(1);
        await page.screenshot({ path: join(OUT, `cv-${ex.key}-${size.label}-${theme}.png`), fullPage: true });
      } finally {
        await ctx.close();
      }
    }
  }
}

for (const ex of EXAMPLES) {
  test(`CV-${ex.key}. a synthetic ${ex.key} fills the profile; the CV says exactly that, captured at 375 and 1440, light and dark`, async ({ browser }) => {
    mkdirSync(OUT, { recursive: true });
    const address = `cv-example.${ex.key}.${RUN}@local.test`;
    const ctx = await browser.newContext({ timezoneId: "UTC" });
    const page = await ctx.newPage();
    try {
      await signUpAndOnboard(page, address, ex.name);
      await fillProfile(page, ex);
      // Stored, not only shown.
      const [profile] = await db<Array<{ id: string }>>(`profiles?email=eq.${encodeURIComponent(address)}&select=id`);
      const edu = await db<Array<{ institution_name: string }>>(
        `worker_education?profile_id=eq.${profile.id}&select=institution_name`,
      );
      expect(edu.map((e) => e.institution_name)).toEqual([ex.school]);
      await checkCv(page, ex);
    } finally {
      await ctx.close();
    }
    await shoot(browser, address, ex);
  });
}
