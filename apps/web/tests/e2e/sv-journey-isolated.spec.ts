import { expect, test, type Page } from "@playwright/test";

/**
 * THE SWEDISH JOURNEY, end to end, at phone and desktop width, on a THROWAWAY
 * LOCAL Supabase stack (.github/workflows/signup-isolated.yml).
 *
 * Sweden is the first commercial market (owner decision 2026-11-11); `sv` is a
 * routed locale since 2026-11-12. This walk is what a Swedish visitor actually
 * does: the landing in Swedish → sign-up → a profile that says Sverige → a job
 * search that stays in Swedish → a company that describes its first need. At
 * every step the page must be Swedish (`<html lang="sv">`, Swedish copy, no
 * English `[EN]` placeholder, no raw message key) and must never bounce the
 * reader to another locale.
 *
 * Same rules as signup-isolated.spec.ts: it refuses to run anywhere but the
 * local stack, and outcomes are checked in that database (a page saying "done"
 * is not the proof; the stored rows are).
 */

const BASE = process.env.E2E_BASE_URL ?? "";
const SB_URL = process.env.E2E_SUPABASE_URL ?? "";
const SB_SERVICE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? "";
const LOCAL = /^http:\/\/127\.0\.0\.1:\d+$/;

test.skip(
  process.env.SIGNUP_ISOLATED !== "1" || !LOCAL.test(BASE) || SB_URL !== "http://127.0.0.1:54321" || !SB_SERVICE,
  "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)",
);
test.setTimeout(180_000);

const RUN = Date.now().toString(36);
const PASSWORD = "Synthetic-Pass-2026!";

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

/** The page is Swedish: the document says so, and nothing untranslated leaks. */
async function expectSwedish(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", "sv");
  expect(new URL(page.url()).pathname, "the reader stays on the Swedish route").toMatch(/^\/sv(\/|$)/);
  const text = await page.locator("body").innerText();
  expect(text, "no English placeholder").not.toContain("[EN]");
  // next-intl renders a missing message as its dotted key path ("auth.signup.title").
  // Any such token on the page, other than a host name, is an unresolved key.
  // Segments of 3+ letters, so Swedish abbreviations (fr.o.m., t.o.m., o.s.v.) do not count.
  const keyLike = (text.match(/\b[a-zA-Z][a-zA-Z0-9]{2,}(?:\.[a-zA-Z][a-zA-Z0-9_]{2,}){2,}\b/g) ?? []).filter(
    (token) => !/labourmarket|\.(?:ai|com|se|eu|org|net|lt)$/i.test(token),
  );
  expect(keyLike, "no unresolved message key on the page").toEqual([]);
}

const VIEWPORTS = [
  { name: "mobile", viewport: { width: 390, height: 844 } },
  { name: "desktop", viewport: { width: 1280, height: 800 } },
] as const;

