/**
 * GLOBAL ACCESS — representative countries through the SHIPPED UI, on the LOCAL stack.
 *
 * Owner directive 2026-09-22 §2: LabourMarket.ai is global by default. MARKET
 * PRIORITY != ACCESS PERMISSION — a market list may ORDER a country select, it
 * may never SHORTEN it. Representative codes: LT SE DE IE VN US SA GE PH (two
 * active markets, one EU non-market, and six countries the product used to gate
 * silently — the `countries` table held 10 rows, the onboarding select mapped
 * ACTIVE_MARKETS, the draft leg dropped the picked country).
 *
 * Per code, the SAME three surfaces the production walk drives
 * (docs/launch/pilot-feedback/walks-2026-09-22/walk-global-access-prod.cjs),
 * each proven by the DATABASE ROW, not the screen:
 *
 *   1. company setup  `company-setup-country` selectOption(code) → save draft →
 *      no invalid-country banner → companies.country = code AND
 *      organizations.country = code (the mirror trigger + the FK to countries).
 *   2. work card      the country NAME in the UI locale typed into
 *      name=location_country ("Vietnamas", "Airija", "Saudo Arabija"), the
 *      names list into name=preferred_countries → save →
 *      workers.current_location_country = code, preferred_countries = codes.
 *   3. demand DRAFT   role + description → next → `demand-country-select`
 *      (option by its lt label) → `demand-save-draft` ONLY (never
 *      `demand-create`) → customer_requests.country = code, payload.country =
 *      code, status stays 'draft'.
 *
 * Plus the onboarding select for a FRESH local identity (created through the
 * LOCAL auth admin API — the loopback guard refuses anything else): it must
 * list every code.
 *
 * Local stack only (`pnpm -C apps/web e2e:local`). Every DB call goes through
 * the loopback-guarded helper; the cloud project is never a target. Needs
 * migration 20260922120000_countries_all_iso_v1 applied locally
 * (`npx supabase migration up` / `db reset`) — without it the six non-market
 * codes fail leg 1 with the honest invalid-country banner, which is the very
 * gate the migration removes.
 */
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { db, dbOk, HAS_LOCAL_STACK, SUPA_SERVICE, SUPA_URL } from "./market-map-db-state";

const CODES = ["LT", "SE", "DE", "IE", "VN", "US", "SA", "GE", "PH"] as const;
const UI_LOCALE = "lt";
const SHOTS = join(__dirname, "..", "..", "test-results", "global-access-countries");

/** The fixture people (dev-fixtures.sql) — hand-written ids, password `password`. */
const COMPANY_PROFILE = "aaaaaaaa-0000-0000-0000-000000000002";
const WORKER_PROFILE = "aaaaaaaa-0000-0000-0000-000000000001";
const LEGACY_COMPANY = "cccccccc-0000-0000-0000-000000000001";
const COMPANY = { email: "dev.company@local.test", password: "password" };
const WORKER = { email: "dev.worker@local.test", password: "password" };

const DRAFT_ROLE = "E2E Global Access (testinis)";
const DRAFT_DESCRIPTION =
  "Reikia 1 darbuotojo — E2E global-access patikra, juodraštis, nesiunčiama.";
/** messages/lt.json companySetup.statusInvalidCountry — the banner that must NOT appear. */
const INVALID_COUNTRY_PREFIX = "Pasirinkite šalį iš sąrašo";

/** The country NAME in the UI locale — the same CLDR data `countryDisplayName` uses. */
const nameOf = (code: string, locale = UI_LOCALE): string =>
  new Intl.DisplayNames([locale, "en"], { type: "region", fallback: "code" }).of(code) ?? code;

async function rows<T = Record<string, unknown>>(path: string): Promise<T[]> {
  const res = await db("GET", path);
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T[];
}

/**
 * The login form is a CLIENT form: a submit that lands before hydration is a
 * plain POST the server answers with the same page (measured 2026-09-22 on a
 * cold dev server: POST /lt/auth/login 200, no navigation, no alert). So the
 * page is loaded to network-idle first, and the submit is retried when nothing
 * moved — a cold compile must never read like a wrong password.
 */
