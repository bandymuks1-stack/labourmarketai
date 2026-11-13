import { expect, test } from "@playwright/test";

import {
  BASE,
  isolatedStack,
  lit,
  onboard,
  publishNeed,
  setUpCompany,
  signIn,
  signUp,
  sql,
  sqlExec,
  userId,
} from "./isolated-web-a-helpers";

/**
 * OWNER PRINCIPLE C (2026-11-12), end to end on the THROWAWAY local stack
 * (.github/workflows/signup-isolated.yml, every migration applied by
 * `supabase db reset`):
 *   V1-0  nothing is public before the company's explicit "Publish publicly";
 *         each company then publishes its need through the real button;
 *   V1-1  a signed-out visitor sees the clean need of an UNCONFIRMED company on
 *         /jobs, labelled "Company not confirmed", with no verified badge and no
 *         contact data;
 *   V1-2  a published need with a phone number in its shown text is NOT shown —
 *         and its company sees "Waiting for review".
 * Both companies are created through the real sign-up, onboarding, company
 * setup and need intake. The only direct write is to the need's own text, so
 * the walk does not depend on how the intake wizard maps its fields.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const CLEAN = `v1.clean.${RUN}@local.test`;
const SPAM = `v1.spam.${RUN}@local.test`;

async function companyWithNeed(
  browser: import("@playwright/test").Browser,
  address: string,
  legalName: string,
): Promise<string> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signUp(page, BASE, address);
  await onboard(page, "hire", `V1 ${RUN}`);
  await setUpCompany(page, legalName);
  await publishNeed(page, BASE, "tiler", "LT");
  await ctx.close();
  const pid = await userId(address);
  const rows = sql<{ id: string }>(
    `select id from public.customer_requests where profile_id = ${lit(pid)} and status = 'submitted' order by created_at desc limit 1`,
  );
  expect(rows.length, "the need was submitted").toBe(1);
  return rows[0].id;
}

let cleanId = "";
let spamId = "";

/** The company's own explicit choice, through the needs page's real button. */
async function publishViaUi(browser: import("@playwright/test").Browser, address: string, id: string): Promise<void> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, BASE, address);
  await page.goto(`${BASE}/en/dashboard/company/needs`);
  await page.getByTestId(`need-publish-${id}`).click();
  await expect(page.getByTestId(`need-withdraw-${id}`), "the choice is saved").toBeVisible({ timeout: 60_000 });
  await ctx.close();
}

test("V1-0. two unconfirmed companies each post a need; nothing is public until each publishes it", async ({ browser }) => {
  cleanId = await companyWithNeed(browser, CLEAN, `V1 Clean ${RUN} UAB`);
  spamId = await companyWithNeed(browser, SPAM, `V1 Spam ${RUN} UAB`);
  // Neither company is verified: the walk is about the unconfirmed path.
  const statuses = sql<{ v: string }>(
    `select c.verification_status as v from public.customer_requests cr
       join public.organizations o on o.id = cr.organization_id
       join public.companies c on c.id = o.legacy_company_id
      where cr.id in (${lit(cleanId)}, ${lit(spamId)})`,
  ).map((r) => r.v);
  expect(statuses.length).toBe(2);
  expect(statuses).not.toContain("verified");
  // setUpCompany saves a DRAFT; a draft company's needs are held (company_draft).
  // Move both out of draft the way activating the profile does — still NOT verified.
  sqlExec(
    `update public.companies c set verification_status = 'active_unverified'
       from public.customer_requests cr join public.organizations o on o.id = cr.organization_id
      where c.id = o.legacy_company_id and cr.id in (${lit(cleanId)}, ${lit(spamId)}) and c.verification_status = 'draft'`,
  );
  // The shown text, set deterministically: a place for both, a unique summary
  // (no duplicate across the two), and a phone number in the spammy role.
  sqlExec(
    `update public.customer_requests set location = 'Vilnius', role_or_work_type = 'tiler',
            need_summary = ${lit(`Clean tiling job ${RUN}, three weeks.`)} where id = ${lit(cleanId)}`,
  );
  sqlExec(
    `update public.customer_requests set location = 'Vilnius', role_or_work_type = 'tiler call +370 612 34567',
            need_summary = ${lit(`Spam tiling job ${RUN}.`)} where id = ${lit(spamId)}`,
  );
  const stateOf = () =>
    Object.fromEntries(
      sql<{ id: string; state: string }>(
        `select cr.id, (public.need_public_state_v1(cr.id)).state from public.customer_requests cr
          where cr.id in (${lit(cleanId)}, ${lit(spamId)})`,
      ).map((s) => [s.id, s.state]),
    );
  // Principle C: the default is OFF — nothing is public before the company's choice.
  expect(stateOf(), "nothing is published by default").toEqual({ [cleanId]: "not_published", [spamId]: "not_published" });
  const anon = await browser.newContext();
  const before = await anon.newPage();
  await before.goto(`${BASE}/en/jobs`);
  await expect(before.getByTestId(`public-company-need-${cleanId}`), "not on /jobs before the choice").toHaveCount(0);
  await anon.close();

  await publishViaUi(browser, CLEAN, cleanId);
  await publishViaUi(browser, SPAM, spamId);
  const states = sql<{ id: string; state: string }>(
    `select cr.id, (public.need_public_state_v1(cr.id)).state from public.customer_requests cr
      where cr.id in (${lit(cleanId)}, ${lit(spamId)})`,
  );
  expect(Object.fromEntries(states.map((s) => [s.id, s.state]))).toEqual({
    [cleanId]: "unconfirmed_public",
    [spamId]: "held_review",
  });
});

test("V1-1. a signed-out visitor sees the clean need, labelled, without contact data", async ({ browser }) => {
  const ctx = await browser.newContext(); // no session, no cookies
  const page = await ctx.newPage();
  await page.goto(`${BASE}/en/jobs`);
  const section = page.getByTestId("public-company-needs");
  await expect(section, "the company needs section renders for a signed-out visitor").toBeVisible({ timeout: 60_000 });
  const card = page.getByTestId(`public-company-need-${cleanId}`);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-company-confirmed", "false");
  await expect(card.getByTestId("public-company-need-not-confirmed")).toHaveText("Company not confirmed");
  await expect(card.getByTestId("public-company-need-verified")).toHaveCount(0);
  const text = (await card.innerText()).toLowerCase();
  expect(text).not.toMatch(/@|\+370|https?:\/\//);

  // V1-2 (public half): the spammy need is not on the page at all.
  await expect(page.getByTestId(`public-company-need-${spamId}`)).toHaveCount(0);
  await ctx.close();
});

test("V1-2. the spammy need's company sees that it is waiting for review", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, BASE, SPAM);
  await page.goto(`${BASE}/en/dashboard/company/needs`);
  const state = page.getByTestId(`demand-public-state-${spamId}`);
  await expect(state).toBeVisible({ timeout: 60_000 });
  await expect(state).toHaveAttribute("data-public-state", "held_review");
  await expect(state).toContainText("Waiting for review");
  await expect(state).toContainText("phone number");
  await ctx.close();
});
