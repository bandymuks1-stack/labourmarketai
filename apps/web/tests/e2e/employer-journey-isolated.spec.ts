import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { clickUntilVisible } from "./click-until-visible";
import {
  accessToken,
  BASE,
  SB_ANON,
  SB_URL,
  isolatedStack,
  lit,
  onboard,
  publishNeed,
  setUpCompany,
  signUp,
  sql,
  userId,
  verifyCompanyAsLocalAdmin,
} from "./isolated-web-a-helpers";

/**
 * THE OWNER'S EMPLOYER JOURNEY, END TO END, on a THROWAWAY LOCAL Supabase stack, at 390 px (phone,
 * touch) and 1440 px. Coordinator order 2026-11-22: sign-up → company profile → posting a need →
 * candidate search → offers → messaging → agreeing terms → choosing the worker → project →
 * journals. Each step checks that the data is SAVED, that the result SHOWS (and survives a
 * reload), that RIGHTS hold (a second, unrelated company sees nothing), and that errors are clear.
 *
 *   E-1  sign-up: a new person creates an account and chooses to hire;
 *   E-2  company profile: the company is set up and its public description saved and reopened;
 *   E-3  posting a need: the need is stored once and listed on the company's own needs page;
 *   E-4  candidate search: a discoverable, available worker is found among the need's candidates;
 *   E-5  offers: the company proposes a start (with its terms) to the worker;
 *   E-6  messaging: worker and company write both ways; the stranger reads nothing;
 *   E-7  agreeing terms: the worker sees the proposed start and the company's terms before deciding;
 *   E-8  choosing the worker: the worker accepts; the hire is stored as an active engagement;
 *   E-9  project: the company creates a project and puts the hired worker on it;
 *   E-10 journals: the worker records a day on the project; the company accepts it as the client;
 *        the worker sees it accepted (a direct hire opens no employer relationship).
 */
const RUN = `${Date.now().toString(36)}`;
const email = (who: string) => `emp-${who}-${RUN}@walk.labourmarket.test`;

type Width = { name: string; viewport: { width: number; height: number }; mobile: boolean };
const WIDTHS: Width[] = [
  { name: "1440", viewport: { width: 1440, height: 900 }, mobile: false },
  { name: "390", viewport: { width: 390, height: 844 }, mobile: true },
];

test.skip(!isolatedStack(), "isolated stack only (SIGNUP_ISOLATED=1 against a local Supabase)");
test.setTimeout(240_000);

const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();

async function open(browser: Browser, w: Width, who?: string): Promise<{ page: Page; done: () => Promise<void> }> {
  const ctx = await browser.newContext({
    viewport: w.viewport,
    isMobile: w.mobile,
    hasTouch: w.mobile,
    timezoneId: "UTC",
    storageState: who ? sessions.get(who) : undefined,
  });
  const page = await ctx.newPage();
  return {
    page,
    done: async () => {
      if (who) sessions.set(who, await ctx.storageState());
      await ctx.close();
    },
  };
}

