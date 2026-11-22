import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { clickUntilVisible } from "./click-until-visible";
import {
  BASE,
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
 * THE HIRING CHAIN, END TO END, on a THROWAWAY LOCAL Supabase stack
 * (.github/workflows/signup-isolated.yml). Coordinator order 2026-11-22 (owner: the platform must
 * work in production end to end on 11-23): employer need → application → selection → hire →
 * assignment → project, and the worker's side of it.
 *
 * The other isolated specs walk most of it already (role-journeys: an AGENCY-placed worker put on
 * a project; phone-journeys: apply → message → booking accepted, phones only). The step no spec
 * walked is the one this file is for: a worker hired DIRECTLY — they applied, the company proposed
 * a booking, they accepted — and is then put on the company's project. At 1280 and at 390 px.
 *
 *   H-0 a verified company posts a need; a second verified company exists (the stranger);
 *   H-1 a new worker consents to being found, says they are available, finds the need and applies;
 *       the application survives a reload;
 *   H-2 the company sees the applicant under its need, the record survives a reload, and proposes a
 *       start; the STRANGER company opening the same need's candidates sees nobody (rights);
 *   H-3 the worker accepts the booking; the engagement is stored;
 *   H-4 the company creates a project and puts the hired worker on it from the assign form; the
 *       assignment is stored and still listed after a reload;
 *   H-5 the worker sees the project in their own list, and the booking names their DIRECT partner
 *       only — never the stranger company (decision 0033: direct counterparty, no leak);
 *   H-6 messaging: the worker writes to the employer from the application, the company reads and
 *       answers, the worker reads the answer; both survive a reload; the stranger cannot open it.
 */
const RUN = `${Date.now().toString(36)}`;
const email = (who: string) => `hire-${who}-${RUN}@walk.labourmarket.test`;

type Width = { name: string; viewport: { width: number; height: number }; mobile: boolean };
const WIDTHS: Width[] = [
  { name: "1280", viewport: { width: 1280, height: 800 }, mobile: false },
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

/** No sideways scroll at this width (DESIGN.md §10: phone first). */
async function fits(page: Page, what: string): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, `${what}: no sideways scroll`).toBeLessThanOrEqual(1);
}

