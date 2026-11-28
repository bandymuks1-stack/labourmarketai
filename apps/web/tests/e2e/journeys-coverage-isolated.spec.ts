import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { clickUntilVisible } from "./click-until-visible";
import { chooseDemandCountryIfEmpty } from "./demand-country";
import {
  accessToken,
  BASE,
  isolatedStack,
  lit,
  onboard,
  publishNeed,
  SB_ANON,
  SB_URL,
  setUpCompany,
  signIn,
  signUp,
  sql,
  userId,
  verifyCompanyAsLocalAdmin,
} from "./isolated-web-a-helpers";

/**
 * THE JOURNEY GAPS (coordinator, owner directive 2026-11-21), on a THROWAWAY LOCAL Supabase stack
 * (.github/workflows/signup-isolated.yml). The coverage audit of the existing walks found three
 * journeys with steps no spec proves end to end; this file proves exactly those, nothing else.
 *
 * Every step is done through the product's own pages, and every step is proven four ways:
 *   (a) the act in the browser, (b) the stored row read from the local database AND a fresh
 *   load showing it, (c) the rights: a third party sees and does none of it — the page refuses
 *   or is empty, and a read with that person's OWN session (their JWT, through PostgREST, so
 *   row-level security decides) returns nothing, and (d) the visible result.
 *
 *   SC SUBCONTRACTOR  a provider company publishes its public business profile and a service
 *                     offering; a buyer company finds it (with the discovery filter), requests it
 *                     with a message; the provider reads the request and accepts it with a note;
 *                     the buyer sees the answer; both open the conversation and exchange a message.
 *                     A third company sees neither the request nor the conversation. No payment:
 *                     the marketplace has none by design.
 *   ST STUDENT        a verified company posts an INTERNSHIP-typed need beside an ordinary one; a
 *                     student finds it on the internship board (the ordinary one is not there),
 *                     applies; a second student cannot see that interest; the company sees the
 *                     hand-raiser among the need's candidates once the student allows employers
 *                     to find them (owner rule 2026-10-18: interest alone is never consent).
 *   WM WORKER MESSAGES the student, a worker identity, writes to that employer from the
 *                     application; the employer answers; a second student and another company
 *                     cannot open the thread (404) and their own sessions read none of its messages.
 *
 * EDUCATION is already proven (recognition-chain-isolated I-1..I-15, signup-isolated E-1..E-4); the
 * product has no door for an institution to arrange a placement with an employer (the employer
 * invites the intern directly), so there is nothing more to walk here.
 *
 * Each device (a 1440 × 900 desktop and a 390 × 844 touch phone) is its own serial group with its
 * own synthetic people, so a failure on one device hides nothing on the other. Result class:
 * PASS_CI_ONLY. It refuses to run anywhere but the local stack.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const PHONE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const DEVICES = [
  { name: "desktop", options: { viewport: { width: 1440, height: 900 } } },
  {
    name: "phone",
    options: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: PHONE_UA },
  },
] as const;
type Device = (typeof DEVICES)[number];
type State = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** One sign-in per person per run: the local auth server limits sign-ins per IP. */
const sessions = new Map<string, State>();
const tokens = new Map<string, string>();

async function onDevice(browser: Browser, device: Device, state?: State): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...device.options, ...(state ? { storageState: state } : {}), timezoneId: "UTC" });
  return { ctx, page: await ctx.newPage() };
}

/** A person already signed up in this run, on `device`, signed in. */
async function as(browser: Browser, device: Device, address: string): Promise<{ page: Page; done: () => Promise<void> }> {
  const saved = sessions.get(address);
  const { ctx, page } = await onDevice(browser, device, saved);
  if (!saved) await signIn(page, BASE, address);
  return {
    page,
    done: async () => {
      sessions.set(address, await ctx.storageState());
      await ctx.close();
    },
  };
}

