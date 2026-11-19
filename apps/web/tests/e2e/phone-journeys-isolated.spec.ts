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
  sqlExec,
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
 *   M-7 JOURNAL  opens the work journal; it fits the phone, also with its disclosures open.
 *   M-8 FIRST    records a first entry from the home's one action; the saved state links the CV;
 *                back on the journal, the CV bridge leads the records: the CV is one tap away.
 *
 * M-2 runs LAST in each group (first run 2026-11-14: the CV page stopped answering at 375 px), so a
 * CV fault cannot hide search, applying and messages; if it stops answering again, the step says
 * whether the same CV answers at a desktop width.
 *
 * THE FOUR OTHER GROUPS (owner P0, evening 2026-11-14: "visoms 5 grupėms"), each at both widths and
 * each its own serial group, so one role's failure hides no other:
 *   E EMPLOYER     the area sheet to needs; the need form sent on the phone; candidate search for it;
 *                  the people page and a join-by-link invitation; messages. The candidate search's
 *                  chips, filters and next steps are thumb-sized (44 px) and its result is reachable.
 *   A AGENCY       the area sheet to clients; the roster invite on the people page; a need posted on
 *                  the phone; messages; the Lithuanian clients page with a connected client.
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

/** A control a thumb can hit: at least 44 px tall (ui/Chip, buttonLinkClassName). */
async function thumbSized(target: Locator, where: string): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  expect(box, `${where} is on the page`).not.toBeNull();
  expect(box!.height, `${where} is ${box!.height} px tall`).toBeGreaterThanOrEqual(43.5);
}