async function loginAs(page: Page, creds: { email: string; password: string }): Promise<void> {
  await page.goto(`/${UI_LOCALE}/auth/login`, { waitUntil: "networkidle", timeout: 120_000 });
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.waitForTimeout(2_000);
    await page.locator('input[type="email"]').fill(creds.email);
    await page.locator('input[type="password"]').fill(creds.password);
    await page.locator('button[type="submit"]').first().click();
    const moved = await page
      .waitForURL(/\/dashboard|\/onboarding/, { timeout: 30_000, waitUntil: "domcontentloaded" })
      .then(() => true)
      .catch(() => false);
    if (moved) return;
    // A slow navigation may land right here — reading the page mid-navigation
    // is not a refusal.
    const alerts = await page.locator('[role="alert"]').allInnerTexts().catch(() => [] as string[]);
    if (/\/dashboard|\/onboarding/.test(page.url())) return;
    if (alerts.length > 0) throw new Error(`login refused for ${creds.email}: ${alerts.join(" | ")}`);
    if (!/\/auth\/login/.test(page.url())) {
      await page.goto(`/${UI_LOCALE}/auth/login`, { waitUntil: "networkidle", timeout: 120_000 });
    }
  }
  throw new Error(`login did not leave /auth/login for ${creds.email} after 3 attempts`);
}

type CompanyRow = { id: string; country: string | null; verification_status: string | null };
type OrgRow = { id: string; country: string | null };
type WorkerRow = {
  id: string;
  current_location_country: string | null;
  preferred_countries: string[] | null;
  work_card_confirmed_at: string | null;
};
type DraftRow = {
  id: string;
  status: string;
  country: string | null;
  payload: { country?: string } | null;
};

const companyRows = () =>
  rows<CompanyRow>(`companies?profile_id=eq.${COMPANY_PROFILE}&select=id,country,verification_status`);
const orgRows = () =>
  rows<OrgRow>(`organizations?legacy_company_id=eq.${LEGACY_COMPANY}&select=id,country`);
const workerRows = () =>
  rows<WorkerRow>(
    `workers?profile_id=eq.${WORKER_PROFILE}&select=id,current_location_country,preferred_countries,work_card_confirmed_at`,
  );
const draftRows = () =>
  rows<DraftRow>(
    `customer_requests?profile_id=eq.${COMPANY_PROFILE}&kind=eq.company_request&status=eq.draft&select=id,status,country,payload`,
  );
const walkTitleRows = () =>
  rows<{ id: string; status: string }>(
    `customer_requests?profile_id=eq.${COMPANY_PROFILE}&title=eq.${encodeURIComponent(DRAFT_ROLE)}&select=id,status`,
  );

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