/** A read through PostgREST with the person's OWN session: row-level security decides. */
async function readAs<T>(address: string, path: string): Promise<T[]> {
  let token = tokens.get(address);
  if (!token) {
    token = await accessToken(address);
    tokens.set(address, token);
  }
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` } });
  expect(r.status, `own-session read of ${path.split("?")[0]}`).toBe(200);
  return (await r.json()) as T[];
}

/** A new company owner: sign-up → "hire" → the company setup form. Returns profile and organization. */
async function newCompany(browser: Browser, device: Device, address: string, owner: string, legalName: string): Promise<{ profileId: string; orgId: string }> {
  const { ctx, page } = await onDevice(browser, device);
  await signUp(page, BASE, address);
  await onboard(page, "hire", owner);
  await setUpCompany(page, legalName);
  sessions.set(address, await ctx.storageState());
  await ctx.close();
  const profileId = await userId(address);
  const orgs = sql<{ id: string }>(`select id from public.organizations where owner_profile_id = ${lit(profileId)}`);
  expect(orgs, "the organization is stored once").toHaveLength(1);
  return { profileId, orgId: orgs[0]!.id };
}

/** A new student, through the student door of onboarding (ST-1's path); lands on the profile. */
async function newStudent(browser: Browser, device: Device, address: string, name: string, school: string): Promise<{ profileId: string; workerId: string }> {
  const { ctx, page } = await onDevice(browser, device);
  await signUp(page, BASE, address);
  await page.getByTestId("onboarding-intent-student").click();
  await expect(page.getByTestId("onboarding-intent-student")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("onboarding-intents-continue").click();
  await page.getByTestId("onboarding-display-name").fill(name);
  await page.getByTestId("onboarding-country").click();
  await page.getByRole("option", { name: /Lithuania/ }).first().click();
  await expect(page.getByTestId("onboarding-student-fields")).toBeVisible();
  await page.getByTestId("onboarding-institution").fill(school);
  await page.getByTestId("onboarding-program").fill("Hospitality and catering");
  await page.getByTestId("onboarding-submit").click();
  await page.waitForURL(/\/en\/dashboard\/profile/, { timeout: 60_000 });
  sessions.set(address, await ctx.storageState());
  await ctx.close();
  const profileId = await userId(address);
  const workers = sql<{ id: string }>(`select id from public.workers where profile_id = ${lit(profileId)}`);
  expect(workers, "the student is one worker record").toHaveLength(1);
  return { profileId, workerId: workers[0]!.id };
}

/** The needs page's own intake, with the opportunity type chosen on step 2. Returns the need's id. */
async function postTypedNeed(page: Page, ownerProfileId: string, role: string, type: "Internship"): Promise<string> {
  await page.goto(`${BASE}/en/dashboard/company/needs?audience=need#demand-intake`);
  const main = page.getByRole("main");
  await main.getByTestId("demand-role").fill(role);
  await main.getByTestId("demand-description").fill("A six-week practice at the front desk of a Vilnius hotel.");
  await main.getByTestId("demand-next").click();
  const size = main.getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("1");
  await main.getByTestId("demand-opportunity-type").click();
  await page.getByRole("option", { name: type, exact: true }).click();
  await expect(main.getByTestId("demand-opportunity-type")).toContainText(type);
  await chooseDemandCountryIfEmpty(page);
  await main.getByTestId("demand-next").click();
  await main.getByTestId("demand-create").click();
  await expect(main.getByTestId("demand-done"), "the need is accepted").toBeVisible({ timeout: 30_000 });
  const rows = sql<{ id: string }>(
    `select id from public.customer_requests where (title = ${lit(role)} or role_or_work_type = ${lit(role)}) and profile_id = ${lit(ownerProfileId)}`,
  );
  expect(rows, "the need is stored once").toHaveLength(1);
  return rows[0]!.id;
}

/** The board's card for a need, in <main> (a streamed copy can sit outside it for a moment). */
const card = (page: Page, needId: string): Locator => page.getByRole("main").locator(`li[id="opp-${needId}"]`);

/**
 * Send one message in an open thread and see it in the thread. Message reads are scoped to <main>:
 * while the thread streams in, React holds its segments in hidden `div#S:n` for up to ~300 ms
 * (measured on this page, then one copy), and an unscoped testid meets both.
 */
async function send(page: Page, text: string): Promise<void> {
  const input = page.getByTestId("communication-composer-input");
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("main").locator('[data-testid^="message-text-"]', { hasText: text }), "the message shows in the thread").toBeVisible({
    timeout: 30_000,
  });
}

/**
 * An outsider opens a thread by its address: the product's not-found page, none of the thread.
 * (The HTTP status is 200: the dashboard layout streams the page inside a Suspense boundary, so
 * `notFound()` renders the not-found UI after the shell is sent. The refusal is the page.)
 */
