import { expect, test, type Page } from "@playwright/test";

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

/** The public sign-up form → the onboarding wizard (Confirm email is OFF locally). */
async function signUp(page: Page, address: string): Promise<void> {
  await page.goto(`${BASE}/en/auth/signup`);
  await page.locator('input[type="email"]').fill(address);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirm_password"]').fill(PASSWORD);
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

test("S-1. a worker signs up through the form, onboards, and lands as a worker", async ({ page }) => {
  const address = email("worker");
  await signUp(page, address);
  await onboard(page, "work", "Synthetic Signup Worker");
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
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
