import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

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
  userId,
  verifyCompanyAsLocalAdmin,
} from "./isolated-web-a-helpers";

/**
 * AI ASSISTANT INTENT → REAL ACTION (owner P1, 2026-11-21), on the THROWAWAY
 * local stack of .github/workflows/signup-isolated.yml, with
 * AI_PROVIDER_MODE=disabled: everything below is the deterministic router and
 * the existing canonical flows, never a model. Synthetic people only.
 *
 * The confirmed defect: "noriu užpildyti darbo ataskaitas" was answered with
 * the organisation's figures and CSV exports. Each acceptance phrase is typed
 * into the ONE chat, in LT, EN and RU, and must reach its real action:
 *   S  "Ieškau darbo" …           → the job search opens with results
 *   N  "Man reikia penkių …" …    → the need intake, quantity 5, nothing sent
 *   J  "Užpildyk vakarykštį …" …  → a journal draft dated yesterday; the
 *                                    confirmation shows; nothing is saved
 *                                    before confirm; one row after; the
 *                                    worker reads it in the journal
 *   R  "noriu užpildyti darbo ataskaitas" … → the journal flow, not figures
 *   G  the goal survives a workspace switch: the need said in the personal
 *      space continues, with its five, in the company picked from the chip
 *   E  the assistant is one tap from every dashboard page (the header's home)
 * The whole walk runs at a desktop width and at a 390 px phone. Outcomes are
 * read back from the local database — the page saying "done" is not the proof.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.setTimeout(240_000);

const RUN = Date.now().toString(36);
const email = (who: string) => `assistant.${who}.${RUN}@local.test`;

const DEVICES = [
  { name: "desktop", context: { viewport: { width: 1280, height: 900 } } },
  {
    name: "phone-390",
    context: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    },
  },
] as const;

type Session = Awaited<ReturnType<BrowserContext["storageState"]>>;

async function open(browser: Browser, device: (typeof DEVICES)[number], state?: Session): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...device.context, timezoneId: "UTC", ...(state ? { storageState: state } : {}) });
  return { ctx, page: await ctx.newPage() };
}

/** The ONE chat, freshly opened. A send before hydration is a no-op, so the
 *  composer must accept text and enable Send first (w7-photo-evidence). */
async function home(page: Page): Promise<void> {
  await page.goto(`${BASE}/en/dashboard`);
  const composer = page.getByTestId("composer-input");
  await composer.waitFor({ state: "visible", timeout: 120_000 });
  const send = page.getByTestId("composer-send").first();
  await expect(async () => {
    await composer.fill("x");
    await expect(send).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 120_000 });
  await composer.fill("");
}

