import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
  BASE,
  isolatedStack,
  lit,
  onboard,
  publishNeed,
  setUpCompany,
  signUp,
  sql,
  sqlExec,
  stackMailLink,
  userId,
} from "./isolated-web-a-helpers";

/**
 * AN AGENCY'S PLACEMENT TERM AND A WORKER'S OWN CHOICE TO JOIN AN AGENCY
 * (migration 20261114120000, RED draft). Local stack only, SYNTHETIC people
 * and companies only. Every amount and text here is a test value.
 *
 *   P-1  the agency states its term on its own partners page
 *   P-2  a new worker is offered the agency (admin-kept list), nothing ticked;
 *        joining needs their own tick; they land on the EXISTING roster, with
 *        no work relationship; the profile names the agency
 *   P-3  a worker another agency represents is never offered it
 *   P-4  a worker who joined can leave through the existing withdrawal, and
 *        is not offered the agency again
 *   P-5  the employer sees the fee and the condition on that agency's
 *        candidate only; viewing records nothing; accepting without the tick
 *        is not possible; accepting with it records the exact term
 *   P-6  the fee's trigger is the placement: the worker accepts the booking
 *        and the engagement is the employer's
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const mail = (who: string) => `apt.${who}.${RUN}@local.test`;
const AG = mail("agency");
const AG2 = mail("agency2");
const CO = mail("employer");
const W1 = mail("worker1");
const W3 = mail("worker3");
const W4 = mail("worker4");

const AG_ORG = `QA-SYNTHETIC Placement Agency ${RUN}`;
const AG2_ORG = `QA-SYNTHETIC Other Agency ${RUN}`;
const CO_ORG = `QA-SYNTHETIC Employer ${RUN}`;
const W1_NAME = `QA-SYNTHETIC Candidate One ${RUN}`;
const CONDITION = `QA-SYNTHETIC condition ${RUN}: applies to companies that keep their work journal.`;
const NEED_ROLE = `QA-SYNTHETIC tilers ${RUN}`;
const CONSENT_VERSION = `qa.${RUN}`;

const s = {
  agCompanyId: "",
  ag2CompanyId: "",
  coCompanyId: "",
  termId: "",
  w1WorkerId: "",
  w3WorkerId: "",
  needId: "",
  connectionId: "",
  offerId: "",
  bookingId: "",
};

const people = new Map<string, { ctx: BrowserContext; page: Page }>();
async function fresh(browser: Browser, address: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  people.set(address, { ctx, page });
  return page;
}
function as(address: string): Page {
  const p = people.get(address);
  if (!p) throw new Error("no session for this person (an earlier step failed)");
  return p.page;
}
test.afterAll(async () => {
  for (const { ctx } of people.values()) await ctx.close().catch(() => {});
});

async function verifyEmail(page: Page, address: string): Promise<void> {
  await page.goto(`${BASE}/en/dashboard/network`);
  const prompt = page.getByTestId("network-email-unverified");
  await expect(prompt).toBeVisible({ timeout: 30_000 });
  await prompt.getByTestId("verify-email-send").click();
  await expect(prompt.getByTestId("verify-email-sent")).toBeVisible({ timeout: 30_000 });
  await page.goto(await stackMailLink(address));
  await page.waitForURL((url) => url.host === new URL(BASE).host && !url.pathname.includes("/auth/callback"), {
    timeout: 60_000,
  });
}
function companyOf(profileId: string): string {
  return sql<{ id: string }>(`select id from public.companies where profile_id = ${lit(profileId)} order by created_at desc limit 1`)[0]!.id;
}
function workerOf(address: string): string {
  return sql<{ id: string }>(
    `select w.id from public.workers w join auth.users u on u.id = w.profile_id where u.email = ${lit(address)}`,
  )[0]!.id;
}
function rosterStatus(companyId: string, workerId: string): string {
  return (
    sql<{ status: string }>(
      `select status from public.company_workers where company_id = ${lit(companyId)} and worker_id = ${lit(workerId)}`,
    )[0]?.status ?? "none"
  );
}
async function newWorker(browser: Browser, address: string, name: string): Promise<Page> {
  const page = await fresh(browser, address);
  await signUp(page, BASE, address);
  await onboard(page, "work", name);
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  return page;
}

// ── P-1 ────────────────────────────────────────────────────────────────────

test("P-1. the agency states its placement term on its own partners page", async ({ browser }) => {
  const ag = await fresh(browser, AG);
  await signUp(ag, BASE, AG);
  await onboard(ag, "agency", `QA-SYNTHETIC Agency Owner ${RUN}`);
  await setUpCompany(ag, AG_ORG);
  s.agCompanyId = companyOf(await userId(AG));

  await ag.goto(`${BASE}/en/dashboard/company/partners`);
  const box = ag.getByTestId("agency-placement-term");
  await expect(box).toBeVisible({ timeout: 30_000 });
  await expect(box.getByTestId("agency-placement-term-none"), "no term until the agency states one").toBeVisible();
  await box.getByTestId("agency-placement-term-amount").fill("250");
  await box.getByTestId("agency-placement-term-currency").fill("EUR");
  await box.getByTestId("agency-placement-term-condition").fill(CONDITION);
  await box.getByTestId("agency-placement-term-save").click();
  await expect(box.getByTestId("agency-placement-term-done")).toBeVisible({ timeout: 30_000 });

  const terms = sql<{ id: string; fee_amount: string; currency: string; condition_text: string; retired: boolean }>(
    `select id, fee_amount::text, currency, condition_text, retired_at is not null as retired
       from public.agency_placement_terms where company_id = ${lit(s.agCompanyId)}`,
  );
  expect(terms.length, "one term").toBe(1);
  expect(terms[0]).toMatchObject({ fee_amount: "250.00", currency: "EUR", condition_text: CONDITION, retired: false });
  s.termId = terms[0]!.id;

  // The ADMIN puts the agency on the list the product may suggest to workers
  // (configuration, not code).
  sqlExec(
    `insert into public.platform_suggested_agencies (company_id, consent_text_version)
     values (${lit(s.agCompanyId)}, ${lit(CONSENT_VERSION)})`,
  );
});

// ── P-2 ────────────────────────────────────────────────────────────────────

test("P-2. a new worker is offered the agency, nothing ticked, and joins by their own tick", async ({ browser }) => {
  const w1 = await newWorker(browser, W1, W1_NAME);
  s.w1WorkerId = workerOf(W1);

  await w1.goto(`${BASE}/en/dashboard`);
  const card = w1.getByTestId("agency-suggestion");
  await expect(card, "the suggestion is on the new worker's home").toBeVisible({ timeout: 60_000 });
  await expect(card).toContainText(AG_ORG);
  const tick = card.getByTestId("agency-suggestion-consent");
  await expect(tick, "never pre-selected").not.toBeChecked();

  // Without the tick the browser does not send the form: nothing is written.
  await card.getByTestId("agency-suggestion-join").click();
  expect(rosterStatus(s.agCompanyId, s.w1WorkerId), "no tick, no link").toBe("none");

  await tick.check();
  await card.getByTestId("agency-suggestion-join").click();
  await expect(card.getByTestId("agency-suggestion-error"), "the join is not refused").toHaveCount(0);
  await expect
    .poll(() => rosterStatus(s.agCompanyId, s.w1WorkerId), {
      message: "on the agency's EXISTING roster",
      timeout: 30_000,
    })
    .toBe("active");
  await expect(w1.getByTestId("agency-suggestion-joined"), "the person is told").toBeVisible({ timeout: 30_000 });
  expect(
    sql<{ v: string }>(
      `select payload->>'consent_text_version' as v from public.audit_logs
        where action = 'suggested_agency_joined' and entity_id = ${lit(s.w1WorkerId)}`,
    )[0]?.v,
    "the consent version is on the audit trail",
  ).toBe(CONSENT_VERSION);
  expect(
    sql<{ n: number }>(
      `select count(*)::int as n from public.engagement_contexts ec
         join public.organizations o on o.id = ec.organization_id
        where ec.profile_id = ${lit(await userId(W1))} and o.legacy_company_id = ${lit(s.agCompanyId)}`,
    )[0]!.n,
    "a candidate base is not a job: no work relationship",
  ).toBe(0);

  // The person sees who represents them, on their profile.
  await w1.goto(`${BASE}/en/dashboard/profile`);
  const history = w1.getByTestId("organization-history-disclosure").first();
  await expect(history).toBeAttached({ timeout: 30_000 });
  if ((await history.getAttribute("open")) === null) await history.locator("summary").first().click();
  await expect(history.getByTestId("team-link").filter({ hasText: AG_ORG })).toBeVisible({ timeout: 30_000 });

  await w1.goto(`${BASE}/en/dashboard`);
  await expect(w1.getByTestId("agency-suggestion"), "not offered again").toHaveCount(0, { timeout: 30_000 });
});

// ── P-3 ────────────────────────────────────────────────────────────────────

test("P-3. a worker another agency represents is never offered the agency", async ({ browser }) => {
  const ag2 = await fresh(browser, AG2);
  await signUp(ag2, BASE, AG2);
  await onboard(ag2, "agency", `QA-SYNTHETIC Other Agency Owner ${RUN}`);
  await setUpCompany(ag2, AG2_ORG);
  s.ag2CompanyId = companyOf(await userId(AG2));

  const w4 = await newWorker(browser, W4, `QA-SYNTHETIC Represented ${RUN}`);
  const w4Worker = workerOf(W4);
  // The other agency's existing representation (its roster), seeded.
  sqlExec(
    `insert into public.company_workers (company_id, worker_id, status)
     values (${lit(s.ag2CompanyId)}, ${lit(w4Worker)}, 'active')`,
  );
  await w4.goto(`${BASE}/en/dashboard`);
  await expect(w4.getByTestId("today-stations")).toBeVisible({ timeout: 60_000 });
  await expect(w4.getByTestId("agency-suggestion"), "no suggestion to a represented worker").toHaveCount(0);
  expect(rosterStatus(s.agCompanyId, w4Worker), "never moved to this agency").toBe("none");
  expect(rosterStatus(s.ag2CompanyId, w4Worker), "the existing link is untouched").toBe("active");
});

// ── P-4 ────────────────────────────────────────────────────────────────────

test("P-4. a worker who joined can leave through the existing withdrawal, and is not asked again", async ({ browser }) => {
  const w3 = await newWorker(browser, W3, `QA-SYNTHETIC Leaver ${RUN}`);
  s.w3WorkerId = workerOf(W3);
  await w3.goto(`${BASE}/en/dashboard`);
  const card = w3.getByTestId("agency-suggestion");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.getByTestId("agency-suggestion-consent").check();
  await card.getByTestId("agency-suggestion-join").click();
  await expect
    .poll(() => rosterStatus(s.agCompanyId, s.w3WorkerId), { message: "joined", timeout: 30_000 })
    .toBe("active");
  await expect(w3.getByTestId("agency-suggestion-joined")).toBeVisible({ timeout: 30_000 });

  await w3.goto(`${BASE}/en/dashboard/profile`);
  const history = w3.getByTestId("organization-history-disclosure").first();
  await expect(history).toBeAttached({ timeout: 30_000 });
  if ((await history.getAttribute("open")) === null) await history.locator("summary").first().click();
  const link = history.getByTestId("team-link").filter({ hasText: AG_ORG });
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.getByTestId("roster-link-end-open").click();
  await link.getByTestId("roster-link-end-submit").click();
  await expect
    .poll(() => rosterStatus(s.agCompanyId, s.w3WorkerId), { message: "the worker left", timeout: 30_000 })
    .toBe("removed");

  await w3.goto(`${BASE}/en/dashboard`);
  await expect(w3.getByTestId("today-stations")).toBeVisible({ timeout: 60_000 });
  await expect(w3.getByTestId("agency-suggestion"), "a withdrawal is an answer").toHaveCount(0);
});

// ── P-5 ────────────────────────────────────────────────────────────────────

test("P-5. the employer sees the fee on that agency's candidate and accepts it only with the candidate", async ({
  browser,
}) => {
  const ag = as(AG);
  const co = await fresh(browser, CO);
  await signUp(co, BASE, CO);
  await onboard(co, "hire", `QA-SYNTHETIC Employer Owner ${RUN}`);
  await setUpCompany(co, CO_ORG);
  s.coCompanyId = companyOf(await userId(CO));
  await publishNeed(co, BASE, NEED_ROLE);
  s.needId = sql<{ id: string }>(
    `select id from public.customer_requests where profile_id = ${lit(await userId(CO))} order by created_at desc limit 1`,
  )[0]!.id;
  await verifyEmail(co, CO);

  // The agency connects the employer; the employer accepts and shares the need.
  await ag.goto(`${BASE}/en/dashboard/company/partners`);
  await ag.getByTestId("agency-bridge-invite-form").locator('input[name="email"]').fill(CO);
  await ag.getByTestId("agency-bridge-invite-submit").click();
  await expect(ag.getByTestId("agency-bridge-delivery")).toBeVisible({ timeout: 30_000 });
  s.connectionId = sql<{ id: string }>(
    `select id from public.agency_client_connections where agency_company_id = ${lit(s.agCompanyId)}`,
  )[0]!.id;
  await co.goto(`${BASE}/en/dashboard/company/partners`);
  await co.getByTestId(`client-bridge-accept-${s.connectionId}`).click();
  const active = co.getByTestId("client-bridge-active-row").filter({ hasText: AG_ORG }).first();
  await expect(active).toBeVisible({ timeout: 30_000 });
  const share = active.getByTestId("client-bridge-share-form");
  await share.locator('select[name="requestId"]').selectOption(s.needId);
  await share.getByTestId("client-bridge-share-submit").click();
  await expect(active.getByTestId("client-bridge-shared-row").first()).toBeVisible({ timeout: 30_000 });

  // The agency offers the worker who joined its list.
  await ag.goto(`${BASE}/en/dashboard/company/partners`);
  const row = ag.getByTestId("agency-bridge-shared-row").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const form = row.getByTestId("agency-bridge-offer-form");
  await form.locator('select[name="workerId"]').selectOption(s.w1WorkerId);
  await form.getByTestId("agency-bridge-offer-submit").click();
  await expect
    .poll(
      () =>
        sql<{ id: string }>(
          `select id from public.agency_candidate_offers where request_id = ${lit(s.needId)} and worker_id = ${lit(s.w1WorkerId)}`,
        )[0]?.id ?? "",
      { timeout: 30_000 },
    )
    .not.toBe("");
  s.offerId = sql<{ id: string }>(
    `select id from public.agency_candidate_offers where request_id = ${lit(s.needId)} and worker_id = ${lit(s.w1WorkerId)}`,
  )[0]!.id;

  // The employer reads the offer: the fee, the agency's own condition, and
  // that the full terms are not published (no link stated).
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    await co.setViewportSize({ width, height });
    await co.goto(`${BASE}/en/dashboard/company/scouting?request=${s.needId}`);
    const term = co.getByTestId(`offer-placement-term-${s.offerId}`);
    await expect(term, "the agency's term stands on its candidate").toBeVisible({ timeout: 30_000 });
    await expect(co.getByTestId(`offer-placement-fee-${s.offerId}`)).toContainText("250");
    await expect(co.getByTestId(`offer-placement-condition-${s.offerId}`)).toHaveText(CONDITION);
    await expect(co.getByTestId(`offer-placement-terms-pending-${s.offerId}`)).toBeVisible();
    await expect(co.getByTestId(`offer-placement-accept-${s.offerId}`), "never pre-ticked").not.toBeChecked();
    const overflow = await co.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `no sideways scroll at ${width}px`).toBeLessThanOrEqual(1);
  }
  await co.setViewportSize({ width: 1280, height: 800 });
  const recorded = () =>
    sql<{ st: string }>(
      `select status || '/' || coalesce(accepted_placement_term_id::text, '-') as st
         from public.agency_candidate_offers where id = ${lit(s.offerId)}`,
    )[0]!.st;
  expect(recorded(), "viewing records nothing").toBe("offered/-");

  // Without the tick the accept form is not sent.
  await co.getByTestId(`offer-accept-${s.offerId}`).click();
  expect(recorded(), "no tick, no decision").toBe("offered/-");

  await co.getByTestId(`offer-placement-accept-${s.offerId}`).check();
  await co.getByTestId(`offer-accept-${s.offerId}`).click();
  // The page re-reads the offer after the decision; an accepted offer has no
  // decision buttons left, so its own status line is what shows.
  await expect
    .poll(recorded, { message: "the exact term is recorded with the decision", timeout: 30_000 })
    .toBe(`accepted/${s.termId}`);
  await expect(co.getByTestId("scouting-agency-offers").getByTestId("scout-offer-status-accepted")).toBeVisible({
    timeout: 30_000,
  });
  s.bookingId = sql<{ id: string }>(
    `select booking_id as id from public.agency_candidate_offers where id = ${lit(s.offerId)}`,
  )[0]!.id;
});

// ── P-6 ────────────────────────────────────────────────────────────────────

test("P-6. the placement is the worker's own acceptance; the engagement is the employer's", async () => {
  const w1 = as(W1);
  await w1.goto(`${BASE}/en/dashboard/bookings`);
  const card = w1.getByTestId(`booking-${s.bookingId}`).filter({ visible: true }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByTestId("booking-accept-open").click();
  await card.getByTestId("booking-accept-confirm").click();
  await expect
    .poll(
      () => sql<{ status: string }>(`select status from public.booking_requests where id = ${lit(s.bookingId)}`)[0]?.status,
      { timeout: 30_000 },
    )
    .toBe("accepted");
  expect(
    sql<{ company_id: string; status: string }>(
      `select company_id, status from public.company_worker_engagements where source_booking_id = ${lit(s.bookingId)}`,
    ),
    "placed: one active engagement, for the employer",
  ).toEqual([{ company_id: s.coCompanyId, status: "active" }]);
  expect(
    sql<{ n: number }>(
      `select count(*)::int as n from public.agency_candidate_offers where accepted_placement_term_id is not null`,
    )[0]!.n,
    "one acceptance in the whole run: the accepted candidate's",
  ).toBe(1);
});
