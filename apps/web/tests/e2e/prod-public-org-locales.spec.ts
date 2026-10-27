import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Page } from "./prod-walk";

import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * PRODUCTION — PUBLIC SURFACES, ORGANIZATION PAGES AND LANGUAGES (owner areas
 * 4 / 8 / 11 / 13 / 17 / 18, acceptance campaign 2026-10-22..25). The rows
 * below had no production walk before this file.
 *
 * PUBLIC (U-*): signed out, in LT, EN and RU, at 390 px AND 1280 px. Every
 * public page opens, fits the phone (no sideways scroll), logs no console
 * error, and does its own job: the pricing cards tell the billing truth, the
 * anonymous need intake renders (it is NEVER submitted), the job board shows a
 * count, the calculator computes, and the crawler files are served.
 *
 * SIGNED IN (S-*): the synthetic owner (qa.owner — owns "QA-SYNTHETIC Alfa").
 * Read-only except two things: the chat transcript of one read-only question
 * (S-9) and the owner's own language preference (S-11), which is switched and
 * switched back — and restored in afterAll if the test stopped half-way.
 *
 * Runs only inside `.github/workflows/prod-qa-walk.yml` with the minted
 * synthetic cast. Nothing of a real person or a real company is opened: the
 * one public organization profile walked is the one Alfa's own settings link
 * to, and only when Alfa has opted in. Logs carry paths, states and counts.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const ALFA = "QA-SYNTHETIC Alfa";
const SYNTHETIC = "QA-SYNTHETIC";
/** The canonical public origin every canonical / hreflang URL must point at (lib/domain/canonical.ts). */
const ORIGIN = "https://labourmarket.ai";
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1";
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ timeout: 300_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const LOCALES = ["lt", "en", "ru"] as const;
type Locale = (typeof LOCALES)[number];
const NATIVE: Record<Locale, string> = { lt: "Lietuvių", en: "English", ru: "Русский" };

const WIDTHS = [
  { name: "390 px", viewport: { width: 390, height: 844 }, phone: true },
  { name: "1280 px", viewport: { width: 1280, height: 800 }, phone: false },
] as const;
type Width = (typeof WIDTHS)[number];

/** Every (locale, width) pair the public rows are walked in. */
const COMBOS: readonly { locale: Locale; width: Width }[] = LOCALES.flatMap((locale) =>
  WIDTHS.map((width) => ({ locale, width })),
);

// ───────────────────────────── public harness ─────────────────────────────

interface Visitor {
  readonly ctx: BrowserContext;
  readonly page: Page;
  /** Console errors and uncaught page errors since the last `take()`. */
  take(): string[];
}

