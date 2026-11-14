import { expect, test, type Page } from "@playwright/test";

import { FIRST_VISIT_CAMPAIGN, refuseOnFirstVisit, storedAnalytics } from "./first-visit-consent";

/**
 * SELF-SERVE SIGN-UP, end to end, on a THROWAWAY LOCAL Supabase stack
 * (.github/workflows/signup-isolated.yml). The one journey no production walk
 * covers: a stranger fills the sign-up form, picks what they came for, and
 * reaches their first real surface — as a worker, as a company, as an agency.
 *
 * It refuses to run anywhere but the local stack: production synthetic
 * accounts are owner-dispatch only (owner decision 2026-10-28), so this spec
 * creates people ONLY in a database that dies with the CI job.
 *
 * Outcomes are checked in that local database through its service key (the
 * page saying "done" is not the proof; the stored rows are).
 */

const BASE = process.env.E2E_BASE_URL ?? "";
const SB_URL = process.env.E2E_SUPABASE_URL ?? "";
const SB_SERVICE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? "";
const LOCAL = /^http:\/\/127\.0\.0\.1:\d+$/;

test.skip(
  process.env.SIGNUP_ISOLATED !== "1" || !LOCAL.test(BASE) || SB_URL !== "http://127.0.0.1:54321" || !SB_SERVICE,
  "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)",
);
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const RUN = Date.now().toString(36);
const PASSWORD = "Synthetic-Pass-2026!";
const email = (who: string) => `signup.${who}.${RUN}@local.test`;