for (const { name, viewport } of VIEWPORTS) {
  test.describe(`sv journey · ${name}`, () => {
    test.describe.configure({ mode: "serial" });
    test.use({ viewport });

    const worker = `sv.worker.${name}.${RUN}@local.test`;
    const company = `sv.company.${name}.${RUN}@local.test`;

    test(`SV-1 ${name}: the landing is Swedish and tells search engines about every language`, async ({ page }) => {
      await page.goto(`${BASE}/sv`);
      await expectSwedish(page);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // hreflang: the Swedish page is one of the alternates, and x-default exists.
      await expect(page.locator('link[rel="alternate"][hreflang="sv"]')).toHaveCount(1);
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveCount(1);
      // No horizontal overflow at this width.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(1);
    });

    test(`SV-2 ${name}: a worker signs up in Swedish and onboards with Sverige as the country`, async ({ page }) => {
      await page.goto(`${BASE}/sv/auth/signup`);
      await expectSwedish(page);
      await page.locator('input[type="email"]').fill(worker);
      await page.locator('input[name="password"]').fill(PASSWORD);
      await page.locator('input[name="confirm_password"]').fill(PASSWORD);
      await page.locator('form button[type="submit"]').click();
      await page.waitForURL(/\/sv\/onboarding/, { timeout: 60_000 });
      await expect(page.getByTestId("onboarding-intents")).toBeVisible({ timeout: 30_000 });
      await expectSwedish(page);
      await page.getByTestId("onboarding-intent-work").click();
      await page.getByTestId("onboarding-intents-continue").click();
      await page.getByTestId("onboarding-display-name").fill(`Syntetisk arbetstagare ${name}`);
      await page.getByTestId("onboarding-country").click();
      // The country list is named in Swedish.
      await page.getByRole("option", { name: /^Sverige/ }).first().click();
      await page.getByTestId("onboarding-submit").click();
      await page.waitForURL(/\/sv\/dashboard/, { timeout: 60_000 });
      await expectSwedish(page);

      const id = await userId(worker);
      const [profile] = await db<Array<{ onboarded: boolean | null; country: string | null; locale?: string | null }>>(
        `profiles?id=eq.${id}&select=onboarded,country`,
      );
      expect(profile?.onboarded, "profile is onboarded").toBe(true);
      expect(profile?.country, "the country is stored as ISO SE").toBe("SE");
    });

    test(`SV-3 ${name}: the worker's profile (Levande CV) opens in Swedish`, async ({ page }) => {
      await page.goto(`${BASE}/sv/auth/login`);
      await page.locator('input[name="email"]').fill(worker);
      await page.locator('input[name="password"]').fill(PASSWORD);
      await page.locator('form button[type="submit"]').first().click();
      await page.waitForURL(/\/sv\/dashboard/, { timeout: 60_000 });
      await page.goto(`${BASE}/sv/cv`);
      await expect(page.getByRole("main")).toBeVisible({ timeout: 30_000 });
      await expectSwedish(page);
    });

    test(`SV-4 ${name}: a Swedish profession word becomes its filter, and a free word stays a search`, async ({ page }) => {
      await page.goto(`${BASE}/sv/jobs`);
      await expectSwedish(page);
      // "svetsare" is the Swedish catalogue's own word for a welder, so the
      // board answers with the profession filter — not a text search.
      await page.locator("#q").fill("svetsare");
      await page.locator("#q").press("Enter");
      await page.waitForURL(/\/sv\/jobs\?.*profession=welder/, { timeout: 30_000 });
      await expectSwedish(page);
      await expect(page.getByTestId("public-jobs-unavailable")).toHaveCount(0);
      // A word no catalogue names stays a free-text search, still in Swedish.
      await page.goto(`${BASE}/sv/jobs`);
      await page.locator("#q").fill("Göteborg");
      await page.locator("#q").press("Enter");
      await page.waitForURL(/\/sv\/jobs\?.*q=G/, { timeout: 30_000 });
      await expectSwedish(page);
      // Either real results or an honest Swedish empty state — never an error page.
      await expect(page.getByTestId("public-jobs-unavailable")).toHaveCount(0);
    });

    test(`SV-5 ${name}: a Swedish company signs up, sets up in SE, and describes its first need`, async ({ page }) => {
      await page.goto(`${BASE}/sv/auth/signup`);
      await page.locator('input[type="email"]').fill(company);
      await page.locator('input[name="password"]').fill(PASSWORD);
      await page.locator('input[name="confirm_password"]').fill(PASSWORD);
      await page.locator('form button[type="submit"]').click();
      await page.waitForURL(/\/sv\/onboarding/, { timeout: 60_000 });
      await page.getByTestId("onboarding-intent-hire").click();
      await page.getByTestId("onboarding-intents-continue").click();
      await page.getByTestId("onboarding-display-name").fill(`Syntetisk ägare ${name}`);
      await page.getByTestId("onboarding-country").click();
      await page.getByRole("option", { name: /^Sverige/ }).first().click();
      await page.getByTestId("onboarding-submit").click();
      await page.waitForURL(/\/sv\/dashboard\/start\/company/, { timeout: 60_000 });
      await expect(page.getByTestId("company-setup-form")).toBeVisible({ timeout: 30_000 });
      await expectSwedish(page);
      await page.getByTestId("company-setup-legal-name").fill(`Syntetiskt Bygg AB ${name} ${RUN}`);
      await page.getByTestId("company-setup-country").selectOption("SE");
      await page.getByTestId("company-setup-save-draft").click();
      await expect(page.getByTestId("company-setup-result")).toBeVisible({ timeout: 30_000 });

      await page.goto(`${BASE}/sv/dashboard/company/needs?audience=need#demand-intake`);
      const main = page.getByRole("main");
      await expectSwedish(page);
      await main.getByTestId("demand-role").fill(`Svetsare ${name} ${RUN}`);
      await main.getByTestId("demand-description").fill("Vi behöver två svetsare i tre veckor i Göteborg, start i december.");
      await main.getByTestId("demand-next").click();
      const size = main.getByTestId("demand-team-size");
      if (await size.isVisible().catch(() => false)) await size.fill("2");
      await main.getByTestId("demand-next").click();
      await main.getByTestId("demand-create").click();
      await expect(main.getByTestId("demand-done"), "the first need is accepted").toBeVisible({ timeout: 30_000 });
      await expectSwedish(page);

      const id = await userId(company);
      const needs = await db<Array<{ id: string }>>(
        `customer_requests?profile_id=eq.${id}&select=id`,
      );
      expect(needs.length, "the need is stored for the company").toBeGreaterThan(0);
    });
  });
}
