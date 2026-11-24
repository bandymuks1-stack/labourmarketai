import { expect, test } from "@playwright/test";

import { BASE, PASSWORD, isolatedStack, lit, onboard, signUp, sql } from "./isolated-web-a-helpers";

/**
 * ANONYMOUS PUBLIC NEED INTAKE (function register 4.8), end to end on the
 * THROWAWAY local stack (.github/workflows/signup-isolated.yml): a visitor
 * with no account fills the public /company-need form and submits it; the
 * proof is the stored row in the local database, not the page saying "done".
 *
 * Production synthetic submissions are owner-dispatch only (owner decision
 * 2026-10-28) — this spec refuses to run anywhere but the local stack.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const RUN = Date.now().toString(36);
const CONTACT = `need.${RUN}@local.test`;
const COMPANY = `Synthetic Need Co ${RUN}`;

test("N-6. the landing's worker-search door opens the one need form, which keeps everything the door asked", async ({ browser }) => {
  const contact = `need.door.${RUN}@local.test`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); // no session
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en`);
  // The request block is closed until asked for (owner order 2026-11-24,
  // decisions 0032 / 0034): a visitor opens it, then picks the door.
  const block = page.getByTestId("landing-need-path");
  if (!(await block.evaluate((el) => (el as HTMLDetailsElement).open))) await block.locator("summary").click();
  await page.getByTestId("request-door-worker-search-open").first().click();
  await page.waitForURL(/\/en\/company-need\?from=request_worker_search/, { timeout: 30_000 });
  const form = page.getByTestId("company-need-form");
  await expect(form.locator('input[name="started"]'), "hydration wrote the fill time").not.toHaveValue("", {
    timeout: 60_000,
  });
  // The door's privacy notice came along.
  await expect(page.getByTestId("company-need-privacy-notice").locator('a[href$="/legal/privacy"]')).toBeVisible();
  await form.locator('input[name="company_name"]').fill(`Synthetic Door Co ${RUN}`);
  await form.locator('input[name="contact_email"]').fill(contact);
  await form.locator('input[name="contact_phone"]').fill("+37060000000");
  await form.locator('select[name="profession"]').selectOption("other_general");
  await form.getByTestId("company-need-country").selectOption("LT");
  // More than the old 1,000 cap here: the door took up to 100,000.
  await form.locator('input[name="number_of_workers"]').fill("2000");
  await form.locator('input[name="start_date"]').fill("2027-03-01");
  await form.locator('textarea[name="description"]').fill(`Seasonal pickers, own words (${RUN}).`);
  await page.waitForTimeout(3_500); // the spam guard's minimum fill time
  await form.getByTestId("company-need-submit").click();
  await expect(page.getByTestId("company-need-result")).toBeVisible({ timeout: 60_000 });

  const rows = sql<{ contact_phone: string | null; headcount: number | null; start_window: string | null; source_path: string | null }>(
    `select contact_phone, headcount, start_window, source_path
       from public.company_need_public_intakes where contact_email = ${lit(contact)}`,
  );
  expect(rows.length, "exactly one intake row").toBe(1);
  expect(rows[0].contact_phone, "the phone the door used to ask for is stored").toBe("+37060000000");
  expect(rows[0].headcount).toBe(2000);
  expect(rows[0].start_window).toContain("2027-03-01");
  expect(rows[0].source_path).toBe("/en/company-need?from=request_worker_search");
  await ctx.close();
});

test("N-1. an anonymous visitor submits the public company-need form and the intake is stored", async ({ browser }) => {
  const ctx = await browser.newContext(); // no session, no cookies
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/company-need`);
  const form = page.getByTestId("company-need-form");
  await expect(form, "the public form renders without an account").toBeVisible({ timeout: 30_000 });
  // The form is server markup that also posts without JavaScript; a send before
  // hydration takes that path and is stored marked `?review=no-js`. This walk is
  // the JavaScript visitor, so it waits until hydration has written the fill time.
  await expect(form.locator('input[name="started"]'), "hydration wrote the fill time").not.toHaveValue("", {
    timeout: 60_000,
  });

  await form.locator('input[name="company_name"]').fill(COMPANY);
  await form.locator('input[name="contact_person"]').fill("Synthetic Contact");
  await form.locator('input[name="contact_email"]').fill(CONTACT);
  // The first real work category the form offers (the list is the product's).
  const profession = form.locator('select[name="profession"]');
  const firstValue = await profession
    .locator("option")
    .evaluateAll((opts) => (opts as HTMLOptionElement[]).map((o) => o.value).find((v) => v !== "") ?? "");
  expect(firstValue, "the form offers at least one work category").not.toBe("");
  await profession.selectOption(firstValue);
  await form.getByTestId("company-need-country").selectOption("LT");
  await form.locator('input[name="number_of_workers"]').fill("3");
  await form.locator('input[name="city_region"]').fill("Vilnius");
  await form.locator('textarea[name="description"]').fill(`Three workers for a 4-week site job (${RUN}).`);
  // A send inside the spam guard's minimum fill time (3 s, lib/security/public-form-guard.ts)
  // is refused and stores nothing, so wait it out like a person would.
  await page.waitForTimeout(3_500);
  await form.getByTestId("company-need-submit").click();

  const result = page.getByTestId("company-need-result");
  await expect(result, "the form answers the visitor").toBeVisible({ timeout: 60_000 });
  // AI is off on this stack (AI_PROVIDER_MODE=disabled): the result says so in
  // the catalogue's own words, never a silent gap where a suggestion would
  // have been — at 1280 px and at 390 px. Imported here so this walk adds
  // nothing to the shared import line above.
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const EN = JSON.parse(readFileSync(resolve(__dirname, "../../messages/en.json"), "utf8")) as {
    companyNeed: { aiDisabled: string };
  };
  const aiOff = result.getByTestId("company-need-ai-disabled");
  await expect(aiOff, "AI off: the form says no suggestion is prepared").toBeVisible();
  await expect(aiOff).toHaveText(EN.companyNeed.aiDisabled);
  await expect(result.getByTestId("company-need-ai-none"), "AI off is not 'no suggestion produced'").toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(aiOff, "AI off: the same words at 390 px").toBeVisible();
  await expect(aiOff).toHaveText(EN.companyNeed.aiDisabled);
  // The stored row is the proof (the result card's received-vs-prepared
  // wording is the page's claim; the database is the fact).

  const rows = sql<{
    company_name: string;
    contact_email: string | null;
    country: string;
    sector: string | null;
    headcount: number | null;
    status: string;
    source_path: string | null;
  }>(
    `select company_name, contact_email, country, sector, headcount, status, source_path
       from public.company_need_public_intakes where contact_email = ${lit(CONTACT)}`,
  );
  expect(rows.length, "exactly one intake row is stored for this submission").toBe(1);
  const [row] = rows;
  expect(row.company_name).toBe(COMPANY);
  expect(row.country).toBe("LT");
  expect(row.sector).toBe(firstValue);
  expect(row.headcount).toBe(3);
  expect(row.status, "a new intake waits for the operator").toBe("new");
  expect(row.source_path).toBe("/en/company-need");
  await ctx.close();
});

test("N-5. the cost calculator's account route brings its worker count and country into the need form", async ({ browser }) => {
  // Imported here so this walk adds nothing to the shared import line above.
  const { PASSWORD, onboard, setUpCompany, signUp } = await import("./isolated-web-a-helpers");
  // A company account (setup, not under test).
  const account = `need.calc.${RUN}@local.test`;
  const setup = await browser.newContext();
  const first = await setup.newPage();
  await signUp(first, BASE, account);
  await onboard(first, "hire", "Synthetic Calc Employer");
  await setUpCompany(first, `Synthetic Calc Co ${RUN}`);
  await setup.close();

  // Signed out, the person estimates a job: Sweden, 3 workers x 8 h at 20.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/calculators/project-cost`);
  await expect(page.getByTestId("project-cost-calculator")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("pcc-country").selectOption("SE");
  await page.getByTestId("pcc-next").click();
  await page.getByTestId("pcc-workerCount").fill("3");
  await page.getByTestId("pcc-hoursPerWorker").fill("8");
  await page.getByTestId("pcc-next").click();
  await page.getByTestId("pcc-rate").fill("20");
  await page.getByTestId("pcc-next").click();
  await expect(page.getByTestId("estimate-total")).toBeVisible({ timeout: 15_000 });

  // The account route: sign in on the way, then the need form.
  await page.getByTestId("pcc-bridge").getByTestId("auth-cta-link").click();
  await page.waitForURL(/\/en\/auth\/login\?next=/, { timeout: 30_000 });
  await page.locator('input[name="email"]').fill(account);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(/\/en\/dashboard\/company\/needs\?/, { timeout: 60_000 });

  // The estimate's numbers are already in the form; nothing is retyped.
  const main = page.getByRole("main");
  await main.getByTestId("demand-role").fill("Welders");
  await main.getByTestId("demand-description").fill(`Three welders for a two-week job (${RUN}).`);
  await main.getByTestId("demand-next").click();
  await expect(main.getByTestId("demand-team-size"), "the worker count arrived").toHaveValue("3", { timeout: 30_000 });
  await expect(main.getByTestId("demand-country-select"), "the country arrived").toContainText(/Sweden/);
  await ctx.close();
});

test("N-2. the anonymous path cannot read the intake table back (write-only by design)", async () => {
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  test.skip(!anon, "anon key not exported");
  const r = await fetch(
    `http://127.0.0.1:54321/rest/v1/company_need_public_intakes?select=id&contact_email=eq.${encodeURIComponent(CONTACT)}`,
    { headers: { apikey: anon, Authorization: `Bearer ${anon}` } },
  );
  // Either refused outright or an empty answer — never the visitor's row.
  if (r.ok) {
    expect(await r.json(), "anon sees no intake rows").toEqual([]);
  } else {
    expect([401, 403, 404]).toContain(r.status);
  }
});

test("N-3. signing in from the form comes back to it, with what was typed", async ({ browser }) => {
  // An existing, onboarded account, made through the real sign-up.
  const account = `need.return.${RUN}@local.test`;
  const setup = await browser.newContext();
  const first = await setup.newPage();
  await signUp(first, BASE, account);
  await onboard(first, "hire", "Synthetic Need Return");
  await first.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  await setup.close();

  // Signed out, the person starts the need on the public form.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/company-need?from=landing_entry`);
  const form = page.getByTestId("company-need-form");
  await expect(form.locator('input[name="started"]'), "hydration wrote the fill time").not.toHaveValue("", {
    timeout: 60_000,
  });
  const text = `Two welders for a bridge job in Gothenburg (${RUN}).`;
  await form.getByTestId("company-need-country").selectOption("SE");
  await form.locator('input[name="number_of_workers"]').fill("2");
  await form.locator('textarea[name="description"]').fill(text);

  // Then signs in from the form's own link.
  await page.getByTestId("need-bridge-login").click();
  await page.waitForURL(/\/en\/auth\/login\?next=/, { timeout: 30_000 });
  await page.locator('input[name="email"]').fill(account);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();

  // Back on the form, not the dashboard, with the need as it was typed.
  await page.waitForURL(/\/en\/company-need\?/, { timeout: 60_000 });
  const back = page.getByTestId("company-need-form");
  await expect(back.locator('textarea[name="description"]'), "the typed text survives sign-in").toHaveValue(text, {
    timeout: 30_000,
  });
  await expect(back.getByTestId("company-need-country")).toHaveValue("SE");
  await expect(back.locator('input[name="number_of_workers"]')).toHaveValue("2");
  expect(new URL(page.url()).searchParams.get("from"), "the page that opened the form is still named").toBe(
    "landing_entry",
  );
  // No name or address rode along in the URL.
  expect(page.url()).not.toContain("local.test");
  await ctx.close();
});

test("N-4. signing up from the form comes back to it after onboarding, with what was typed", async ({ browser }) => {
  const account = `need.signup.${RUN}@local.test`;
  const ctx = await browser.newContext(); // signed out
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/company-need`);
  const form = page.getByTestId("company-need-form");
  await expect(form.locator('input[name="started"]'), "hydration wrote the fill time").not.toHaveValue("", {
    timeout: 60_000,
  });
  const text = `Five carpenters for a school roof (${RUN}).`;
  await form.locator('textarea[name="description"]').fill(text);

  // A new account from the form's own sign-up link.
  await page.getByTestId("need-bridge-signup").click();
  await page.waitForURL(/\/en\/auth\/signup\?next=/, { timeout: 30_000 });
  await page.locator('input[type="email"]').fill(account);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirm_password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/en\/onboarding/, { timeout: 60_000 });
  await onboard(page, "hire", "Synthetic Need Signup");

  // Onboarding done: back on the form with the need, not on a dashboard.
  await page.waitForURL(/\/en\/company-need\?/, { timeout: 60_000 });
  await expect(
    page.getByTestId("company-need-form").locator('textarea[name="description"]'),
    "the typed text survives sign-up and onboarding",
  ).toHaveValue(text, { timeout: 30_000 });
  await ctx.close();
});