/** The candidate search's own parts on a phone: the chosen need, the filters, a way onward. */
async function candidateSearchOnPhone(page: Page, needId: string, where: string): Promise<void> {
  const main = page.getByRole("main");
  const chosen = main.locator(`a[aria-current="page"][href*="request=${needId}"]`);
  await expect(chosen, `${where}: the need is the chosen chip`).toBeVisible({ timeout: 30_000 });
  await thumbSized(chosen, `${where}: the chosen need chip`);
  await thumbSized(main.getByTestId("scouting-how").locator("summary"), `${where}: the how-it-works row`);
  // Filters, when the need has any: every chip is thumb-sized and the row never widens the page
  // (on a phone it scrolls sideways inside itself).
  const filters = main.getByTestId("scouting-filters");
  if (await filters.isVisible().catch(() => false)) {
    const chips = filters.locator("a[href]");
    for (let i = 0; i < (await chips.count()); i += 1) await thumbSized(chips.nth(i), `${where}: filter ${i + 1}`);
    const row = await filters.boundingBox();
    expect(row!.x + row!.width, `${where}: the filters stay inside the screen`).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
  // Round 2: the card's status pills (verdict, evidence, readiness) and, when an
  // agency offered people, that section on ui/Card stay inside the screen.
  for (const sel of ['[data-testid^="scout-verdict-"]', '[data-testid^="scout-readiness-"]', '[data-testid="scouting-agency-offers"]']) {
    const part = main.locator(sel).first();
    if (!(await part.isVisible().catch(() => false))) continue;
    const box = await part.boundingBox();
    expect(box!.x + box!.width, `${where}: ${sel} stays inside the screen`).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
  // The result is reachable below: candidates, or the empty list with its door onward.
  const outcome = main
    .getByTestId("scouting-results")
    .or(main.getByTestId("scouting-empty"))
    .or(main.getByTestId("scouting-not-structured"));
  await outcome.first().scrollIntoViewIfNeeded();
  await expect(outcome.first(), `${where}: the result is reachable`).toBeVisible();
  const door = main.getByTestId("scouting-empty-edit-need");
  if (await door.isVisible().catch(() => false)) await thumbSized(door, `${where}: the empty list's door`);
  const next = main.locator('[data-testid^="scout-pipeline-next-"]');
  if ((await next.count()) > 0) await thumbSized(next.first(), `${where}: a candidate's next step`);
  await fitsTheScreen(page, `${where}, scrolled to the result`);
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
  // No stated duration: this walk is about the path, not the hours review (doctrine §7).
  const firstEntry = `QA-SYNTHETIC first entry ${phone.name} ${RUN}: tiled the bathroom floor`;
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
    test(`M-6 (${phone.name}). booking: the worker says they are available, the company proposes a start from its need's hand-raisers, the worker accepts`, async ({ browser }) => {
      // The schedule gate (canStartCommunicationOrBooking): a booking is offered only for a worker
      // who is available or has a start date, or a need with a start date. The need form asks for
      // urgency, not a date, so the worker states their availability on the work card first.
      // Employers find a person only with that person's own consent (owner rule 2026-10-18:
      // interest and messaging are never consent): without it the hand-raiser is a count, not a
      // candidate. A structured need pins every hand-raiser into its candidates whatever the
      // match, so the worker turns on employer visibility, on their privacy page, as
      // skills-chain's newDiscoverableWorker does.
      const w = await signedInOnPhone(browser, phone, worker);
      await w.page.goto(`${BASE}/en/dashboard/privacy#visibility`);
      const vis = w.page.getByRole("main").getByTestId("privacy-visibility");
      await expect(vis, "the visibility choice is on the privacy page").toBeVisible({ timeout: 60_000 });
      await tapUntil(vis.getByTestId("discoverability-open"), vis.getByTestId("discoverability-grant"));
      await vis.getByTestId("discoverability-grant").tap();
      await expect(vis.getByTestId("discoverability-granted"), "employers may now find them").toBeVisible({ timeout: 30_000 });
      await w.page.goto(`${BASE}/en/dashboard/profile#work-card-editor-section`);
      const toggle = w.page.getByRole("main").getByTestId("work-card-editor-toggle");
      await expect(toggle, "the work card editor is offered on the worker's profile").toBeVisible({ timeout: 60_000 });
      const editor = w.page.getByRole("main").getByTestId("work-card-editor");
      await tapUntil(toggle, editor);
      await editor.locator('select[name="availability_status"]').selectOption("available");
      await editor.getByTestId("work-card-save").tap();
      await expect(w.page.getByTestId("work-card-saved"), "availability is saved").toBeVisible({ timeout: 30_000 });
      expect(
        sql<{ a: string | null }>(`select availability_status as a from public.workers where id = ${lit(s.workerId)}`)[0]?.a,
      ).toBe("available");
      await w.done();

      // The company opens its need's candidates and proposes a start date to the hand-raiser.
      const c = await signedInOnPhone(browser, phone, COMPANY);
      await c.page.goto(`${BASE}/en/dashboard/company/scouting?request=${shared.needId}`);
      const cand = c.page.getByRole("main").getByTestId(`scout-candidate-${s.workerId}`);
      await expect(cand, "the worker who raised a hand is among the need's candidates").toBeVisible({ timeout: 60_000 });
      await expect(cand.getByTestId(`scout-interest-${s.workerId}`), "marked as interested").toBeVisible();
      const open = cand.getByTestId("propose-booking-open");
      await expect(open, "the company can propose a booking to them").toBeVisible({ timeout: 30_000 });
      // The shortlist statuses are the shared toggle chip: a thumb can hit each one (44 px).
      const statuses = cand.getByTestId(`scout-shortlist-${s.workerId}`).locator("button[aria-pressed]");
      for (let i = 0; i < (await statuses.count()); i += 1) {
        const box = await statuses.nth(i).boundingBox();
        expect(box?.height ?? 0, `shortlist status ${i + 1} is thumb-sized`).toBeGreaterThanOrEqual(43.5);
      }
      await fitsTheScreen(c.page, "the need's candidates");
      await candidateSearchOnPhone(c.page, shared.needId, "the need's candidates");
      await tapUntil(open, cand.getByTestId("propose-booking-form"));
      const start = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
      await cand.getByTestId("propose-booking-start-date").fill(start);
      await cand.getByTestId("propose-booking-send").tap();
      await expect(cand.getByTestId("propose-booking-sent"), "the proposal is sent").toBeVisible({ timeout: 30_000 });
      await c.done();
      const rows = () =>
        sql<{ id: string; status: string }>(
          `select id, status from public.booking_requests where request_id = ${lit(shared.needId)} and worker_id = ${lit(s.workerId)}`,
        );
      await expect.poll(() => rows().map((r) => r.status), { message: "one booking, proposed", timeout: 30_000 }).toEqual(["proposed"]);
      const bookingId = rows()[0]!.id;

      // The worker accepts it from their bookings.
      const w2 = await signedInOnPhone(browser, phone, worker);
      await w2.page.goto(`${BASE}/en/dashboard/bookings`);
      const card = w2.page.getByRole("main").getByTestId(`booking-${bookingId}`);
      await expect(card, "the proposal reaches the worker").toBeVisible({ timeout: 60_000 });
      await fitsTheScreen(w2.page, "the worker's bookings");
      await tapUntil(card.getByTestId("booking-accept-open"), card.getByTestId("booking-accept-confirm"));
      await card.getByTestId("booking-accept-confirm").tap();
      await expect.poll(() => rows().map((r) => r.status), { message: "the booking is accepted", timeout: 30_000 }).toEqual(["accepted"]);
      await w2.done();
    });
    test(`M-7 (${phone.name}). the worker's work journal fits the phone`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, worker);
      await page.goto(`${BASE}/en/dashboard/journal`);
      const main = page.getByRole("main");
      await expect(main.getByTestId("journal-entries"), "the journal's records open").toBeVisible({ timeout: 30_000 });
      await expect(main.getByTestId("journal-quick-record-text"), "quick recording is on the page").toBeVisible({ timeout: 30_000 });
      await fitsTheScreen(page, "the work journal");
      // The two disclosures on the page open in place and still fit.
      for (const id of ["journal-status-details", "mano-cv-player-card-lead"]) {
        const fold = main.getByTestId(id);
        if (!(await fold.isVisible().catch(() => false))) continue;
        await fold.locator("summary").first().tap();
        await expect(fold).toHaveAttribute("open", "");
      }
      await fitsTheScreen(page, "the work journal with its disclosures open");
      await done();
    });
    test(`M-8 (${phone.name}). the worker's first entry, from the home's one action to the Living CV, and the CV one tap from the journal`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, worker);
      // The home's ONE gold action for a worker with no recorded work opens the journal.
      const cta = page.locator('[data-testid="today-next-cta"]:visible');
      await expect(cta, "the home's one action").toHaveAttribute("href", /\/dashboard\/journal$/, { timeout: 60_000 });
      // UX gap W-1: a healthy new account never shows the "could not be read"
      // notice; a read that fails is named by the job's W-1 log step.
      const unknownOpen = page.getByRole("main").getByTestId("today-open-unknown");
      if ((await unknownOpen.count()) > 0) {
        const holder = page.getByRole("main").locator("[data-doors-unknown], [data-journal-unknown]").first();
        console.log(
          `[W-1] unknown: journal=${await holder.getAttribute("data-journal-unknown")} doors=${await holder.getAttribute("data-doors-unknown")}`,
        );
      }
      await expect(unknownOpen, "the open items are read").toHaveCount(0);
      // This worker signed up with a password and has not proven the mailbox:
      // the home offers the network page's own proof prompt, not a fault.
      await expect(
        page.getByRole("main").getByTestId("home-mailbox-proof").filter({ visible: true }).first(),
        "the mailbox proof is offered",
      ).toBeVisible();
      await cta.tap();
      await page.waitForURL(/\/en\/dashboard\/journal/, { timeout: 30_000 });
      const main = page.getByRole("main");
      await main.getByTestId("journal-quick-record-text").fill(firstEntry);
      await tapUntil(main.getByTestId("journal-quick-record-understand"), main.getByTestId("worklog-flow"));
      // Only when the M-6 booking left this worker more than one work context or a project to name.
      if (await main.getByTestId("worklog-context-must-choose").isVisible().catch(() => false)) {
        await main.getByTestId("worklog-context").selectOption({ index: 1 });
      }
      if (await main.getByTestId("worklog-project-must-choose").isVisible().catch(() => false)) {
        await main.getByTestId("worklog-project").selectOption("none");
      }
      await main.getByTestId("worklog-save").tap();
      await main.getByTestId("worklog-confirm").tap();
      await expect(main.getByTestId("worklog-done"), "the entry is saved").toBeVisible({ timeout: 60_000 });
      await expect(main.getByTestId("worklog-living-cv-link"), "the saved state leads to the CV").toBeVisible();
      const stored = sql<{ n: number }>(
        `select count(*)::int as n from public.journal_entries e join public.workers w on w.id = e.worker_id
          where w.profile_id = ${lit(s.profileId)} and e.superseded_by is null`,
      );
      expect(stored[0]?.n, "one live entry is stored").toBe(1);

      // A later visit (a manager's decision notification lands here): with an entry, the CV bridge
      // leads the records, so the CV is ONE tap away — the status disclosure stays closed.
      await page.goto(`${BASE}/en/dashboard/journal`);
      const bridge = main.getByTestId("journal-cv-bridge");
      await expect(bridge, "the CV bridge leads the records").toBeVisible({ timeout: 30_000 });
      await expect(main.getByTestId("journal-status-details")).not.toHaveAttribute("open", "");
      await fitsTheScreen(page, "the work journal with the CV bridge");
      await bridge.getByTestId("journal-cv-bridge-link").tap();
      await page.waitForURL(/\/en\/cv/, { timeout: 30_000 });
      await expect(page.getByRole("main").getByTestId("cv-summary").first(), "the CV counts the entry").toBeVisible({ timeout: 30_000 });
      await done();
    });
    // UX gaps W-2 to W-6 (docs/ux/UX_GAPS_2026-11-18.md): the worker's journal and profile controls
    // are at least 44 px where the walk measured them smaller, and the read-back card opens in view.
    // Its own test (not inside M-6/M-8), after M-8 so the worker has a saved entry.
    test(`W-2..W-6 (${phone.name}). the worker's journal and profile controls are 44 px and the read-back opens in view`, async ({ browser }) => {
      const { page, done } = await signedInOnPhone(browser, phone, worker);
      const TAP = 44 - 0.5; // sub-pixel rounding at device scale 2 and 3
      const size = async (target: Locator, what: string, axis: "height" | "width" | "both" = "height") => {
        await target.scrollIntoViewIfNeeded();
        const box = await target.boundingBox();
        expect(box, `${what} is laid out`).not.toBeNull();
        if (axis !== "width") expect(box!.height, `${what} is ${box!.height} px high`).toBeGreaterThanOrEqual(TAP);
        if (axis !== "height") expect(box!.width, `${what} is ${box!.width} px wide`).toBeGreaterThanOrEqual(TAP);
      };

      await page.goto(`${BASE}/en/dashboard/journal`);
      const main = page.getByRole("main");
      await expect(main.getByTestId("journal-quick-record-text")).toBeVisible({ timeout: 30_000 });

      // W-3: the links that get an entry confirmed (present when the entry's state offers them).
      for (const link of [main.locator('[data-testid^="journal-entry-identify-verifier-"]'), main.getByTestId("evidence-awaiting-review-link")]) {
        if ((await link.count()) > 0 && (await link.first().isVisible())) await size(link.first(), "the confirmation link");
      }
      // W-5: readiness steps and the hours export links.
      const steps = main.locator('[data-testid^="readiness-step-"]');
      for (let i = 0; i < (await steps.count()); i += 1) {
        if (await steps.nth(i).isVisible()) await size(steps.nth(i), `readiness step ${i + 1}`);
      }
      for (const period of ["week", "month"]) {
        const exp = main.getByTestId(`journal-hours-export-${period}`);
        if (await exp.isVisible().catch(() => false)) await size(exp, `the ${period} export link`, "both");
      }

      // W-2 + W-4: the read-back opens with its top in view; its photo, date and site fields are 44 px.
      await main.getByTestId("journal-quick-record-text").fill(`QA-SYNTHETIC read-back ${phone.name} ${RUN}: grouted the hallway, 3 hours`);
      await tapUntil(main.getByTestId("journal-quick-record-understand"), main.getByTestId("worklog-flow"));
      await expect
        .poll(async () => {
          const box = await main.getByTestId("worklog-flow").boundingBox();
          return box !== null && box.y >= -1 && box.y < phone.viewport.height / 3;
        }, { message: "the read-back card opens at the top of the screen", timeout: 10_000 })
        .toBe(true);
      await size(main.getByTestId("worklog-photo-input"), "the photo picker");
      await size(main.getByTestId("worklog-date"), "the date field");
      await size(main.getByTestId("worklog-site"), "the site field");
      await fitsTheScreen(page, "the journal with the read-back open");

      // W-6: the profile's "current job" row and the licence toggles.
      // The experience form lives in the capabilities section, which the profile
      // opens only when the address names it (DetailsHashOpener; the
      // production walk P-7 opens it the same way).
      await page.goto(`${BASE}/en/dashboard/profile#capabilities`);
      const profile = page.getByRole("main");
      await expect(profile.locator("details#capabilities").first(), "the capabilities section is open").toHaveAttribute("open", "", {
        timeout: 30_000,
      });
      const openExp = profile.getByTestId("add-experience-open").filter({ visible: true }).first();
      await openExp.scrollIntoViewIfNeeded();
      await tapUntil(openExp, profile.getByTestId("add-experience-current"));
      // `has` is matched INSIDE each label, so the inner locator is the bare test id.
      await size(
        profile.locator("label", { has: page.getByTestId("add-experience-current") }).filter({ visible: true }).first(),
        "the current-job row",
      );
      // The licence toggles are in the CV-details section, opened the same way.
      await page.goto(`${BASE}/en/dashboard/profile#cv-details`);
      await expect(profile.locator("details#cv-details").first(), "the CV-details section is open").toHaveAttribute("open", "", {
        timeout: 30_000,
      });
      const licences = profile
        .locator('[data-testid^="prefs-licence-"]:not([data-testid="prefs-licence-categories"])')
        .filter({ visible: true });
      await expect.poll(() => licences.count(), { message: "the licence toggles render", timeout: 30_000 }).toBeGreaterThan(0);
      for (let i = 0; i < (await licences.count()); i += 1) await size(licences.nth(i), `licence toggle ${i + 1}`, "both");
      await fitsTheScreen(page, "the profile with the experience form open");
      await done();
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
      await candidateSearchOnPhone(page, e.needId, "the employer's candidate search");
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
      const rostered = email(`rostered${phone.name}`);
      await main.getByTestId("company-workers-invite-email").fill(rostered);
      await main.getByTestId("company-workers-invite-submit").tap();
      const result = main.getByTestId("company-workers-invite-result");
      await expect(result, "the roster invitation is answered").toBeVisible({ timeout: 30_000 });
      // The result shows for refusals too (not_owner, needs_migration, errors): only the stored row
      // and the success state prove an invitation was made (Codex P2).
      test.info().annotations.push({ type: "roster-invite-outcome", description: (await result.innerText()).slice(0, 160) });
      await expect(result, "the outcome is the success state").toHaveClass(/state-success/);
      const stored = sql<{ status: string }>(
        `select i.status from public.company_worker_invitations i join public.organizations o on o.legacy_company_id = i.company_id where o.id = ${lit(a.orgId)} and lower(i.invited_email) = lower(${lit(rostered)})`,
      );
      expect(stored.map((r) => r.status), "one pending roster invitation for that address").toEqual(["pending"]);
      // UX gaps 2026-11-18, A-3: the success state hands over a link to send the invitee.
      await expect(main.getByTestId("company-workers-invite-link"), "the invitation offers a link to send").toBeVisible();
      await expect(main.getByTestId("company-workers-invite-copy-link")).toBeVisible();
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
    test(`A-6 (${phone.name}). the organisation is recorded as a staffing agency`, async () => {
      // The organisation is bound to its company record (agency-roles-isolated A-1 reads it the same
      // way). NEVER alias a column `t` here: sql() wraps the query as `json_agg(t) from (…) t`, and a
      // column named t is aggregated instead of the row (two runs read undefined that way; the agency
      // was created correctly). The failure message names what the rows hold.
      const facts = () =>
        sql<{ organization_type: string | null; legacy_company_id: string | null; via_legacy: string | null; by_owner: string | null }>(
          `select o.organization_type, o.legacy_company_id,
                  (select c.company_type from public.companies c where c.id = o.legacy_company_id) as via_legacy,
                  (select string_agg(coalesce(c.company_type, 'null'), ',') from public.companies c where c.profile_id = o.owner_profile_id) as by_owner
             from public.organizations o where o.id = ${lit(a.orgId)}`,
        )[0];
      await expect
        .poll(() => facts()?.via_legacy ?? null, { message: `an agency, not a hiring company; rows: ${JSON.stringify(facts())}`, timeout: 15_000 })
        .toBe("staffing_agency");
    });
    test(`A-7 (${phone.name}). with a connected client, the Lithuanian clients page still fits the phone`, async ({ browser }) => {
      // Production ux-metrics walk (run 43691077388, build b5795ab7): /lt partners as an agency
      // ran 25 px past a 390 px screen. The draft-a-need form only renders for an ACTIVE client
      // connection, and its country <select> was as wide as its longest Lithuanian option
      // ("Ypatingasis Administracinis Kinijos Regionas Honkongas"). A-2 has no client, so it
      // never drew that form. Setup (not the walk): a client company at a desktop, and the
      // connection recorded active on the local database.
      const client = email(`agencyclient${phone.name}`);
      const c = await newOrganisation(browser, client, "hire", `Synthetic Client Owner ${phone.name} ${RUN}`, `Synthetic Client Co ${phone.name} ${RUN}`);
      sqlExec(
        `insert into public.agency_client_connections (agency_company_id, client_company_id, invited_email, status, invited_by, accepted_by, accepted_at)
         select ag.legacy_company_id, cl.legacy_company_id, ${lit(client)}, 'active', ${lit(a.profileId)}, ${lit(c.profileId)}, now()
           from public.organizations ag, public.organizations cl
          where ag.id = ${lit(a.orgId)} and cl.id = ${lit(c.orgId)}`,
      );
      expect(
        sql<{ id: string }>(`select x.id from public.agency_client_connections x join public.organizations o on o.legacy_company_id = x.agency_company_id where o.id = ${lit(a.orgId)} and x.status = 'active'`),
        "one active client connection is stored",
      ).toHaveLength(1);
      const { page, done } = await signedInOnPhone(browser, phone, AGENCY);
      await page.goto(`${BASE}/lt/dashboard/company/partners`);
      await expect(page.getByRole("main").getByTestId("agency-draft-need-form"), "the draft-a-need form is drawn for the client").toBeVisible({ timeout: 30_000 });
      await fitsTheScreen(page, "the agency's clients in Lithuanian, with a client");
      // UX gaps 2026-11-18, A-5: the suite's app log carried a minified React client error on this
      // route with a connected client. The page must render without one, in both languages.
      const uncaught = () =>
        (heard.get(page) ?? []).filter((n) => n.startsWith("pageerror:") || /Minified React error|react\.dev\/errors/.test(n));
      expect(uncaught(), "the Lithuanian clients page raises no client error").toEqual([]);
      await page.goto(`${BASE}/en/dashboard/company/partners`);
      await expect(page.getByRole("main").getByTestId("agency-draft-need-form")).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      expect(uncaught(), "the English clients page raises no client error").toEqual([]);
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
      // demand-request-button builds its country list in the browser (country-options-server-only
      // lists it UNVERIFIED): the same cause as A-5's React #418 on /partners. The need form must
      // render without a client error, in Lithuanian and English.
      const clientErrors = () =>
        (heard.get(page) ?? []).filter((n) => n.startsWith("pageerror:") || /Minified React error|react\.dev\/errors/.test(n));
      await page.goto(`${BASE}/lt/dashboard/company/needs?audience=need#demand-intake`);
      await expect(page.getByRole("main").getByTestId("demand-role")).toBeVisible({ timeout: 60_000 });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      expect(clientErrors(), "the Lithuanian need form raises no client error").toEqual([]);
      await page.goto(`${BASE}/en/dashboard/company/needs?audience=need#demand-intake`);
      await expect(page.getByRole("main").getByTestId("demand-role")).toBeVisible({ timeout: 60_000 });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      expect(clientErrors(), "the English need form raises no client error").toEqual([]);
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
      // UX_GAPS I-4: one read-only line for the preset, link mode by default, 44 px fields.
      const preset = page.getByTestId("invite-preset");
      await expect(preset, "the learner capacity").toHaveAttribute("data-relationship", "student", { timeout: 30_000 });
      await expect(page.getByTestId("invite-capacity")).toHaveCount(0);
      await expect(page.getByTestId("invite-mode-link")).toHaveAttribute("aria-checked", "true");
      const nameBox = await page.getByTestId("invite-name").boundingBox();
      expect(nameBox?.height ?? 0, "the name field is a 44 px target").toBeGreaterThanOrEqual(44);
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
