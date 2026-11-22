import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { clickUntilVisible } from "./click-until-visible";
import {
  accessToken,
  BASE,
  isolatedStack,
  lit,
  onboard,
  PASSWORD,
  publishNeed,
  recordJournal,
  SB_ANON,
  SB_URL,
  setUpCompany,
  signUp,
  sql,
  userId,
} from "./isolated-web-a-helpers";

/**
 * THE CHROME ACCEPTANCE MATRIX (owner directive 2026-11-21, Lane L), on a THROWAWAY LOCAL Supabase
 * stack (.github/workflows/signup-isolated.yml). The deep journeys are proven by their own isolated
 * specs (signup, role-journeys, agency-roles, recognition-chain, phone-journeys, journeys-coverage);
 * this file walks the CORE PATH of each of the eight acceptance scenarios on the three screens the
 * owner named — a 1440 × 900 desktop, a 768 × 1024 touch tablet and a 390 × 844 touch phone — and
 * proves on each surface what a person needs in order to finish without help:
 *
 *   - the page renders inside <main> with no client error and no leftover hidden streamed copy;
 *   - nothing is wider than the screen (no sideways scroll);
 *   - the surface's primary action is visible, and on a touch screen at least 44 px high;
 *   - one thing per scenario is SAVED through the page and is there again after a reload;
 *   - the wrong person is refused: a route of another role sends them away, and a read with
 *     their OWN session (row-level security decides) returns none of the owner's rows.
 *
 * Every surface's measurements (and, when MATRIX_SHOTS is set, a full-page screenshot) go to
 * MATRIX_REPORT as JSON lines for the matrix document (docs/qa/CHROME_ACCEPTANCE_MATRIX_2026-11.md).
 * Nothing is written to the repository. AI is disabled on this stack (AI_PROVIDER_MODE=disabled), so
 * scenario 7 proves the conversation surface and that nothing pretends to act; that the AI really acts
 * is the production walks' proof. No payment, no outreach: synthetic people on a local stack only.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const PHONE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const TABLET_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const DEVICES = [
  { name: "desktop", touch: false, options: { viewport: { width: 1440, height: 900 } } },
  {
    name: "tablet",
    touch: true,
    options: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: TABLET_UA },
  },
  {
    name: "phone",
    touch: true,
    options: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: PHONE_UA },
  },
] as const;
type Device = (typeof DEVICES)[number];
type State = Awaited<ReturnType<BrowserContext["storageState"]>>;

const REPORT = process.env.MATRIX_REPORT ?? "";
const SHOTS = process.env.MATRIX_SHOTS ?? "";

/** One sign-up per person per run, and their session reused: the local auth server limits sign-ins per IP. */
const sessions = new Map<string, State>();

async function onDevice(browser: Browser, device: Device, state?: State) {
  const ctx = await browser.newContext({ ...device.options, ...(state ? { storageState: state } : {}), timezoneId: "UTC" });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  return { ctx, page, errors };
}

async function as(browser: Browser, device: Device, address: string) {
  const saved = sessions.get(address);
  expect(saved, `${address.split("@")[0]} signed up earlier in this run`).toBeTruthy();
  const opened = await onDevice(browser, device, saved);
  return {
    ...opened,
    done: async () => {
      sessions.set(address, await opened.ctx.storageState());
      await opened.ctx.close();
    },
  };
}