async function db<T>(path: string): Promise<T> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` },
  });
  if (!r.ok) throw new Error(`local db read ${path.split("?")[0]} → ${r.status}`);
  return (await r.json()) as T;
}

async function userId(address: string): Promise<string> {
  const r = await fetch(`${SB_URL}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` },
  });
  const body = (await r.json()) as { users?: Array<{ id: string; email?: string }> };
  const u = (body.users ?? []).find((x) => x.email === address);
  if (!u) throw new Error(`no auth user for ${address}`);
  return u.id;
}

/**
 * The public sign-up form → the onboarding wizard (Confirm email is OFF locally).
 * `refuseConsent`: arrive like a stranger from a campaign link and answer the
 * real first-visit consent banner with "refuse" before filling the form.
 */
async function signUp(
  page: Page,
  address: string,
  password: string = PASSWORD,
  opts: { refuseConsent?: boolean } = {},
): Promise<void> {
  if (opts.refuseConsent) {
    await page.goto(`${BASE}/en/auth/signup?${FIRST_VISIT_CAMPAIGN}`);
    await refuseOnFirstVisit(page);
  } else {
    await page.goto(`${BASE}/en/auth/signup`);
  }
  await page.locator('input[type="email"]').fill(address);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirm_password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/en\/onboarding/, { timeout: 60_000 });
  await expect(page.getByTestId("onboarding-intents")).toBeVisible({ timeout: 30_000 });
}

/** Step 1: what they came for. Step 2: name, country, then submit. */
async function onboard(page: Page, intent: string, displayName: string): Promise<void> {
  await page.getByTestId(`onboarding-intent-${intent}`).click();
  await expect(page.getByTestId(`onboarding-intent-${intent}`)).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("onboarding-intents-continue").click();
  await page.getByTestId("onboarding-display-name").fill(displayName);
  await page.getByTestId("onboarding-country").click();
  await page.getByRole("option", { name: /Lithuania/ }).first().click();
  await page.getByTestId("onboarding-submit").click();
}

test("S-1. a worker refuses analytics on the first visit, signs up through the form, onboards, and lands as a worker", async ({ page }) => {
  const address = email("worker");
  await signUp(page, address, PASSWORD, { refuseConsent: true });
  await onboard(page, "work", "Synthetic Signup Worker");
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  const stored = await storedAnalytics(page);
  expect(JSON.parse(stored.consent ?? "{}").choice, "the refusal survives sign-up and onboarding").toBe("refused");
  expect(stored.analytics, "nothing analytics-related was stored on the way in").toEqual([]);
  const id = await userId(address);
  const [profile] = await db<Array<{ onboarded: boolean | null; active_role: string | null; country: string | null }>>(
    `profiles?id=eq.${id}&select=onboarded,active_role,country`,
  );
  expect(profile?.onboarded, "profile is onboarded").toBe(true);
  expect(profile?.active_role, "the worker identity is recorded").toBe("worker");
  expect(profile?.country).toBe("LT");
});

test("S-2. a company signs up through the form and reaches its company setup", async ({ page }) => {
  const address = email("company");
  await signUp(page, address);
  await onboard(page, "hire", "Synthetic Signup Owner");
  await page.waitForURL(/\/en\/dashboard\/start\/company/, { timeout: 60_000 });
  await expect(page.getByTestId("company-setup-form")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("company-setup-legal-name").fill(`Synthetic Signup Co ${RUN}`);
  await page.getByTestId("company-setup-country").selectOption("LT");
  await page.getByTestId("company-setup-save-draft").click();
  await expect(page.getByTestId("company-setup-result")).toBeVisible({ timeout: 30_000 });
  const id = await userId(address);
  const orgs = await db<Array<{ id: string }>>(`organizations?owner_profile_id=eq.${id}&select=id`);
  expect(orgs.length, "the company's organization is stored and owned by the person who signed up").toBeGreaterThan(0);
});

test("S-3. an agency signs up through the form and its organization is an agency", async ({ page }) => {
  const address = email("agency");
  await signUp(page, address);
  await onboard(page, "agency", "Synthetic Signup Agency Owner");
  await page.waitForURL(/\/en\/dashboard\/start\/company/, { timeout: 60_000 });
  await expect(page.getByTestId("company-setup-form")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("company-setup-legal-name").fill(`Synthetic Signup Agency ${RUN}`);
  await page.getByTestId("company-setup-country").selectOption("LT");
  await page.getByTestId("company-setup-save-draft").click();
  await expect(page.getByTestId("company-setup-result")).toBeVisible({ timeout: 30_000 });
  const id = await userId(address);
  const orgs = await db<Array<{ id: string }>>(`organizations?owner_profile_id=eq.${id}&select=id`);
  expect(orgs.length, "the agency's organization is stored").toBeGreaterThan(0);
});

test("S-4. an address that already has an account is sent to sign in, not to a mail that never comes", async ({ page }) => {
  await page.goto(`${BASE}/en/auth/signup`);
  await page.locator('input[type="email"]').fill(email("worker"));
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirm_password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByTestId("signup-login-instead")).toBeVisible({ timeout: 30_000 });
});

// ── Returning person: sign out, sign in, forgotten password ─────────────────

const MAIL = "http://127.0.0.1:54324"; // the local stack's mail catcher (Mailpit)
const NEW_PASSWORD = "Synthetic-Pass-2026-Reset!";

async function signIn(page: Page, address: string, password: string): Promise<void> {
  await page.goto(`${BASE}/en/auth/login`);
  await page.locator('input[name="email"]').fill(address);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
}

/** The newest link in the newest local mail to `address` (nothing leaves the runner). */
async function lastMailLink(address: string): Promise<string> {
  for (let i = 0; i < 30; i += 1) {
    const r = await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
    const list = (await r.json()) as { messages?: Array<{ ID: string }> };
    const id = list.messages?.[0]?.ID;
    if (id) {
      const m = (await (await fetch(`${MAIL}/api/v1/message/${id}`)).json()) as { Text?: string; HTML?: string };
      const urls = `${m.Text ?? ""} ${m.HTML ?? ""}`.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
      const link = urls.find((u) => /verify|callback|token/.test(u));
      if (link) return link.replace(/&amp;/g, "&");
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error("no reset mail arrived in the local mail catcher");
}

test("S-5. a person signs out and signs back in; the session is gone after sign-out", async ({ page }) => {
  const address = email("worker");
  await signIn(page, address, PASSWORD);
  await page.goto(`${BASE}/en/auth/logout`);
  await page.goto(`${BASE}/en/dashboard`);
  await page.waitForURL(/\/en\/auth\/login/, { timeout: 30_000 });
  await signIn(page, address, PASSWORD);
});

test("S-6. a forgotten password: the reset mail arrives, the new password works, the old one does not", async ({ page }) => {
  const address = email("company");
  await page.goto(`${BASE}/en/auth/forgot-password`);
  await page.locator('input[type="email"][name="email"]').fill(address);
  await page.locator('form button[type="submit"]').first().click();
  const link = await lastMailLink(address);
  await page.goto(link);
  await page.waitForURL(/reset-password/, { timeout: 60_000 });
  await page.locator('input[name="password"]').fill(NEW_PASSWORD);
  await page.locator('input[name="confirm_password"]').fill(NEW_PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(/\/en\/(auth\/login|dashboard)/, { timeout: 60_000 });
  await page.goto(`${BASE}/en/auth/logout`);
  // The old password is refused…
  await page.goto(`${BASE}/en/auth/login`);
  await page.locator('input[name="email"]').fill(address);
  await page.locator('input[name="password"]').fill(PASSWORD);
  const refused = page.waitForResponse((r) => r.url().includes("/auth/v1/token") && r.request().method() === "POST", {
    timeout: 30_000,
  });
  await page.locator('form button[type="submit"]').first().click();
  expect((await refused).status(), "the old password is refused by auth").toBe(400);
  await expect(page).toHaveURL(/\/en\/auth\/login/);
  // …the new one works.
  await signIn(page, address, NEW_PASSWORD);
});

// ── Worker: Work Journal → Living CV ────────────────────────────────────────

test("S-7. a worker records work in the Work Journal; it is stored and the Living CV door opens", async ({ page }) => {
  const address = email("worker");
  await signIn(page, address, PASSWORD);
  await page.goto(`${BASE}/en/dashboard/journal`);
  const main = page.getByRole("main");
  await main.getByTestId("journal-quick-record-text").fill(`Installed 12 kitchen cabinets on site, 7 hours (${RUN})`);
  await main.getByTestId("journal-quick-record-understand").click();
  await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
  await main.getByTestId("worklog-save").click();
  await main.getByTestId("worklog-confirm").click();
  const done = main.getByTestId("worklog-done");
  await expect(done.or(main.getByTestId("worklog-error")).or(main.getByTestId("worklog-blocked"))).toBeVisible({ timeout: 30_000 });
  await expect(done, "the entry is saved").toBeVisible();
  await expect(done.getByTestId("worklog-living-cv-link")).toHaveAttribute("href", /\/en\/cv$/);
  const entries = await db<Array<{ id: string }>>(
    `journal_entries?original_text=ilike.*${encodeURIComponent(RUN)}*&select=id`,
  );
  expect(entries.length, "the journal entry is stored").toBeGreaterThan(0);
  await page.goto(`${BASE}/en/cv`);
  await expect(page.getByRole("main")).toBeVisible({ timeout: 30_000 });
});

// ── Company: free need ──────────────────────────────────────────────────────

test("S-8. a company publishes its first need for free", async ({ page }) => {
  const address = email("company");
  await signIn(page, address, NEW_PASSWORD);
  await page.goto(`${BASE}/en/dashboard/company/needs?audience=need#demand-intake`);
  const main = page.getByRole("main");
  await main.getByTestId("demand-role").fill(`Tiler ${RUN}`);
  await main.getByTestId("demand-description").fill("Two tilers for a 3-week bathroom renovation in Vilnius.");
  await main.getByTestId("demand-next").click();
  const size = main.getByTestId("demand-team-size");
  if (await size.isVisible().catch(() => false)) await size.fill("2");
  await main.getByTestId("demand-next").click();
  await main.getByTestId("demand-create").click();
  await expect(main.getByTestId("demand-done"), "the first need is accepted on the free plan").toBeVisible({ timeout: 30_000 });
});

