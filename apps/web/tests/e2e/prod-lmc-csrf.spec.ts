import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, request as playwrightRequest, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";

import { qaAppOrigin } from "./prod-qa-api";

/**
 * PRODUCTION — TWO REGISTRY ROWS THAT HAD NO PRODUCTION WALK (2026-10-25):
 *
 *   7.25 LMC balance and history — the worker asks the chat "Kiek turiu LMC?",
 *        the chat answers with ONE door (`chat-chip-link:/dashboard/account#lmc`,
 *        intent `lmc` in lib/conversation/intent-router.ts) and the door opens
 *        the balance section itself, not a page top. The section is READ-ONLY
 *        (`readOwnLmcAccount`): no top-up control, no form. Its state is one of
 *        `ready` (a real figure, `data-cents`), `no_account` (no figure — no
 *        ledger yet) or `unavailable` (no figure — could not be read); UNKNOWN
 *        IS NEVER ZERO (SEP-7). The owner asks in English (L-*).
 *   9.11 Same-origin checks, anonymous — a cross-origin POST is refused and the
 *        same request from the site's own page is validated normally (O-*):
 *          · `/api/assistant/transcript` (lib/http/same-origin-request.ts):
 *            foreign Origin → 403 `{saved:false}`; a cross-site
 *            `Sec-Fetch-Site` → 403; no Origin at all → 403; from the site's
 *            own page → 400 for a malformed body, 200 `{saved:false}` for a
 *            valid one (anonymous: the writer has no person, nothing is stored);
 *          · a Server Action POST (Next.js CSRF check, action-handler.js): a
 *            foreign Origin is aborted BEFORE the action id is even looked up
 *            (no `x-nextjs-action-not-found`), while the same POST from the
 *            site's own page reaches the lookup and answers 404 + that header.
 *            The action id is made up, so nothing can run.
 *          Never touched: `/api/waitlist` (it writes a row) or any other writer.
 *
 * Cast: worker (qa.worker+multiw), owner (qa.owner+multiw); anonymous for the
 * refused checks and for O-*. WRITES: the two chat questions are appended to
 * each person's own assistant transcript (prefixed `QA-SYNTHETIC <run>`); the
 * transcript is append-only, hash-chained history and has no delete door, so
 * those turns stay. Nothing else is written; the LMC ledger is only read, and
 * every O-* request is anonymous and refused or validated without a write.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const TAG = `QA-SYNTHETIC ${RUN}`;
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["worker", "owner"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;

async function as(
  browser: Browser,
  slot: string | null,
  opts: { locale?: "lt-LT" | "en-GB"; phone?: boolean } = {},
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    ...(slot ? { storageState: state(slot) } : {}),
    locale: opts.locale ?? "lt-LT",
    ...(opts.phone ? PHONE : {}),
  });
  return { ctx, page: await ctx.newPage() };
}

/** The page content, never the streaming holder (prod-company-chain.spec.ts, #2729). */
const inMain = (page: Page): Locator => page.getByRole("main");
const settle = (page: Page) => page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);

async function rendered(page: Page, label: string): Promise<void> {
  expect(/\/auth\/(login|sign-?in)/.test(page.url()), `${label}: bounced to sign-in`).toBe(false);
  await expect(page.getByTestId("error-boundary-message"), `${label}: error boundary`).toHaveCount(0);
  await expect(page.getByTestId("global-error-message"), `${label}: global error`).toHaveCount(0);
}

async function fitsPhone(page: Page, label: string): Promise<void> {
  const { doc, body, inner } = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(Math.max(doc, body), `${label}: wider than the phone (innerWidth ${inner})`).toBeLessThanOrEqual(inner + 1);
}

// ═══════════════════════════════════════════════════ 7.25 LMC balance (L)

type LmcReading = { state: string; cents: string | null };

/**
 * The balance section, honest in each of its three states. Unknown is never
 * zero: only `ready` carries a figure, and it is a whole number of cents.
 */