async function say(page: Page, text: string): Promise<void> {
  const composer = page.getByTestId("composer-input");
  const send = page.getByTestId("composer-send").first();
  await expect(async () => {
    await composer.fill(text);
    await expect(send).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await send.click();
  await expect(page.getByTestId("msg-user").filter({ hasText: text }).last(), "the sentence is in the thread").toBeVisible({ timeout: 30_000 });
}

/** Never wider than the screen (no sideways scroll). */
async function fits(page: Page, where: string): Promise<void> {
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width, `${where}: nothing scrolls sideways`).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}

/** The person's calendar day in the page's own clock (UTC context), shifted. */
async function day(page: Page, delta: number): Promise<string> {
  return page.evaluate((d) => {
    const t = new Date();
    t.setDate(t.getDate() + d);
    const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
  }, delta);
}

const entries = (profileId: string) =>
  sql<{ text: string; day: string }>(
    // The day lives in the entry's `work_date` metric (lib/journal/actions.ts).
    `select e.original_text as text,
            (select m.value_text from public.journal_entry_metrics m where m.entry_id = e.id and m.metric_slug = 'work_date' limit 1) as day
       from public.journal_entries e
       join public.workers w on w.id = e.worker_id
      where w.profile_id = ${lit(profileId)} and e.superseded_by is null order by e.created_at`,
  );

const needsOf = (profileId: string) =>
  sql<{ n: number }>(`select count(*)::int as n from public.customer_requests where profile_id = ${lit(profileId)}`)[0]?.n ?? 0;

async function workspaceSwitch(page: Page, optionId: string): Promise<void> {
  const trigger = page.locator('[data-testid="workspace-chip"] button[aria-haspopup="menu"]').filter({ visible: true }).first();
  const option = page.getByTestId(`workspace-option-${optionId}`);
  await expect(async () => {
    if (!(await option.isVisible().catch(() => false))) await trigger.click({ timeout: 5_000 });
    await expect(option).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await option.click();
  await expect(page.getByTestId("workspace-switch-failed")).toHaveCount(0);
}

const activeOrg = (profileId: string) =>
  sql<{ org: string | null }>(`select active_organization_id as org from public.profiles where id = ${lit(profileId)}`)[0]?.org ?? null;

async function lastFlow(page: Page): Promise<Locator> {
  const flow = page.getByTestId("worklog-flow").last();
  await expect(flow, "the journal flow opens in the chat").toBeVisible({ timeout: 60_000 });
  return flow;
}

const JOB = [
  ["LT", "Ieškau darbo"],
  ["EN", "I'm looking for a job"],
  ["RU", "Ищу работу"],
] as const;
const NEED = [
  ["LT", "Man reikia penkių darbuotojų"],
  ["EN", "I need five workers"],
  ["RU", "Мне нужно пять работников"],
] as const;
const YESTERDAY = [
  ["LT", "Užpildyk vakarykštį darbo žurnalą"],
  ["EN", "Fill in yesterday's work journal"],
  ["RU", "Заполни вчерашний рабочий журнал"],
] as const;
const REPORTS = [
  ["LT", "noriu užpildyti darbo ataskaitas"],
  ["EN", "I want to fill in work reports"],
  ["RU", "Хочу заполнить рабочие отчёты"],
] as const;

for (const device of DEVICES) {
  // Each device is self-contained: a failed group must not leave the other
  // without its company, need or people (Playwright replaces the worker).
  const OWNER = email(`owner-${device.name}`);
  const WORKER = email(`worker-${device.name}`);
  const ORG = `Synthetic Assistant Builders ${device.name} ${RUN}`;
  const NEED_ROLE = `Assistant walk tiler ${device.name} ${RUN}`;
  const NOTE = `QA-SYNTHETIC ${device.name} ${RUN}: installed bathroom tiles for 6 hours`;
  const s: { owner?: Session; worker?: Session; ownerId: string; workerId: string; orgId: string } = {
    ownerId: "",
    workerId: "",
    orgId: "",
  };

  /** Stand in the company's workspace (the header's own switch), then reopen the chat. */
  const inCompany = async (page: Page) => {
    if (activeOrg(s.ownerId) === s.orgId) return;
    await workspaceSwitch(page, s.orgId);
    await expect.poll(() => activeOrg(s.ownerId), { message: "the company is the active workspace", timeout: 30_000 }).toBe(s.orgId);
    await home(page);
  };

  test.describe(`assistant intent → real action (${device.name})`, () => {
    test.describe.configure({ mode: "serial" });

    test(`0 (${device.name}). setup: a verified company with a need, and a worker`, async ({ browser }) => {
      {
        const { ctx, page } = await open(browser, DEVICES[0]);
        await signUp(page, BASE, OWNER);
        await onboard(page, "hire", `Synthetic Assistant Owner ${device.name} ${RUN}`);
        await setUpCompany(page, ORG);
        await publishNeed(page, BASE, NEED_ROLE, "LT");
        s.owner = await ctx.storageState();
        await ctx.close();
      }
      await verifyCompanyAsLocalAdmin(OWNER, email(`admin-${device.name}`));
      s.ownerId = await userId(OWNER);
      s.orgId = sql<{ id: string }>(`select id from public.organizations where owner_profile_id = ${lit(s.ownerId)}`)[0]!.id;
      {
        const { ctx, page } = await open(browser, DEVICES[0]);
        await signUp(page, BASE, WORKER);
        await onboard(page, "work", `Synthetic Assistant Worker ${device.name} ${RUN}`);
        await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
        s.worker = await ctx.storageState();
        await ctx.close();
      }
      s.workerId = await userId(WORKER);
      expect(entries(s.workerId), "the worker starts with an empty journal").toEqual([]);
    });

    for (const [lang, phrase] of JOB) {
      test(`S-${lang} (${device.name}). "${phrase}" opens the job search with results`, async ({ browser }) => {
        const { ctx, page } = await open(browser, device, s.worker);
        await home(page);
        await say(page, phrase);
        const view = page.getByTestId("opportunities-view").filter({ visible: true }).first();
        await expect(view, "the job search result opens").toBeVisible({ timeout: 60_000 });
        await expect(view.getByTestId("opportunities-band-counts"), "with results, not an empty list").toHaveText(/[1-9]/);
        await expect(page.getByTestId("worklog-flow"), "no journal flow for a job search").toHaveCount(0);
        await fits(page, `job search ${lang}`);
        await ctx.close();
      });
    }

    test(`J-LT (${device.name}). "Užpildyk vakarykštį darbo žurnalą": a draft dated yesterday, confirmed, saved once, readable`, async ({ browser }) => {
      const { ctx, page } = await open(browser, device, s.worker);
      await home(page);
      await say(page, YESTERDAY[0][1]);
      const flow = await lastFlow(page);
      const yesterday = await day(page, -1);
      await expect(flow.getByTestId("worklog-date"), "the draft is dated yesterday").toHaveValue(yesterday);
      await expect(flow.getByTestId("worklog-date-yesterday")).toHaveAttribute("aria-pressed", "true");
      await expect(flow.getByTestId("worklog-date-today"), "today is offered too").toBeVisible();
      // The request is not the work: the field is empty and asks for it.
      await expect(flow.getByTestId("worklog-notes"), "the request is not prefilled as evidence").toHaveValue("");
      await fits(page, "journal draft");
      expect(entries(s.workerId), "nothing is saved by the sentence").toEqual([]);

      await flow.getByTestId("worklog-notes").fill(NOTE);
      await flow.getByTestId("worklog-save").click();
      const confirm = flow.getByTestId("worklog-confirm");
      await expect(confirm, "the confirmation is shown").toBeVisible({ timeout: 30_000 });
      expect(entries(s.workerId), "nothing is saved before confirm").toEqual([]);
      await confirm.click();
      await expect(flow.getByTestId("worklog-done").or(flow.getByTestId("worklog-error"))).toBeVisible({ timeout: 60_000 });
      await expect(flow.getByTestId("worklog-done"), "the entry is saved").toBeVisible();
      await expect
        .poll(() => entries(s.workerId), { message: "one row, dated yesterday, in the worker's words", timeout: 30_000 })
        .toEqual([{ text: NOTE, day: yesterday }]);

      await page.goto(`${BASE}/en/dashboard/journal`);
      await expect(page.getByRole("main").getByText(NOTE).first(), "the worker reads the entry in the journal").toBeVisible({ timeout: 60_000 });
      expect(entries(s.workerId), "still exactly one row").toHaveLength(1);
      await ctx.close();
    });

    for (const [lang, phrase] of YESTERDAY.slice(1)) {
      test(`J-${lang} (${device.name}). "${phrase}" opens a journal draft dated yesterday; nothing is saved`, async ({ browser }) => {
        const { ctx, page } = await open(browser, device, s.worker);
        await home(page);
        await say(page, phrase);
        const flow = await lastFlow(page);
        await expect(flow.getByTestId("worklog-date"), "the draft is dated yesterday").toHaveValue(await day(page, -1));
        await expect(flow.getByTestId("worklog-notes")).toHaveValue("");
        await flow.getByTestId("worklog-notes").fill(`${NOTE} (${lang}, not confirmed)`);
        await flow.getByTestId("worklog-save").click();
        await expect(flow.getByTestId("worklog-confirm"), "the confirmation is shown").toBeVisible({ timeout: 30_000 });
        expect(entries(s.workerId), "no new row without the confirm").toHaveLength(1);
        await ctx.close();
      });
    }

    for (const [lang, phrase] of REPORTS) {
      test(`R-${lang} (${device.name}). "${phrase}" opens the journal flow, not the figures`, async ({ browser }) => {
        const { ctx, page } = await open(browser, device, s.worker);
        await home(page);
        await say(page, phrase);
        const flow = await lastFlow(page);
        const today = await day(page, 0);
        await expect(flow.getByTestId("worklog-date"), "no day was named: today is offered").toHaveValue(today);
        await expect(flow.getByTestId("worklog-notes"), "the request is not the record").toHaveValue("");
        // The person picks the day: yesterday in one tap.
        await flow.getByTestId("worklog-date-yesterday").click();
        await expect(flow.getByTestId("worklog-date")).toHaveValue(await day(page, -1));
        await expect(page.getByTestId("opportunities-view"), "no job search").toHaveCount(0);
        expect(entries(s.workerId), "the sentence saves nothing").toHaveLength(1);
        await fits(page, `reports ${lang}`);
        await ctx.close();
      });
    }

    test(`R-negative (${device.name}). "show project stats" stays a read: no journal flow opens`, async ({ browser }) => {
      const { ctx, page } = await open(browser, device, s.worker);
      await home(page);
      const answers = page.locator('[data-testid^="msg-"]:not([data-testid="msg-user"])');
      const before = await answers.count();
      await say(page, "show project stats");
      await expect.poll(() => answers.count(), { message: "the assistant answers", timeout: 60_000 }).toBeGreaterThan(before);
      await expect(page.getByTestId("chat-typing")).toHaveCount(0, { timeout: 60_000 });
      await expect(page.getByTestId("worklog-flow"), "a figures read is not the journal").toHaveCount(0);
      await ctx.close();
    });

    for (const [lang, phrase] of NEED) {
      test(`N-${lang} (${device.name}). "${phrase}" opens the need intake with quantity 5; nothing is sent`, async ({ browser }) => {
        const { ctx, page } = await open(browser, device, s.owner);
        await home(page);
        await inCompany(page);
        const before = needsOf(s.ownerId);
        await say(page, phrase);
        const form = page.getByTestId("inline-action-form-company.create-demand").last();
        await expect(form, "the need intake opens").toBeVisible({ timeout: 60_000 });
        await expect(form.getByTestId("field-teamSize"), "quantity 5, as said").toHaveValue("5");
        expect(needsOf(s.ownerId), "nothing is sent before the person confirms").toBe(before);
        await fits(page, `need intake ${lang}`);
        await ctx.close();
      });
    }

    test(`G (${device.name}). the goal survives a workspace switch: the need said in the personal space continues in the company`, async ({ browser }) => {
      // Setup on this throwaway stack: the owner also holds the person role,
      // so the personal space really is a person's space (as for anyone who
      // works and also runs a company).
      sqlExec(`insert into public.profile_roles (profile_id, role) values (${lit(s.ownerId)}, 'worker') on conflict do nothing`);
      const { ctx, page } = await open(browser, device, s.owner);
      await home(page);
      await inCompany(page);
      await workspaceSwitch(page, "personal");
      await expect.poll(() => activeOrg(s.ownerId), { message: "the personal space is active", timeout: 30_000 }).toBeNull();
      await home(page);
      const before = needsOf(s.ownerId);
      await say(page, NEED[0][1]);
      const door = page.getByTestId(`chat-chip-ws:${s.orgId}`).last();
      await expect(door, "the company is offered as the door").toBeVisible({ timeout: 60_000 });
      await door.click();
      await expect.poll(() => activeOrg(s.ownerId), { message: "the company is active after the chip", timeout: 30_000 }).toBe(s.orgId);
      const form = page.getByTestId("inline-action-form-company.create-demand").last();
      await expect(form, "the same goal continues in the company: the need intake opens").toBeVisible({ timeout: 90_000 });
      await expect(form.getByTestId("field-teamSize"), "the five said before the switch are kept").toHaveValue("5");
      expect(needsOf(s.ownerId), "nothing is sent by the switch").toBe(before);
      await ctx.close();
    });

    test(`E (${device.name}). the assistant is one tap away from every dashboard page`, async ({ browser }) => {
      const { ctx, page } = await open(browser, device, s.worker);
      for (const path of ["/en/dashboard/journal", "/en/dashboard/opportunities", "/en/dashboard/profile", "/en/dashboard/communication"]) {
        await page.goto(`${BASE}${path}`);
        const homeLink = page.getByTestId("shell-logo-home").filter({ visible: true }).first();
        await expect(homeLink, `${path}: the header's way home is there`).toBeVisible({ timeout: 60_000 });
        await expect(homeLink).toHaveAttribute("href", /\/en\/dashboard$/);
      }
      await page.getByTestId("shell-logo-home").filter({ visible: true }).first().click();
      await page.waitForURL(/\/en\/dashboard$/, { timeout: 60_000 });
      await expect(page.getByTestId("composer-input"), "it opens the assistant").toBeVisible({ timeout: 60_000 });
      await ctx.close();
    });
  });
}
