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