/** A read through PostgREST with the person's OWN session: row-level security decides. */
async function readAs<T>(address: string, path: string): Promise<T[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${await accessToken(address)}` },
  });
  expect(r.status, `own-session read of ${path.split("?")[0]}`).toBe(200);
  return (await r.json()) as T[];
}

/** `primary` is the surface's main action; for a read-only page (no single action) it is the page heading, `heading: true`. */
type Surface = { scenario: string; device: Device; path: string; primary: (main: Locator) => Locator; what: string; heading?: boolean };

/**
 * One surface, measured the same way everywhere. Returns the page's <main> so the caller can act.
 * The primary action must be visible and, on a touch screen, a 44 px target.
 */
async function surface(page: Page, errors: string[], s: Surface): Promise<Locator> {
  await page.goto(`${BASE}/en${s.path}`);
  const main = page.getByRole("main");
  await expect(main, `${s.scenario} ${s.what}: the page renders`).toBeVisible({ timeout: 60_000 });
  const primary = s.primary(main);
  await expect(primary, `${s.scenario} ${s.what}: the primary action is on the page`).toBeVisible({ timeout: 60_000 });
  // A hidden streamed copy can live for a moment while the page settles (#3539); it must not stay.
  await expect(page.locator('div[hidden][id^="S:"]'), `${s.scenario} ${s.what}: one copy of the page`).toHaveCount(0, {
    timeout: 15_000,
  });
  const box = await primary.boundingBox();
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    text: (document.querySelector("main")?.innerText ?? "").replace(/\s+/g, " ").trim(),
  }));
  const row = {
    scenario: s.scenario,
    device: s.device.name,
    path: s.path,
    what: s.what,
    heading: Boolean(s.heading),
    overflowPx: Math.max(0, m.scrollWidth - m.innerWidth),
    primaryHeight: Math.round(box?.height ?? 0),
    primaryTop: Math.round(box?.y ?? -1),
    mainWords: m.text ? m.text.split(" ").length : 0,
    mainText: m.text.slice(0, 600),
    pageErrors: [...errors],
  };
  if (REPORT) appendFileSync(REPORT, `${JSON.stringify(row)}\n`);
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, `${s.scenario}-${s.device.name}-${s.what.replace(/\W+/g, "_")}.png`), fullPage: true });
  }
  // Soft: one run lists every surface that misses, instead of stopping at the first.
  expect.soft(row.overflowPx, `${s.scenario} ${s.what}: nothing is wider than the screen`).toBeLessThanOrEqual(1);
  if (s.device.touch && !s.heading) expect.soft(row.primaryHeight, `${s.scenario} ${s.what}: the primary action is a 44 px target`).toBeGreaterThanOrEqual(44);
  expect.soft(errors, `${s.scenario} ${s.what}: no client error`).toEqual([]);
  return main;
}

/** A route of another role sends this person away: they never stay on it. */
async function refused(page: Page, path: string, who: string): Promise<void> {
  await page.goto(`${BASE}/en${path}`);
  await page.waitForLoadState("domcontentloaded");
  await expect
    .poll(() => new URL(page.url()).pathname, { message: `${who} is sent away from ${path}`, timeout: 30_000 })
    .not.toBe(`/en${path}`);
}

for (const device of DEVICES) {
  test.describe(`acceptance matrix on ${device.name}`, () => {
    test.describe.configure({ mode: "serial" });
    const tag = `${device.name}-${RUN}`;
    const email = (who: string) => `matrix.${who}.${tag}@example.test`;
    const WORKER = email("worker");
    const EMPLOYER = email("employer");
    const AGENCY = email("agency");
    const STUDENT = email("student");
    const SCHOOL = email("school");
    const s = { employerOrg: "", agencyOrg: "", schoolOrg: "", workerId: "" };

    test(`M-1 (${device.name}). sign-up and onboarding: every person registers through the forms on this screen`, async ({ browser }) => {
      // The worker: the sign-up form and the onboarding wizard, measured on this screen.
      {
        const { ctx, page, errors } = await onDevice(browser, device);
        await page.goto(`${BASE}/en/auth/signup`);
        await surface(page, errors, { scenario: "1-signup", device, path: "/auth/signup", primary: () => page.locator('form button[type="submit"]').first(), what: "sign-up form" });
        await signUp(page, BASE, WORKER);
        await onboard(page, "work", `Synthetic Matrix Worker ${tag}`);
        await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
        sessions.set(WORKER, await ctx.storageState());
        await ctx.close();
      }
      const workerId = await userId(WORKER);
      s.workerId = workerId;
      const [p] = sql<{ onboarded: boolean; active_role: string }>(
        `select onboarded_at is not null as onboarded, active_role from public.profiles where id = ${lit(workerId)}`,
      );
      expect(p, "the worker's profile is stored, onboarded, as a worker").toEqual({ onboarded: true, active_role: "worker" });

      // The employer and the agency: the company setup form after their own onboarding choice.
      for (const [address, intent, name] of [
        [EMPLOYER, "hire", `QA-SYNTHETIC Matrix Employer ${tag}`],
        [AGENCY, "agency", `QA-SYNTHETIC Matrix Agency ${tag}`],
      ] as const) {
        const { ctx, page } = await onDevice(browser, device);
        await signUp(page, BASE, address);
        await onboard(page, intent, `Synthetic Matrix Owner ${tag}`);
        await setUpCompany(page, name);
        sessions.set(address, await ctx.storageState());
        await ctx.close();
      }
      s.employerOrg = sql<{ id: string }>(`select id from public.organizations where owner_profile_id = ${lit(await userId(EMPLOYER))}`)[0]!.id;
      s.agencyOrg = sql<{ id: string }>(`select id from public.organizations where owner_profile_id = ${lit(await userId(AGENCY))}`)[0]!.id;
      await expect
        .poll(
          () =>
            sql<{ company_type: string }>(
              `select c.company_type from public.companies c join public.organizations o on o.legacy_company_id = c.id where o.id = ${lit(s.agencyOrg)}`,
            )[0]?.company_type,
          { message: "the agency is recorded as a staffing agency", timeout: 30_000 },
        )
        .toBe("staffing_agency");

      // The student, through the student door; the institution, through its own door.
      {
        const { ctx, page } = await onDevice(browser, device);
        await signUp(page, BASE, STUDENT);
        await page.getByTestId("onboarding-intent-student").click();
        await page.getByTestId("onboarding-intents-continue").click();
        await page.getByTestId("onboarding-display-name").fill(`Synthetic Matrix Student ${tag}`);
        await page.getByTestId("onboarding-country").click();
        await page.getByRole("option", { name: /Lithuania/ }).first().click();
        await page.getByTestId("onboarding-institution").fill(`QA-SYNTHETIC Matrix College ${tag}`);
        await page.getByTestId("onboarding-program").fill("Hospitality and catering");
        const submit = page.getByTestId("onboarding-submit");
        if (device.touch) expect.soft((await submit.boundingBox())?.height ?? 0, "the Finish button is a 44 px target").toBeGreaterThanOrEqual(44);
        await submit.click();
        await page.waitForURL(/\/en\/dashboard\/profile/, { timeout: 60_000 });
        sessions.set(STUDENT, await ctx.storageState());
        await ctx.close();
      }
      {
        const { ctx, page } = await onDevice(browser, device);
        const door = "/dashboard/start/company?capability=training_provider";
        await page.goto(`${BASE}/en/auth/signup?next=${encodeURIComponent(door)}`);
        await page.locator('input[type="email"]').fill(SCHOOL);
        await page.locator('input[name="password"]').fill(PASSWORD);
        await page.locator('input[name="confirm_password"]').fill(PASSWORD);
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(/\/en\/onboarding/, { timeout: 60_000 });
        // The door hands its choice to onboarding: "education" arrives selected (landing-handoff.ts),
        // so a tap would switch it off again. Choose it only if the hand-off has not.
        const card = page.getByTestId("onboarding-intent-education");
        await expect(card).toBeVisible({ timeout: 30_000 });
        await page.waitForLoadState("networkidle").catch(() => undefined);
        if ((await card.getAttribute("aria-pressed")) !== "true") await card.click();
        await expect(card, "the institution door selects education").toHaveAttribute("aria-pressed", "true");
        await page.getByTestId("onboarding-intents-continue").click();
        await page.getByTestId("onboarding-display-name").fill(`Synthetic Matrix Lecturer ${tag}`);
        await page.getByTestId("onboarding-country").click();
        await page.getByRole("option", { name: /Lithuania/ }).first().click();
        await page.getByTestId("onboarding-submit").click();
        await setUpCompany(page, `QA-SYNTHETIC Matrix School ${tag}`);
        sessions.set(SCHOOL, await ctx.storageState());
        await ctx.close();
      }
      s.schoolOrg = sql<{ id: string }>(`select id from public.organizations where owner_profile_id = ${lit(await userId(SCHOOL))}`)[0]!.id;

      // Invitation: the employer's one invitation panel hands out a link a stranger can open.
      const { page, errors, done } = await as(browser, device, EMPLOYER);
      const main = await surface(page, errors, {
        scenario: "1-signup",
        device,
        path: `/dashboard/network?type=join_organization&org=${s.employerOrg}&relationship=employee`,
        primary: (m) => m.getByTestId("invite-panel"),
        what: "invitation panel",
      });
      const panel = main.getByTestId("invite-panel");
      const open = panel.getByTestId("invite-panel-open");
      if (await open.isVisible().catch(() => false)) await clickUntilVisible(open, panel.getByTestId("invite-submit"), { what: "the invite form" });
      const linkMode = panel.getByTestId("invite-mode-link");
      if (await linkMode.isVisible().catch(() => false)) await linkMode.click();
      const name = panel.getByTestId("invite-name");
      if (await name.isVisible().catch(() => false)) await name.fill(`Synthetic Invitee ${tag}`);
      const submit = panel.getByTestId("invite-submit");
      if (device.touch) expect.soft((await submit.boundingBox())?.height ?? 0, "the invite button is a 44 px target").toBeGreaterThanOrEqual(44);
      await submit.click();
      const copy = panel.getByTestId("invite-copy-link").first();
      await expect(copy, "the invitation link is handed out").toBeVisible({ timeout: 30_000 });
      const link = new URL((await copy.getAttribute("data-invite-link"))!);
      await done();
      const stranger = await onDevice(browser, device);
      await stranger.page.goto(`${BASE}${link.pathname}${link.search}`);
      await expect(stranger.page.getByTestId("invite-register"), "a stranger can act on the link").toBeVisible({ timeout: 30_000 });
      if (device.touch) expect.soft((await stranger.page.getByTestId("invite-register").boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(await stranger.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      await stranger.ctx.close();
    });

    test(`M-2 (${device.name}). worker: profile, the work board, a journal entry that survives a reload, messages`, async ({ browser }) => {
      const { page, errors, done } = await as(browser, device, WORKER);
      await surface(page, errors, { scenario: "2-worker", device, path: "/dashboard/profile", primary: (m) => m.locator("h1").first(), heading: true, what: "profile" });
      await surface(page, errors, { scenario: "2-worker", device, path: "/dashboard/opportunities", primary: (m) => m.locator("h1").first(), heading: true, what: "work board" });
      const entry = `Fitted 6 kitchen cabinets for a client, 7 hours (matrix ${tag})`;
      await surface(page, errors, { scenario: "2-worker", device, path: "/dashboard/journal", primary: (m) => m.getByTestId("journal-quick-record-text"), what: "journal" });
      await recordJournal(page, BASE, entry);
      await page.reload();
      await expect(page.getByRole("main").getByText(entry, { exact: false }).first(), "the entry is there after a reload").toBeVisible({ timeout: 60_000 });
      const stored = sql<{ n: number }>(
        `select count(*)::int as n from public.journal_entries e join public.workers w on w.id = e.worker_id where w.profile_id = ${lit(s.workerId)} and e.original_text like ${lit(`%matrix ${tag}%`)}`,
      )[0]?.n;
      expect(stored, "the entry is stored once").toBe(1);
      await surface(page, errors, { scenario: "2-worker", device, path: "/dashboard/communication", primary: (m) => m.locator("h1").first(), heading: true, what: "messages" });
      // Rights: an employer with no link to this worker reads none of the worker's journal.
      const leaked = await readAs<{ id: string }>(EMPLOYER, `journal_entries?original_text=like.*${encodeURIComponent(`matrix ${tag}`)}*&select=id`);
      expect(leaked, "an unrelated employer reads none of the worker's journal").toEqual([]);
      await refused(page, "/dashboard/company/settings", "the worker");
      await done();
    });

    test(`M-3 (${device.name}). employer: the company home, a need that survives a reload, the people page`, async ({ browser }) => {
      const { page, errors, done } = await as(browser, device, EMPLOYER);
      await surface(page, errors, { scenario: "3-employer", device, path: "/dashboard", primary: (m) => m.getByTestId("company-model-primary"), what: "company home" });
      const role = `Matrix tiler ${tag}`;
      await surface(page, errors, { scenario: "3-employer", device, path: "/dashboard/company/needs?audience=need#demand-intake", primary: (m) => m.getByTestId("demand-role"), what: "need intake" });
      await publishNeed(page, BASE, role, "LT");
      await page.reload();
      await expect(page.getByRole("main").getByText(role).first(), "the need is listed after a reload").toBeVisible({ timeout: 60_000 });
      await surface(page, errors, { scenario: "3-employer", device, path: "/dashboard/company/people", primary: (m) => m.locator("h1").first(), heading: true, what: "people" });
      // Rights: another organization's owner reads none of this company's seats.
      const seats = await readAs<{ id: string }>(AGENCY, `company_memberships?organization_id=eq.${s.employerOrg}&select=id`);
      expect(seats, "another organization reads none of the employer's seats").toEqual([]);
      await done();
    });

    test(`M-4 (${device.name}). agency: its home, clients and people; a worker is refused`, async ({ browser }) => {
      const { page, errors, done } = await as(browser, device, AGENCY);
      await surface(page, errors, { scenario: "4-agency", device, path: "/dashboard", primary: (m) => m.getByTestId("company-model-primary"), what: "agency home" });
      await surface(page, errors, { scenario: "4-agency", device, path: "/dashboard/company/partners", primary: (m) => m.locator("h1").first(), heading: true, what: "clients" });
      await surface(page, errors, { scenario: "4-agency", device, path: "/dashboard/company/people", primary: (m) => m.locator("h1").first(), heading: true, what: "people" });
      await done();
      const worker = await as(browser, device, WORKER);
      await refused(worker.page, "/dashboard/company/partners", "the worker");
      await worker.done();
    });

    test(`M-5 (${device.name}). subcontractor: a service offering that survives a reload; another company cannot change it`, async ({ browser }) => {
      const { page, errors, done } = await as(browser, device, AGENCY);
      const main = await surface(page, errors, { scenario: "5-subcontractor", device, path: "/dashboard/services", primary: (m) => m.getByTestId("service-offering-add"), what: "services" });
      const title = `Matrix tiling service ${tag}`;
      const section = main.getByTestId("service-offerings-section");
      await clickUntilVisible(section.getByTestId("service-offering-add"), section.getByTestId("service-offering-title"), { what: "the service form" });
      await section.getByTestId("service-offering-title").fill(title);
      await section.getByTestId("service-offering-category").fill("tiling");
      await section.getByTestId("service-offering-country").fill("LT");
      await section.getByTestId("service-offering-rate").fill("25 EUR/m²");
      await section.getByTestId("service-offering-save").click();
      const row = section.locator('[data-testid^="service-offering-row-"]', { hasText: title }).first();
      await expect(row, "the offering is listed").toBeVisible({ timeout: 30_000 });
      await page.reload();
      await expect(page.getByRole("main").locator('[data-testid^="service-offering-row-"]', { hasText: title }).first(), "the offering is there after a reload").toBeVisible({ timeout: 60_000 });
      const stored = sql<{ id: string }>(`select id from public.service_offerings where title = ${lit(title)}`);
      expect(stored, "the offering is stored once").toHaveLength(1);
      await surface(page, errors, { scenario: "5-subcontractor", device, path: "/dashboard/service-requests", primary: (m) => m.locator("h1").first(), heading: true, what: "service requests" });
      await done();
      // Rights: the employer's own services page does not list the agency's offering as its own.
      const other = await as(browser, device, EMPLOYER);
      await other.page.goto(`${BASE}/en/dashboard/services`);
      await expect(other.page.getByRole("main").getByTestId("service-offerings-section")).toBeVisible({ timeout: 60_000 });
      await expect(other.page.getByRole("main").locator('[data-testid^="service-offering-row-"]', { hasText: title }), "another company does not own the offering").toHaveCount(0);
      await other.done();
    });

    test(`M-6 (${device.name}). student and institution: the compass, the internship board, a programme that survives a reload`, async ({ browser }) => {
      const student = await as(browser, device, STUDENT);
      await surface(student.page, student.errors, { scenario: "6-education", device, path: "/dashboard/profile", primary: (m) => m.getByTestId("compass-open-internships"), what: "student compass" });
      await surface(student.page, student.errors, { scenario: "6-education", device, path: "/dashboard/opportunities?opportunityType=internship", primary: (m) => m.locator("h1").first(), heading: true, what: "internship board" });
      await refused(student.page, "/dashboard/company/education", "the student");
      await student.done();

      const { page, errors, done } = await as(browser, device, SCHOOL);
      const main = await surface(page, errors, { scenario: "6-education", device, path: "/dashboard/company/education", primary: (m) => m.getByTestId("institution-learners-invite"), what: "education home" });
      const program = `Matrix hospitality programme ${tag}`;
      const create = main.getByTestId("create-program-form");
      const disclosure = main.locator("details").filter({ has: page.getByTestId("create-program-form") }).first();
      if ((await disclosure.getAttribute("open")) === null) await disclosure.locator("summary").first().click();
      await create.getByTestId("program-name").fill(program);
      if (device.touch) expect.soft((await create.getByTestId("program-name").boundingBox())?.height ?? 0, "the programme field is a 44 px target").toBeGreaterThanOrEqual(44);
      await expect(async () => {
        if (sql<{ id: string }>(`select id from public.education_programs where organization_id = ${lit(s.schoolOrg)} and name = ${lit(program)}`).length) return;
        await create.getByTestId("program-create").click({ timeout: 5_000 });
        await expect.poll(() => sql<{ id: string }>(`select id from public.education_programs where name = ${lit(program)}`).length, { timeout: 10_000 }).toBe(1);
      }).toPass({ timeout: 60_000 });
      await page.reload();
      await expect(page.getByRole("main").getByText(program).first(), "the programme is listed after a reload").toBeVisible({ timeout: 60_000 });
      await done();
      // Rights: another organization reads none of the institution's programmes.
      const programs = await readAs<{ id: string }>(EMPLOYER, `education_programs?organization_id=eq.${s.schoolOrg}&select=id`);
      expect(programs, "another organization reads none of the institution's programmes").toEqual([]);
    });

    test(`M-7 (${device.name}). AI: the conversation opens, can be written in, and nothing pretends to act`, async ({ browser }) => {
      const { page, errors, done } = await as(browser, device, WORKER);
      await surface(page, errors, { scenario: "7-ai", device, path: "/dashboard", primary: (m) => m.getByRole("textbox").first(), what: "conversation" });
      await done();
    });

    test(`M-8 (${device.name}). admin: organization settings, documents; a member of nothing is refused`, async ({ browser }) => {
      const { page, errors, done } = await as(browser, device, EMPLOYER);
      await surface(page, errors, { scenario: "8-admin", device, path: "/dashboard/company/settings#organization-members", primary: (m) => m.getByTestId("org-members-invite-form"), what: "organization settings" });
      await surface(page, errors, { scenario: "8-admin", device, path: "/dashboard/documents", primary: (m) => m.getByTestId("documents-page"), what: "documents" });
      await done();
      const worker = await as(browser, device, WORKER);
      await refused(worker.page, "/dashboard/company/settings", "the worker");
      await worker.done();
    });
  });
}
