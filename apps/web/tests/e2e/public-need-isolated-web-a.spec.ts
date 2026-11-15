import { expect, test } from "@playwright/test";

import { BASE, isolatedStack, lit, sql } from "./isolated-web-a-helpers";

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