test.describe("global access — LT SE DE IE VN US SA GE PH through the shipped UI", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");

  let baselineCompany: CompanyRow[] = [];
  let baselineWorker: WorkerRow | null = null;
  let companyPage: Page;
  let workerPage: Page;

  test.beforeAll(async ({ browser }) => {
    // Two cold logins on a shared dev server (each route compiles on first
    // request) have been measured past the 120 s per-test budget this hook
    // inherits — patience for the boot, not for the assertions.
    test.setTimeout(600_000);
    mkdirSync(SHOTS, { recursive: true });
    baselineCompany = await companyRows();
    baselineWorker = (await workerRows())[0] ?? null;
    // The walk's own draft rows from an earlier run — gone before we start, so
    // the one-draft-per-kind upsert below is measured from a clean slate.
    await db(
      "DELETE",
      `customer_requests?profile_id=eq.${COMPANY_PROFILE}&title=eq.${encodeURIComponent(DRAFT_ROLE)}`,
    );
    const companyCtx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: `${UI_LOCALE}-LT`,
    });
    const workerCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: `${UI_LOCALE}-LT`,
    });
    companyPage = await companyCtx.newPage();
    workerPage = await workerCtx.newPage();
    await loginAs(companyPage, COMPANY);
    await loginAs(workerPage, WORKER);
  });

  test.afterAll(async () => {
    // Restore the fixture rows this spec moved (LOCAL rows, service role,
    // loopback-guarded). The walk's draft rows are removed by title.
    for (const c of baselineCompany) {
      await db("PATCH", `companies?id=eq.${c.id}`, { country: c.country });
    }
    if (baselineWorker) {
      await db("PATCH", `workers?id=eq.${baselineWorker.id}`, {
        current_location_country: baselineWorker.current_location_country,
        preferred_countries: baselineWorker.preferred_countries,
        work_card_confirmed_at: baselineWorker.work_card_confirmed_at,
      });
    }
    await db(
      "DELETE",
      `customer_requests?profile_id=eq.${COMPANY_PROFILE}&title=eq.${encodeURIComponent(DRAFT_ROLE)}`,
    );
    await companyPage?.context().close();
    await workerPage?.context().close();
  });

  test("the countries table lists every representative code (migration 20260922120000)", async () => {
    const seeded = await rows<{ code: string }>(
      `countries?code=in.(${CODES.join(",")})&select=code`,
    );
    const codes = seeded.map((r) => r.code).sort();
    expect(codes, "apply 20260922120000_countries_all_iso_v1 locally (npx supabase migration up)").toEqual(
      [...CODES].sort(),
    );
  });

  // One test per code, so each carries its own time budget on a dev server that
  // compiles every route on first request (LT+SE alone took 4 min cold on
  // 2026-09-22) and a failure names the country in the report.
  for (const code of CODES) {
    test(`company setup ${code}: the select lists the code and the mirror row follows`, async () => {
      const page = companyPage;
      expect(baselineCompany.length, "the fixture company must exist").toBeGreaterThan(0);
      {
        await page.goto(`/${UI_LOCALE}/dashboard/start/company`, { waitUntil: "domcontentloaded" });
        const form = page.getByTestId("company-setup-form");
        await expect(form).toBeVisible({ timeout: 60_000 });
        const select = page.getByTestId("company-setup-country");
        await expect(select).toBeEnabled();
        const values = await select.locator("option").evaluateAll((os) =>
          os.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
        );
        expect(values, `${code} is offered in the company country select`).toContain(code);
        // Every ISO country, not a market shortlist.
        expect(values.length).toBeGreaterThanOrEqual(240);
        await select.selectOption(code);
        await page.getByTestId("company-setup-save-draft").click();
        const result = page.getByTestId("company-setup-result");
        await expect(result).toBeVisible({ timeout: 60_000 });
        const text = (await result.innerText()).trim();
        expect(text.startsWith(INVALID_COUNTRY_PREFIX), `${code}: no invalid-country banner`).toBe(false);
        await page.screenshot({ path: join(SHOTS, `${code}-1-company.png`), fullPage: true });

        // THE PROOF IS THE ROW — both sides of the mirror.
        await expect
          .poll(async () => (await companyRows()).map((c) => c.country), { timeout: 20_000 })
          .toEqual(baselineCompany.map(() => code));
        await expect
          .poll(async () => (await orgRows()).map((o) => o.country), { timeout: 20_000 })
          .toEqual((await orgRows()).map(() => code));
        expect((await orgRows()).length, "the organization mirror row exists").toBeGreaterThan(0);
      }
    });
  }

  for (const code of CODES) {
    test(`work card ${code}: the country NAME typed in the UI locale is stored as the CODE`, async () => {
      const page = workerPage;
      expect(baselineWorker, "the fixture worker must exist").not.toBeNull();
      const preferredNames = CODES.map((c) => nameOf(c)).join(", ");
      {
        await page.goto(`/${UI_LOCALE}/dashboard?result=player-card`, { waitUntil: "domcontentloaded" });
        const host = page.getByTestId("player-card-work-editor");
        await expect(host).toBeVisible({ timeout: 60_000 });
        if ((await host.getByTestId("work-card-editor").count()) === 0) {
          await host.getByTestId("work-card-editor-toggle").click();
        }
        const form = host.getByTestId("work-card-editor");
        await expect(form).toBeVisible();
        await form.locator('input[name="location_country"]').fill(nameOf(code));
        await form.locator('input[name="preferred_countries"]').fill(preferredNames);
        await form.locator('button[type="submit"]').first().click();
        const status = form.locator('[role="status"]').first();
        await expect(status).toBeVisible({ timeout: 30_000 });
        await expect(status, `${code}: the save reports success, not an error`).not.toHaveClass(
          /text-state-danger/,
        );
        await page.screenshot({ path: join(SHOTS, `${code}-2-workcard.png`), fullPage: true });

        await expect
          .poll(async () => (await workerRows())[0]?.current_location_country ?? null, { timeout: 20_000 })
          .toBe(code);
        const preferred = (await workerRows())[0]?.preferred_countries ?? [];
        expect([...preferred].sort(), `${code}: preferred names resolved to the nine codes`).toEqual(
          [...CODES].sort(),
        );
      }
    });
  }

  for (const code of CODES) {
    test(`demand DRAFT ${code}: the picked country lands on customer_requests.country, nothing is submitted`, async () => {
      const page = companyPage;
      {
        const label = nameOf(code);
        await page.goto(`/${UI_LOCALE}/dashboard/company/needs`, {
          waitUntil: "networkidle",
          timeout: 120_000,
        });
        const form = page.getByTestId("demand-form");
        await expect(form).toBeVisible({ timeout: 60_000 });
        if ((await page.getByTestId("demand-back").count()) > 0) await page.getByTestId("demand-back").click();
        // The wizard is a CONTROLLED client form. A fill that lands before
        // hydration leaves the text in the DOM but not in React state — and
        // React's value tracker then treats a re-fill of the SAME text as no
        // change, so no onChange ever fires and `demand-next` stays disabled
        // (measured 2026-09-22: 30 identical re-fills over 120 s, gate closed).
        // So the page is loaded to network-idle and every retry CLEARS first.
        const next = page.getByTestId("demand-next");
        for (let attempt = 1; attempt <= 5; attempt++) {
          await page.getByTestId("demand-role").fill("");
          await page.getByTestId("demand-description").fill("");
          await page.getByTestId("demand-role").fill(DRAFT_ROLE);
          await page.getByTestId("demand-description").fill(DRAFT_DESCRIPTION);
          if (await next.isEnabled({ timeout: 5_000 }).catch(() => false)) break;
          await page.waitForTimeout(3_000);
        }
        await expect(next, "the description gate opens once the typed text is held").toBeEnabled();
        await next.click();
        const listbox = page.getByTestId("demand-country-select");
        await expect(listbox).toBeVisible({ timeout: 30_000 });
        await listbox.click();
        const options = page.locator('ul[role="listbox"] li[role="option"] button');
        await expect(options.first()).toBeVisible();
        const option = options.filter({
          hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(✓)?\\s*$`),
        });
        expect(await option.count(), `${code} (${label}) is offered in the criteria listbox`).toBeGreaterThan(0);
        await option.first().click();
        await expect(listbox).toContainText(label);
        // ONLY the private draft — never `demand-create`.
        await page.getByTestId("demand-save-draft").click();
        await expect(page.getByTestId("demand-draft-saved")).toBeVisible({ timeout: 45_000 });
        await page.screenshot({ path: join(SHOTS, `${code}-3-draft.png`), fullPage: true });

        await expect
          .poll(async () => (await draftRows())[0]?.country ?? null, { timeout: 20_000 })
          .toBe(code);
        const draft = (await draftRows())[0];
        expect(draft.payload?.country, `${code}: the payload keeps the code too`).toBe(code);
        expect(draft.status).toBe("draft");
        // One draft per profile+kind (partial unique index) and no submitted leak.
        const walkRows = await walkTitleRows();
        expect(walkRows.map((r) => r.status)).toEqual(["draft"]);
      }
    });
  }

  test("onboarding: a fresh identity is offered every code, active markets first", async ({ browser }) => {
    // A fresh identity pays two cold compiles in a row (login → /dashboard →
    // forwarded to /onboarding: 105 s + 90 s measured 2026-09-22) before the
    // select exists. Budget for the boot; the assertions keep their own clocks.
    test.setTimeout(600_000);
    const fresh = await createFreshLocalUser();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: `${UI_LOCALE}-LT` });
    const page = await ctx.newPage();
    try {
      await loginAs(page, fresh);
      await page.goto(`/${UI_LOCALE}/onboarding`, { waitUntil: "networkidle", timeout: 120_000 });
      await page.getByTestId("onboarding-intent-work").waitFor({ timeout: 60_000 });
      // The intent card is a client toggle: a click before hydration ticks
      // nothing and "Tęsti" stays disabled (measured 2026-09-22). Click until
      // the gate opens.
      const cont = page.getByTestId("onboarding-intents-continue");
      for (let attempt = 1; attempt <= 5; attempt++) {
        if (await cont.isEnabled().catch(() => false)) break; // a toggle: never re-click a ticked card
        await page.getByTestId("onboarding-intent-work").click();
        if (await cont.isEnabled({ timeout: 5_000 }).catch(() => false)) break;
        await page.waitForTimeout(3_000);
      }
      await expect(cont, "an intent ticked opens the continue gate").toBeEnabled();
      await cont.click();
      const select = page.locator('select[name="country"]');
      await expect(select).toBeVisible({ timeout: 30_000 });
      const values = await select.locator("option").evaluateAll((os) =>
        os.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
      );
      for (const code of CODES) expect(values, `${code} is offered at onboarding`).toContain(code);
      expect(values.length).toBeGreaterThanOrEqual(240);
      // Ordering: the active markets come before the rest (a market list orders).
      expect(values.indexOf("LT")).toBeLessThan(values.indexOf("VN"));
      await page.screenshot({ path: join(SHOTS, `4-onboarding-select.png`), fullPage: true });
    } finally {
      await ctx.close();
      await deleteLocalUser(fresh.id);
    }
  });
});

/**
 * A throwaway identity on the LOCAL auth server (never the cloud: the same
 * loopback assertion `db()` makes). The production walk never creates users —
 * an onboarded identity cannot reach the wizard, so here, where a user costs
 * nothing and the database is reset routinely, one is minted and removed.
 */
async function authAdmin(method: "POST" | "DELETE", path: string, body?: unknown): Promise<Response> {
  if (!/^(127\.0\.0\.1|localhost)$/.test(new URL(SUPA_URL).hostname)) {
    throw new Error(`refusing to create a user on a non-local target: ${SUPA_URL}`);
  }
  return fetch(`${SUPA_URL}/auth/v1/admin/${path}`, {
    method,
    headers: { apikey: SUPA_SERVICE, Authorization: `Bearer ${SUPA_SERVICE}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createFreshLocalUser(): Promise<{ id: string; email: string; password: string }> {
  const email = `e2e-global-access-${Date.now()}@local.test`;
  const password = `pw-${Date.now()}-global`;
  const res = await authAdmin("POST", "users", { email, password, email_confirm: true });
  if (!res.ok) throw new Error(`create local user → ${res.status}: ${await res.text()}`);
  const user = (await res.json()) as { id: string };
  // handle_new_user normally seeds the profile shell; make sure a row exists so
  // the dashboard layout forwards to /onboarding rather than failing.
  await dbOk("POST", "profiles?on_conflict=id", { id: user.id, full_name: "E2E Global Access" }, "resolution=ignore-duplicates,return=minimal");
  return { id: user.id, email, password };
}

async function deleteLocalUser(id: string): Promise<void> {
  await db("DELETE", `profiles?id=eq.${id}`);
  await authAdmin("DELETE", `users/${id}`);
}