async function threadRefused(page: Page, conversationId: string, secret: string, who: string): Promise<void> {
  await page.goto(`${BASE}/en/dashboard/communication/${conversationId}`);
  await expect(page.getByTestId("branded-not-found"), `${who}: the thread is not found for them`).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("communication-composer-input"), `${who}: no composer`).toHaveCount(0);
  expect(await page.locator("body").innerText(), `${who}: none of the thread's text`).not.toContain(secret);
}

for (const device of DEVICES) {
  const D = device.name;
  const email = (who: string) => `journeys.${who}.${D}.${RUN}@local.test`;
  const PROVIDER = email("provider");
  const BUYER = email("buyer");
  const THIRD = email("third");
  const STUDENT = email("student");
  const STUDENT2 = email("student2");
  const SLUG = `synthetic-tiling-${D}-${RUN}`;
  const TAGLINE = `Bathroom tiling and waterproofing ${D} ${RUN}`;
  const ABOUT = `QA-SYNTHETIC provider profile ${D} ${RUN}: ten years of wet-room tiling in Kaunas.`;
  const SERVICE = `Synthetic wet-room tiling ${D} ${RUN}`;
  const CATEGORY = `tiling-${D}-${RUN}`;
  const ASK = `Request ${D} ${RUN}: a 6 m² bathroom next week`;
  const NOTE = `Accepted ${D} ${RUN}: Tuesday works`;
  const SC_MSG = `Buyer message ${D} ${RUN}: bring the grout samples`;
  const SC_REPLY = `Provider reply ${D} ${RUN}: will do`;
  const INTERN_ROLE = `Hotel reception intern ${D} ${RUN}`;
  const ORDINARY_ROLE = `Hotel night porter ${D} ${RUN}`;
  const WM_MSG = `Student question ${D} ${RUN}: when does the practice start?`;
  const WM_REPLY = `Employer answer ${D} ${RUN}: on the first Monday`;
  const s = {
    provider: { profileId: "", orgId: "" },
    buyer: { profileId: "", orgId: "" },
    third: { profileId: "", orgId: "" },
    student: { profileId: "", workerId: "" },
    student2: { profileId: "", workerId: "" },
    offeringId: "",
    requestId: "",
    scConversationId: "",
    internNeedId: "",
    ordinaryNeedId: "",
    wmConversationId: "",
  };

  test.describe(`journeys on ${D}`, () => {
    test.describe.configure({ mode: "serial" });

    test(`J-0 (${D}). setup: three companies and two students sign up through the product's own doors`, async ({ browser }) => {
      s.provider = await newCompany(browser, device, PROVIDER, `Synthetic Provider Owner ${D}`, `Synthetic Tiling Provider ${D} ${RUN}`);
      s.buyer = await newCompany(browser, device, BUYER, `Synthetic Buyer Owner ${D}`, `Synthetic Hotel Buyer ${D} ${RUN}`);
      s.third = await newCompany(browser, device, THIRD, `Synthetic Third Owner ${D}`, `Synthetic Outsider Builders ${D} ${RUN}`);
      s.student = await newStudent(browser, device, STUDENT, `Synthetic Student ${D}`, `Synthetic Hospitality School ${D}`);
      s.student2 = await newStudent(browser, device, STUDENT2, `Synthetic Second Student ${D}`, `Synthetic Hospitality School ${D}`);
    });

    // ── SC: subcontractor ──────────────────────────────────────────────────────────────────────

    test(`SC-1 (${D}). the provider publishes its public business profile; it is public after a reload, and nothing private is on it`, async ({ browser }) => {
      // Before: no page at that address.
      const anon = await onDevice(browser, device);
      const before = await anon.page.goto(`${BASE}/en/business/${SLUG}`);
      expect(before?.status(), "no public page before the provider publishes one").toBe(404);
      await anon.ctx.close();

      const { page, done } = await as(browser, device, PROVIDER);
      await page.goto(`${BASE}/en/dashboard/company/settings#public-business-profile`);
      await page.reload();
      const panel = page.getByRole("main").getByTestId("business-public-profile-panel");
      await expect(panel).toBeVisible({ timeout: 60_000 });
      const enable = panel.getByRole("checkbox");
      const slug = panel.locator('input[maxlength="50"]');
      await expect(async () => {
        if (!(await enable.isChecked())) await enable.click({ timeout: 5_000 });
        await expect(enable).toBeChecked({ timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
      await slug.fill(SLUG);
      await panel.locator('input[maxlength="160"]').fill(TAGLINE);
      await panel.getByTestId("business-description-input").fill(ABOUT);
      await panel.locator("button").last().click();
      await expect(panel.getByRole("status"), "the panel says it saved").toBeVisible({ timeout: 30_000 });
      // Stored, and still there after a fresh load.
      await expect
        .poll(
          () =>
            sql<{ n: number }>(
              `select count(*)::int as n from public.organizations o join public.companies c on c.id = o.legacy_company_id
                where o.id = ${lit(s.provider.orgId)} and c.description = ${lit(ABOUT)}`,
            )[0]?.n,
          {
          message: "the description is stored on the provider's company",
          timeout: 30_000,
        })
        .toBe(1);
      await page.reload();
      const again = page.getByRole("main").getByTestId("business-public-profile-panel");
      await expect(again.getByTestId("business-description-input"), "the description reopens").toHaveValue(ABOUT, { timeout: 60_000 });
      await expect(again.locator('input[maxlength="50"]')).toHaveValue(SLUG);
      await expect(again.getByTestId("view-public-profile-link"), "the published page is linked").toHaveAttribute("href", new RegExp(`/business/${SLUG}$`));
      await done();

      // The public page, for anyone signed out: the published fields, and not the owner's address.
      const pub = await onDevice(browser, device);
      const res = await pub.page.goto(`${BASE}/en/business/${SLUG}`);
      expect(res?.status(), "the public page exists").toBe(200);
      await expect(pub.page.getByRole("main")).toContainText(TAGLINE, { timeout: 30_000 });
      await expect(pub.page.getByRole("main")).toContainText(ABOUT);
      expect(await pub.page.locator("body").innerText(), "the owner's sign-in address is not published").not.toContain(PROVIDER);
      await pub.ctx.close();
    });

    test(`SC-2 (${D}). the provider offers a service and makes it findable; it stays active after a reload`, async ({ browser }) => {
      const { page, done } = await as(browser, device, PROVIDER);
      await page.goto(`${BASE}/en/dashboard/services`);
      const section = page.getByRole("main").getByTestId("service-offerings-section");
      await expect(section).toBeVisible({ timeout: 60_000 });
      await clickUntilVisible(section.getByTestId("service-offering-add"), section.getByTestId("service-offering-title"), { what: "the service form" });
      await section.getByTestId("service-offering-title").fill(SERVICE);
      await section.getByTestId("service-offering-category").fill(CATEGORY);
      await section.getByTestId("service-offering-country").fill("LT");
      await section.getByTestId("service-offering-rate").fill("25 EUR/m²");
      await section.getByTestId("service-offering-save").click();
      const row = section.locator('[data-testid^="service-offering-row-"]', { hasText: SERVICE }).first();
      await expect(row, "the service is listed").toBeVisible({ timeout: 30_000 });
      s.offeringId = (await row.getAttribute("data-testid"))!.replace("service-offering-row-", "");
      const findable = section.getByTestId(`service-offering-discoverability-${s.offeringId}`);
      await expect(async () => {
        const status = sql<{ status: string }>(`select status from public.service_offerings where id = ${lit(s.offeringId)}`)[0]?.status;
        if (status !== "active") await section.getByTestId(`service-offering-toggle-${s.offeringId}`).click({ timeout: 5_000 });
        await expect(findable).toHaveAttribute("data-visibility", "visible", { timeout: 10_000 });
      }).toPass({ timeout: 60_000 });
      const stored = sql<{ status: string; provider_id: string; category_slug: string | null }>(
        `select status, provider_id, category_slug from public.service_offerings where id = ${lit(s.offeringId)}`,
      );
      expect(stored, "one stored offering, active, the provider's own").toEqual([{ status: "active", provider_id: s.provider.profileId, category_slug: CATEGORY }]);
      await page.reload();
      await expect(page.getByRole("main").getByTestId(`service-offering-discoverability-${s.offeringId}`), "still findable after a reload").toHaveAttribute(
        "data-visibility",
        "visible",
        { timeout: 60_000 },
      );
      await done();
    });

    test(`SC-3 (${D}). the buyer finds it through the discovery filter and requests it with a message`, async ({ browser }) => {
      const { page, done } = await as(browser, device, BUYER);
      await page.goto(`${BASE}/en/dashboard/service-requests`);
      const main = page.getByRole("main");
      const filter = main.getByTestId("marketplace-discover-filter");
      await expect(filter, "the discovery filter is offered").toBeVisible({ timeout: 60_000 });
      await filter.getByTestId("marketplace-filter-country").fill("LT");
      await filter.getByTestId("marketplace-filter-category").fill(CATEGORY);
      await filter.getByTestId("marketplace-filter-apply").click();
      await page.waitForURL(/[?&]category=/, { timeout: 30_000 });
      const offers = page.getByRole("main").getByTestId("marketplace-offer-row");
      await expect(offers.filter({ hasText: SERVICE }), "the filter finds the service").toHaveCount(1, { timeout: 60_000 });
      // The filter narrows: every offer it shows is in this run's own category, so only this service.
      await expect(offers, "nothing else matches this run's category").toHaveCount(1);
      const offer = offers.filter({ hasText: SERVICE }).first();
      await offer.getByTestId("marketplace-offer-message").fill(ASK);
      await offer.getByTestId("marketplace-offer-request").click();
      await expect(offer.getByTestId("marketplace-offer-requested"), "the request is sent").toBeVisible({ timeout: 30_000 });
      const rows = sql<{ id: string; status: string; message: string; provider_id: string }>(
        `select id, status, message, provider_id from public.service_offering_requests where offering_id = ${lit(s.offeringId)} and buyer_id = ${lit(s.buyer.profileId)}`,
      );
      expect(rows.map(({ status, message, provider_id }) => ({ status, message, provider_id })), "one stored request to this provider").toEqual([
        { status: "sent", message: ASK, provider_id: s.provider.profileId },
      ]);
      s.requestId = rows[0]!.id;
      await page.goto(`${BASE}/en/dashboard/service-requests`);
      await expect(page.getByRole("main").getByTestId("marketplace-outgoing-row").filter({ hasText: SERVICE }), "the request is in the buyer's outgoing list after a reload").toHaveCount(1, {
        timeout: 60_000,
      });
      await done();
    });

    test(`SC-4 (${D}). the provider reads the request and accepts it with a note; the buyer sees the answer after a reload`, async ({ browser }) => {
      const p = await as(browser, device, PROVIDER);
      await p.page.goto(`${BASE}/en/dashboard/service-requests`);
      const incoming = p.page.getByRole("main").getByTestId("marketplace-incoming-row").filter({ hasText: ASK }).first();
      await expect(incoming, "the request reaches the provider").toBeVisible({ timeout: 60_000 });
      await expect(incoming.getByTestId("marketplace-incoming-message"), "the provider reads the buyer's message").toContainText(ASK);
      await incoming.getByTestId("marketplace-incoming-note").fill(NOTE);
      await incoming.getByTestId("marketplace-incoming-accept").click();
      await expect
        .poll(() => sql<{ status: string; response_note: string | null }>(`select status, response_note from public.service_offering_requests where id = ${lit(s.requestId)}`), {
          message: "the request is stored as accepted, with the note",
          timeout: 30_000,
        })
        .toEqual([{ status: "accepted", response_note: NOTE }]);
      await p.page.reload();
      await expect(p.page.getByRole("main").getByTestId("marketplace-incoming-message-cta").first(), "the accepted request offers the conversation").toBeVisible({ timeout: 60_000 });
      await p.done();

      const b = await as(browser, device, BUYER);
      await b.page.goto(`${BASE}/en/dashboard/service-requests`);
      const out = b.page.getByRole("main").getByTestId("marketplace-outgoing-row").filter({ hasText: SERVICE }).first();
      await expect(out.getByTestId("marketplace-outgoing-note"), "the buyer reads the provider's note").toContainText(NOTE, { timeout: 60_000 });
      await expect(out.getByTestId("marketplace-outgoing-responded")).toBeVisible();
      await b.done();
    });

    test(`SC-5 (${D}). both open the request's conversation and exchange a message`, async ({ browser }) => {
      const b = await as(browser, device, BUYER);
      await b.page.goto(`${BASE}/en/dashboard/service-requests`);
      const out = b.page.getByRole("main").getByTestId("marketplace-outgoing-row").filter({ hasText: SERVICE }).first();
      await out.getByTestId("marketplace-outgoing-message-cta").click();
      await b.page.waitForURL(/\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 60_000 });
      s.scConversationId = /\/communication\/([0-9a-f-]{36})/.exec(b.page.url())![1]!;
      await send(b.page, SC_MSG);
      await b.done();
      await expect
        .poll(() => sql<{ body: string }>(`select body from public.conversation_messages where conversation_id = ${lit(s.scConversationId)} and author_id = ${lit(s.buyer.profileId)}`).map((r) => r.body), {
          message: "the buyer's message is stored in that conversation",
          timeout: 30_000,
        })
        .toEqual([SC_MSG]);

      const p = await as(browser, device, PROVIDER);
      await p.page.goto(`${BASE}/en/dashboard/service-requests`);
      await p.page.getByRole("main").getByTestId("marketplace-incoming-message-cta").first().click();
      await p.page.waitForURL(new RegExp(`/communication/${s.scConversationId}`), { timeout: 60_000 });
      await expect(p.page.getByRole("main").locator('[data-testid^="message-text-"]', { hasText: SC_MSG }), "the provider reads the buyer's message").toBeVisible({ timeout: 30_000 });
      await send(p.page, SC_REPLY);
      await p.done();

      const b2 = await as(browser, device, BUYER);
      await b2.page.goto(`${BASE}/en/dashboard/communication/${s.scConversationId}`);
      await expect(b2.page.getByRole("main").locator('[data-testid^="message-text-"]', { hasText: SC_REPLY }), "the buyer reads the reply on a fresh load").toBeVisible({ timeout: 60_000 });
      await b2.done();
    });

    test(`SC-6 (${D}). a third company sees neither the request nor the conversation`, async ({ browser }) => {
      const t = await as(browser, device, THIRD);
      await t.page.goto(`${BASE}/en/dashboard/service-requests`);
      const main = t.page.getByRole("main");
      await expect(main.getByTestId("marketplace-discover-filter").or(main.getByTestId("marketplace-discover-empty")).first()).toBeVisible({ timeout: 60_000 });
      await expect(main.getByTestId("marketplace-outgoing-row"), "no outgoing request of theirs").toHaveCount(0);
      await expect(main.getByTestId("marketplace-incoming-row"), "no incoming request for them").toHaveCount(0);
      expect(await main.innerText(), "none of the request's text").not.toContain(ASK);
      await threadRefused(t.page, s.scConversationId, SC_MSG, "the third company");
      await t.done();
      expect(await readAs(THIRD, `service_offering_requests?id=eq.${s.requestId}&select=id`), "their own session reads no such request").toEqual([]);
      expect(await readAs(THIRD, `conversation_messages?conversation_id=eq.${s.scConversationId}&select=id`), "their own session reads none of the messages").toEqual([]);
      // The parties' own sessions do read them (the refusal above is about who, not about the read).
      expect(await readAs(BUYER, `service_offering_requests?id=eq.${s.requestId}&select=id`), "the buyer reads its request").toHaveLength(1);
      expect((await readAs(PROVIDER, `conversation_messages?conversation_id=eq.${s.scConversationId}&select=id`)).length, "the provider reads the thread").toBe(2);
    });

    // ── ST: a student finds a practice ─────────────────────────────────────────────────────────

    test(`ST-1 (${D}). a verified company posts an internship and an ordinary need`, async ({ browser }) => {
      const b = await as(browser, device, BUYER);
      s.internNeedId = await postTypedNeed(b.page, s.buyer.profileId, INTERN_ROLE, "Internship");
      // The intake's address is the one the first need was sent from; going there again would be a
      // hash-only navigation that keeps the sent view, so the second need starts from a real load.
      await b.page.goto(`${BASE}/en/dashboard/company/needs`);
      await publishNeed(b.page, BASE, ORDINARY_ROLE, "LT");
      await b.done();
      const ord = sql<{ id: string }>(
        `select id from public.customer_requests where (title = ${lit(ORDINARY_ROLE)} or role_or_work_type = ${lit(ORDINARY_ROLE)}) and profile_id = ${lit(s.buyer.profileId)}`,
      );
      expect(ord, "the ordinary need is stored once").toHaveLength(1);
      s.ordinaryNeedId = ord[0]!.id;
      await verifyCompanyAsLocalAdmin(BUYER, email("admin"));
      const typed = sql<{ opportunity_type: string | null }>(`select payload->'structured_v2'->>'opportunity_type' as opportunity_type from public.customer_requests where id = ${lit(s.internNeedId)}`);
      expect(typed.map((r) => r.opportunity_type), "the need is stored as an internship").toEqual(["internship"]);
    });

    test(`ST-2 (${D}). the student finds it on the internship board, not the ordinary need, and applies`, async ({ browser }) => {
      const st = await as(browser, device, STUDENT);
      await st.page.goto(`${BASE}/en/dashboard/opportunities?view=all&opportunityType=internship`);
      const main = st.page.getByRole("main");
      await expect(main.getByTestId("opportunities-list")).toBeVisible({ timeout: 60_000 });
      await expect(main.locator('[data-testid="opportunities-filter-opportunityType"][data-active="true"]').first(), "the internship filter is on").toBeVisible();
      await expect(card(st.page, s.internNeedId), "the internship is on the internship board").toBeVisible({ timeout: 60_000 });
      await expect(card(st.page, s.ordinaryNeedId), "the ordinary need is not").toHaveCount(0);
      const box = card(st.page, s.internNeedId).getByTestId(`interest-${s.internNeedId}`);
      await clickUntilVisible(box.getByTestId("interest-express"), box.getByTestId("interest-sent"), { what: "the sent interest" });
      expect(
        sql<{ status: string }>(`select status from public.demand_interest_signals where request_id = ${lit(s.internNeedId)} and worker_id = ${lit(s.student.workerId)}`).map((r) => r.status),
        "one interest row, interested",
      ).toEqual(["interested"]);
      // A fresh load: the board still shows it as sent.
      await st.page.reload();
      await expect(card(st.page, s.internNeedId).getByTestId("interest-sent"), "the interest is still sent after a reload").toBeVisible({ timeout: 60_000 });
      // The whole board, unfiltered, has both needs: the filter is what took the ordinary one out.
      await st.page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
      await expect(card(st.page, s.ordinaryNeedId), "the ordinary need is on the unfiltered board").toBeVisible({ timeout: 60_000 });
      await st.done();
    });

    test(`ST-3 (${D}). a second student cannot see the first student's interest`, async ({ browser }) => {
      const st2 = await as(browser, device, STUDENT2);
      await st2.page.goto(`${BASE}/en/dashboard/opportunities?view=all&opportunityType=internship`);
      const c = card(st2.page, s.internNeedId);
      await expect(c, "the second student sees the same internship").toBeVisible({ timeout: 60_000 });
      await expect(c.getByTestId("interest-sent"), "but not as their own interest").toHaveCount(0);
      await expect(c.getByTestId("interest-express")).toBeVisible();
      await st2.done();
      expect(await readAs(STUDENT2, `demand_interest_signals?request_id=eq.${s.internNeedId}&select=id`), "their own session reads no one's interest").toEqual([]);
      expect(await readAs(STUDENT, `demand_interest_signals?request_id=eq.${s.internNeedId}&select=id`), "the first student reads their own").toHaveLength(1);
    });

    test(`ST-4 (${D}). once the student lets employers find them, the company sees the hand-raiser on its need; another company does not`, async ({ browser }) => {
      const st = await as(browser, device, STUDENT);
      await st.page.goto(`${BASE}/en/dashboard/privacy#visibility`);
      const vis = st.page.getByRole("main").getByTestId("privacy-visibility");
      await expect(vis).toBeVisible({ timeout: 60_000 });
      await clickUntilVisible(vis.getByTestId("discoverability-open"), vis.getByTestId("discoverability-grant"), { what: "the visibility choice" });
      await vis.getByTestId("discoverability-grant").click();
      await expect(vis.getByTestId("discoverability-granted"), "employers may now find them").toBeVisible({ timeout: 30_000 });
      await st.done();

      const b = await as(browser, device, BUYER);
      await b.page.goto(`${BASE}/en/dashboard/company/scouting?request=${s.internNeedId}`);
      await expect(b.page.getByRole("main").getByTestId(`scout-candidate-${s.student.workerId}`), "the hand-raiser is among the need's candidates").toBeVisible({ timeout: 60_000 });
      await b.page.reload();
      await expect(b.page.getByRole("main").getByTestId(`scout-candidate-${s.student.workerId}`), "and still after a reload").toBeVisible({ timeout: 60_000 });
      await b.done();

      const t = await as(browser, device, THIRD);
      await t.page.goto(`${BASE}/en/dashboard/company/scouting?request=${s.internNeedId}`);
      await t.page.waitForLoadState("networkidle").catch(() => {});
      await expect(t.page.getByTestId(`scout-candidate-${s.student.workerId}`), "another company sees no candidate on a need that is not theirs").toHaveCount(0);
      await t.done();
      expect(await readAs(THIRD, `demand_interest_signals?request_id=eq.${s.internNeedId}&select=id`), "another company's session reads none of the interest").toEqual([]);
    });

    // ── WM: worker ↔ company messages, and who cannot read them ────────────────────────────────

    test(`WM-1 (${D}). the student writes to the employer from the application; the employer answers`, async ({ browser }) => {
      const st = await as(browser, device, STUDENT);
      await st.page.goto(`${BASE}/en/dashboard/opportunities?view=all&opportunityType=internship`);
      const box = card(st.page, s.internNeedId).getByTestId(`interest-${s.internNeedId}`);
      await expect(box.getByTestId("interest-contact-employer")).toBeVisible({ timeout: 60_000 });
      await box.getByTestId("interest-contact-employer").click();
      await st.page.waitForURL(/\/en\/dashboard\/communication\/[0-9a-f-]{36}/, { timeout: 60_000 });
      s.wmConversationId = /\/communication\/([0-9a-f-]{36})/.exec(st.page.url())![1]!;
      await send(st.page, WM_MSG);
      await st.done();
      await expect
        .poll(() => sql<{ body: string }>(`select body from public.conversation_messages where conversation_id = ${lit(s.wmConversationId)} and author_id = ${lit(s.student.profileId)}`).map((r) => r.body), {
          message: "the student's message is stored in that conversation",
          timeout: 30_000,
        })
        .toEqual([WM_MSG]);

      const b = await as(browser, device, BUYER);
      await b.page.goto(`${BASE}/en/dashboard/communication`);
      const row = b.page.getByTestId(`conversation-row-${s.wmConversationId}`);
      await expect(row, "the thread is in the employer's messages").toBeVisible({ timeout: 60_000 });
      await row.click();
      await b.page.waitForURL(new RegExp(`/communication/${s.wmConversationId}`), { timeout: 30_000 });
      await expect(b.page.getByRole("main").locator('[data-testid^="message-text-"]', { hasText: WM_MSG }), "the employer reads it").toBeVisible({ timeout: 30_000 });
      await send(b.page, WM_REPLY);
      await b.done();

      const st2 = await as(browser, device, STUDENT);
      await st2.page.goto(`${BASE}/en/dashboard/communication/${s.wmConversationId}`);
      await expect(st2.page.getByRole("main").locator('[data-testid^="message-text-"]', { hasText: WM_REPLY }), "the student reads the answer on a fresh load").toBeVisible({ timeout: 60_000 });
      await st2.done();
    });

    test(`WM-2 (${D}). a second student and another company cannot open the thread or read its messages`, async ({ browser }) => {
      for (const [who, address] of [
        ["the second student", STUDENT2],
        ["another company", THIRD],
      ] as const) {
        const o = await as(browser, device, address);
        await threadRefused(o.page, s.wmConversationId, WM_MSG, who);
        await o.page.goto(`${BASE}/en/dashboard/communication`);
        await expect(o.page.getByRole("main").getByTestId("communication-workspace")).toBeVisible({ timeout: 60_000 });
        await expect(o.page.getByTestId(`conversation-row-${s.wmConversationId}`), `${who}: not in their messages`).toHaveCount(0);
        await o.done();
        expect(await readAs(address, `conversation_messages?conversation_id=eq.${s.wmConversationId}&select=id`), `${who}: their own session reads none of it`).toEqual([]);
      }
      expect((await readAs(STUDENT, `conversation_messages?conversation_id=eq.${s.wmConversationId}&select=id`)).length, "the student reads both messages").toBe(2);
    });
  });
}