/** A signed-out visitor: no storage state, the locale's browser language, the given width. */
async function visitor(browser: Browser, locale: Locale, width: Width): Promise<Visitor> {
  const ctx = await browser.newContext({
    locale: locale === "lt" ? "lt-LT" : locale === "ru" ? "ru-RU" : "en-GB",
    viewport: width.viewport,
    ...(width.phone ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await ctx.newPage();
  let errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text().replace(/\s+/g, " ").slice(0, 200)}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message.split("\n")[0].slice(0, 200)}`));
  return {
    ctx,
    page,
    take: () => {
      const out = errors;
      errors = [];
      return out;
    },
  };
}

/**
 * Open one public page and run the checks every public page owes the visitor.
 * Returns the problems found (empty = the page is fine); never throws, so one
 * run reports every broken page instead of stopping at the first.
 */
async function openPublic(
  v: Visitor,
  locale: Locale,
  width: Width,
  path: string,
  opts: { landmark?: string; h1?: boolean } = {},
): Promise<string[]> {
  const { page } = v;
  const url = `/${locale}${path}`;
  const problems: string[] = [];
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e: Error) => e);
  if (res instanceof Error) return [`navigation failed: ${res.message.split("\n")[0]}`];
  if (res && res.status() >= 400) return [`HTTP ${res.status()}`];
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  if (await page.getByTestId("branded-not-found").isVisible().catch(() => false)) return ["not found (404 page)"];
  if (await page.getByTestId("error-boundary-message").isVisible().catch(() => false)) problems.push("error boundary rendered");
  if (await page.getByTestId("global-error-message").isVisible().catch(() => false)) problems.push("global error rendered");
  if (new URL(page.url()).pathname.startsWith(`/${locale}/auth`)) problems.push("bounced to sign-in");
  const lang = (await page.locator("html").getAttribute("lang").catch(() => null)) ?? "";
  if (lang.slice(0, 2) !== locale) problems.push(`html lang is "${lang}", not ${locale}`);
  if (opts.landmark && !(await page.getByTestId(opts.landmark).first().isVisible().catch(() => false))) {
    problems.push(`landmark ${opts.landmark} not visible`);
  }
  if (opts.h1 !== false && !(await page.locator("h1").first().isVisible().catch(() => false))) problems.push("no visible h1");
  const main = page.locator("main").first();
  if ((await main.innerText().catch(() => "")).trim().length < 20) problems.push("main content is empty");
  if (width.phone) {
    const { doc, body, inner } = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      inner: window.innerWidth,
    }));
    if (Math.max(doc, body) > inner + 1) problems.push(`wider than the phone: scrollWidth=${Math.max(doc, body)} innerWidth=${inner}`);
  }
  problems.push(...v.take());
  return problems;
}

/** Walk `paths` in every (locale, width); each page a soft check, the test fails on any problem. */
async function walkPublic(
  browser: Browser,
  tag: string,
  pages: readonly { path: string; landmark?: string; h1?: boolean; probe?: (page: Page, locale: Locale) => Promise<string[]> }[],
  combos: readonly { locale: Locale; width: Width }[] = COMBOS,
): Promise<void> {
  const failures: string[] = [];
  for (const { locale, width } of combos) {
    const v = await visitor(browser, locale, width);
    for (const p of pages) {
      const problems = await openPublic(v, locale, width, p.path, p);
      if (problems.length === 0 && p.probe) problems.push(...(await p.probe(v.page, locale).catch((e: Error) => [`probe threw: ${e.message.split("\n")[0]}`])));
      // Errors raised by the probe's own interactions belong to this page too.
      if (p.probe) problems.push(...v.take());
      const where = `${locale} ${width.name} /${locale}${p.path}`;
      console.info(`[${tag}] ${where} ${problems.length ? "FAIL " + problems.join(" | ") : "ok"}`);
      if (problems.length) failures.push(`${where}: ${problems.join(" | ")}`);
      expect.soft(problems, where).toEqual([]);
    }
    await v.ctx.close();
  }
  expect(failures, failures.join("\n")).toEqual([]);
}

// ───────────────────────────── public rows ─────────────────────────────

test("U-1 (8.10). the landing and the four marketing pages open in LT/EN/RU at 390 and 1280 px", async ({ browser }) => {
  await walkPublic(browser, "marketing", [
    { path: "", landmark: "landing-hero-eyebrow" },
    { path: "/for-workers" },
    { path: "/for-companies" },
    { path: "/for-agencies" },
    { path: "/about", landmark: "about-page" },
  ]);
});

/**
 * 7.1 — the plan cards tell the billing truth, whichever it is today:
 * billing OFF → every plan card offers the waitlist, no trial line, and the
 * pre-payment boundary explains why; billing ON → every plan card links to the
 * organization account and the "payments not enabled" boundary is gone. A mix
 * of the two is the dishonest state this row exists to catch.
 */
async function pricingProbe(page: Page, locale: Locale): Promise<string[]> {
  const problems: string[] = [];
  const free = page.getByTestId("pricing-plan-free");
  const business = page.getByTestId("pricing-plan-business");
  for (const [slug, card] of [["free", free], ["business", business]] as const) {
    if (!(await card.isVisible().catch(() => false))) problems.push(`plan card ${slug} missing`);
  }
  if (!(await page.getByTestId("pricing-plan-individual").isVisible().catch(() => false))) problems.push("individual card missing");
  const ctaFree = await page.getByTestId("pricing-cta-free").count();
  const ctaBusiness = await page.getByTestId("pricing-cta-business").count();
  const boundary = await page.getByTestId("plan-boundary").count();
  const trial = await page.getByTestId("pricing-trial-business").count();
  const billingOn = ctaFree + ctaBusiness > 0;
  const stateFree = await page.getByTestId("pricing-price-state-free").getAttribute("data-state").catch(() => null);
  const stateBusiness = await page.getByTestId("pricing-price-state-business").getAttribute("data-state").catch(() => null);
  console.info(
    `[pricing] ${locale} billing=${billingOn ? "on" : "off"} cta=${ctaFree}/${ctaBusiness} boundary=${boundary} trial=${trial} state=${stateFree}/${stateBusiness}`,
  );
  if (!stateFree || !stateBusiness) problems.push("a plan card has no price-readiness line");
  if (ctaFree !== ctaBusiness) problems.push("one plan card offers the account, the other the waitlist");
  if (billingOn && boundary > 0) problems.push("a live plan CTA next to the 'payments not enabled' boundary");
  if (!billingOn) {
    if (boundary === 0) problems.push("waitlist cards without the pre-payment boundary that explains them");
    if (trial > 0) problems.push("a trial is promised while billing is off");
    for (const [slug, card] of [["free", free], ["business", business]] as const) {
      if ((await card.getByRole("button").count()) === 0) problems.push(`plan card ${slug} has no waitlist button`);
    }
  }
  const individualHref = (await page.getByTestId("pricing-cta-individual").getAttribute("href").catch(() => null)) ?? "";
  if (!individualHref.includes("/company-need")) problems.push("the individual card does not lead to the need intake");
  return problems;
}

test("U-2 (7.1). /pricing renders the plan cards honestly for the billing state it is in", async ({ browser }) => {
  await walkPublic(browser, "pricing", [{ path: "/pricing", probe: pricingProbe }]);
});

/** 4.8 — the anonymous need intake renders and is usable. It is NOT submitted. */
async function needFormProbe(page: Page): Promise<string[]> {
  const problems: string[] = [];
  if (!(await page.getByTestId("company-need-honest-note").isVisible().catch(() => false))) problems.push("honest note missing");
  const form = page.getByTestId("company-need-form");
  if (!(await form.isVisible().catch(() => false))) return [...problems, "need form missing"];
  const countries = await page.getByTestId("company-need-country").locator("option").count();
  if (countries < 2) problems.push(`country select offers ${countries} option(s)`);
  const submit = page.getByTestId("company-need-submit");
  if (!(await submit.isVisible().catch(() => false))) problems.push("submit button missing");
  else if (!(await submit.isEnabled().catch(() => false))) problems.push("submit button disabled");
  if (!(await page.getByTestId("need-bridge").isVisible().catch(() => false))) problems.push("bridge to the real account missing");
  return problems;
}

test("U-3 (4.8). the anonymous need intake renders (never submitted)", async ({ browser }) => {
  // No <h1> on this page today (reported, not fixed here): the form is the landmark.
  await walkPublic(browser, "need-intake", [{ path: "/company-need", h1: false, probe: needFormProbe }]);
});

const RESULTS: Record<Locale, string> = { lt: "rasta darbo vietų", en: "vacancies found", ru: "найдено вакансий" };

/** 4.4 — the board states a number of vacancies (an honest "unavailable" is reported, not passed). */
async function jobsProbe(page: Page, locale: Locale): Promise<string[]> {
  if (await page.getByTestId("public-jobs-unavailable").isVisible().catch(() => false)) {
    return ["the job board says it is unavailable"];
  }
  const status = page.locator('main [role="status"]').filter({ hasText: RESULTS[locale] }).first();
  if (!(await status.isVisible().catch(() => false))) return ["no result count shown"];
  const text = (await status.innerText()).replace(/\s+/g, " ").trim();
  const digits = text.replace(/[^\d]/g, "");
  console.info(`[jobs] ${locale} count line present (${digits.length} digit(s))`);
  return /^\d/.test(text) && digits.length > 0 ? [] : [`the count line does not start with a number: "${text.slice(0, 60)}"`];
}

test("U-4 (4.4). the public job board renders a vacancy count", async ({ browser }) => {
  await walkPublic(browser, "jobs", [{ path: "/jobs", probe: jobsProbe }]);
});

test("U-5 (8.4). a country labour-market page renders", async ({ browser }) => {
  await walkPublic(browser, "country", [{ path: "/labour-market" }, { path: "/labour-market/lt" }]);
});

test("U-6 (9.12). the legal pages render", async ({ browser }) => {
  await walkPublic(browser, "legal", [
    { path: "/legal/privacy", landmark: "legal-privacy" },
    { path: "/legal/terms", landmark: "legal-terms" },
    { path: "/legal/cookies", landmark: "legal-cookies" },
    { path: "/legal/data-protection", landmark: "legal-data-protection" },
    { path: "/legal/data-access", landmark: "legal-data-access" },
    { path: "/legal/data-deletion", landmark: "legal-data-deletion" },
    { path: "/legal/legal-notice", landmark: "legal-notice" },
    { path: "/legal/marketplace-rules", landmark: "marketplace-rules" },
  ]);
});

/** 6.10 — 2 workers × 8 h × 20 per hour = 320.00, computed in the browser. */
async function calculatorProbe(page: Page): Promise<string[]> {
  const calc = page.getByTestId("project-cost-calculator");
  if (!(await calc.isVisible().catch(() => false))) return ["calculator missing"];
  await page.getByTestId("pcc-next").click();
  await page.getByTestId("pcc-workerCount").fill("2");
  await page.getByTestId("pcc-hoursPerWorker").fill("8");
  await page.getByTestId("pcc-next").click();
  await page.getByTestId("pcc-rate").fill("20");
  await page.getByTestId("pcc-next").click();
  const total = page.getByTestId("estimate-total");
  if (!(await total.waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false))) {
    return [(await page.getByTestId("pcc-empty").isVisible().catch(() => false)) ? "result says nothing to estimate" : "no estimated total"];
  }
  const text = (await total.innerText()).replace(/[\s  ]/g, "");
  return /320[.,]00/.test(text) ? [] : [`estimated total is "${text}", expected 320.00`];
}

test("U-7 (6.10). the project-cost calculator computes a result", async ({ browser }) => {
  await walkPublic(browser, "calculator", [{ path: "/calculators/project-cost", probe: calculatorProbe }]);
});

test("U-8 (8.7). /llms.txt is served as plain text and names the product", async ({ request }) => {
  const res = await request.get("/llms.txt", { maxRedirects: 0 });
  expect(res.status(), "/llms.txt answered").toBe(200);
  expect(res.headers()["content-type"] ?? "").toContain("text/plain");
  const body = await res.text();
  expect(body.startsWith("# LabourMarket.ai"), "llms.txt opens with the product heading").toBe(true);
  expect(body.length, "llms.txt is not a stub").toBeGreaterThan(500);
});

/** Canonical + hreflang of one public page, against the apex origin. */
async function seoProbe(page: Page, locale: Locale, path: string): Promise<string[]> {
  const problems: string[] = [];
  const canonical = (await page.locator('link[rel="canonical"]').first().getAttribute("href").catch(() => null)) ?? "";
  const expected = `${ORIGIN}/${locale}${path}`;
  if (canonical.replace(/\/$/, "") !== expected) problems.push(`canonical is "${canonical}", expected ${expected}`);
  const alternates = await page
    .locator('link[rel="alternate"][hreflang]')
    .evaluateAll((els) => els.map((e) => [e.getAttribute("hreflang") ?? "", e.getAttribute("href") ?? ""] as const));
  const byLang = new Map(alternates);
  for (const l of [...LOCALES, "x-default"]) {
    const want = `${ORIGIN}/${l === "x-default" ? "en" : l}${path}`;
    const got = (byLang.get(l) ?? "").replace(/\/$/, "");
    if (got !== want) problems.push(`hreflang ${l} is "${got || "missing"}"`);
  }
  return problems;
}

test("U-9 (8.8). robots.txt, sitemap.xml and every marketing page's canonical + hreflang point at the apex", async ({ browser, request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status(), "/robots.txt answered").toBe(200);
  const robotsText = await robots.text();
  expect(robotsText).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  expect(robotsText, "the app is closed to crawlers").toMatch(/Disallow: \/\*\/dashboard/);

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status(), "/sitemap.xml answered").toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain("<urlset");
  for (const l of LOCALES) expect(xml, `sitemap lists the ${l} home`).toContain(`<loc>${ORIGIN}/${l}</loc>`);

  const desktop = COMBOS.filter((c) => !c.width.phone);
  await walkPublic(
    browser,
    "seo",
    ["", "/for-workers", "/for-companies", "/for-agencies", "/about", "/pricing", "/labour-market/lt"].map((path) => ({
      path,
      probe: (page: Page, locale: Locale) => seoProbe(page, locale, path),
    })),
    desktop,
  );
});

test("U-10 (8.12). every locale's home links the web app manifest, and it is served", async ({ browser, request }) => {
  const hrefs = new Set<string>();
  for (const locale of LOCALES) {
    const v = await visitor(browser, locale, WIDTHS[0]);
    await v.page.goto(`/${locale}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const href = await v.page.locator('link[rel="manifest"]').first().getAttribute("href");
    expect(href, `/${locale} links a manifest`).toBeTruthy();
    hrefs.add(href!);
    await v.ctx.close();
  }
  for (const href of hrefs) {
    const res = await request.get(href);
    expect(res.status(), `${href} answered`).toBe(200);
    const m = (await res.json()) as { name?: string; start_url?: string; icons?: unknown[] };
    expect(m.name).toBe("LabourMarket.ai");
    expect(m.start_url).toBe("/");
    expect((m.icons ?? []).length, "the manifest carries icons").toBeGreaterThan(0);
  }
});