async function readLmc(page: Page, words: { noAccount: RegExp; unavailable: RegExp }): Promise<LmcReading> {
  const section = inMain(page).getByTestId("lmc-balance-section");
  // The fold opens on the `#lmc` hash after hydration (DetailsHashOpener).
  await expect(section, "the door lands on the balance section itself").toBeVisible({ timeout: 30_000 });
  const st = (await section.getAttribute("data-state")) ?? "";
  expect(["ready", "no_account", "unavailable"], `lmc state "${st}"`).toContain(st);
  const figure = section.getByTestId("lmc-available");
  if (st === "ready") {
    await expect(figure).toHaveCount(1);
    const cents = (await figure.getAttribute("data-cents")) ?? "";
    expect(cents, "a measured balance is a whole number of cents").toMatch(/^-?\d+$/);
    await expect(figure).toContainText("LMC");
    // History: either the movements (newest first) or the honest "none yet".
    const movements = section.getByTestId("lmc-movement");
    await expect(section.getByTestId("lmc-latest").or(section.getByTestId("lmc-no-movements")).first()).toBeVisible();
    if ((await section.getByTestId("lmc-history").count()) > 0) {
      await section.getByTestId("lmc-history").locator("summary").click();
      await expect(movements.first()).toBeVisible({ timeout: 10_000 });
      for (const dir of await movements.evaluateAll((ns) => ns.map((n) => n.getAttribute("data-direction")))) {
        expect(["credit", "debit"]).toContain(dir);
      }
    }
    return { state: st, cents };
  }
  // No figure at all in the other two states — neither a 0 nor a placeholder number.
  await expect(figure, "no balance figure without a measured balance").toHaveCount(0);
  if (st === "no_account") await expect(section.getByTestId("lmc-no-account")).toContainText(words.noAccount);
  else await expect(section.getByTestId("lmc-unavailable")).toContainText(words.unavailable);
  return { state: st, cents: null };
}

/** Read-only: no top-up, purchase or spend control anywhere in the section. */
async function readOnly(page: Page): Promise<void> {
  const section = inMain(page).getByTestId("lmc-balance-section");
  await expect(section.locator("form"), "the balance section carries no form").toHaveCount(0);
  await expect(section.locator("button, input, select, textarea"), "the balance section carries no control").toHaveCount(0);
}

/** Ask the chat, take its one door, and land on the balance. */
async function askAndOpen(page: Page, locale: "lt" | "en", sentence: string, chipLabel: RegExp): Promise<void> {
  await page.goto(`/${locale}/dashboard`);
  await rendered(page, `chat (${locale})`);
  const composer = inMain(page).getByTestId("composer-input");
  await expect(composer).toBeVisible({ timeout: 60_000 });
  await settle(page);
  const door = inMain(page).getByTestId("chat-chip-link:/dashboard/account#lmc");
  const before = await door.count();
  await composer.fill(sentence);
  await inMain(page).getByTestId("composer-send").click();
  await expect.poll(() => door.count(), { timeout: 45_000, intervals: [1_000] }).toBeGreaterThan(before);
  const chip = door.last();
  await expect(chip).toHaveText(chipLabel);
  await chip.click();
  await page.waitForURL(/\/dashboard\/account/, { timeout: 30_000 });
  expect(new URL(page.url()).hash, "the door opens the section, not the page top").toBe("#lmc");
}

const LT_WORDS = { noAccount: /LMC sąskaita dar nesukurta/, unavailable: /Tai nereiškia, kad likutis nulinis/ };
const EN_WORDS = { noAccount: /No LMC account yet/, unavailable: /does not mean it is zero/ };

let workerReading: LmcReading | null = null;

test("L-1 (7.25). the worker asks 'Kiek turiu LMC?' and the chat's door opens the balance and history", async ({ browser }) => {
  const { ctx, page } = await as(browser, "worker");
  await askAndOpen(page, "lt", `${TAG}: Kiek turiu LMC?`, /Atidaryti LMC/);
  await rendered(page, "account");
  workerReading = await readLmc(page, LT_WORDS);
  console.info(`[lmc] worker state=${workerReading.state}`);
  await readOnly(page);
  await ctx.close();
});

test("L-2 (7.25). a fresh load reads the same balance — nothing moved by reading it; it fits a phone", async ({ browser }) => {
  test.skip(!workerReading, "L-1 did not read the balance");
  const { ctx, page } = await as(browser, "worker", { phone: true });
  await page.goto("/lt/dashboard/account#lmc");
  await page.reload();
  await rendered(page, "account (phone)");
  const again = await readLmc(page, LT_WORDS);
  expect(again, "reading the balance changes nothing").toEqual(workerReading);
  await readOnly(page);
  await fitsPhone(page, "account with the LMC section");
  await ctx.close();
});

test("L-3 (7.25). the owner asks in English and reads their own balance in English", async ({ browser }) => {
  const { ctx, page } = await as(browser, "owner", { locale: "en-GB" });
  await askAndOpen(page, "en", `${TAG}: How much LMC do I have?`, /Open LMC/);
  await rendered(page, "account (en)");
  expect((await page.locator("html").getAttribute("lang"))?.slice(0, 2)).toBe("en");
  await expect(inMain(page).getByTestId("lmc-balance-section")).toContainText("LMC credit");
  const reading = await readLmc(page, EN_WORDS);
  console.info(`[lmc] owner state=${reading.state}`);
  await readOnly(page);
  await ctx.close();
});

test("L-4 (7.25). REFUSED: a signed-out visitor never reaches a balance", async ({ browser }) => {
  const { ctx, page } = await as(browser, null);
  await page.goto("/lt/dashboard/account#lmc");
  await expect(page, "the account page sends a stranger to sign in").toHaveURL(/\/auth\/login/, { timeout: 30_000 });
  await expect(page.getByTestId("lmc-balance-section")).toHaveCount(0);
  await expect(page.getByTestId("lmc-available")).toHaveCount(0);
  await ctx.close();
});