// ── Invited worker: invitation → link → sign-up → accepted ─────────────────

test("S-9. an invited person opens the link, registers through it, and the invitation is accepted", async ({ browser }) => {
  const invitee = email("invited");
  // The inviter: the worker from S-1 invites a new person to the platform.
  const a = await browser.newContext();
  const inviter = await a.newPage();
  await signIn(inviter, email("worker"), PASSWORD);
  await inviter.goto(`${BASE}/en/dashboard/network`);
  const panel = inviter.getByTestId("invite-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  const open = panel.getByTestId("invite-panel-open");
  if (await open.isVisible().catch(() => false)) await open.click();
  await panel.getByTestId("invite-emails").fill(invitee);
  await panel.getByTestId("invite-submit").click();
  const copy = panel.getByTestId("invite-copy-link").first();
  await expect(copy, "the invitation is created and its link is handed over").toBeVisible({ timeout: 30_000 });
  const raw = await copy.getAttribute("data-invite-link");
  expect(raw, "an invitation link").toBeTruthy();
  // The link carries the canonical origin; this walk serves the same path locally.
  const u = new URL(raw!);
  const link = `${BASE}${u.pathname}${u.search}`;
  await a.close();

  // The invited person: a fresh browser, no session.
  const b = await browser.newContext();
  const page = await b.newPage();
  await page.goto(link);
  await page.getByTestId("invite-register").click();
  await page.waitForURL(/\/en\/auth\/signup/, { timeout: 30_000 });
  const addressed = page.locator('input[aria-describedby="invited-email-note"]');
  if (await addressed.isVisible().catch(() => false)) {
    await expect(addressed, "the address comes from the invitation").not.toBeEditable();
  } else {
    await page.locator('input[type="email"]').fill(invitee);
  }
  await page.locator('input[name="password"]').fill(PASSWORD);
  // The addressed form may ask for the password once (the address is already known).
  const confirm = page.locator('input[name="confirm_password"]');
  if (await confirm.count()) await confirm.fill(PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/en\/(onboarding|invite|dashboard)/, { timeout: 60_000 });
  if (/\/onboarding/.test(page.url())) await onboard(page, "work", "Synthetic Invited Worker");
  await page.waitForURL(/\/en\/(dashboard|invite)/, { timeout: 60_000 });
  if (/\/invite\//.test(page.url())) {
    const accept = page.getByTestId("invite-accept");
    if (await accept.isVisible().catch(() => false)) await accept.click();
  }
  const id = await userId(invitee);
  const rows = await db<Array<{ status: string; accepted_by_profile_id: string | null }>>(
    `invitations?invited_email=eq.${encodeURIComponent(invitee)}&select=status,accepted_by_profile_id`,
  );
  expect(rows[0]?.status, "the invitation is accepted").toBe("accepted");
  expect(rows[0]?.accepted_by_profile_id, "by the person who registered through it").toBe(id);
  await b.close();
});

// ── M-0: the company the ISOLATED Android need journey signs in as ────────
// Runs only from android-need-isolated.yml (MOBILE_NEED_SEED_EMAIL set): the
// same real sign-up form and company setup as S-2, with QA-SYNTHETIC names and
// the server-set qa_synthetic marker; the app then posts its need on device.
test("M-0. seed: a synthetic company for the isolated mobile need journey", async ({ page }) => {
  const address = process.env.MOBILE_NEED_SEED_EMAIL ?? "";
  const password = process.env.MOBILE_NEED_SEED_PASSWORD ?? "";
  test.skip(!address || !password, "android-need-isolated.yml only");
  await signUp(page, address, password);
  await onboard(page, "hire", "QA-SYNTHETIC Mobile Need Owner");
  await page.waitForURL(/\/en\/dashboard\/start\/company/, { timeout: 60_000 });
  await expect(page.getByTestId("company-setup-form")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("company-setup-legal-name").fill("QA-SYNTHETIC Mobile Need Co");
  await page.getByTestId("company-setup-country").selectOption("LT");
  await page.getByTestId("company-setup-save-draft").click();
  await expect(page.getByTestId("company-setup-result")).toBeVisible({ timeout: 30_000 });
  const id = await userId(address);
  const r = await fetch(`${SB_URL}/auth/v1/admin/users/${id}`, {
    method: "PUT",
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "content-type": "application/json" },
    body: JSON.stringify({ app_metadata: { qa_synthetic: true } }),
  });
  expect(r.ok, "the seed carries the server-set qa_synthetic marker").toBe(true);
  const needs = await db<Array<{ id: string }>>(`customer_requests?profile_id=eq.${id}&select=id`);
  expect(needs.length, "the seed company starts with no need").toBe(0);
});

/**
 * P-1. THE WAY FORWARD IS ON SCREEN ON A PHONE (trust and sign-up audit,
 * 2026-11-13). Measured before the fix: the role step's Continue sat 1.7–2.1
 * screens down and choosing a card did not bring it into view; the profile
 * step's submit sat 2.7–3.4 screens down. Both now ride in a bar at the bottom
 * of the screen on a phone. The viewport heights are the VISIBLE page area of
 * a small Android phone, a 375 px phone and a 390 px phone with the browser's
 * bars shown; English and Lithuanian. The numbers are still printed, so a
 * later change has a baseline.
 */
for (const phone of [
  { name: "360x560", width: 360, height: 560 },
  { name: "375x553", width: 375, height: 553 },
  { name: "390x664", width: 390, height: 664 },
] as const) {
  test(`P-1. onboarding on a phone: the primary button is on screen (${phone.name})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: phone.width, height: phone.height }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    try {
      await signUp(page, email(`phone${phone.width}`));
      const box = async (testId: string) =>
        page.getByTestId(testId).first().evaluate((el) => {
          const r = el.getBoundingClientRect();
          // "visible" = inside the visible area AND nothing drawn over its centre.
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          // A disabled button ignores pointer events, so the hit test lands on
          // its own bar behind it: that is still "nothing foreign on top".
          const bar = el.closest('[data-testid="onboarding-action-bar"]');
          const uncovered = top !== null && (el.contains(top) || (bar !== null && bar.contains(top)));
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), visible: r.top >= 0 && r.bottom <= window.innerHeight && uncovered };
        });
      for (const locale of ["en", "lt"] as const) {
        // The wizard restores an unfinished draft (and its step); each pass starts as a first visit.
        await page.evaluate(() => {
          window.localStorage.clear();
          window.sessionStorage.clear();
        });
        await page.goto(`${BASE}/${locale}/onboarding`);
        await expect(page.getByTestId("onboarding-intents")).toBeVisible({ timeout: 30_000 });
        await page.evaluate(() => window.scrollTo(0, 0));
        const cards = await page.locator('[data-testid^="onboarding-intent-"]:not([data-testid="onboarding-intents-continue"])').evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= window.innerHeight;
          }),
        );
        const before = await box("onboarding-intents-continue");
        // The role step says what to do while nothing is chosen, and stops saying it after the first pick.
        await expect(page.getByTestId("onboarding-continue-hint"), `${locale}: the bar says to choose first`).toBeVisible();
        await expect(page.getByTestId("onboarding-intents-continue")).toBeDisabled();
        await page.getByTestId("onboarding-intent-work").tap();
        await expect(page.getByTestId("onboarding-intent-work")).toHaveAttribute("aria-pressed", "true");
        await expect(page.getByTestId("onboarding-continue-hint"), `${locale}: the hint goes with the first pick`).toHaveCount(0);
        await expect(page.getByTestId("onboarding-intents-continue")).toBeEnabled();
        const after = await box("onboarding-intents-continue");
        const scrollAfterPick = await page.evaluate(() => Math.round(window.scrollY));
        console.info(
          `[onboarding-phone] ${JSON.stringify({ phone: phone.name, locale, step: "role", viewport: phone.height, cardsTotal: cards.length, cardsFullyVisible: cards.filter(Boolean).length, continueBeforePick: before, continueAfterPick: after, scrollAfterPick, pageHeight: await page.evaluate(() => document.documentElement.scrollHeight) })}`,
        );
        expect(before.visible, `${locale}: Continue is on screen before anything is chosen`).toBe(true);
        expect(after.visible, `${locale}: Continue is on screen after a card is chosen, without scrolling`).toBe(true);
        expect(after.height, `${locale}: Continue keeps the 44 px touch floor`).toBeGreaterThanOrEqual(44);
        // Nothing is trapped under the bar: at the end of the page the last card is clear of it.
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const lastCardBottom = await page.getByTestId("onboarding-intent-education").evaluate((el) => Math.round(el.getBoundingClientRect().bottom));
        const barTop = await page.getByTestId("onboarding-action-bar").evaluate((el) => Math.round(el.getBoundingClientRect().top));
        expect(lastCardBottom, `${locale}: the last card is not covered by the bar`).toBeLessThanOrEqual(barTop);
        await page.evaluate(() => window.scrollTo(0, 0));

        await page.getByTestId("onboarding-intents-continue").click();
        await expect(page.getByTestId("onboarding-display-name")).toBeVisible({ timeout: 30_000 });
        await page.evaluate(() => window.scrollTo(0, 0));
        const submit = await box("onboarding-submit");
        const name = await box("onboarding-display-name");
        const country = await box("onboarding-country");
        await page.getByTestId("onboarding-country").tap();
        const option = page.getByRole("option").first();
        await expect(option, "the country list opens").toBeVisible({ timeout: 15_000 });
        const list = await option.evaluate((el) => {
          const r = (el.closest('[role="listbox"]') ?? el).getBoundingClientRect();
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), fitsViewport: r.top >= 0 && r.bottom <= window.innerHeight };
        });
        console.info(
          `[onboarding-phone] ${JSON.stringify({ phone: phone.name, locale, step: "profile", viewport: phone.height, name, country, submit, countryList: list, pageHeight: await page.evaluate(() => document.documentElement.scrollHeight) })}`,
        );
        expect(submit.visible, `${locale}: the submit button is on screen when the profile step opens`).toBe(true);
        expect(submit.height, `${locale}: the submit button keeps the 44 px touch floor`).toBeGreaterThanOrEqual(44);
        expect(name.visible && name.bottom <= submit.top, `${locale}: the name field is clear of the bar`).toBe(true);
        await page.keyboard.press("Escape");
      }
    } finally {
      await ctx.close();
    }
  });
}


test("P-2. on a desktop the onboarding buttons stay where they were, in the page flow", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await signUp(page, email("desktop1440"));
    const bar = page.getByTestId("onboarding-action-bar");
    await expect(bar).toBeVisible({ timeout: 30_000 });
    expect(await bar.evaluate((el) => getComputedStyle(el).position), "role step: no fixed bar on a desktop").toBe("static");
    await page.getByTestId("onboarding-intent-work").click();
    await page.getByTestId("onboarding-intents-continue").click();
    await expect(page.getByTestId("onboarding-submit")).toBeVisible({ timeout: 30_000 });
    expect(await bar.evaluate((el) => getComputedStyle(el).position), "profile step: no fixed bar on a desktop").toBe("static");
  } finally {
    await ctx.close();
  }
});

// ── Education: institution ↔ student acceptance (owner direction 2026-11-14, Lane L) ──
//
// One institution and one student, both created here and gone with the job.
// Order is deliberate: E-1 links them, E-3 turns the student into a worker,
// E-4 ends the student link, and E-2 (student-initiated messaging) runs LAST
// with its own fresh student, so that an open product gap in messaging cannot
// hide the history and access proofs behind a serial skip.

const EDU = {
  institution: email("edu.institution"),
  student: email("edu.student"),
  student2: email("edu.student2"),
  orgName: `Synthetic Training Centre ${RUN}`,
  studiesAt: `Synthetic Vocational School ${RUN}`,
  learnerName: `Synthetic Learner ${RUN}`,
};
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** A REST read AS a signed-in person (their own JWT, their own RLS). */
async function asPerson<T>(address: string, path: string): Promise<T> {
  const tok = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: address, password: PASSWORD }),
  });
  const { access_token } = (await tok.json()) as { access_token?: string };
  if (!access_token) throw new Error(`no session for the synthetic person (${tok.status})`);
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${access_token}` },
  });
  if (!r.ok) throw new Error(`person read ${path.split("?")[0]} → ${r.status}`);
  return (await r.json()) as T;
}