// ───────────────────────────── signed-in rows ─────────────────────────────

test.describe("signed in as the synthetic owner of Alfa", () => {
  test.skip(!existsSync(state("owner")), "no minted session for the owner slot");
  test.describe.configure({ mode: "serial", timeout: 240_000, retries: 0 });

  async function owner(browser: Browser, width: Width = WIDTHS[1]): Promise<{ ctx: BrowserContext; page: Page }> {
    const ctx = await browser.newContext({
      storageState: state("owner"),
      locale: "lt-LT",
      viewport: width.viewport,
      ...(width.phone ? { isMobile: true, hasTouch: true } : {}),
    });
    return { ctx, page: await ctx.newPage() };
  }

  /** Open `path` with Alfa as the active workspace (the real header chip switches it when needed). */
  async function openInAlfa(page: Page, path: string): Promise<void> {
    await page.goto(path);
    const chip = page.getByTestId("workspace-chip").first();
    await expect(chip).toBeVisible({ timeout: 30_000 });
    if (!(await chip.innerText()).includes(ALFA)) {
      await chip.getByRole("button").first().click();
      await page.getByTestId("workspace-chip-menu").locator('[data-testid^="workspace-option-"]', { hasText: ALFA }).first().click();
      await expect(chip).toContainText(ALFA, { timeout: 30_000 });
      await page.goto(path);
    }
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  }

  test("S-1 (1.6). the organization's identity page shows Alfa's own record", async ({ browser }) => {
    const { ctx, page } = await owner(browser);
    await openInAlfa(page, "/lt/dashboard/company/settings");
    await expect(page.getByTestId("company-settings")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("company-no-profile-guide"), "Alfa has a company record").toHaveCount(0);
    await expect(page.getByTestId("company-name-link"), "the identity names the synthetic organization").toContainText(SYNTHETIC);
    await expect(page.getByTestId("company-dashboard-type-chip")).toBeVisible();
    await ctx.close();
  });

  test("S-2 (1.7). the verification status is shown, and it is an honest one", async ({ browser }) => {
    const { ctx, page } = await owner(browser);
    await openInAlfa(page, "/lt/dashboard/company/settings");
    const actions = page.getByTestId("company-next-actions");
    await expect(actions).toBeVisible({ timeout: 30_000 });
    const status = (await actions.getAttribute("data-status")) ?? "";
    console.info(`[org] verification status=${status} readiness=${await page.getByTestId("company-readiness").getAttribute("data-status")}`);
    expect(["draft", "active_unverified", "needs_checks", "pending_verification", "unverified", "verified"]).toContain(status);
    const label = (await page.getByTestId("company-next-actions-status").innerText()).trim();
    expect(label.length, "the status has words").toBeGreaterThan(0);
    // A synthetic organization is never presented as verified by anyone.
    if (status !== "verified") expect(label, "an unverified organization is not labelled verified").not.toBe("Patvirtinta");
    await expect(page.getByTestId("company-next-actions-explainer")).toBeVisible();
    await expect(page.getByTestId("company-readiness")).toBeVisible();
    await ctx.close();
  });

  test("S-3 (1.8). the organization's capabilities are shown (read only)", async ({ browser }) => {
    const { ctx, page } = await owner(browser);
    await openInAlfa(page, "/lt/dashboard/company/settings#company-capabilities");
    const card = page.getByTestId("org-capabilities-card");
    await expect(card, "the capabilities card opens from its deep link").toBeVisible({ timeout: 30_000 });
    const settled = await card.getByTestId("org-capabilities-settled").count();
    const options = await card.locator('[data-testid^="org-capability-option-"]').count();
    console.info(`[org] capabilities: settled=${settled} options=${options}`);
    expect(settled + options, "the card states what Alfa does or offers the choice").toBeGreaterThan(0);
    await ctx.close();
  });

  test("S-4 (3.25). the management decisions page renders", async ({ browser }) => {
    const { ctx, page } = await owner(browser);
    await openInAlfa(page, "/lt/dashboard/network?area=decisions");
    const section = page.getByTestId("management-decisions");
    await expect(section, "the decisions area answers (not a silent nothing)").toBeVisible({ timeout: 30_000 });
    const list = section.getByTestId("decisions-list");
    const empty = section.getByTestId("decisions-empty");
    const unavailable = section.getByTestId("decisions-not-available");
    await expect(list.or(empty).or(unavailable).first()).toBeVisible({ timeout: 30_000 });
    console.info(`[org] decisions: rows=${await section.getByTestId("decision-row").count()} unavailable=${await unavailable.count()}`);
    await ctx.close();
  });

  test("S-5 (1.15). the organization's history view renders", async ({ browser }) => {
    const { ctx, page } = await owner(browser);
    await openInAlfa(page, "/lt/dashboard/company/history");
    await expect(page.getByTestId("company-history")).toBeVisible({ timeout: 30_000 });
    const history = page.getByTestId("company-work-history");
    const unavailable = page.getByTestId("company-work-history-unavailable");
    const notice = page.getByTestId("business-history-workspace-notice");
    await expect(history.or(unavailable).or(notice).first(), "the history says what is on record, or that it cannot read").toBeVisible({
      timeout: 30_000,
    });
    console.info(
      `[org] history: state=${(await history.first().getAttribute("data-state").catch(() => null)) ?? "records"} unavailable=${await unavailable.count()} overview=${await page.getByTestId("business-history-overview").count()}`,
    );
    await ctx.close();
  });

  test("S-6 (7.13). the bookings surface renders, with no plan gate at rest", async ({ browser }) => {
    // booking_requests is granted on every organization plan
    // (lib/commercial/plan-catalogue.ts); its gate speaks only when a proposal
    // is sent — a write this walk does not make. What is provable read-only:
    // the surface answers and shows no false "not on your plan".
    const { ctx, page } = await owner(browser);
    await openInAlfa(page, "/lt/dashboard/bookings");
    await expect(page.getByTestId("bookings-page")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("propose-booking-not-entitled")).toHaveCount(0);
    console.info(
      `[org] bookings: rows=${await page.locator("li[data-status][data-direction]").count()} unavailable=${await page.getByTestId("bookings-unavailable").count()}`,
    );
    await ctx.close();
  });

  test("S-7 (7.12). the AI cost cap is shown to the organization", async () => {
    test.skip(
      true,
      "no person-facing surface shows the per-organization AI run cap: it is the server setting AI_ORG_DAILY_RUN_CAP (lib/ai/runtime/org-run-cap.ts), enforced on vendor runs only",
    );
  });

  test("S-8 (6.19). the team enquiry inbox renders for the owner", async ({ browser }) => {
    const { ctx, page } = await owner(browser);
    await openInAlfa(page, "/lt/dashboard/company/people");
    const panel = page.getByTestId("team-brigades-panel");
    await expect(panel).toBeVisible({ timeout: 30_000 });
    const teams = panel.locator('[data-testid^="team-brigade-"]');
    const n = await teams.count();
    console.info(`[org] teams=${n}`);
    test.skip(n === 0, "Alfa has no team yet, so there is no enquiry inbox to open");
    const team = teams.first();
    const teamId = ((await team.getAttribute("data-testid")) ?? "").replace(/^team-brigade-/, "");
    const fold = team.locator("details").filter({ has: page.locator('[data-testid^="team-enquir"]') }).first();
    await fold.locator("summary").first().click();
    const inbox = page.getByTestId(`team-enquiries-${teamId}`);
    const empty = page.getByTestId(`team-enquiries-empty-${teamId}`);
    const off = page.getByTestId(`team-enquiries-not-enabled-${teamId}`);
    await expect(inbox.or(empty).or(off).first(), "the inbox lists enquiries, says there are none, or says it is not enabled").toBeVisible({
      timeout: 30_000,
    });
    console.info(`[org] enquiry inbox: listed=${await inbox.count()} empty=${await empty.count()} not_enabled=${await off.count()}`);
    await ctx.close();
  });

  test("S-9 (6.20). the chat shows the value channels for an offer (read only)", async ({ browser }) => {
    const { ctx, page } = await owner(browser);
    await openInAlfa(page, "/lt/dashboard");
    await expect(page.getByTestId("composer-input")).toBeVisible({ timeout: 30_000 });
    const text = "Pagaminome 500 medinių palečių ir norime jas parduoti.";
    // The product's own channel readback (conversation.chat.valueIntent.*).
    const channel = /Tavo teigimu:|skelbimų lentoje|Atidaryti skelbimus|paslaugos pasiūlymą|Šito per platformą pasiūlyti negalima/g;
    const hits = async () => ((await page.locator("body").innerText()).match(channel) ?? []).length;
    // Count, not offset: starting a conversation folds the home intro, so the
    // page text SHRINKS and an offset into it cut the answer to its last word
    // (run 40363282539 logged "skelbimus" — the tail of "Atidaryti skelbimus").
    const before = await hits();
    await page.getByTestId("composer-input").fill(text);
    await page.getByTestId("composer-send").click();
    const tail = async () => (await page.locator("body").innerText()).slice(-1200);
    const answered = await expect
      .poll(async () => (await hits()) > before, { timeout: 45_000, intervals: [1_000] })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    const shown = (await tail()).slice(-400).replace(/\s+/g, " ");
    console.info(`[value-channels] → ${shown}`);
    expect(answered, `the chat named a channel for the offer: ${shown}`).toBe(true);
    expect(shown, "the offer was understood, not 'unclear'").not.toMatch(/Nesu tikras, ar kažką siūlai/);
    await ctx.close();
  });

  test("S-10 (8.9, 6.21). Alfa's public organization profile opens signed out, if Alfa opted in", async ({ browser }) => {
    const { ctx, page } = await owner(browser);
    await openInAlfa(page, "/lt/dashboard/company/settings");
    await expect(page.getByTestId("company-settings")).toBeVisible({ timeout: 30_000 });
    const link = page.getByTestId("view-public-profile-link");
    const href = (await link.count()) > 0 ? await link.first().getAttribute("href") : null;
    await ctx.close();
    console.info(`[org] public profile: ${href ? "published" : "not published"}`);
    test.skip(!href, "Alfa has not opted in to a public business profile; no synthetic organization profile to open");
    const path = href!.replace(/^https?:\/\/[^/]+/, "").replace(/^\/(lt|en|ru)(?=\/)/, "");
    const failures: string[] = [];
    for (const width of WIDTHS) {
      const v = await visitor(browser, "lt", width);
      const problems = await openPublic(v, "lt", width, path);
      if (problems.length === 0) {
        const h1 = (await v.page.locator("h1").first().innerText()).trim();
        if (!h1.includes(SYNTHETIC)) problems.push("the profile does not carry the synthetic organization's name");
        // 6.21: what the organization offers is listed, or the page says there is nothing yet.
        if ((await v.page.locator("main h2").count()) === 0) problems.push("no offer sections on the profile");
      }
      console.info(`[org] public profile ${width.name} ${problems.length ? "FAIL " + problems.join(" | ") : "ok"}`);
      if (problems.length) failures.push(`${width.name}: ${problems.join(" | ")}`);
      await v.ctx.close();
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  test("S-12 (8.16). a signed-in person reports a language problem from the account menu", async ({ browser }) => {
    const { ctx, page } = await owner(browser);
    await openInAlfa(page, "/lt/dashboard/journal");
    await page.getByTestId("account-menu-trigger").first().click();
    await page.getByTestId("language-feedback-open").click();
    const comment = page.getByTestId("language-feedback-comment");
    await expect(comment, "the report form opens with its comment box").toBeVisible({ timeout: 30_000 });
    // Marked synthetic, so the admin inbox reads it as a walk's trace.
    await comment.fill(`QA-SYNTHETIC ${RUN}: production walk language report (ignore).`);
    await page.getByRole("button", { name: "Išsiųsti" }).click();
    const ok = page.getByTestId("language-feedback-success");
    const err = page.getByTestId("language-feedback-error");
    await expect(ok.or(err)).toBeVisible({ timeout: 30_000 });
    const failed = (await err.isVisible()) ? await err.innerText() : "";
    console.info(`[lang-feedback] ${RUN} submitted=${failed === ""}${failed ? ` error="${failed.slice(0, 80)}"` : ""}`);
    expect(failed, "the language report was refused").toBe("");
    await ctx.close();
  });

  // ── 8.13 / 8.16: the language switch persists for the user ──────────────
  const OTHER: Record<Locale, Locale> = { lt: "en", en: "lt", ru: "lt" };
  /** The owner's language before the walk touched it (own row). null = not readable here. */
  let originalLocale: Locale | null = null;
  let localeTouched = false;

  async function accountLocale(): Promise<string | null> {
    if (SUPA === "" || ANON === "") return null;
    const token = bearerOf("owner");
    const sub = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).sub as string;
    const res = await qaApi(`/rest/v1/profiles?select=locale&id=eq.${encodeURIComponent(sub)}`, token);
    if (res.status !== 200) return null;
    const rows = (await res.json()) as { locale: string | null }[];
    return rows[0]?.locale ?? null;
  }

  /** Switch with the real header control, from whatever page is open. */
  async function switchTo(page: Page, from: Locale, to: Locale): Promise<void> {
    const control = (scope: Page | ReturnType<Page["getByTestId"]>) =>
      scope.locator('button[aria-haspopup="menu"]').filter({ hasText: NATIVE[from] }).filter({ visible: true }).first();
    let trigger = control(page);
    // The header control is the first door; the account menu carries the same one.
    if (!(await trigger.waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false))) {
      await page.getByTestId("account-menu-trigger").first().click();
      trigger = control(page.getByTestId("account-menu-locale"));
    }
    await expect(trigger, `the language control shows ${NATIVE[from]}`).toBeVisible({ timeout: 30_000 });
    await trigger.click();
    await page.getByTestId("locale-switcher-menu").getByRole("menuitem", { name: NATIVE[to] }).click();
    await page.waitForURL(new RegExp(`/${to}/dashboard/journal`), { timeout: 30_000 });
    // The account write is fire-and-forget: let it land before anyone reloads.
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  }

  test("S-11 (8.13, 8.16). switching to English persists across a reload and for the account, then back", async ({ browser }) => {
    const before = await accountLocale();
    originalLocale = before && (LOCALES as readonly string[]).includes(before) ? (before as Locale) : null;
    console.info(`[locale] ${RUN} account locale before=${before ?? "unreadable/none"}`);
    const { ctx, page } = await owner(browser);
    await openInAlfa(page, "/lt/dashboard/journal");
    localeTouched = true;
    await switchTo(page, "lt", "en");
    // A fresh load of an unprefixed address lands in the chosen language.
    await page.goto("/dashboard/journal");
    await expect(page).toHaveURL(/\/en\/dashboard\/journal/, { timeout: 30_000 });
    expect((await page.locator("html").getAttribute("lang"))?.slice(0, 2)).toBe("en");
    await page.reload();
    await expect(page).toHaveURL(/\/en\/dashboard\/journal/);
    if (SUPA !== "" && ANON !== "") {
      await expect.poll(accountLocale, { timeout: 30_000, message: "the choice reached the account" }).toBe("en");
    }
    // …and back.
    await switchTo(page, "en", "lt");
    await page.goto("/dashboard/journal");
    await expect(page).toHaveURL(/\/lt\/dashboard\/journal/, { timeout: 30_000 });
    if (SUPA !== "" && ANON !== "") {
      await expect.poll(accountLocale, { timeout: 30_000, message: "the switch back reached the account" }).toBe("lt");
    }
    await ctx.close();
    localeTouched = originalLocale !== null && originalLocale !== "lt";
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(120_000); // the default 30 s hook timeout is shorter than one switch
    // Restore the owner's own language if the walk left it elsewhere: the
    // original when it was readable, otherwise Lithuanian (the walk's language).
    if (!localeTouched) return;
    const target: Locale = originalLocale ?? "lt";
    if ((await accountLocale().catch(() => null)) === target) return;
    const from = OTHER[target];
    const { ctx, page } = await owner(browser);
    try {
      await page.goto(`/${from}/dashboard/journal`);
      await switchTo(page, from, target);
      console.info(`[locale] restored the owner's language to ${target}`);
    } catch (e) {
      console.info(`[locale] restore to ${target} did not complete: ${(e as Error).message.split("\n")[0]}`);
    } finally {
      await ctx.close();
    }
  });
});