for (const w of WIDTHS) {
  const COMPANY = email(`company${w.name}`);
  const STRANGER = email(`stranger${w.name}`);
  const WORKER = email(`worker${w.name}`);
  const ORG = `Synthetic Hiring Builders ${w.name} ${RUN}`;
  const STRANGER_ORG = `Synthetic Stranger Co ${w.name} ${RUN}`;
  const ROLE = `Hiring walk tiler ${w.name} ${RUN}`;
  const PROJECT = `Hiring walk project ${w.name} ${RUN}`;
  const s = { needId: "", workerProfileId: "", workerId: "", bookingId: "", projectId: "", conversationId: "" };
  const MESSAGE = `Hello from the hiring walk ${w.name} ${RUN}`;
  const ANSWER = `Answer from the company ${w.name} ${RUN}`;

  test.describe(`hiring chain at ${w.viewport.width} px`, () => {
    test.describe.configure({ mode: "serial" });

    test(`H-0 (${w.name}). a verified company posts a need; a second verified company exists`, async ({ browser }) => {
      for (const [addr, org, role] of [
        [COMPANY, ORG, ROLE],
        [STRANGER, STRANGER_ORG, `Stranger need ${w.name} ${RUN}`],
      ] as const) {
        const { page, done } = await open(browser, WIDTHS[0]!);
        await signUp(page, BASE, addr);
        await onboard(page, "hire", `Synthetic Owner ${org}`);
        await setUpCompany(page, org);
        await publishNeed(page, BASE, role, "LT");
        sessions.set(addr, await page.context().storageState());
        await done();
        await verifyCompanyAsLocalAdmin(addr, email(`admin-${addr.split("@")[0]}`));
      }
      const owner = await userId(COMPANY);
      const needs = sql<{ id: string }>(
        `select id from public.customer_requests where (title = ${lit(ROLE)} or role_or_work_type = ${lit(ROLE)}) and profile_id = ${lit(owner)}`,
      );
      expect(needs, "the need is stored once").toHaveLength(1);
      s.needId = needs[0]!.id;
    });

    test(`H-1 (${w.name}). a new worker consents to be found, is available, finds the need and applies`, async ({ browser }) => {
      const { page, done } = await open(browser, w);
      await signUp(page, BASE, WORKER);
      await onboard(page, "work", `Synthetic Hiring Worker ${w.name} ${RUN}`);
      await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
      s.workerProfileId = await userId(WORKER);
      sessions.set(WORKER, await page.context().storageState());

      await page.goto(`${BASE}/en/dashboard/privacy#visibility`);
      const vis = page.getByRole("main").getByTestId("privacy-visibility");
      await expect(vis).toBeVisible({ timeout: 60_000 });
      await clickUntilVisible(vis.getByTestId("discoverability-open"), vis.getByTestId("discoverability-grant"));
      await vis.getByTestId("discoverability-grant").click();
      await expect(vis.getByTestId("discoverability-granted")).toBeVisible({ timeout: 30_000 });

      await page.goto(`${BASE}/en/dashboard/profile#work-card-editor-section`);
      const toggle = page.getByRole("main").getByTestId("work-card-editor-toggle");
      await expect(toggle).toBeVisible({ timeout: 60_000 });
      const editor = page.getByRole("main").getByTestId("work-card-editor");
      await clickUntilVisible(toggle, editor);
      await editor.locator('select[name="availability_status"]').selectOption("available");
      await editor.getByTestId("work-card-save").click();
      await expect(page.getByTestId("work-card-saved")).toBeVisible({ timeout: 30_000 });
      const rows = sql<{ id: string; a: string | null }>(
        `select id, availability_status as a from public.workers where profile_id = ${lit(s.workerProfileId)}`,
      );
      expect(rows.map((r) => r.a), "availability is stored").toEqual(["available"]);
      s.workerId = rows[0]!.id;

      await page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
      const card = page.getByRole("main").locator(`li[id="opp-${s.needId}"]`).first();
      await expect(card, "the verified company's need is on the work board").toBeVisible({ timeout: 60_000 });
      await expect(card, "the card names the company that posted it").toContainText(ORG);
      await fits(page, "the work board");
      const box = card.getByTestId(`interest-${s.needId}`);
      await clickUntilVisible(box.getByTestId("interest-express"), box.getByTestId("interest-sent"));
      expect(
        sql<{ status: string }>(
          `select status from public.demand_interest_signals where request_id = ${lit(s.needId)} and worker_id = ${lit(s.workerId)}`,
        ).map((r) => r.status),
        "one application, stored",
      ).toEqual(["interested"]);

      await page.reload();
      const again = page.getByRole("main").locator(`li[id="opp-${s.needId}"]`).first().getByTestId(`interest-${s.needId}`);
      await expect(again.getByTestId("interest-sent"), "the application survives a reload").toBeVisible({ timeout: 60_000 });
      await done();
    });

    test(`H-2 (${w.name}). the company sees the applicant and proposes a start; a stranger company sees nobody`, async ({ browser }) => {
      const stranger = await open(browser, w, STRANGER);
      await stranger.page.goto(`${BASE}/en/dashboard/company/scouting?request=${s.needId}`);
      await stranger.page.waitForLoadState("networkidle").catch(() => {});
      await expect(
        stranger.page.getByTestId(`scout-candidate-${s.workerId}`),
        "another company never sees this need's applicant",
      ).toHaveCount(0);
      await expect(stranger.page.getByText(`Synthetic Hiring Worker ${w.name} ${RUN}`), "nor their name").toHaveCount(0);
      await stranger.done();

      const { page, done } = await open(browser, w, COMPANY);
      await page.goto(`${BASE}/en/dashboard/company/scouting?request=${s.needId}`);
      const cand = page.getByRole("main").getByTestId(`scout-candidate-${s.workerId}`);
      await expect(cand, "the applicant is among the need's candidates").toBeVisible({ timeout: 60_000 });
      await expect(cand.getByTestId(`scout-interest-${s.workerId}`), "marked as having applied").toBeVisible();
      await fits(page, "the need's candidates");
      await page.reload();
      await expect(page.getByRole("main").getByTestId(`scout-candidate-${s.workerId}`), "still there after a reload").toBeVisible({
        timeout: 60_000,
      });
      const c2 = page.getByRole("main").getByTestId(`scout-candidate-${s.workerId}`);
      await clickUntilVisible(c2.getByTestId("propose-booking-open"), c2.getByTestId("propose-booking-form"));
      await c2.getByTestId("propose-booking-start-date").fill(new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10));
      await c2.getByTestId("propose-booking-send").click();
      await expect(c2.getByTestId("propose-booking-sent"), "the proposal is sent").toBeVisible({ timeout: 30_000 });
      await done();
      const rows = sql<{ id: string; status: string }>(
        `select id, status from public.booking_requests where request_id = ${lit(s.needId)} and worker_id = ${lit(s.workerId)}`,
      );
      expect(rows.map((r) => r.status), "one booking, proposed").toEqual(["proposed"]);
      s.bookingId = rows[0]!.id;
    });

    test(`H-3 (${w.name}). the worker accepts; the engagement is stored`, async ({ browser }) => {
      const { page, done } = await open(browser, w, WORKER);
      await page.goto(`${BASE}/en/dashboard/bookings`);
      const card = page.getByRole("main").getByTestId(`booking-${s.bookingId}`);
      await expect(card, "the proposal reaches the worker").toBeVisible({ timeout: 60_000 });
      await fits(page, "the worker's bookings");
      await clickUntilVisible(card.getByTestId("booking-accept-open"), card.getByTestId("booking-accept-confirm"));
      await card.getByTestId("booking-accept-confirm").click();
      await expect
        .poll(() => sql<{ status: string }>(`select status from public.booking_requests where id = ${lit(s.bookingId)}`)[0]?.status, {
          timeout: 30_000,
        })
        .toBe("accepted");
      await done();
      await expect
        .poll(
          () =>
            sql<{ n: string }>(
              `select count(*)::text as n from public.company_worker_engagements where worker_id = ${lit(s.workerId)} and status = 'active'`,
            )[0]?.n,
          { message: "the hire is stored as an active engagement", timeout: 30_000 },
        )
        .toBe("1");
    });

    test(`H-4 (${w.name}). the company creates a project and puts the hired worker on it`, async ({ browser }) => {
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
      await expect(assign, "the assign form").toBeVisible({ timeout: 60_000 });
      await fits(page, "the projects page");
      await assign.locator('select[name="project_id"]').selectOption(s.projectId);
      const picker = assign.getByTestId("assign-worker-select");
      await expect(
        picker.locator(`option[value="${s.workerProfileId}"]`),
        "the directly hired worker is offered for assignment",
      ).toHaveCount(1);
      await picker.selectOption(s.workerProfileId);
      await assign.locator("#assign-worker-submit").click();
      await expect(assign.getByTestId("assign-worker-done").or(assign.getByTestId("assign-worker-failed"))).toBeVisible({ timeout: 30_000 });
      await expect(assign.getByTestId("assign-worker-failed"), "the assignment is not refused").toHaveCount(0);
      await expect
        .poll(
          () =>
            sql<{ status: string }>(
              `select status from public.project_worker_assignments where project_id = ${lit(s.projectId)} and worker_id = ${lit(s.workerId)}`,
            ).length,
          { message: "the assignment is stored", timeout: 30_000 },
        )
        .toBe(1);
      await page.reload();
      await expect(page.getByRole("main"), "the project still lists the worker after a reload").toContainText(
        `Synthetic Hiring Worker ${w.name} ${RUN}`,
        { timeout: 60_000 },
      );
      await done();
    });

    test(`H-5 (${w.name}). the worker sees the project; their partner is the company, never the stranger`, async ({ browser }) => {
      const { page, done } = await open(browser, w, WORKER);
      await page.goto(`${BASE}/en/dashboard/projects`);
      const mine = page.getByRole("main").getByTestId("worker-projects-list");
      await expect(mine, "the worker's own project list").toBeVisible({ timeout: 60_000 });
      await expect(mine, "the project they were put on").toContainText(PROJECT, { timeout: 30_000 });
      await fits(page, "the worker's projects");

      // The work board is left out on purpose: the stranger's own published need is meant to be
      // there. What must never carry another company is the worker's own work with THIS one.
      for (const path of ["/en/dashboard/projects", "/en/dashboard/bookings", "/en/dashboard/communication"]) {
        await page.goto(`${BASE}${path}`);
        await page.waitForLoadState("networkidle").catch(() => {});
        await expect(page.getByText(STRANGER_ORG), `${path}: no other company's name reaches the worker`).toHaveCount(0);
      }
      await page.goto(`${BASE}/en/dashboard/bookings`);
      await expect(page.getByRole("main").getByTestId(`booking-${s.bookingId}`), "the booking names the direct partner").toContainText(
        ORG,
        { timeout: 60_000 },
      );
      await done();
    });

    test(`H-6 (${w.name}). messaging from the application, both ways; the stranger cannot open the thread`, async ({ browser }) => {
      const wk = await open(browser, w, WORKER);
      await wk.page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
      const box = wk.page.getByRole("main").locator(`li[id="opp-${s.needId}"]`).first().getByTestId(`interest-${s.needId}`);
      await expect(box.getByTestId("interest-contact-employer")).toBeVisible({ timeout: 60_000 });
      await box.getByTestId("interest-contact-employer").click();
      await wk.page.waitForURL(/\/en\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 60_000 });
      s.conversationId = /\/communication\/([0-9a-f-]{36})/.exec(wk.page.url())![1]!;
      await wk.page.getByTestId("communication-composer-input").fill(MESSAGE);
      await wk.page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(wk.page.locator('[data-testid^="message-text-"]', { hasText: MESSAGE })).toBeVisible({ timeout: 30_000 });
      await fits(wk.page, "the worker's thread");
      await wk.done();

      const co = await open(browser, w, COMPANY);
      await co.page.goto(`${BASE}/en/dashboard/communication/${s.conversationId}`);
      await expect(co.page.locator('[data-testid^="message-text-"]', { hasText: MESSAGE }), "the company reads it").toBeVisible({
        timeout: 60_000,
      });
      await co.page.getByTestId("communication-composer-input").fill(ANSWER);
      await co.page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(co.page.locator('[data-testid^="message-text-"]', { hasText: ANSWER })).toBeVisible({ timeout: 30_000 });
      await co.done();

      const wk2 = await open(browser, w, WORKER);
      await wk2.page.goto(`${BASE}/en/dashboard/communication/${s.conversationId}`);
      await wk2.page.reload();
      for (const text of [MESSAGE, ANSWER]) {
        await expect(wk2.page.locator('[data-testid^="message-text-"]', { hasText: text }), `after a reload: ${text}`).toBeVisible({
          timeout: 60_000,
        });
      }
      await wk2.done();
      expect(
        sql<{ n: string }>(`select count(*)::text as n from public.conversation_messages where conversation_id = ${lit(s.conversationId)}`)[0]?.n,
        "both messages are stored",
      ).toBe("2");

      const st = await open(browser, w, STRANGER);
      await st.page.goto(`${BASE}/en/dashboard/communication/${s.conversationId}`);
      await st.page.waitForLoadState("networkidle").catch(() => {});
      for (const text of [MESSAGE, ANSWER]) {
        await expect(st.page.getByText(text), "the stranger company reads nothing of it").toHaveCount(0);
      }
      await st.done();
    });
  });
}
