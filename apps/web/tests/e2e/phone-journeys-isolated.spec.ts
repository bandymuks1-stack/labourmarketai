import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

import {
  BASE,
  isolatedStack,
  lit,
  onboard,
  PASSWORD,
  publishNeed,
  setUpCompany,
  signIn,
  signUp,
  sql,
  userId,
  verifyCompanyAsLocalAdmin,
} from "./isolated-web-a-helpers";

/**
 * A SIGNED-IN PERSON ON A PHONE, at 375 and at 390 px, on a THROWAWAY LOCAL Supabase stack
 * (.github/workflows/signup-isolated.yml). Owner 2026-11-14: "Patikrinti prisijungusio naudotojo
 * profilį, CV, darbo paiešką, kandidatavimą ir susirašinėjimą. Tikrinti 375 ir 390 px pločiu."
 *
 * For each width, first at a desktop (setup, not the walk): a company signs up, posts a need and is verified by the
 * local operator, so the need reaches the worker board.
 *
 * Then, for EACH phone — 375 × 667 and 390 × 844, touch, a phone's user agent — a new worker:
 *   M-1 PROFILE  opens their profile from the avatar menu and saves a public headline (stored);
 *   M-2 CV       opens the Living CV from the avatar menu and switches it to the EU format;
 *   M-3 SEARCH   finds the company's need on the work board and opens its details;
 *   M-4 APPLY    expresses interest in it (the interest row is stored);
 *   M-5 MESSAGES writes to the employer from that application; the company answers from ITS phone;
 *                the worker reaches the thread through the phone's area sheet and reads the answer.
 *
 * M-2 runs LAST in each group (first run 2026-11-14: the CV page stopped answering at 375 px), so a
 * CV fault cannot hide search, applying and messages; if it stops answering again, the step says
 * whether the same CV answers at a desktop width.
 *
 * THE FOUR OTHER GROUPS (owner P0, evening 2026-11-14: "visoms 5 grupėms"), each at both widths and
 * each its own serial group, so one role's failure hides no other:
 *   E EMPLOYER     the area sheet to needs; the need form sent on the phone; candidate search for it;
 *                  the people page and a join-by-link invitation; messages.
 *   A AGENCY       the area sheet to clients; the roster invite on the people page; a need posted on
 *                  the phone; messages.
 *   S STUDENT      signs up ON THE PHONE (study fields), the learning compass, the internship board,
 *                  applies to an open need, the study on the Living CV; messages.
 *   T INSTITUTION  signs up ON THE PHONE through its door and sets up its organisation; the education
 *                  home (no header or sheet door leads there: reached by address, recorded); a learner
 *                  invited by link; the people page with its members fold; messages.
 * Organisation setup that is not itself under test happens at a desktop, like M-0.
 *
 * On every page the walk also asserts that nothing scrolls sideways (the page is never wider than
 * the phone). Controls are TAPPED, not clicked. Outcomes are read back from the local database —
 * the page saying "done" is not the proof. It refuses to run anywhere but the local stack (owner
 * decision 2026-10-28: no synthetic accounts in production). Result class: PASS_CI_ONLY.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
// One worker runs this file in order (playwright.config: E2E_LOCAL_STACK → workers 1). Each phone is
// its own serial group, so a failure at 375 px does not hide the 390 px walk.
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const email = (who: string) => `phone.${who}.${RUN}@local.test`;

const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const PHONES = [
  { name: "375", viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 },
  { name: "390", viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
] as const;

async function onPhone(
  browser: Browser,
  phone: (typeof PHONES)[number],
  storageState?: Awaited<ReturnType<BrowserContext["storageState"]>>,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    ...(storageState ? { storageState } : {}),
    viewport: phone.viewport,
    deviceScaleFactor: phone.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    userAgent: USER_AGENT,
    timezoneId: "UTC",
  });
  const page = await ctx.newPage();
  watch(page);
  return { ctx, page };
}

/** What the page said while the walk was on it: uncaught errors, console errors, dialogs. */
const heard = new WeakMap<Page, string[]>();
function watch(page: Page): void {
  const notes: string[] = [];
  heard.set(page, notes);
  page.on("pageerror", (e) => notes.push(`pageerror: ${String(e.message).slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error") notes.push(`console: ${m.text().slice(0, 200)}`);
  });
  // A dialog blocks the page; it is recorded and dismissed, and the step that met it fails below.
  page.on("dialog", (d) => {
    notes.push(`dialog: ${d.type()} ${d.message().slice(0, 120)}`);
    void d.dismiss().catch(() => {});
  });
}

/**
 * One sign-in per person per run: later steps reuse that browser session (cookies and storage do
 * not depend on the screen). The local auth server limits sign-ins per IP, and every walk in this
 * job shares one stack.
 */
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();

async function signedInOnPhone(browser: Browser, phone: (typeof PHONES)[number], address: string): Promise<{ ctx: BrowserContext; page: Page; done: () => Promise<void> }> {
  const saved = sessions.get(address);
  const { ctx, page } = await onPhone(browser, phone, saved);
  if (saved) {
    await page.goto(`${BASE}/en/dashboard`);
    await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  } else {
    await signIn(page, BASE, address);
  }
  return {
    ctx,
    page,
    done: async () => {
      sessions.set(address, await ctx.storageState());
      await ctx.close();
    },
  };
}

/** The page answers within 20 s; if not, say so with what the page reported, instead of hanging. */
/**
 * How far the BODY reaches past the screen. Not `documentElement.scrollWidth`: globals.css clips the
 * root (html, body { overflow-x: hidden }), so that reads the screen width while content runs off it
 * (authenticated-mobile-overflow.spec.ts, the same measure, Codex P2 on #3366).
 */
async function answers(page: Page): Promise<{ scroll: number; inner: number } | null> {
  return Promise.race([
    page.evaluate(() => ({ scroll: document.body.scrollWidth, inner: document.documentElement.clientWidth })),
    new Promise<null>((r) => setTimeout(() => r(null), 20_000)),
  ]);
}

/** The page is never wider than the phone: nothing scrolls sideways. */
async function fitsTheScreen(page: Page, where: string): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const got = await answers(page);
  const notes = (heard.get(page) ?? []).join(" | ") || "none";
  if (got === null) throw new Error(`${where}: the page stopped answering for 20 s (busy main thread or an open dialog). The page reported: ${notes}`);
  expect(notes.includes("dialog:"), `${where}: no dialog opened (${notes})`).toBe(false);
  expect(got.scroll - got.inner, `${where}: the body reaches ${got.scroll - got.inner} px past a ${got.inner} px screen`).toBeLessThanOrEqual(1);
}

/** Tap until the expected result shows: a tap before hydration is a silent no-op. */
async function tapUntil(target: Locator, result: Locator, timeout = 60_000): Promise<void> {
  await expect(async () => {
    if (!(await result.isVisible().catch(() => false))) await target.tap({ timeout: 5_000 });
    await expect(result).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout });
}

/** The avatar menu: the phone's door to the profile and the CV. */
async function accountMenu(page: Page, link: "account-menu-profile-link" | "account-menu-cv-link"): Promise<void> {
  const target = page.getByTestId(link);
  await tapUntil(page.getByTestId("account-menu-trigger"), target);
  await target.tap();
}

/** The phone's area sheet (the desktop nav is hidden below md): open it and take one door. */
async function sheetTo(page: Page, id: string): Promise<void> {
  const item = page.getByTestId(`header-nav-sheet-${id}`);
  await tapUntil(page.getByTestId("header-nav-sheet-trigger"), item);
  await item.tap();
}

/** A new organisation owner, set up at a desktop (setup, not the walk); the session is kept. */
async function newOrganisation(browser: Browser, address: string, intent: "hire" | "agency", owner: string, legalName: string): Promise<{ profileId: string; orgId: string }> {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  await signUp(page, BASE, address);
  await onboard(page, intent, owner);
  await setUpCompany(page, legalName);
  sessions.set(address, await ctx.storageState());
  await ctx.close();
  const profileId = await userId(address);
  const orgs = sql<{ id: string }>(`select id from public.organizations where owner_profile_id = ${lit(profileId)}`);
  expect(orgs, "the organisation is stored once").toHaveLength(1);
  return { profileId, orgId: orgs[0]!.id };
}

/** The need form, filled on the phone; returns the stored need's id. */
async function postNeedOnPhone(page: Page, profileId: string, role: string): Promise<string> {
  const main = page.getByRole("main");
  await expect(main.getByTestId("demand-role")).toBeVisible({ timeout: 60_000 });
  await fitsTheScreen(page, "the need form");
  await main.getByTestId("demand-role").fill(role);
  await main.getByTestId("demand-description").fill("Two people for a three-week renovation in Vilnius.");
  await main.getByTestId("demand-next").tap();
  const size = main.getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("2");
  await main.getByTestId("demand-next").tap();
  await main.getByTestId("demand-create").tap();
  await expect(main.getByTestId("demand-done"), "the need is accepted").toBeVisible({ timeout: 30_000 });
  const rows = sql<{ id: string }>(
    `select id from public.customer_requests where (title = ${lit(role)} or role_or_work_type = ${lit(role)}) and profile_id = ${lit(profileId)}`,
  );
  expect(rows, "the need is stored once").toHaveLength(1);
  return rows[0]!.id;
}

/** Messages through the area sheet: the inbox opens and fits the screen. */
async function messagesBySheet(page: Page, who: string): Promise<void> {
  await sheetTo(page, "communication");
  await page.waitForURL(/\/en\/dashboard\/communication/, { timeout: 30_000 });
  await expect(page.getByTestId("communication-workspace"), `${who}: the messages page opens`).toBeVisible({ timeout: 30_000 });
  await fitsTheScreen(page, `${who}'s messages`);
}

for (const phone of PHONES) {
  // Each width is self-contained: Playwright replaces the worker process after a failure, so
  // nothing a group needs may live in another group's module state (Codex P2).
  const COMPANY = email(`company${phone.name}`);
  const COMPANY_ORG = `Synthetic Phone Builders ${phone.name} ${RUN}`;
  const NEED_ROLE = `Phone walk tiler ${phone.name} ${RUN}`;
  const shared: { companyId: string; needId: string } = { companyId: "", needId: "" };
  const worker = email(`worker${phone.name}`);
  const workerName = `Synthetic Phone Worker ${phone.name} ${RUN}`;
  const headline = `Tiler and waterproofer ${phone.name} ${RUN}`;
  const message = `Hello from a ${phone.name} px phone ${RUN}`;
  const answer = `Answer to the ${phone.name} px phone ${RUN}`;
  /** profileId is the auth/profile id; workerId is `workers.id`, which interest rows reference. */
  const s: { profileId: string; workerId: string; conversationId: string } = { profileId: "", workerId: "", conversationId: "" };

  test.describe(`at ${phone.viewport.width} × ${phone.viewport.height}`, () => {
    test.describe.configure({ mode: "serial" });
    test(`M-0 (${phone.name}). setup at a desktop: a verified company posts a need`, async ({ browser }) => {
      const ctx = await browser.newContext({ timezoneId: "UTC" });
      const page = await ctx.newPage();
      await signUp(page, BASE, COMPANY);
      await onboard(page, "hire", `Synthetic Phone Owner ${phone.name} ${RUN}`);
      await setUpCompany(page, COMPANY_ORG);
      await publishNeed(page, BASE, NEED_ROLE, "LT");
      sessions.set(COMPANY, await ctx.storageState());
      await ctx.close();
      shared.companyId = await verifyCompanyAsLocalAdmin(COMPANY, email(`admin${phone.name}`));
      const owner = await userId(COMPANY);
      const needs = sql<{ id: string }>(
        `select id from public.customer_requests where (title = ${lit(NEED_ROLE)} or role_or_work_type = ${lit(NEED_ROLE)}) and profile_id = ${lit(owner)}`,
      );
      expect(needs, "the need is stored once").toHaveLength(1);
      shared.needId = needs[0]!.id;
    });

    test(`M-1 (${phone.name}). a new worker opens their profile from the avatar menu and saves a public headline`, async ({ browser }) => {
      const { ctx, page } = await onPhone(browser, phone);
      await signUp(page, BASE, worker);
      await onboard(page, "work", workerName);
      await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
      s.profileId = await userId(worker);
      await fitsTheScreen(page, "the worker's home");

      await accountMenu(page, "account-menu-profile-link");
      await page.waitForURL(/\/en\/dashboard\/profile/, { timeout: 30_000 });
      await expect(page.getByTestId("profile-destinations")).toBeVisible({ timeout: 30_000 });
      await fitsTheScreen(page, "the profile");
      // The public summary sits in the collapsed CV details; its hash opens them.
      await page.goto(`${BASE}/en/dashboard/profile#profile-public-summary`);
      await page.reload();
      const section = page.getByTestId("profile-public-summary");
      await expect(section).toBeVisible({ timeout: 30_000 });
      await section.getByTestId("profile-public-headline").fill(headline);
      await section.getByTestId("profile-public-summary-save").tap();
      await expect(section.getByTestId("profile-public-summary-saved"), "the headline is saved").toBeVisible({ timeout: 30_000 });
      const rows = sql<{ id: string; headline: string | null }>(`select id, headline from public.workers where profile_id = ${lit(s.profileId)}`);
      expect(rows.map((r) => r.headline), "the headline is stored on the worker").toEqual([headline]);
      s.workerId = rows[0]!.id;
      sessions.set(worker, await ctx.storageState());
      await ctx.close();
    });

    test(`M-3 (${phone.name}). the worker finds the company's need on the work board and opens its details`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, worker);
      await page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
      // Scoped to <main>: while a section streams in, the page can briefly hold a second, hidden copy
      // of the list outside it (run on 4b663d9, 375 px: strict-mode match of two lists).
      await expect(page.getByRole("main").getByTestId("opportunities-list")).toBeVisible({ timeout: 60_000 });
      await fitsTheScreen(page, "the work board");
      const card = page.getByRole("main").locator(`li[id="opp-${shared.needId}"]`).first();
      await expect(card, "the verified company's need is on the board").toBeVisible({ timeout: 60_000 });
      // The card is THIS need (its id) from THIS company. Its heading is the recognised profession
      // ("Tiler"), not the company's free-text title (first run, 2026-11-14), so the title is
      // recorded, not asserted.
      await expect(card, "the card names the company that posted the need").toContainText(COMPANY_ORG);
      test.info().annotations.push({ type: "board-card-heading", description: ((await card.innerText()) || "").split("\n").find((l) => l.trim()) ?? "" });
      // The testid is on the disclosure's wrapper; the toggle and aria-expanded are on its button.
      const toggle = card.getByTestId("opportunity-details").locator("button[aria-expanded]").first();
      await toggle.tap();
      await expect(toggle, "its details open").toHaveAttribute("aria-expanded", "true", { timeout: 30_000 });
      const region = await toggle.getAttribute("aria-controls");
      if (region) await expect(card.locator(`[id="${region}"]`), "the details region is shown").toBeVisible();
      await fitsTheScreen(page, "the work board with a need's details open");
      await done();
    });

    test(`M-4 (${phone.name}). the worker applies: interest in the need is expressed and stored`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, worker);
      await page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
      const card = page.getByRole("main").locator(`li[id="opp-${shared.needId}"]`).first();
      await expect(card).toBeVisible({ timeout: 60_000 });
      const box = card.getByTestId(`interest-${shared.needId}`);
      await tapUntil(box.getByTestId("interest-express"), box.getByTestId("interest-sent"));
      await expect(box.getByTestId("interest-contact-employer"), "the way to write to the employer opens").toBeVisible({ timeout: 30_000 });
      const rows = sql<{ status: string }>(
        `select status from public.demand_interest_signals where request_id = ${lit(shared.needId)} and worker_id = ${lit(s.workerId)}`,
      );
      expect(rows.map((r) => r.status), "one interest row, interested").toEqual(["interested"]);
      await done();
    });

    test(`M-5 (${phone.name}). messages: the worker writes from the application, the company answers from its phone, the worker reads it`, async ({ browser }) => {
      // The worker writes to the employer from their application.
      const w = await signedInOnPhone(browser, phone, worker);
      await w.page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
      const box = w.page.getByRole("main").locator(`li[id="opp-${shared.needId}"]`).first().getByTestId(`interest-${shared.needId}`);
      await expect(box.getByTestId("interest-contact-employer")).toBeVisible({ timeout: 60_000 });
      await box.getByTestId("interest-contact-employer").tap();
      await w.page.waitForURL(/\/en\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 60_000 });
      s.conversationId = /\/communication\/([0-9a-f-]{36})/.exec(w.page.url())![1]!;
      await fitsTheScreen(w.page, "the worker's new thread");
      await w.page.getByTestId("communication-composer-input").fill(message);
      await w.page.getByRole("button", { name: "Send", exact: true }).tap();
      await expect(w.page.locator('[data-testid^="message-text-"]', { hasText: message }), "the message shows in the thread").toBeVisible({
        timeout: 30_000,
      });
      await w.done();
      await expect
        .poll(
          () =>
            sql<{ body: string }>(
              `select body from public.conversation_messages where conversation_id = ${lit(s.conversationId)} and author_id = ${lit(s.profileId)}`,
            ).map((r) => r.body),
          { message: "the worker's message is stored in that conversation", timeout: 30_000 },
        )
        .toEqual([message]);

      // The company finds the thread in its messages, on its own phone, and answers.
      const c = await signedInOnPhone(browser, phone, COMPANY);
      await c.page.goto(`${BASE}/en/dashboard/communication`);
      const row = c.page.getByTestId(`conversation-row-${s.conversationId}`);
      await expect(row, "the thread is in the company's messages").toBeVisible({ timeout: 60_000 });
      await fitsTheScreen(c.page, "the company's messages");
      await row.tap();
      await c.page.waitForURL(new RegExp(`/communication/${s.conversationId}`), { timeout: 30_000 });
      await expect(c.page.locator('[data-testid^="message-text-"]', { hasText: message }), "the company reads the worker's message").toBeVisible({
        timeout: 30_000,
      });
      await c.page.getByTestId("communication-composer-input").fill(answer);
      await c.page.getByRole("button", { name: "Send", exact: true }).tap();
      await expect(c.page.locator('[data-testid^="message-text-"]', { hasText: answer })).toBeVisible({ timeout: 30_000 });
      await c.done();

      // The worker reaches messages through the phone's area sheet (the desktop nav is hidden) and reads it.
      const w2 = await signedInOnPhone(browser, phone, worker);
      const sheetItem = w2.page.getByTestId("header-nav-sheet-communication");
      await tapUntil(w2.page.getByTestId("header-nav-sheet-trigger"), sheetItem);
      await sheetItem.tap();
      await w2.page.waitForURL(/\/en\/dashboard\/communication/, { timeout: 30_000 });
      const mine = w2.page.getByTestId(`conversation-row-${s.conversationId}`);
      await expect(mine).toBeVisible({ timeout: 60_000 });
      await mine.tap();
      await expect(w2.page.locator('[data-testid^="message-text-"]', { hasText: answer }), "the worker reads the company's answer").toBeVisible({
        timeout: 30_000,
      });
      await fitsTheScreen(w2.page, "the worker's thread with the answer");
      await w2.done();
    });
    test(`M-2 (${phone.name}). the worker opens the Living CV from the avatar menu and switches it to the EU format`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, worker);
      await accountMenu(page, "account-menu-cv-link");
      await page.waitForURL(/\/en\/cv/, { timeout: 30_000 });
      await expect(page.getByTestId("cv-back-link")).toBeVisible({ timeout: 30_000 });
      try {
        await fitsTheScreen(page, "the Living CV");
      } catch (phoneError) {
        // Is it the phone, or this CV? The same session opens the same page at a desktop width.
        const desk = await browser.newContext({ storageState: await page.context().storageState(), timezoneId: "UTC" });
        const dp = await desk.newPage();
        watch(dp);
        await dp.goto(`${BASE}/en/cv`);
        await dp.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        const atDesk = await answers(dp);
        await desk.close();
        await page.context().close();
        throw new Error(`${(phoneError as Error).message}\nThe same CV at 1280 × 720: ${atDesk === null ? "ALSO stops answering" : "answers"}.`);
      }
      await page.getByTestId("cv-template-eu").tap();
      await page.waitForURL(/template=eu/, { timeout: 30_000 });
      await expect(page.getByTestId("cv-eu-format"), "the EU-format CV renders").toBeVisible({ timeout: 30_000 });
      await fitsTheScreen(page, "the EU-format CV");
      await done();
    });
  });

  // ── EMPLOYER ──────────────────────────────────────────────────────────────
  const EMPLOYER = email(`employer${phone.name}`);
  const e: { profileId: string; orgId: string; needId: string } = { profileId: "", orgId: "", needId: "" };
  test.describe(`employer at ${phone.viewport.width} × ${phone.viewport.height}`, () => {
    test.describe.configure({ mode: "serial" });
    test(`E-1 (${phone.name}). setup at a desktop: a company owner`, async ({ browser }) => {
      Object.assign(e, await newOrganisation(browser, EMPLOYER, "hire", `Synthetic Employer ${phone.name} ${RUN}`, `Synthetic Employer Co ${phone.name} ${RUN}`));
    });
    test(`E-2 (${phone.name}). the area sheet leads to needs; the need form is filled and sent on the phone`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, EMPLOYER);
      await sheetTo(page, "area:need");
      await page.waitForURL(/\/en\/dashboard\/company\/needs/, { timeout: 30_000 });
      e.needId = await postNeedOnPhone(page, e.profileId, `Phone employer need ${phone.name} ${RUN}`);
      await done();
    });
    test(`E-3 (${phone.name}). candidate search for that need opens on the phone`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, EMPLOYER);
      await page.goto(`${BASE}/en/dashboard/company/scouting?request=${e.needId}`);
      await expect(page.getByRole("main").locator('[data-testid^="scouting-"]').first(), "the scouting page renders its own content").toBeVisible({ timeout: 60_000 });
      await fitsTheScreen(page, "the employer's candidate search");
      await done();
    });
    test(`E-4 (${phone.name}). organisation management: the people page from the sheet, and a join-by-link invitation`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, EMPLOYER);
      await sheetTo(page, "area:people");
      await page.waitForURL(/\/en\/dashboard\/company\/people/, { timeout: 30_000 });
      await fitsTheScreen(page, "the employer's people page");
      await page.goto(`${BASE}/en/dashboard/network?invite=1&type=join_organization&org=${e.orgId}#network-invite`);
      const panel = page.getByTestId("invite-panel");
      await expect(panel).toBeVisible({ timeout: 30_000 });
      await panel.getByTestId("invite-mode-link").tap();
      await panel.getByTestId("invite-name").fill(`Synthetic Invitee ${phone.name} ${RUN}`);
      await panel.getByTestId("invite-submit").tap();
      await expect(panel.getByTestId("invite-copy-link").first(), "the invitation link is handed over").toBeVisible({ timeout: 30_000 });
      await fitsTheScreen(page, "the invitation panel");
      const rows = sql<{ status: string }>(`select status from public.invitations where organization_id = ${lit(e.orgId)} and invitation_type = 'join_organization'`);
      expect(rows.length, "the invitation is stored").toBeGreaterThan(0);
      await done();
    });
    test(`E-5 (${phone.name}). messages from the area sheet`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, EMPLOYER);
      await messagesBySheet(page, "the employer");
      await done();
    });
  });

  // ── AGENCY ────────────────────────────────────────────────────────────────
  const AGENCY = email(`agency${phone.name}`);
  const a: { profileId: string; orgId: string } = { profileId: "", orgId: "" };
  test.describe(`agency at ${phone.viewport.width} × ${phone.viewport.height}`, () => {
    test.describe.configure({ mode: "serial" });
    test(`A-1 (${phone.name}). setup at a desktop: a staffing agency`, async ({ browser }) => {
      Object.assign(a, await newOrganisation(browser, AGENCY, "agency", `Synthetic Agency Owner ${phone.name} ${RUN}`, `Synthetic Staffing ${phone.name} ${RUN}`));
      const [c] = sql<{ t: string | null }>(`select company_type as t from public.companies where profile_id = ${lit(a.profileId)}`);
      expect(c?.t, "an agency, not a hiring company").toBe("staffing_agency");
    });
    test(`A-2 (${phone.name}). the area sheet leads to clients (partners)`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, AGENCY);
      await sheetTo(page, "area:clients");
      await page.waitForURL(/\/en\/dashboard\/company\/partners/, { timeout: 30_000 });
      await fitsTheScreen(page, "the agency's clients");
      await done();
    });
    test(`A-3 (${phone.name}). organisation management: the roster invite on the people page`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, AGENCY);
      await sheetTo(page, "area:people");
      await page.waitForURL(/\/en\/dashboard\/company\/people/, { timeout: 30_000 });
      const main = page.getByRole("main");
      await expect(main.getByTestId("company-workers-invite-email")).toBeVisible({ timeout: 30_000 });
      await fitsTheScreen(page, "the agency's people page");
      await main.getByTestId("company-workers-invite-email").fill(email(`rostered${phone.name}`));
      await main.getByTestId("company-workers-invite-submit").tap();
      await expect(main.getByTestId("company-workers-invite-result"), "the roster invitation is answered").toBeVisible({ timeout: 30_000 });
      await done();
    });
    test(`A-4 (${phone.name}). the agency posts a need on the phone`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, AGENCY);
      await sheetTo(page, "area:need");
      await page.waitForURL(/\/en\/dashboard\/company\/needs/, { timeout: 30_000 });
      await postNeedOnPhone(page, a.profileId, `Phone agency need ${phone.name} ${RUN}`);
      await done();
    });
    test(`A-5 (${phone.name}). messages from the area sheet`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, AGENCY);
      await messagesBySheet(page, "the agency");
      await done();
    });
  });

  // ── STUDENT ───────────────────────────────────────────────────────────────
  const STUDENT = email(`student${phone.name}`);
  const st: { profileId: string; workerId: string; needId: string } = { profileId: "", workerId: "", needId: "" };
  const STUDENT_NEED = `Phone student placement ${phone.name} ${RUN}`;
  test.describe(`student at ${phone.viewport.width} × ${phone.viewport.height}`, () => {
    test.describe.configure({ mode: "serial" });
    test(`S-0 (${phone.name}). setup at a desktop: a verified company posts the need the student will apply to`, async ({ browser }) => {
      // The student group owns its need: another group's failure (and the worker restart it causes)
      // cannot skip the student's application (Codex P2).
      const owner = email(`studentco${phone.name}`);
      const org = await newOrganisation(browser, owner, "hire", `Synthetic Placement Owner ${phone.name} ${RUN}`, `Synthetic Placement Co ${phone.name} ${RUN}`);
      const { page, done } = await signedInOnPhone(browser, phone, owner);
      await page.goto(`${BASE}/en/dashboard/company/needs?audience=need#demand-intake`);
      st.needId = await postNeedOnPhone(page, org.profileId, STUDENT_NEED);
      await done();
      await verifyCompanyAsLocalAdmin(owner, email(`studentadmin${phone.name}`));
    });
    test(`S-1 (${phone.name}). a student signs up ON THE PHONE, names where they study, lands on the learning compass`, async ({ browser }) => {
      const { ctx, page } = await onPhone(browser, phone);
      await signUp(page, BASE, STUDENT);
      const intent = page.getByTestId("onboarding-intent-student");
      await intent.tap();
      await expect(intent).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("onboarding-intents-continue").tap();
      await page.getByTestId("onboarding-display-name").fill(`Synthetic Student ${phone.name} ${RUN}`);
      await page.getByTestId("onboarding-country").tap();
      await page.getByRole("option", { name: /Lithuania/ }).first().tap();
      await expect(page.getByTestId("onboarding-student-fields")).toBeVisible();
      await page.getByTestId("onboarding-institution").fill(`Synthetic Phone College ${phone.name} ${RUN}`);
      await page.getByTestId("onboarding-submit").tap();
      await expect(page.getByTestId("learning-compass"), "the student home").toBeVisible({ timeout: 60_000 });
      await fitsTheScreen(page, "the learning compass");
      st.profileId = await userId(STUDENT);
      const [w] = sql<{ id: string }>(`select id from public.workers where profile_id = ${lit(st.profileId)}`);
      st.workerId = w!.id;
      const edu = sql<{ is_current: boolean }>(`select is_current from public.worker_education where profile_id = ${lit(st.profileId)}`);
      expect(edu.map((x) => x.is_current), "the study is stored, current").toEqual([true]);
      sessions.set(STUDENT, await ctx.storageState());
      await ctx.close();
    });
    test(`S-2 (${phone.name}). the compass opens the internship board, filtered`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, STUDENT);
      await page.goto(`${BASE}/en/dashboard/profile`);
      await page.getByTestId("compass-open-internships").first().tap();
      await page.waitForURL(/opportunityType=/, { timeout: 30_000 });
      await expect(page.getByRole("main").getByTestId("opportunities-list").or(page.getByRole("main").getByTestId("opportunities-filtered-empty")).first()).toBeVisible({ timeout: 60_000 });
      await fitsTheScreen(page, "the internship board");
      await done();
    });
    test(`S-3 (${phone.name}). the student applies to an open need (interest stored)`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, STUDENT);
      await page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
      const box = page.getByRole("main").locator(`li[id="opp-${st.needId}"]`).first().getByTestId(`interest-${st.needId}`);
      await tapUntil(box.getByTestId("interest-express"), box.getByTestId("interest-sent"));
      const rows = sql<{ status: string }>(`select status from public.demand_interest_signals where request_id = ${lit(st.needId)} and worker_id = ${lit(st.workerId)}`);
      expect(rows.map((r) => r.status)).toEqual(["interested"]);
      await done();
    });
    test(`S-4 (${phone.name}). the Living CV shows the study`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, STUDENT);
      await accountMenu(page, "account-menu-cv-link");
      await page.waitForURL(/\/en\/cv/, { timeout: 30_000 });
      await expect(page.getByTestId("cv-education-row").first(), "the study is on the CV").toBeVisible({ timeout: 30_000 });
      await fitsTheScreen(page, "the student's CV");
      await done();
    });
    test(`S-5 (${phone.name}). messages from the area sheet`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, STUDENT);
      await messagesBySheet(page, "the student");
      await done();
    });
  });

  // ── TRAINING INSTITUTION ──────────────────────────────────────────────────
  const SCHOOL = email(`school${phone.name}`);
  const t: { profileId: string; orgId: string } = { profileId: "", orgId: "" };
  test.describe(`training institution at ${phone.viewport.width} × ${phone.viewport.height}`, () => {
    test.describe.configure({ mode: "serial" });
    test(`T-1 (${phone.name}). an institution signs up ON THE PHONE through its door and sets up its organisation`, async ({ browser }) => {
      const { ctx, page } = await onPhone(browser, phone);
      const door = "/dashboard/start/company?capability=training_provider";
      await page.goto(`${BASE}/en/auth/signup?next=${encodeURIComponent(door)}`);
      await page.locator('input[type="email"]').fill(SCHOOL);
      await page.locator('input[name="password"]').fill(PASSWORD);
      await page.locator('input[name="confirm_password"]').fill(PASSWORD);
      await page.locator('form button[type="submit"]').tap();
      await page.waitForURL(/\/en\/onboarding/, { timeout: 60_000 });
      const intent = page.getByTestId("onboarding-intent-education");
      if ((await intent.getAttribute("aria-pressed")) !== "true") await intent.tap();
      await page.getByTestId("onboarding-intents-continue").tap();
      await page.getByTestId("onboarding-display-name").fill(`Synthetic Lecturer ${phone.name} ${RUN}`);
      await page.getByTestId("onboarding-country").tap();
      await page.getByRole("option", { name: /Lithuania/ }).first().tap();
      await page.getByTestId("onboarding-submit").tap();
      await page.waitForURL(/\/en\/dashboard\/start\/company/, { timeout: 60_000 });
      await expect(page.getByTestId("company-setup-form")).toBeVisible({ timeout: 30_000 });
      await fitsTheScreen(page, "the organisation setup form");
      await page.getByTestId("company-setup-legal-name").fill(`Synthetic Phone Academy ${phone.name} ${RUN}`);
      await page.getByTestId("company-setup-country").selectOption("LT");
      await page.getByTestId("company-setup-save-draft").tap();
      await expect(page.getByTestId("company-setup-next")).toBeVisible({ timeout: 30_000 });
      t.profileId = await userId(SCHOOL);
      const orgs = sql<{ id: string }>(`select id from public.organizations where owner_profile_id = ${lit(t.profileId)}`);
      expect(orgs, "the institution's organisation is stored once").toHaveLength(1);
      t.orgId = orgs[0]!.id;
      sessions.set(SCHOOL, await ctx.storageState());
      await ctx.close();
    });
    test(`T-2 (${phone.name}). the education home opens on the phone`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, SCHOOL);
      // No header or area-sheet door leads here (only the setup form and chat): reached by address.
      test.info().annotations.push({ type: "education-home-door", description: "no header or area-sheet entry; reached by address" });
      await page.goto(`${BASE}/en/dashboard/company/education`);
      await expect(page.getByTestId("company-education")).toBeVisible({ timeout: 30_000 });
      await fitsTheScreen(page, "the education home");
      await done();
    });
    test(`T-3 (${phone.name}). the institution invites a learner by link`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, SCHOOL);
      await page.goto(`${BASE}/en/dashboard/company/education`);
      await page.getByTestId("institution-learners-invite").tap();
      await page.waitForURL(/\/dashboard\/network/, { timeout: 30_000 });
      const open = page.getByTestId("invite-panel-open");
      const capacity = page.getByTestId("invite-capacity");
      await expect(open.or(capacity).first()).toBeVisible({ timeout: 30_000 });
      if (await open.isVisible().catch(() => false)) await open.tap();
      await expect(capacity, "the learner capacity").toHaveValue("student", { timeout: 30_000 });
      const linkMode = page.getByTestId("invite-mode-link");
      if (await linkMode.isVisible().catch(() => false)) await linkMode.tap();
      const name = page.getByTestId("invite-name");
      if (await name.isVisible().catch(() => false)) await name.fill(`Synthetic Learner ${phone.name} ${RUN}`);
      await page.getByTestId("invite-submit").tap();
      await expect(page.getByTestId("invite-copy-link").first(), "the learner's link is handed over").toBeVisible({ timeout: 30_000 });
      await fitsTheScreen(page, "the learner invitation");
      const rows = sql<{ status: string }>(`select status from public.invitations where organization_id = ${lit(t.orgId)}`);
      expect(rows.length, "the invitation is stored").toBeGreaterThan(0);
      await done();
    });
    test(`T-4 (${phone.name}). organisation management: the people page from the sheet, its members in the fold`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, SCHOOL);
      await sheetTo(page, "area:people");
      await page.waitForURL(/\/en\/dashboard\/company\/people/, { timeout: 30_000 });
      const fold = page.getByTestId("people-more");
      await expect(fold).toBeAttached({ timeout: 30_000 });
      if ((await fold.getAttribute("open")) === null) await fold.locator("summary").first().tap();
      await expect(page.locator("#org-members"), "the members panel").toBeVisible({ timeout: 30_000 });
      await fitsTheScreen(page, "the institution's people page");
      await done();
    });
    test(`T-5 (${phone.name}). messages from the area sheet`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, SCHOOL);
      await messagesBySheet(page, "the institution");
      await done();
    });
  });

}