/** A read under RLS with the person's OWN session; an error is a failure, never "zero". */
async function rowsAs(address: string, path: string): Promise<unknown[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${await accessToken(address)}` },
  });
  if (!r.ok) throw new Error(`read as ${address.split("@")[0]} → ${r.status}`);
  return (await r.json()) as unknown[];
}

async function fits(page: Page, what: string): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, `${what}: no sideways scroll`).toBeLessThanOrEqual(1);
}

const message = (page: Page, text: string) => page.locator('[data-testid^="message-text-"]', { hasText: text }).first();

for (const w of WIDTHS) {
  const COMPANY = email(`company${w.name}`);
  const STRANGER = email(`stranger${w.name}`);
  const WORKER = email(`worker${w.name}`);
  const ORG = `Synthetic Employer Journey ${w.name} ${RUN}`;
  const STRANGER_ORG = `Synthetic Stranger Employer ${w.name} ${RUN}`;
  const ROLE = `Employer journey tiler ${w.name} ${RUN}`;
  const ABOUT = `We renovate bathrooms ${w.name} ${RUN}`;
  const TERMS = `Two weeks, own tools, start at 8:00 ${w.name} ${RUN}`;
  const PROJECT = `Employer journey project ${w.name} ${RUN}`;
  const ASK = `Can you start on the proposed day? ${w.name} ${RUN}`;
  const ANSWER = `Yes, I can start then. ${w.name} ${RUN}`;
  const DAY = `Tiled the second bathroom ${w.name} ${RUN}`;
  const WORKER_NAME = `Synthetic Employer Worker ${w.name} ${RUN}`;
  const START = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const s = {
    companyId: "",
    orgId: "",
    needId: "",
    workerProfileId: "",
    workerId: "",
    bookingId: "",
    conversationId: "",
    projectId: "",
    engagementId: "",
    entryId: "",
  };

  test.describe(`employer journey at ${w.viewport.width} px`, () => {
    test.describe.configure({ mode: "serial" });

    test(`E-1 (${w.name}). sign-up: a new person creates an account and chooses to hire`, async ({ browser }) => {
      const { page, done } = await open(browser, w);
      await signUp(page, BASE, COMPANY);
      await onboard(page, "hire", `Synthetic Owner ${ORG}`);
      sessions.set(COMPANY, await page.context().storageState());
      await done();
      s.companyId = await userId(COMPANY);
      expect(s.companyId, "the account exists").toMatch(/^[0-9a-f-]{36}$/);
    });

    test(`E-2 (${w.name}). company profile: set up, description saved and reopened`, async ({ browser }) => {
      const { page, done } = await open(browser, w, COMPANY);
      await page.goto(`${BASE}/en/dashboard/start/company`);
      await setUpCompany(page, ORG);
      const orgs = sql<{ id: string }>(
        `select organization_id::text as id from public.company_memberships where profile_id = ${lit(s.companyId)} and role = 'owner' and status = 'active'`,
      );
      expect(orgs, "the company organization exists, owned by the person").toHaveLength(1);
      s.orgId = orgs[0]!.id;
      await page.goto(`${BASE}/en/dashboard/company/settings#public-business-profile`);
      const panel = page.getByRole("main").getByTestId("business-public-profile-panel");
      await expect(panel).toBeVisible({ timeout: 60_000 });
      await panel.getByTestId("business-description-input").fill(ABOUT);
      await panel.locator("button").last().click();
      await expect(panel.getByRole("status"), "the panel says it saved").toBeVisible({ timeout: 30_000 });
      await expect
        .poll(
          () =>
            sql<{ n: number }>(
              `select count(*)::int as n from public.organizations o join public.companies c on c.id = o.legacy_company_id
                where o.id = ${lit(s.orgId)} and c.description = ${lit(ABOUT)}`,
            )[0]?.n,
          { message: "the description is stored on the company", timeout: 30_000 },
        )
        .toBe(1);
      await page.reload();
      await expect(
        page.getByRole("main").getByTestId("business-public-profile-panel").getByTestId("business-description-input"),
        "the description reopens",
      ).toHaveValue(ABOUT, { timeout: 60_000 });
      await fits(page, "the company settings");
      await done();
      await verifyCompanyAsLocalAdmin(COMPANY, email("admin"));
    });

    test(`E-3 (${w.name}). posting a need: stored once, listed on the company's needs`, async ({ browser }) => {
      const { page, done } = await open(browser, w, COMPANY);
      await publishNeed(page, BASE, ROLE, "LT");
      const needs = sql<{ id: string; status: string }>(
        `select id, status from public.customer_requests where (title = ${lit(ROLE)} or role_or_work_type = ${lit(ROLE)}) and profile_id = ${lit(s.companyId)}`,
      );
      expect(needs, "the need is stored once").toHaveLength(1);
      expect(needs[0]!.status, "and published").toBe("submitted");
      s.needId = needs[0]!.id;
      await page.goto(`${BASE}/en/dashboard/company/scouting?request=${s.needId}`);
      await expect(page.getByRole("main"), "the need's own page answers").toBeVisible({ timeout: 60_000 });
      await page.reload();
      await expect(page.getByRole("main").getByTestId("scouting-privacy-note"), "it still opens after a reload").toBeVisible({ timeout: 60_000 });
      await fits(page, "the need's page");
      await done();

      // A second, unrelated verified company exists (for the rights checks below).
      const st = await open(browser, WIDTHS[0]!);
      await signUp(st.page, BASE, STRANGER);
      await onboard(st.page, "hire", `Synthetic Owner ${STRANGER_ORG}`);
      await setUpCompany(st.page, STRANGER_ORG);
      sessions.set(STRANGER, await st.page.context().storageState());
      await st.done();
      await verifyCompanyAsLocalAdmin(STRANGER, email("admin2"));
    });

    test(`E-4 (${w.name}). candidate search: a discoverable, available worker is found for the need`, async ({ browser }) => {
      const wk = await open(browser, w);
      await signUp(wk.page, BASE, WORKER);
      await onboard(wk.page, "work", WORKER_NAME);
      await wk.page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
      s.workerProfileId = await userId(WORKER);
      sessions.set(WORKER, await wk.page.context().storageState());
      await wk.page.goto(`${BASE}/en/dashboard/privacy#visibility`);
      const vis = wk.page.getByRole("main").getByTestId("privacy-visibility");
      await expect(vis).toBeVisible({ timeout: 60_000 });
      await clickUntilVisible(vis.getByTestId("discoverability-open"), vis.getByTestId("discoverability-grant"));
      await vis.getByTestId("discoverability-grant").click();
      await expect(vis.getByTestId("discoverability-granted")).toBeVisible({ timeout: 30_000 });
      await wk.page.goto(`${BASE}/en/dashboard/profile#work-card-editor-section`);
      const editor = wk.page.getByRole("main").getByTestId("work-card-editor");
      await clickUntilVisible(wk.page.getByRole("main").getByTestId("work-card-editor-toggle"), editor);
      await editor.locator('select[name="availability_status"]').selectOption("available");
      await editor.getByTestId("work-card-save").click();
      await expect(wk.page.getByTestId("work-card-saved")).toBeVisible({ timeout: 30_000 });
      s.workerId = sql<{ id: string }>(`select id from public.workers where profile_id = ${lit(s.workerProfileId)}`)[0]!.id;
      // The worker applies from the work board (the employer's candidate list is built from it).
      await wk.page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
      const card = wk.page.getByRole("main").locator(`li[id="opp-${s.needId}"]`).first();
      await expect(card, "the need is on the work board").toBeVisible({ timeout: 60_000 });
      const box = card.getByTestId(`interest-${s.needId}`);
      await clickUntilVisible(box.getByTestId("interest-express"), box.getByTestId("interest-sent"));
      await wk.done();

      const { page, done } = await open(browser, w, COMPANY);
      await page.goto(`${BASE}/en/dashboard/company/scouting?request=${s.needId}`);
      const cand = page.getByRole("main").getByTestId(`scout-candidate-${s.workerId}`);
      await expect(cand, "the worker is among the need's candidates").toBeVisible({ timeout: 60_000 });
      await page.reload();
      await expect(page.getByRole("main").getByTestId(`scout-candidate-${s.workerId}`), "still after a reload").toBeVisible({ timeout: 60_000 });
      await fits(page, "the candidates");
      await done();

      const st = await open(browser, w, STRANGER);
      await st.page.goto(`${BASE}/en/dashboard/company/scouting?request=${s.needId}`);
      await expect(st.page.getByRole("main").getByTestId("scouting-privacy-note"), "the stranger's page rendered").toBeVisible({ timeout: 60_000 });
      await expect(st.page.getByTestId(`scout-candidate-${s.workerId}`), "the stranger finds nobody for another company's need").toHaveCount(0);
      await st.done();
      expect(await rowsAs(STRANGER, `demand_interest_signals?request_id=eq.${s.needId}&select=id`), "the stranger reads no application").toHaveLength(0);
    });

    test(`E-5 (${w.name}). offers: the company proposes a start, with its terms`, async ({ browser }) => {
      const { page, done } = await open(browser, w, COMPANY);
      await page.goto(`${BASE}/en/dashboard/company/scouting?request=${s.needId}`);
      const c = page.getByRole("main").getByTestId(`scout-candidate-${s.workerId}`);
      await expect(c).toBeVisible({ timeout: 60_000 });
      await clickUntilVisible(c.getByTestId("propose-booking-open"), c.getByTestId("propose-booking-form"));
      await c.getByTestId("propose-booking-start-date").fill(START);
      await c.getByTestId("propose-booking-note").fill(TERMS);
      await c.getByTestId("propose-booking-send").click();
      await expect(c.getByTestId("propose-booking-sent"), "the proposal is sent").toBeVisible({ timeout: 30_000 });
      await done();
      const rows = sql<{ id: string; status: string }>(
        `select id, status from public.booking_requests where request_id = ${lit(s.needId)} and worker_id = ${lit(s.workerId)}`,
      );
      expect(rows.map((r) => r.status), "one proposal, stored").toEqual(["proposed"]);
      s.bookingId = rows[0]!.id;
      expect(await rowsAs(STRANGER, `booking_requests?id=eq.${s.bookingId}&select=id`), "the stranger reads no proposal").toHaveLength(0);
    });

    test(`E-6 (${w.name}). messaging: both ways; the stranger reads nothing`, async ({ browser }) => {
      const wk = await open(browser, w, WORKER);
      await wk.page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
      const box = wk.page.getByRole("main").locator(`li[id="opp-${s.needId}"]`).first().getByTestId(`interest-${s.needId}`);
      await expect(box.getByTestId("interest-contact-employer")).toBeVisible({ timeout: 60_000 });
      await box.getByTestId("interest-contact-employer").click();
      await wk.page.waitForURL(/\/en\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 60_000 });
      s.conversationId = /\/communication\/([0-9a-f-]{36})/.exec(wk.page.url())![1]!;
      await wk.page.getByTestId("communication-composer-input").fill(ASK);
      await wk.page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(message(wk.page, ASK)).toBeVisible({ timeout: 30_000 });
      await fits(wk.page, "the worker's thread");
      await wk.done();

      const co = await open(browser, w, COMPANY);
      await co.page.goto(`${BASE}/en/dashboard/communication/${s.conversationId}`);
      await expect(message(co.page, ASK), "the company reads it").toBeVisible({ timeout: 60_000 });
      await co.page.getByTestId("communication-composer-input").fill(ANSWER);
      await co.page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(message(co.page, ANSWER)).toBeVisible({ timeout: 30_000 });
      await co.page.reload();
      for (const t of [ASK, ANSWER]) await expect(message(co.page, t), `after a reload: ${t}`).toBeVisible({ timeout: 60_000 });
      await co.done();
      expect(
        sql<{ n: string }>(`select count(*)::text as n from public.conversation_messages where conversation_id = ${lit(s.conversationId)}`)[0]?.n,
        "both messages are stored",
      ).toBe("2");

      const st = await open(browser, w, STRANGER);
      const res = await st.page.goto(`${BASE}/en/dashboard/communication/${s.conversationId}`);
      expect(res?.status() ?? 0, "the thread URL answers the stranger without a server error").toBeLessThan(500);
      await expect(st.page.getByRole("main")).toBeVisible({ timeout: 60_000 });
      for (const t of [ASK, ANSWER]) await expect(st.page.getByText(t), "the stranger reads nothing").toHaveCount(0);
      await st.done();
      expect(await rowsAs(STRANGER, `conversation_messages?conversation_id=eq.${s.conversationId}&select=id`)).toHaveLength(0);
    });

    test(`E-7 (${w.name}). agreeing terms: the worker sees the proposed start and the terms`, async ({ browser }) => {
      const { page, done } = await open(browser, w, WORKER);
      await page.goto(`${BASE}/en/dashboard/bookings`);
      const card = page.getByRole("main").getByTestId(`booking-${s.bookingId}`);
      await expect(card, "the proposal reaches the worker").toBeVisible({ timeout: 60_000 });
      await expect(card, "with the company's terms").toContainText(TERMS);
      await expect(card.locator(`time[datetime^="${START}"]`).or(card.getByText(START)), "and the proposed start").toHaveCount(1);
      await fits(page, "the worker's bookings");
      await done();
    });

    test(`E-8 (${w.name}). choosing the worker: the worker accepts; the hire is stored`, async ({ browser }) => {
      const { page, done } = await open(browser, w, WORKER);
      await page.goto(`${BASE}/en/dashboard/bookings`);
      const card = page.getByRole("main").getByTestId(`booking-${s.bookingId}`);
      await clickUntilVisible(card.getByTestId("booking-accept-open"), card.getByTestId("booking-accept-confirm"));
      await card.getByTestId("booking-accept-confirm").click();
      await expect
        .poll(() => sql<{ status: string }>(`select status from public.booking_requests where id = ${lit(s.bookingId)}`)[0]?.status, {
          timeout: 30_000,
        })
        .toBe("accepted");
      await page.reload();
      await expect(page.getByRole("main").getByTestId(`booking-${s.bookingId}`), "the accepted booking still shows").toBeVisible({ timeout: 60_000 });
      await done();
      await expect
        .poll(
          () =>
            sql<{ n: string }>(
              `select count(*)::text as n from public.company_worker_engagements where worker_id = ${lit(s.workerId)} and status = 'active'`,
            )[0]?.n,
          { message: "the hire is an active engagement", timeout: 30_000 },
        )
        .toBe("1");
      const co = await open(browser, w, COMPANY);
      await co.page.goto(`${BASE}/en/dashboard/bookings`);
      await expect(co.page.getByRole("main").getByTestId(`booking-${s.bookingId}`), "the company sees the accepted booking").toBeVisible({ timeout: 60_000 });
      await co.done();
    });

    test(`E-9 (${w.name}). project: created, the hired worker put on it`, async ({ browser }) => {
      const { page, done } = await open(browser, w, COMPANY);
      await page.goto(`${BASE}/en/dashboard/company/projects/new`);
      const main = page.getByRole("main");
      await main.getByTestId("project-name-input").fill(PROJECT);
      await main.getByTestId("project-create-submit").click();
      const ok = main.getByTestId("project-context-created");
      const err = main.getByTestId("project-create-error");
      await expect(ok.or(err)).toBeVisible({ timeout: 30_000 });
      if (await err.isVisible()) throw new Error(`project not created: ${await err.getAttribute("data-code")}`);
      const projects = sql<{ id: string }>(`select id from public.projects where title = ${lit(PROJECT)}`);
      expect(projects, "the project is stored once").toHaveLength(1);
      s.projectId = projects[0]!.id;
      await page.goto(`${BASE}/en/dashboard/projects`);
      const assign = page.getByRole("main").getByTestId("project-assign");
      await expect(assign).toBeVisible({ timeout: 60_000 });
      await assign.locator('select[name="project_id"]').selectOption(s.projectId);
      await assign.getByTestId("assign-worker-select").selectOption(s.workerProfileId);
      await assign.locator("#assign-worker-submit").click();
      await expect(assign.getByTestId("assign-worker-done").or(assign.getByTestId("assign-worker-failed"))).toBeVisible({ timeout: 30_000 });
      await expect(assign.getByTestId("assign-worker-failed"), "the assignment is not refused").toHaveCount(0);
      await expect
        .poll(
          () =>
            sql<{ n: string }>(
              `select count(*)::text as n from public.project_worker_assignments where project_id = ${lit(s.projectId)} and worker_id = ${lit(s.workerId)} and status = 'active'`,
            )[0]?.n,
          { message: "the assignment is stored", timeout: 30_000 },
        )
        .toBe("1");
      await page.reload();
      await expect(page.getByRole("main"), "the project lists the worker after a reload").toContainText(WORKER_NAME, { timeout: 60_000 });
      await fits(page, "the projects page");
      await done();
      expect(await rowsAs(STRANGER, `projects?id=eq.${s.projectId}&select=id`), "the stranger reads no project").toHaveLength(0);
    });

    test(`E-10 (${w.name}). journals: the worker records a day; the company accepts it as the client`, async ({ browser }) => {
      // A DIRECT hire opens no employer relationship (owner decision 2026-09-28, 20260928220000):
      // the worker records the day in their own journal on the company's project, and the
      // company decides it as the CLIENT (accept / correct / dispute), never as an employer.
      const co = await open(browser, w, COMPANY);
      await co.page.goto(`${BASE}/en/dashboard/projects/${s.projectId}`);
      const panel = co.page.getByRole("main").getByTestId("counterparty-link-panel");
      await expect(panel, "the project offers to register the client side").toBeVisible({ timeout: 60_000 });
      const row = panel.getByTestId(`counterparty-link-row-${s.workerId}`);
      await expect(row, "the hired worker is a candidate on the project").toBeVisible({ timeout: 30_000 });
      await expect(async () => {
        if (!(await panel.getByTestId(`counterparty-link-active-${s.workerId}`).isVisible().catch(() => false))) {
          await panel.getByTestId(`counterparty-link-register-${s.workerId}`).click({ timeout: 5_000 });
        }
        await expect(panel.getByTestId(`counterparty-link-active-${s.workerId}`)).toBeVisible({ timeout: 10_000 });
      }).toPass({ timeout: 60_000 });
      await fits(co.page, "the project page");
      await co.done();
      const links = sql<{ id: string; org: string }>(
        `select id, counterparty_organization_id::text as org from public.work_counterparty_links
          where project_id = ${lit(s.projectId)} and worker_id = ${lit(s.workerId)} and revoked_at is null`,
      );
      expect(links.map((l) => l.org), "one stored client link, to the company").toEqual([s.orgId]);

      const wk = await open(browser, w, WORKER);
      await wk.page.goto(`${BASE}/en/dashboard/journal`);
      const main = wk.page.getByRole("main");
      await main.getByTestId("journal-quick-record-text").fill(DAY);
      await main.getByTestId("journal-quick-record-understand").click();
      await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 60_000 });
      const project = main.getByTestId("worklog-project");
      if (await project.count()) await project.selectOption(s.projectId);
      else await expect(main.getByTestId("worklog-project-auto"), "the one project is filed on its own").toBeVisible();
      await main.getByTestId("worklog-save").click();
      await main.getByTestId("worklog-confirm").click();
      await expect(main.getByTestId("worklog-done").or(main.getByTestId("worklog-error")).or(main.getByTestId("worklog-blocked"))).toBeVisible({
        timeout: 30_000,
      });
      await expect(main.getByTestId("worklog-done"), "the entry is saved").toBeVisible();
      const entries = sql<{ id: string; p: string | null }>(
        `select id, project_id::text as p from public.journal_entries where worker_id = ${lit(s.workerId)} and original_text ilike ${lit(`%${RUN}%`)}`,
      );
      expect(entries.map((e) => e.p), "one stored entry, on the company's project").toEqual([s.projectId]);
      s.entryId = entries[0]!.id;
      await wk.page.goto(`${BASE}/en/dashboard/journal`);
      const review = main.getByTestId(`entry-review-${s.entryId}`);
      await expect(review, "the entry offers review by the company").toHaveAttribute("data-phase", "ready_to_submit", { timeout: 60_000 });
      await expect(async () => {
        if ((await review.getAttribute("data-phase")) !== "submitted") await review.getByTestId(`entry-review-submit-${s.entryId}`).click({ timeout: 5_000 });
        await expect(review).toHaveAttribute("data-phase", "submitted", { timeout: 10_000 });
      }).toPass({ timeout: 60_000 });
      await fits(wk.page, "the journal");
      await wk.done();

      const co2 = await open(browser, w, COMPANY);
      await co2.page.goto(`${BASE}/en/dashboard/inbox/counterparty`);
      const card = co2.page.getByRole("main").getByTestId(`counterparty-card-${s.entryId}`);
      await expect(card, "the day waits in the company's queue").toBeVisible({ timeout: 60_000 });
      await expect(card).toContainText(DAY);
      await fits(co2.page, "the company's queue");
      const decide = card.getByTestId(`counterparty-decide-${s.entryId}`);
      await expect(async () => {
        await card.getByRole("radio", { name: /accept the work/i }).check({ timeout: 5_000 });
        await expect(decide).toBeEnabled({ timeout: 3_000 });
      }).toPass({ timeout: 60_000 });
      const decided = () =>
        sql<{ d: string | null }>(
          `select confirmation_scope->>'decision' as d from public.journal_entry_confirmations where entry_id = ${lit(s.entryId)}`,
        ).map((r) => r.d);
      await expect(async () => {
        if (decided().length === 0) await decide.click({ timeout: 5_000 });
        await expect.poll(decided, { timeout: 10_000 }).toEqual(["approved"]);
      }).toPass({ timeout: 60_000 });
      await co2.done();

      const wk2 = await open(browser, w, WORKER);
      await wk2.page.goto(`${BASE}/en/dashboard/journal`);
      await expect(wk2.page.getByRole("main").getByTestId(`entry-review-${s.entryId}`), "the worker sees the day accepted").toHaveAttribute(
        "data-phase",
        "accepted",
        { timeout: 60_000 },
      );
      await wk2.done();
      expect(await rowsAs(STRANGER, `journal_entries?id=eq.${s.entryId}&select=id`), "the stranger reads no journal entry").toHaveLength(0);
    });
  });
}
