import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";

import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * PRODUCTION — THE REQUIREMENT LEDGER AND THE COUNTRY REQUIREMENT MATRIX
 * (registry rows 2.11 and 8.6, register PER-13 / SKL-8; no production walk
 * before 2026-10-25). Decision 0021: documents are readiness requirements,
 * not a vault and never a gate — nothing here may refuse, disable or say
 * "you are not ready".
 *
 *   2.11 Requirement ledger (R-*) — the worker names the countries they aim
 *        at on their own work card; their profile then reads, per country,
 *        "{profession}, {country}: what you have and what is missing" with the
 *        "N of M in place" ratio (`instruction-ledger-ratio`, data-have /
 *        data-total), every row saying its state, why it is asked and where
 *        the state came from — and nothing on it is a gate. LT + EN, 390 px.
 *   8.6  Country requirement matrix (C-*) — the PUBLIC page
 *        /labour-market/<cc> (lib/country-readiness) for Germany and the
 *        Netherlands in LT and EN, with official sources linked per row and
 *        the national parts marked as needing a legal check; and the worker's
 *        own /dashboard/documents?country=XX view with its source links.
 *
 * REFUSED: a signed-out visitor gets neither the ledger nor the documents
 * view; the agency (another organization) opening the worker's person page
 * sees no ledger row of theirs.
 *
 * Cast (`lib/testing/prod-qa-guard.ts`, all synthetic): worker2
 * (qa.worker+goal3) or, when that person has no primary profession (the role
 * ledger needs one), worker (qa.worker+multiw) — chosen by a read of the
 * person's own rows, never by writing a profession; agency for the refused
 * check; no session for the public pages.
 *
 * WHAT STAYS. Nothing: the walk changes one value — the preferred-country
 * list on the work card — which it reads first and puts back in `afterAll`,
 * pass or fail (the list may be cleared, so the original is always
 * restorable). Logs carry states and counts only.
 */
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" &&
  SUPA !== "" &&
  ANON !== "" &&
  ["worker", "worker2", "agency"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } as const;
/** Two countries the curated matrix covers (lib/config/documents.ts DOCUMENT_COUNTRIES). */
const TARGET = "DE, NL";
const COUNTRY = { DE: { lt: /Vokietij/, en: /Germany/ }, NL: { lt: /Nyderland/, en: /Netherlands/ } } as const;
/** Words a gate would use. The ledger and the matrix explain; they never refuse. */
const GATE = /nepasiruoš|nesi pasiruoš|not ready|you are not eligible|negalite tęsti|cannot continue/i;

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

/** A FRESH document of `path` (a real reload when the tab is already on it — a same-URL hash goto is a same-document navigation). */
async function fresh(page: Page, path: string): Promise<void> {
  const target = path.split("#")[0];
  const already = (() => {
    try {
      const u = new URL(page.url());
      return `${u.pathname}${u.search}` === target;
    } catch {
      return false;
    }
  })();
  await page.goto(path);
  if (already) await page.reload();
}

const firstLine = (e: unknown) => ((e as Error).message ?? String(e)).split("\n")[0].slice(0, 160);

// ═══════════════════════════════════════════ 2.11 requirement ledger (R)

let slot = "";
let workerId = "";
let originalCountries: string | null = null;

async function ownWorker(s: string): Promise<{ id: string; primary: boolean | null }> {
  const token = bearerOf(s);
  const sub = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub as string;
  const res = await qaApi(`/rest/v1/workers?select=id&profile_id=eq.${encodeURIComponent(sub)}`, token);
  expect(res.status, `${s}: own worker row answered`).toBe(200);
  const rows = (await res.json()) as { id: string }[];
  if (rows.length !== 1) return { id: "", primary: null };
  const prof = await qaApi(
    `/rest/v1/worker_professions?select=is_primary&worker_id=eq.${encodeURIComponent(rows[0].id)}&is_primary=eq.true&limit=1`,
    token,
  );
  // An unreadable answer stays unknown — the browser decides then.
  return { id: rows[0].id, primary: prof.status === 200 ? ((await prof.json()) as unknown[]).length > 0 : null };
}