// ═════════════════════════════════════════ 9.11 same-origin checks (O)

const FOREIGN = "https://evil.example";
const TRANSCRIPT = "/api/assistant/transcript";
/** A syntactically valid but unknown Server Action id (42 hex characters) — no action can run. */
const FAKE_ACTION = `7f${"0".repeat(40)}`;

test("O-1 (9.11). a cross-origin POST to the transcript door is refused, however it is dressed", async () => {
  const origin = qaAppOrigin();
  const api = await playwrightRequest.newContext({ baseURL: origin });
  try {
    const body = JSON.stringify({ role: "user", text: `${TAG} cross-origin probe` });
    const post = (headers: Record<string, string>) =>
      api.post(TRANSCRIPT, { headers: { "content-type": "application/json", ...headers }, data: body, maxRedirects: 0 });
    const foreign = await post({ origin: FOREIGN });
    expect(foreign.status(), "a foreign Origin is refused").toBe(403);
    expect(await foreign.json()).toEqual({ saved: false });
    const crossSite = await post({ origin, "sec-fetch-site": "cross-site" });
    expect(crossSite.status(), "a cross-site fetch is refused even when it names our origin").toBe(403);
    const bare = await post({});
    expect(bare.status(), "no Origin and no Sec-Fetch-Site is refused").toBe(403);
    const sub = await post({ origin: "https://labourmarket.ai.evil.example" });
    expect(sub.status(), "a look-alike host is refused").toBe(403);
  } finally {
    await api.dispose();
  }
});

/** One request sent BY THE SITE'S OWN PAGE (the browser sets Origin and Sec-Fetch-Site itself). */
async function fromOwnPage(
  page: Page,
  path: string,
  init: { headers: Record<string, string>; body: string },
): Promise<{ status: number; body: string; actionNotFound: string | null }> {
  return page.evaluate(
    async ({ path, init }) => {
      const res = await fetch(path, { method: "POST", headers: init.headers, body: init.body, redirect: "manual" });
      return { status: res.status, body: (await res.text()).slice(0, 200), actionNotFound: res.headers.get("x-nextjs-action-not-found") };
    },
    { path, init },
  );
}

test("O-2 (9.11). the same request from the site's own page is validated normally — LT and EN, on a phone", async ({ browser }) => {
  for (const locale of ["lt", "en"] as const) {
    const { ctx, page } = await as(browser, null, { locale: locale === "lt" ? "lt-LT" : "en-GB", phone: locale === "en" });
    await page.goto(`/${locale}`);
    expect((await page.locator("html").getAttribute("lang"))?.slice(0, 2)).toBe(locale);
    const json = { "content-type": "application/json" };
    const malformed = await fromOwnPage(page, TRANSCRIPT, { headers: json, body: JSON.stringify({ role: "robot" }) });
    expect(malformed.status, `${locale}: a malformed body from our own page is validated (400), not refused`).toBe(400);
    const valid = await fromOwnPage(page, TRANSCRIPT, { headers: json, body: JSON.stringify({ role: "user", text: `${TAG} own-origin probe` }) });
    expect(valid.status, `${locale}: a valid body from our own page is accepted`).toBe(200);
    // Anonymous: the writer has no person to write for, and says so.
    expect(JSON.parse(valid.body), `${locale}: nothing is stored for a stranger`).toEqual({ saved: false });
    if (locale === "en") await fitsPhone(page, "home");
    await ctx.close();
  }
});

test("O-3 (9.11). a Server Action POST from a foreign origin is aborted before any action is looked up", async ({ browser }) => {
  const origin = qaAppOrigin();
  const headers = { "next-action": FAKE_ACTION, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component" };
  // From our own page: the CSRF check passes and the made-up id is not found.
  const { ctx, page } = await as(browser, null);
  await page.goto("/lt");
  const own = await fromOwnPage(page, "/lt", { headers, body: "[]" });
  expect(own.status, "our own page reaches the action lookup").toBe(404);
  expect(own.actionNotFound, "…and is told the action does not exist").toBe("1");
  await ctx.close();
  // From a foreign origin: refused before the lookup — never "not found".
  const api = await playwrightRequest.newContext({ baseURL: origin });
  try {
    const foreign = await api.post("/lt", { headers: { ...headers, origin: FOREIGN }, data: "[]", maxRedirects: 0 });
    expect(foreign.status(), "a foreign-origin Server Action is not accepted").toBeGreaterThanOrEqual(400);
    expect(foreign.headers()["x-nextjs-action-not-found"], "it never reached the action lookup").toBeUndefined();
  } finally {
    await api.dispose();
  }
});