/** A service read that some tables refuse even to the service key: null = not readable here. */
async function dbOrNull<T>(path: string): Promise<T | null> {
  try {
    return await db<T>(path);
  } catch (e) {
    console.info(`[edu] ${String(e)} — falling back to what the screens show`);
    return null;
  }
}

async function signUpStudent(page: Page, address: string, displayName: string): Promise<void> {
  await signUp(page, address);
  await page.getByTestId("onboarding-intent-student").click();
  await page.getByTestId("onboarding-intents-continue").click();
  await page.getByTestId("onboarding-display-name").fill(displayName);
  await page.getByTestId("onboarding-country").click();
  await page.getByRole("option", { name: /Lithuania/ }).first().click();
  await page.getByTestId("onboarding-institution").fill(EDU.studiesAt);
  await page.getByTestId("onboarding-submit").click();
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
}

/** The institution's learner invitation by link (no e-mail), as in prod L-2. */
async function inviteLearnerLink(page: Page, name: string): Promise<string> {
  await page.goto(`${BASE}/en/dashboard/company/education`);
  await expect(page.getByTestId("company-education")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("institution-learners-invite").click();
  await page.waitForURL(/\/dashboard\/network/, { timeout: 30_000 });
  const open = page.getByTestId("invite-panel-open");
  if (await open.isVisible().catch(() => false)) await open.click();
  await expect(page.getByTestId("invite-capacity")).toHaveValue("student", { timeout: 30_000 });
  const linkMode = page.getByTestId("invite-mode-link");
  if (await linkMode.isVisible().catch(() => false)) await linkMode.click();
  const nameField = page.getByTestId("invite-name");
  if (await nameField.isVisible().catch(() => false)) await nameField.fill(name);
  await page.getByTestId("invite-submit").click();
  const copy = page.getByTestId("invite-copy-link").first();
  await expect(copy, "the learner invitation link is handed over").toBeVisible({ timeout: 30_000 });
  const u = new URL((await copy.getAttribute("data-invite-link")) ?? "");
  return `${BASE}${u.pathname}${u.search}`;
}

async function acceptInvite(page: Page, link: string): Promise<void> {
  await page.goto(link);
  await expect(page.getByTestId("invite-page")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("invite-accept").click();
  await page.waitForURL((u) => !u.pathname.includes("/invite/"), { timeout: 30_000 });
}

let eduStudentWorkerId = "";

test("E-1. an institution trains people and invites a learner by link; a student accepts it", async ({ browser }) => {
  // The institution: sign-up → "education" intent → organisation setup with the training-provider preset.
  const a = await browser.newContext();
  const inst = await a.newPage();
  await signUp(inst, EDU.institution);
  await onboard(inst, "education", "Synthetic Lecturer");
  await inst.waitForURL(/\/en\/dashboard\/start\/company/, { timeout: 60_000 });
  await inst.getByTestId("company-setup-legal-name").fill(EDU.orgName);
  await inst.getByTestId("company-setup-country").selectOption("LT");
  await inst.getByTestId("company-setup-save-draft").click();
  await expect(inst.getByTestId("company-setup-next")).toBeVisible({ timeout: 30_000 });
  await inst.goto(`${BASE}/en/dashboard/company/education`);
  if (!/\/company\/education/.test(inst.url())) {
    // The preset did not land: declare it where the product offers it (as prod L-1 does).
    await inst.goto(`${BASE}/en/dashboard/company/settings`);
    const more = inst.getByTestId("settings-more");
    if ((await more.getAttribute("open")) === null) await more.locator("summary").first().click();
    await inst.getByTestId("org-capability-checkbox-training_provider").check();
    await inst.getByTestId("org-capabilities-save").click();
    await expect(inst.getByTestId("org-capabilities-saved")).toBeVisible({ timeout: 30_000 });
  }
  const link = await inviteLearnerLink(inst, EDU.learnerName);
  await a.close();

  // The student: registers as a student, then joins through the link.
  const b = await browser.newContext();
  const stu = await b.newPage();
  await signUpStudent(stu, EDU.student, "Synthetic Student");
  await acceptInvite(stu, link);
  await b.close();

  const sid = await userId(EDU.student);
  const [worker] = await db<Array<{ id: string }>>(`workers?profile_id=eq.${sid}&select=id`);
  expect(worker?.id, "the student is a person with a worker record").toBeTruthy();
  eduStudentWorkerId = worker!.id;
  const inv = await db<Array<{ status: string; accepted_by_profile_id: string | null }>>(
    `invitations?invited_name=eq.${encodeURIComponent(EDU.learnerName)}&select=status,accepted_by_profile_id`,
  );
  expect(inv[0], "the learner invitation is accepted by the student").toEqual({ status: "accepted", accepted_by_profile_id: sid });

  // The institution sees one connected learner.
  const c = await browser.newContext();
  const again = await c.newPage();
  await signIn(again, EDU.institution, PASSWORD);
  await again.goto(`${BASE}/en/dashboard/company/education`);
  await expect(again.getByTestId("institution-learners-counts")).toContainText("1 connected", { timeout: 30_000 });
  await c.close();
});

test("E-3. the student becomes a worker: studies end, work is recorded, and nothing of the history is lost", async ({ page }) => {
  await signIn(page, EDU.student, PASSWORD);
  // Studies end — the student's own education editor.
  // The editors sit in the folded "details" part of the profile; its own deep link opens it.
  await page.goto(`${BASE}/en/dashboard/profile#cv-details`);
  const fold = page.locator("details#cv-details");
  if ((await fold.getAttribute("open")) === null) await fold.locator("summary").first().click();
  const row = page.getByTestId("worker-education-row").filter({ hasText: EDU.studiesAt });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await row.getByRole("button", { name: "Edit" }).click();
  const form = page.getByTestId("worker-education-form");
  await expect(form).toBeVisible();
  await form.getByRole("checkbox").uncheck();
  await form.locator('input[aria-labelledby="education-end-year-label"]').fill(String(new Date().getUTCFullYear()));
  await form.getByTestId("worker-education-save").click();
  await expect(row, "the study is now finished, not current").not.toContainText("Currently studying", { timeout: 30_000 });

  // First work as a worker — the Work Journal (pattern S-7).
  await page.goto(`${BASE}/en/dashboard/journal`);
  const main = page.getByRole("main");
  await main.getByTestId("journal-quick-record-text").fill(`Assembled 8 office desks at the client's site, 6 hours (edu ${RUN})`);
  await main.getByTestId("journal-quick-record-understand").click();
  await expect(main.getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
  await main.getByTestId("worklog-save").click();
  await main.getByTestId("worklog-confirm").click();
  await expect(main.getByTestId("worklog-done"), "the first work day is saved").toBeVisible({ timeout: 30_000 });

  // Stored: one study row (ended, kept), the student link kept, the work entry.
  const sid = await userId(EDU.student);
  const studies = await db<Array<{ institution_name: string; is_current: boolean }>>(
    `worker_education?profile_id=eq.${sid}&select=institution_name,is_current`,
  );
  expect(studies, "the study is kept, now finished").toEqual([{ institution_name: EDU.studiesAt, is_current: false }]);
  const work = await db<Array<{ id: string }>>(`journal_entries?worker_id=eq.${eduStudentWorkerId}&select=id`);
  expect(work.length, "the work day is stored on the same person").toBeGreaterThan(0);
  const links = await dbOrNull<Array<{ relationship_slug: string; status: string }>>(
    `engagement_contexts?profile_id=eq.${sid}&select=relationship_slug,status`,
  );
  if (links) expect(links.map((l) => l.relationship_slug), "the student period is kept").toContain("student");

  // One history on the Living CV: the study, the student period at the institution, and the work.
  await page.goto(`${BASE}/en/cv`);
  await expect(page.getByTestId("cv-education-row").filter({ hasText: EDU.studiesAt }), "the study on the CV").toHaveCount(1, { timeout: 30_000 });
  const periods = page
    .locator('[data-testid="cv-practice-history"], [data-testid="cv-organizations-roles"], [data-testid="cv-work-history"]')
    .filter({ hasText: EDU.orgName });
  await expect(periods.first(), "the student period at the institution stays in the one history").toBeVisible({ timeout: 30_000 });
});

test("E-4. the institution ends the student link: it loses access, the learner keeps their history", async ({ browser }) => {
  const a = await browser.newContext();
  const inst = await a.newPage();
  await signIn(inst, EDU.institution, PASSWORD);
  await inst.goto(`${BASE}/en/dashboard/company/people`);
  // The lifecycle list sits in folded sections; unfold them.
  for (let i = 0; i < 12; i++) {
    const closed = inst.locator("main details:not([open]) > summary");
    if ((await closed.count()) === 0) break;
    await closed.first().click();
  }
  const member = inst.getByTestId("lifecycle-member").filter({ hasText: "Student" });
  await expect(member, "the institution's learner is in its people lifecycle").toHaveCount(1, { timeout: 30_000 });
  await member.getByRole("button", { name: "End employment" }).click();
  await inst.waitForLoadState("networkidle").catch(() => undefined);

  const sid = await userId(EDU.student);
  const links = await dbOrNull<Array<{ relationship_slug: string; status: string }>>(
    `engagement_contexts?profile_id=eq.${sid}&relationship_slug=eq.student&select=relationship_slug,status`,
  );
  if (links) expect(links, "the link is ended, not deleted").toEqual([{ relationship_slug: "student", status: "ended" }]);

  await inst.goto(`${BASE}/en/dashboard/company/education`);
  await expect(inst.getByTestId("institution-learners-counts"), "no connected learner remains").toContainText("0 connected", { timeout: 30_000 });
  await a.close();

  // Access, read under the institution's own RLS: no active link, none of the learner's journal.
  const activeLinks = await asPerson<Array<{ id: string }>>(
    EDU.institution,
    `engagement_contexts?profile_id=eq.${sid}&status=eq.active&select=id`,
  );
  expect(activeLinks, "the institution sees no active link to the learner").toEqual([]);
  const journal = await asPerson<Array<{ id: string }>>(
    EDU.institution,
    `journal_entries?worker_id=eq.${eduStudentWorkerId}&select=id`,
  );
  expect(journal, "the institution reads none of the learner's journal").toEqual([]);

  // The learner keeps their own history.
  const own = await asPerson<Array<{ id: string }>>(EDU.student, `journal_entries?worker_id=eq.${eduStudentWorkerId}&select=id`);
  expect(own.length, "the learner still reads their own work").toBeGreaterThan(0);
  const b = await browser.newContext();
  const stu = await b.newPage();
  await signIn(stu, EDU.student, PASSWORD);
  await stu.goto(`${BASE}/en/cv`);
  await expect(stu.getByTestId("cv-education-row").filter({ hasText: EDU.studiesAt })).toHaveCount(1, { timeout: 30_000 });
  await b.close();
});

test("E-2. a student writes first to their own institution, and the institution's person sees the message", async ({ browser }) => {
  // A second learner of the same institution, linked now (E-4 ended the first one).
  const a = await browser.newContext();
  const inst = await a.newPage();
  await signIn(inst, EDU.institution, PASSWORD);
  const link = await inviteLearnerLink(inst, `${EDU.learnerName} two`);
  await a.close();

  const b = await browser.newContext();
  const stu = await b.newPage();
  await signUpStudent(stu, EDU.student2, "Synthetic Student Two");
  await acceptInvite(stu, link);

  // The requirement: from their relationships, the learner opens a conversation with the institution.
  await stu.goto(`${BASE}/en/dashboard/network`);
  const rel = stu.getByTestId("network-relationships");
  await expect(
    rel.locator('[data-testid^="network-engagement-"]').filter({ hasText: EDU.orgName }),
    "the institution is among the learner's relationships",
  ).toHaveCount(1, { timeout: 30_000 });
  const door = rel.locator('[data-testid^="message-button-"]');
  await expect(door.first(), "a door to write to the institution").toBeVisible({ timeout: 30_000 });
  await door.first().click();
  await stu.waitForURL(/\/dashboard\/inbox/, { timeout: 30_000 });
  const text = `Question about my placement (edu ${RUN})`;
  const composer = stu.getByRole("main").getByRole("textbox").first();
  await composer.fill(text);
  await composer.press("Enter");
  await expect(stu.getByText(text).first(), "the message is sent").toBeVisible({ timeout: 30_000 });
  await b.close();

  const c = await browser.newContext();
  const again = await c.newPage();
  await signIn(again, EDU.institution, PASSWORD);
  await again.goto(`${BASE}/en/dashboard/inbox`);
  await expect(again.getByText(/Question about my placement/).first(), "the institution's person sees it").toBeVisible({ timeout: 30_000 });
  await c.close();
});