test("R-0 (2.11). the walked person: one whose own profile names a primary profession", async () => {
  for (const s of ["worker2", "worker"]) {
    const w = await ownWorker(s);
    console.info(`[ledger] ${s}: worker=${w.id !== ""} primary=${w.primary}`);
    if (w.id && w.primary !== false) {
      slot = s;
      workerId = w.id;
      break;
    }
  }
  test.skip(!slot, "no synthetic worker has a primary profession — the role ledger cannot render (the walk never invents one)");
});

const CARD_COUNTRIES = 'input[name="preferred_countries"]';

async function workCard(page: Page): Promise<Locator> {
  await fresh(page, "/lt/dashboard/profile#cv-availability");
  await rendered(page, "profile");
  const main = inMain(page);
  await expect(main.getByTestId("profile-work-card-editor")).toBeVisible({ timeout: 30_000 });
  const toggle = main.getByTestId("work-card-editor-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const form = main.getByTestId("work-card-editor");
  await expect(form).toBeVisible({ timeout: 30_000 });
  return form;
}

async function saveCountries(page: Page, value: string): Promise<void> {
  const form = await workCard(page);
  await form.locator(CARD_COUNTRIES).fill(value);
  await form.getByTestId("work-card-save").click();
  const saved = form.getByTestId("work-card-saved");
  const error = form.getByTestId("work-card-error");
  await expect(saved.or(error)).toBeVisible({ timeout: 30_000 });
  if (await error.isVisible()) throw new Error(`work card not saved: ${(await error.innerText()).slice(0, 120)}`);
}

/** The role ledgers on a fresh profile, one per target country. */
async function ledgers(page: Page, locale: "lt" | "en"): Promise<Locator> {
  await fresh(page, `/${locale}/dashboard/profile`);
  await rendered(page, `profile (${locale})`);
  const section = inMain(page).getByTestId("profile-role-ledgers");
  await expect(section, "the profile carries the requirement ledger").toBeVisible({ timeout: 60_000 });
  return section;
}

/** One ledger reads and explains itself: "N of M", each row's state, reason and source; no gate. */
async function readsAndExplains(ledger: Locator, locale: "lt" | "en"): Promise<{ have: number; total: number; rows: number }> {
  const ratio = ledger.getByTestId("instruction-ledger-ratio");
  await expect(ratio).toBeVisible();
  const have = Number(await ratio.getAttribute("data-have"));
  const total = Number(await ratio.getAttribute("data-total"));
  expect(Number.isInteger(have) && Number.isInteger(total), "the ratio is two counts").toBe(true);
  expect(have, "what is in place never exceeds what is asked").toBeLessThanOrEqual(total);
  await expect(ratio).toHaveText(locale === "lt" ? `Yra ${have} iš ${total}` : `${have} of ${total} in place`);
  const rows = ledger.getByTestId("instruction-ledger-row");
  const n = await rows.count();
  expect(n, "the ledger lists what is asked").toBeGreaterThan(0);
  for (const row of await rows.all()) {
    expect(["valid", "expiring", "missing", "unknown"], "a named state").toContain(await row.getAttribute("data-state"));
    expect((await row.getByTestId("instruction-ledger-state").innerText()).trim().length, "the state in words").toBeGreaterThan(1);
    expect((await row.getByTestId("instruction-ledger-from").innerText()).trim().length, "where the state came from").toBeGreaterThan(3);
  }
  // Country rows say why: "needed for work in <country>".
  await expect(ledger).toContainText(locale === "lt" ? "reikia darbui šalyje" : "needed for work in");
  // NO GATE (decision 0021): nothing to press, nothing disabled, nothing refused.
  await expect(ledger.locator("form, button, [disabled], [aria-disabled='true']"), "the ledger carries no gate control").toHaveCount(0);
  expect(await ledger.innerText(), "the ledger never says 'not ready'").not.toMatch(GATE);
  return { have, total, rows: n };
}

let ledgerShown = false;

test("R-1 (2.11). the worker names Germany and the Netherlands; the profile then reads what they have and what is missing", async ({ browser }) => {
  test.skip(!slot, "R-0 found no walkable person");
  const { ctx, page } = await as(browser, slot);
  originalCountries = await (await workCard(page)).locator(CARD_COUNTRIES).inputValue();
  console.info(`[ledger] original country list set=${originalCountries.trim() !== ""}`);
  // ACT: the person's own work card.
  await saveCountries(page, TARGET);
  await expect((await workCard(page)).locator(CARD_COUNTRIES), "the countries persist").toHaveValue(/DE,\s*NL/, { timeout: 30_000 });
  // Fresh profile: one ledger per country, each reading "N of M" and explaining itself.
  const section = await ledgers(page, "lt");
  for (const c of ["DE", "NL"] as const) {
    const ledger = section.getByTestId("profile-role-ledger").filter({ hasText: COUNTRY[c].lt });
    await expect(ledger, `the ${c} ledger`).toHaveCount(1, { timeout: 30_000 });
    await expect(ledger).toContainText("ką jau turi ir ko trūksta");
    const r = await readsAndExplains(ledger, "lt");
    console.info(`[ledger] ${c}: rows=${r.rows} ratio_total>0=${r.total > 0}`);
  }
  ledgerShown = true;
  await ctx.close();
});

test("R-2 (2.11). the same ledger in English and on a phone", async ({ browser }) => {
  test.skip(!ledgerShown, "R-1 did not show the ledger");
  {
    const { ctx, page } = await as(browser, slot, { locale: "en-GB" });
    const section = await ledgers(page, "en");
    expect((await page.locator("html").getAttribute("lang"))?.slice(0, 2)).toBe("en");
    const ledger = section.getByTestId("profile-role-ledger").filter({ hasText: COUNTRY.DE.en });
    await expect(ledger).toHaveCount(1, { timeout: 30_000 });
    await expect(ledger).toContainText("what you have and what is missing");
    await readsAndExplains(ledger, "en");
    await ctx.close();
  }
  {
    const { ctx, page } = await as(browser, slot, { phone: true });
    const section = await ledgers(page, "lt");
    await expect(section.getByTestId("profile-role-ledger").first()).toBeVisible();
    await fitsPhone(page, "profile with the requirement ledger");
    await ctx.close();
  }
});

test("R-3 (2.11). REFUSED: a signed-out visitor gets no ledger; another organization sees none of the person's", async ({ browser }) => {
  {
    const { ctx, page } = await as(browser, null);
    await page.goto("/lt/dashboard/profile");
    await expect(page, "the profile sends a stranger to sign in").toHaveURL(/\/auth\/login/, { timeout: 30_000 });
    await expect(page.getByTestId("instruction-ledger-row")).toHaveCount(0);
    await ctx.close();
  }
  test.skip(!workerId, "R-0 found no worker id");
  {
    const { ctx, page } = await as(browser, "agency");
    await page.goto(`/lt/dashboard/people/${workerId}`);
    await expect(page.getByTestId("profile-role-ledger"), "no role ledger on someone else's page").toHaveCount(0);
    await expect(page.getByTestId("instruction-ledger-row")).toHaveCount(0);
    await ctx.close();
  }
});

// ═══════════════════════════════════════ 8.6 country requirement matrix (C)

/** The public matrix for one country: scopes, requirement cards, official sources, honest legal-review marks, no gate. */
async function matrix(page: Page, cc: "DE" | "NL", locale: "lt" | "en"): Promise<void> {
  await rendered(page, `labour-market ${cc} (${locale})`);
  const block = page.getByTestId(`country-readiness-${cc}`);
  await expect(block, `the ${cc} requirement matrix`).toBeVisible({ timeout: 30_000 });
  await expect(block).toContainText(locale === "lt" ? "Ko ši šalis iš tavęs reikalauja" : "What this country requires of you");
  for (const scope of ["worker_solo", "worker_posted"]) {
    await expect(block.getByTestId(`country-readiness-scope-${scope}`), `${cc} ${scope}`).toBeVisible();
  }
  const cards = block.locator("li[data-requirement]");
  expect(await cards.count(), `${cc}: requirement cards`).toBeGreaterThan(3);
  // Every card names its source, and the source is an official link.
  for (const card of await cards.all()) {
    const src = card.locator("dd a[href]").first();
    await expect(src, "each requirement carries its source").toHaveCount(1);
    expect(await src.getAttribute("href"), "an official https source").toMatch(/^https:\/\/([a-z0-9-]+\.)*europa\.eu\//);
  }
  await expect(block).toContainText(locale === "lt" ? "Šaltinis" : "Source");
  // National parts are not passed off as verified answers.
  expect(await block.getByTestId("requirement-needs-legal-review").count(), "the national parts are marked for a legal check").toBeGreaterThan(0);
  await expect(block.locator("form, button[disabled]"), "the matrix is information, not a gate").toHaveCount(0);
  expect(await block.innerText()).not.toMatch(GATE);
}

test("C-1 (8.6). a visitor opens Germany and the Netherlands from the country index, in Lithuanian", async ({ browser }) => {
  const { ctx, page } = await as(browser, null);
  for (const cc of ["DE", "NL"] as const) {
    await page.goto("/lt/labour-market");
    await rendered(page, "labour-market index");
    // ACT: the visitor's own click on the country card.
    await page.getByTestId(`country-link-${cc}`).click();
    await page.waitForURL(new RegExp(`/lt/labour-market/${cc.toLowerCase()}$`), { timeout: 30_000 });
    await page.reload();
    await matrix(page, cc, "lt");
  }
  await ctx.close();
});

test("C-2 (8.6). the same matrices in English, and on a phone", async ({ browser }) => {
  {
    const { ctx, page } = await as(browser, null, { locale: "en-GB" });
    for (const cc of ["DE", "NL"] as const) {
      await page.goto(`/en/labour-market/${cc.toLowerCase()}`);
      expect((await page.locator("html").getAttribute("lang"))?.slice(0, 2)).toBe("en");
      await matrix(page, cc, "en");
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await as(browser, null, { phone: true });
    await page.goto("/lt/labour-market/de");
    await matrix(page, "DE", "lt");
    await fitsPhone(page, "labour-market DE");
    await ctx.close();
  }
});

test("C-3 (8.6). the worker's own documents view reads a country's requirements with sources — and asks for no upload", async ({ browser }) => {
  test.skip(!slot, "R-0 found no walkable person");
  const { ctx, page } = await as(browser, slot);
  for (const cc of ["DE", "NL"] as const) {
    await fresh(page, "/lt/dashboard/documents");
    await rendered(page, "documents");
    const picker = inMain(page).getByTestId("documents-country");
    await expect(picker, "the country requirement view").toBeVisible({ timeout: 60_000 });
    // ACT: the worker picks the country.
    await picker.locator(`a[href$="/dashboard/documents?country=${cc}"]`).first().click();
    await page.waitForURL(new RegExp(`[?&]country=${cc}`), { timeout: 30_000 });
    await page.reload();
    const view = inMain(page).getByTestId("documents-country");
    await expect(view.getByTestId("documents-country-unknown"), `${cc} is curated`).toHaveCount(0);
    await expect(view.getByTestId("documents-overall-status")).toBeVisible({ timeout: 30_000 });
    const sources = view.locator('a[target="_blank"][href^="https://"]');
    expect(await sources.count(), `${cc}: the requirements link their sources`).toBeGreaterThan(0);
    await expect(view.locator("form, button[disabled]"), "the view is not an upload gate").toHaveCount(0);
    expect(await view.innerText()).not.toMatch(GATE);
  }
  await ctx.close();
});

test("C-4 (8.6). REFUSED: a signed-out visitor is sent to sign in, never shown a person's documents view", async ({ browser }) => {
  const { ctx, page } = await as(browser, null);
  await page.goto("/lt/dashboard/documents?country=DE");
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 30_000 });
  await expect(page.getByTestId("documents-country")).toHaveCount(0);
  await ctx.close();
});

// ══════════════════════════════════════════════════ cleanup, pass or fail

test.afterAll(async ({ browser }) => {
  test.setTimeout(120_000);
  if (!slot || originalCountries === null) return;
  const { ctx, page } = await as(browser, slot);
  try {
    await saveCountries(page, originalCountries);
    const back = await (await workCard(page)).locator(CARD_COUNTRIES).inputValue();
    console.info(`[cleanup] country list restored=${back.replace(/\s+/g, "") === originalCountries.replace(/\s+/g, "")}`);
  } catch (e) {
    console.info(`[cleanup] country list not restored: ${firstLine(e)}`);
  } finally {
    await ctx.close();
  }
});
