import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { FORBIDDEN_PRODUCT_COPY } from "../../lib/guards/product-copy-forbidden-terms";
import { test, expect, type Browser, type BrowserContext, type Page } from "./prod-walk";
import { COMMON_ROUTES, EMPLOYER_ROUTES } from "./prod-walk-routes";
import { AXE_SOURCE, clsGrowerSource, clsTopSource, componentTops, installObservers, measure, runAxe } from "./ux-probes";

/**
 * PRODUCTION UX MEASUREMENTS — NUMBERS ONLY (spec=ux-metrics, dispatch only).
 *
 * Evidence for the owner's per-function UX/UI audit (1-10 per function). The
 * production walk publishes no screenshots, traces or sessions (public repo), so
 * this walk turns what a reviewer would look at into COUNTS, SIZES and
 * MILLISECONDS, one log line per page:
 *
 *   [ux] <slot> <screen> <locale> <route> role=<role> theme=<theme> key=value ...
 *
 * and the same row, as numbers, in the run's JSON report (a `ux-row` annotation
 * per page: role × page × locale × metric). Values are numbers only — never page
 * text, names, ids or e-mails. <route> is the static path that was requested
 * (from ./prod-walk-routes) or reached by a click. Every integer goes through
 * `n()`: the walk brakes scan the walk log for 5xx markers (`\b50[0-4]\b`,
 * .github/scripts/walk-brakes.mjs INFRA_PATTERN), so a count that happens to be
 * 500-504 is written zero-padded ("0503") instead of reading as a server error.
 * `status=` is the one value left plain: a real 5xx there IS an infrastructure
 * signal.
 *
 * THE SCREEN AND THE THEME are the dispatch's (`device`, `theme` inputs of
 * prod-qa-walk.yml), applied by the walk's fixture: this spec never reads them
 * from the environment. It reads them from the test options (`viewport`,
 * `hasTouch`) and the page (`data-theme`). One dispatch = one device + one theme;
 * the size matrix 375 / 390 / 768 / 1440 is `phone-375`, `phone`, `tablet-768`,
 * `desktop-1440` (owner order, #3679 addendum).
 *
 * ROLES — only the existing synthetic QA cast (lib/testing/prod-qa-guard.ts);
 * a role whose session was not minted is recorded BLOCKED and no account is
 * ever created:
 *   worker        slot worker   (qa.worker+multiw)   the common surfaces
 *   employer      slot owner    (qa.owner+multiw)    home + employer surfaces
 *   agency        slot agency   (qa.agency+multiw)   home + employer surfaces
 *   buyer         slot buyer    (qa.buyer+act1, owner-created; minted for this spec only)
 *   student       slot worker2  (qa.worker+goal3)    the learner of learning-practice
 *   institution   slot owner    the education surface of learning-practice
 *
 * PER PAGE: HTTP status, horizontal scroll (overflow_px), tap targets under the
 * floor (tap_small: 44 px on a touch screen, 24 px without), raw i18n keys,
 * banned product-copy terms (banned_words: the ONE list in
 * lib/guards/product-copy-forbidden-terms.ts, matched against the rendered
 * text), broken images (broken_img), console errors (console_errors: a count,
 * never the message), the rendered theme, plus the existing probes.
 * No screenshot is taken: the production walk never publishes one (public repo,
 * and production pages can show real third parties' data).
 *
 * REAL CLICKS, read-only: per role, the header navigation (L1, or the phone's
 * area sheet), a link inside the landed page (L2), a link inside that one (L3),
 * then the AI entry — the logo is the way home, and the home IS the AI
 * conversation: its composer must be there. Links that would start a write
 * (new / create / edit / delete / invite / sign-out) are never followed; nothing
 * is typed or submitted.
 *
 * NOT DUPLICATED HERE — the click journeys that already have a production walk:
 *
 *   | journey                                   | walk (spec=)                |
 *   |-------------------------------------------|-----------------------------|
 *   | job search: filters applied, results       | jobs-search                 |
 *   | employer: need → offer → submit chain      | company-chain               |
 *   | agency: client, candidate offer submit     | agency-chain                |
 *   | goods / services: offer, request, respond  | marketplace-goods-services  |
 *   | institution → learner: programme, cohort   | learning-practice           |
 *
 * READ-ONLY: it opens pages, reads the DOM and follows navigation links; it
 * never types or submits.
 *
 * Fails ONLY on hard defects (soft-collected, so one run reports all of them):
 * horizontal overflow on a touch screen, a raw i18n key on screen, an axe
 * "critical" violation (when axe is available, see AXE_SOURCE), more than one
 * visible <main> landmark, the error boundary, a header navigation or an AI
 * entry that a click could not open. Everything else is reported, not judged.
 *
 * LOAD (production DB and the walk budget are tight; the health brake trips at
 * db > 1500 ms): ≤ 120 page loads per dispatch (PLANNED_LOADS, printed by the
 * first test) — the same order as before, now spent on ONE screen per dispatch:
 * the six roles' surfaces (52), the worker's five key surfaces in the six other
 * active locales (30; lt is the worker's own pass), two homes with
 * `reducedMotion: "reduce"` (4) and the click journeys (6 × 5).
 */
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1";
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
// Never retried: a retry would double the production load of the whole test.
test.describe.configure({ retries: 0 });

// ── Plan ─────────────────────────────────────────────────────────────────────

/** `activeLocales` in lib/i18n/config.ts (7 of the 11 UI locales are routed). Mirrored, not imported:
 *  a Playwright spec cannot resolve the app's `@/` alias. Context `locale` is the browser's language. */
const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de", "pl", "sv"] as const;
type Locale = (typeof ACTIVE_LOCALES)[number];
const BROWSER_LOCALE: Record<Locale, string> = { lt: "lt-LT", en: "en-GB", ru: "ru-RU", nl: "nl-NL", de: "de-DE", pl: "pl-PL", sv: "sv-SE" };

const EMPLOYER_SET = ["/lt/dashboard", ...EMPLOYER_ROUTES];
type Role = "worker" | "employer" | "agency" | "buyer" | "student" | "institution";
const ROLES: readonly { role: Role; slot: string; routes: readonly string[] }[] = [
  { role: "worker", slot: "worker", routes: COMMON_ROUTES },
  { role: "employer", slot: "owner", routes: EMPLOYER_SET },
  { role: "agency", slot: "agency", routes: EMPLOYER_SET },
  // The routes prod-buyer-workspace.spec.ts walks as the buyer.
  { role: "buyer", slot: "buyer", routes: ["/lt/dashboard", "/lt/dashboard/buyer", "/lt/dashboard/service-requests", "/lt/dashboard/services"] },
  // The learner's surfaces in prod-learning-practice.spec.ts.
  { role: "student", slot: "worker2", routes: ["/lt/dashboard", "/lt/dashboard/learning", "/lt/dashboard/profile", "/lt/dashboard/opportunities"] },
  // The institution's surface in prod-learning-practice.spec.ts (no workspace switch: that is a write).
  { role: "institution", slot: "owner", routes: ["/lt/dashboard/company/education"] },
];
const LOCALE_SWEEP_ROUTES = [
  "/lt/dashboard",
  "/lt/dashboard/journal",
  "/lt/dashboard/planning",
  "/lt/dashboard/profile",
  "/lt/dashboard/opportunities",
];
const SWEEP_LOCALES = ACTIVE_LOCALES.filter((l) => l !== "lt");
/** Homes with motion: the company home carries the 3D area switcher. Each is loaded twice. */
const REDUCED_MOTION: readonly { role: Role; slot: string; route: string }[] = [
  { role: "worker", slot: "worker", route: "/lt/dashboard" },
  { role: "employer", slot: "owner", route: "/lt/dashboard" },
];
/** Per role: the start page, L1, L2, L3 and the AI entry (home). */
const CLICK_LOADS = 5;
const PLANNED_LOADS =
  ROLES.reduce((s, a) => s + a.routes.length, 0) +
  SWEEP_LOCALES.length * LOCALE_SWEEP_ROUTES.length +
  REDUCED_MOTION.length * 2 +
  ROLES.length * CLICK_LOADS;
const MAX_LOADS = 120;

const withLocale = (route: string, locale: Locale) => route.replace(/^\/lt(?=\/|$)/, `/${locale}`);

/** Top-level message namespaces (next-intl renders a missing key as `namespace.key`). */
const NAMESPACES: string[] = (() => {
  const base = Object.keys(JSON.parse(readFileSync(resolve(__dirname, "../../messages/lt.json"), "utf8")) as Record<string, unknown>);
  // The taxonomy files lib/i18n/request.ts mounts as their own namespaces.
  return [...base, "professions", "skillNames", "journal", "relationshipTypes", "productivityUnits", "labourMarket"];
})();

/** The banned-terms list, as sources a page can rebuild (a RegExp does not cross into the page). */
const BANNED: [source: string, flags: string][] = FORBIDDEN_PRODUCT_COPY.map(({ re }) => [re.source, re.flags]);

/** A link a read-only click may follow: never one that starts a write or ends the session. */
const WRITE_HINT = /\/(new|create|edit|delete|remove|invite|sign-?out|log-?out|auth)(\/|$|\?)/;

// ── The screen (from the test options, never the environment) ───────────────

type Screen = { label: string; touch: boolean; tapMin: number };
function screenOf(viewport: { width: number; height: number } | null, hasTouch: boolean): Screen {
  // Tap floor: 44x44 CSS px on touch (WCAG 2.5.5 / platform guidance), 24x24 without (WCAG 2.5.8).
  return { label: viewport ? `${viewport.width}x${viewport.height}` : "auto", touch: hasTouch, tapMin: hasTouch ? 44 : 24 };
}

// ── Formatting ───────────────────────────────────────────────────────────────

/** An integer for the log, zero-padded only where it would read as a 5xx marker (see header). */
const n = (v: number): string => {
  const r = Math.round(v);
  return r >= 500 && r <= 504 ? `0${r}` : String(r);
};

type Kv = [key: string, value: string];
type Where = { role: Role; slot: string; screen: Screen; locale: Locale };

function line(w: Where, route: string, kv: Kv[]): string {
  return `[ux] ${w.slot} ${w.screen.label} ${w.locale} ${route} ${kv.map(([k, v]) => `${k}=${v}`).join(" ")}`;
}

/** One per-page row: the log line, and the same numbers in the JSON report. */
function row(w: Where, route: string, kv: Kv[]): void {
  console.info(line(w, route, kv));
  test.info().annotations.push({
    type: "ux-row",
    description: JSON.stringify({ role: w.role, slot: w.slot, screen: w.screen.label, locale: w.locale, route, ...Object.fromEntries(kv) }),
  });
}

// ── One page ─────────────────────────────────────────────────────────────────

type PageResult = { measured: boolean; navFailed: boolean; metrics: Record<string, number>; defects: string[] };

async function context(browser: Browser, slot: string, locale: Locale, reducedMotion: "reduce" | "no-preference" = "no-preference"): Promise<BrowserContext> {
  // No viewport here: the screen is the dispatch's, applied by the walk's fixture.
  const ctx = await browser.newContext({ storageState: state(slot), locale: BROWSER_LOCALE[locale], reducedMotion });
  await ctx.addInitScript(installObservers);
  return ctx;
}

/** Console errors of the page since the last reset — a count, never a message. */
function consoleCounter(page: Page): { take: () => number } {
  let count = 0;
  page.on("console", (m) => {
    if (m.type() === "error") count++;
  });
  page.on("pageerror", () => count++);
  return {
    take: () => {
      const c = count;
      count = 0;
      return c;
    },
  };
}

/** Rendered-page counts this spec adds to `measure`: banned terms, broken images, the rendered theme. */
function pageExtras({ banned }: { banned: [string, string][] }): Record<string, number> {
  const text = document.body?.innerText ?? "";
  const bannedWords = banned.filter(([s, f]) => new RegExp(s, f).test(text)).length;
  const brokenImg = Array.from(document.images).filter((i) => i.complete && (i.currentSrc || i.getAttribute("src")) && i.naturalWidth === 0).length;
  return { banned_words: bannedWords, broken_img: brokenImg, theme_dark: document.documentElement.dataset.theme === "dark" ? 1 : 0 };
}

/** Measures the page that is open now (after a goto or a click). */
async function measureHere(page: Page, w: Where, route: string, head: Kv[], consoleErrors: { take: () => number }): Promise<PageResult> {
  const landed = new URL(page.url());
  if (/\/auth\/(login|sign-?in)/.test(landed.pathname)) {
    row(w, route, [...head, ["signin", "1"], ["measured", "0"]]);
    return { measured: false, navFailed: false, metrics: {}, defects: [] };
  }
  // Observation window: long tasks / animation frames and layout shifts in the 3 s after load.
  await page.waitForTimeout(3_000);
  const m = await page.evaluate(measure, { tapMin: w.screen.tapMin, locale: w.locale, namespaces: NAMESPACES }).catch(() => null);
  const extras = await page.evaluate(pageExtras, { banned: BANNED }).catch(() => null);
  if (!m || !extras) {
    row(w, route, [...head, ["measured", "0"]]);
    return { measured: false, navFailed: true, metrics: {}, defects: [] };
  }
  const axe = await runAxe(page);
  const clsTop = await page.evaluate(clsTopSource).catch(() => "none");
  const clsGrower = await page.evaluate(clsGrowerSource).catch(() => "none:0");
  const tops = await page.evaluate(componentTops).catch(() => ({ small: "none", cta: "none" }));
  const errors = consoleErrors.take();
  const kv: Kv[] = [...head, ["measured", "1"], ["theme", extras.theme_dark ? "dark" : "light"]];
  // min_font_px keeps one decimal (11.5 px must not print as 12); every other value is an integer.
  for (const [k, v] of Object.entries(m)) kv.push([k, k === "min_font_px" ? v.toFixed(1) : n(v)]);
  kv.push(["banned_words", n(extras.banned_words!)], ["broken_img", n(extras.broken_img!)], ["console_errors", n(errors)], ["screenshot", "none"]);
  if (axe) {
    kv.push(["axe_critical", n(axe.critical)], ["axe_serious", n(axe.serious)], ["axe_moderate", n(axe.moderate)], ["axe_minor", n(axe.minor)], ["axe_nodes", n(axe.nodes)]);
  } else kv.push(["axe", "na"]);
  kv.push(["cls_top", clsTop], ["cls_grower", clsGrower], ["tap_small_top", tops.small], ["cta_ids", tops.cta]);
  row(w, route, kv);

  const where = `${w.role} ${w.screen.label} ${route}`;
  const defects: string[] = [];
  if (w.screen.touch && m.overflow_px! > 1) defects.push(`${where}: horizontal overflow ${n(m.overflow_px!)} px on a touch screen`);
  if (m.raw_keys! > 0) defects.push(`${where}: ${n(m.raw_keys!)} raw i18n key(s) on screen`);
  if (m.main_count! > 1) defects.push(`${where}: ${n(m.main_count!)} visible <main> landmarks`);
  if (m.error_boundary! > 0) defects.push(`${where}: the error boundary rendered`);
  if (axe && axe.critical > 0) defects.push(`${where}: axe critical rule(s) ${axe.criticalRules.join(",")}`);
  return { measured: true, navFailed: false, metrics: { ...m, ...extras, console_errors: errors }, defects };
}

async function measureRoute(page: Page, w: Where, route: string, consoleErrors: { take: () => number }): Promise<PageResult> {
  const url = withLocale(route, w.locale);
  const started = Date.now();
  consoleErrors.take();
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e: Error) => e);
  if (res instanceof Error) {
    row(w, url, [["status", "ERR"], ["measured", "0"]]);
    return { measured: false, navFailed: true, metrics: {}, defects: [] };
  }
  await page.waitForLoadState("load", { timeout: 20_000 }).catch(() => undefined);
  const navMs = Date.now() - started;
  const status = res?.status() ?? 0;
  const landed = new URL(page.url());
  const head: Kv[] = [
    ["role", w.role],
    ["status", String(status)],
    ["redir", landed.pathname.replace(/\/$/, "") === url.replace(/\/$/, "") ? "0" : "1"],
    ["landed_locale_ok", landed.pathname.split("/")[1] === w.locale ? "1" : "0"],
    ["nav_ms", n(navMs)],
  ];
  if (status >= 400) {
    // Not the surface: role-routes judges reachability; nothing to measure here.
    row(w, url, [...head, ["measured", "0"]]);
    return { measured: false, navFailed: false, metrics: {}, defects: [] };
  }
  const r = await measureHere(page, w, url, head, consoleErrors);
  return r.measured ? { ...r, metrics: { ...r.metrics, nav_ms: navMs } } : r;
}

/** Opens `routes` one after another in ONE context; soft-asserts the hard defects. */
async function sweep(browser: Browser, w: Where, routes: readonly string[]): Promise<void> {
  const ctx = await context(browser, w.slot, w.locale);
  const page = await ctx.newPage();
  const consoleErrors = consoleCounter(page);
  let navFailures = 0;
  let measured = 0;
  const defects: string[] = [];
  try {
    for (const route of routes) {
      const r = await measureRoute(page, w, route, consoleErrors);
      if (r.navFailed) navFailures++;
      if (r.measured) measured++;
      defects.push(...r.defects);
    }
  } finally {
    await ctx.close();
  }
  console.info(line(w, "*", [["role", w.role], ["pages", n(routes.length)], ["measured", n(measured)], ["nav_failed", n(navFailures)], ["hard_defects", n(defects.length)]]));
  // A sweep that could not open a quarter of its pages measured nothing worth a verdict.
  expect.soft(navFailures, `${w.role} ${w.screen.label} ${w.locale}: pages that did not open`).toBeLessThanOrEqual(Math.floor(routes.length / 4));
  expect(defects, defects.join("\n")).toEqual([]);
}

// ── Real clicks ──────────────────────────────────────────────────────────────

/** Clicks `link` and waits for the address to change; the time it took, or null. */
async function clickAway(page: Page, link: ReturnType<Page["locator"]>): Promise<number | null> {
  const before = new URL(page.url()).pathname;
  const started = Date.now();
  const moved = page.waitForURL((u) => u.pathname !== before, { timeout: 20_000 }).then(
    () => true,
    () => false,
  );
  await link.click({ timeout: 10_000 }).catch(() => undefined);
  if (!(await moved)) return null;
  await page.waitForLoadState("load", { timeout: 20_000 }).catch(() => undefined);
  return Date.now() - started;
}

/** The first visible in-page link a read-only click may follow, preferring one deeper than here. */
async function innerLink(page: Page, locale: Locale): Promise<ReturnType<Page["locator"]> | null> {
  const links = page.locator("main a[href]");
  return pickLink(page, links, (p) => p.startsWith(`/${locale}/dashboard`), true);
}

/**
 * The path a click landed on, as a static route: a segment that is an id (a uuid, a
 * number, a long hex or token) is written `:id`, and the query is dropped, so no
 * production identifier reaches the log or the report.
 */
function staticPath(url: string): string {
  return new URL(url).pathname
    .split("/")
    .map((s) => (/^[0-9a-f]{8}-[0-9a-f]{4}-|^\d+$|^[0-9a-f]{12,}$|^[A-Za-z0-9_-]{20,}$/i.test(s) ? ":id" : s))
    .join("/");
}

function parseUrl(href: string): URL | null {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

/**
 * Among `links`, the first visible one to another page that `accept`s its path and is
 * no write (WRITE_HINT); with `deeper`, one below the current page is preferred.
 */
async function pickLink(page: Page, links: ReturnType<Page["locator"]>, accept: (path: string) => boolean, deeper: boolean): Promise<ReturnType<Page["locator"]> | null> {
  const here = new URL(page.url()).pathname.replace(/\/$/, "");
  const origin = new URL(page.url()).origin;
  const found = await links
    .evaluateAll((as) =>
      as.map((a) => {
        const r = a.getBoundingClientRect();
        const visible = r.width > 1 && r.height > 1 && getComputedStyle(a).visibility !== "hidden";
        return { visible, href: (a as HTMLAnchorElement).href, current: a.getAttribute("aria-current") === "page" };
      }),
    )
    .catch(() => [] as { visible: boolean; href: string; current: boolean }[]);
  const ok = found
    .map((f, i) => ({ ...f, i, url: parseUrl(f.href) }))
    .filter((f) => f.visible && !f.current && f.url !== null && f.url.origin === origin)
    .map((f) => ({ i: f.i, path: f.url!.pathname.replace(/\/$/, "") }))
    .filter((f) => f.path !== here && accept(f.path) && !WRITE_HINT.test(f.path));
  const pick = (deeper ? ok.find((f) => f.path.startsWith(`${here}/`)) : undefined) ?? ok[0];
  return pick ? links.nth(pick.i) : null;
}

/** The header navigation: the bar's own links, or the phone's area sheet. */
async function headerLink(page: Page, locale: Locale): Promise<ReturnType<Page["locator"]> | null> {
  const area = (p: string) => p.startsWith(`/${locale}/dashboard`);
  // The journal item opens the journal over the page instead of navigating: not an area link.
  const bar = await pickLink(page, page.locator('a[data-testid^="header-core-nav-"]:not([data-testid="header-core-nav-journal"])'), area, false);
  if (bar) return bar;
  const trigger = page.getByTestId("header-nav-sheet-trigger").filter({ visible: true }).first();
  if ((await trigger.count()) === 0) return null;
  await trigger.click({ timeout: 10_000 }).catch(() => undefined);
  const sheet = page.getByTestId("header-nav-sheet");
  await sheet.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
  return pickLink(page, sheet.locator("a[href]"), area, false);
}

async function clickJourney(browser: Browser, w: Where, start: string): Promise<void> {
  const ctx = await context(browser, w.slot, w.locale);
  const page = await ctx.newPage();
  const consoleErrors = consoleCounter(page);
  const defects: string[] = [];
  const steps: Kv[] = [["role", w.role]];
  try {
    const first = await measureRoute(page, w, start, consoleErrors);
    defects.push(...first.defects);
    if (!first.measured) {
      steps.push(["l1", "na"], ["l2", "na"], ["l3", "na"], ["ai_open", "na"]);
      return;
    }
    // L1 — the header navigation (a must: every role reaches its areas from the bar or the sheet).
    const l1 = await headerLink(page, w.locale);
    const l1Ms = l1 ? await clickAway(page, l1) : null;
    steps.push(["l1", l1Ms === null ? "0" : "1"], ["l1_ms", l1Ms === null ? "na" : n(l1Ms)]);
    if (l1Ms === null) defects.push(`${w.role} ${w.screen.label}: the header navigation did not open another area`);
    else defects.push(...(await measureHere(page, w, staticPath(page.url()), [["role", w.role], ["status", "click"], ["level", "1"]], consoleErrors)).defects);
    // L2, L3 — a link inside the page. A page with no such link is reported, not judged.
    for (const level of [2, 3] as const) {
      const link = l1Ms === null ? null : await innerLink(page, w.locale);
      const ms = link ? await clickAway(page, link) : null;
      steps.push([`l${level}`, link === null ? "na" : ms === null ? "0" : "1"], [`l${level}_ms`, ms === null ? "na" : n(ms)]);
      if (ms !== null) defects.push(...(await measureHere(page, w, staticPath(page.url()), [["role", w.role], ["status", "click"], ["level", String(level)]], consoleErrors)).defects);
    }
    // The AI entry: the logo is the way home, and the home is the AI conversation.
    const logo = page.getByTestId("shell-logo-home").filter({ visible: true }).first();
    const onHome = new URL(page.url()).pathname.replace(/\/$/, "") === `/${w.locale}/dashboard`;
    if (!onHome) await clickAway(page, logo);
    const composer = page.getByTestId("composer-input").filter({ visible: true }).first();
    const opened = await composer.waitFor({ state: "visible", timeout: 20_000 }).then(
      () => true,
      () => false,
    );
    steps.push(["ai_open", opened ? "1" : "0"]);
    if (!opened) defects.push(`${w.role} ${w.screen.label}: the AI entry did not open the conversation`);
  } finally {
    await ctx.close();
    row(w, `${withLocale(start, w.locale)}#clicks`, steps);
  }
  expect(defects, defects.join("\n")).toEqual([]);
}

const perPageBudget = 30_000;

/** A role whose synthetic session was not minted: recorded BLOCKED, never created. */
function blocked(w: Where): boolean {
  if (existsSync(state(w.slot))) return false;
  row(w, "*", [["role", w.role], ["blocked", "1"], ["reason", "no-synthetic-session"]]);
  return true;
}

// ── Tests ────────────────────────────────────────────────────────────────────

// FIRST, and always green: the walk brakes judge a run whose first test failed as an
// infrastructure failure, so a UX defect found later must never be the first step.
test("plan: the measurement fits the production-load budget", ({ viewport, hasTouch }) => {
  const screen = screenOf(viewport, hasTouch);
  console.info(
    `[ux] plan screen=${screen.label} touch=${screen.touch ? "1" : "0"} loads=${n(PLANNED_LOADS)} roles=${ROLES.map((a) => `${a.role}:${n(a.routes.length)}`).join(",")} locale_sweep=${n(SWEEP_LOCALES.length)}x${n(LOCALE_SWEEP_ROUTES.length)} reduced_motion=${n(REDUCED_MOTION.length)}x2 clicks=${n(ROLES.length)}x${n(CLICK_LOADS)} axe=${AXE_SOURCE ? "1" : "0"}`,
  );
  expect(PLANNED_LOADS).toBeLessThanOrEqual(MAX_LOADS);
  expect(NAMESPACES.length).toBeGreaterThan(10);
  expect(BANNED.length).toBeGreaterThan(0);
});

for (const r of ROLES) {
  test(`${r.role}: every surface measured`, async ({ browser, viewport, hasTouch }) => {
    const w: Where = { role: r.role, slot: r.slot, screen: screenOf(viewport, hasTouch), locale: "lt" };
    test.skip(blocked(w), `BLOCKED: no synthetic session for ${r.role} (${r.slot})`);
    test.setTimeout(r.routes.length * perPageBudget + 30_000);
    await sweep(browser, w, r.routes);
  });
}

for (const locale of SWEEP_LOCALES) {
  test(`worker ${locale}: key surfaces in this locale`, async ({ browser, viewport, hasTouch }) => {
    const w: Where = { role: "worker", slot: "worker", screen: screenOf(viewport, hasTouch), locale };
    test.skip(blocked(w), "BLOCKED: no synthetic session for worker");
    test.setTimeout(LOCALE_SWEEP_ROUTES.length * perPageBudget + 30_000);
    await sweep(browser, w, LOCALE_SWEEP_ROUTES);
  });
}

for (const r of ROLES) {
  test(`${r.role}: header navigation L1 → L2 → L3 and the AI entry, by real clicks`, async ({ browser, viewport, hasTouch }) => {
    const w: Where = { role: r.role, slot: r.slot, screen: screenOf(viewport, hasTouch), locale: "lt" };
    test.skip(blocked(w), `BLOCKED: no synthetic session for ${r.role} (${r.slot})`);
    test.setTimeout(CLICK_LOADS * perPageBudget + 60_000);
    await clickJourney(browser, w, r.routes[0]!);
  });
}

test("reduced motion: running animations with prefers-reduced-motion: reduce", async ({ browser, viewport, hasTouch }) => {
  test.setTimeout(REDUCED_MOTION.length * 2 * perPageBudget + 30_000);
  const screen = screenOf(viewport, hasTouch);
  const defects: string[] = [];
  for (const { role, slot, route } of REDUCED_MOTION) {
    const base: Where = { role, slot, screen, locale: "lt" };
    if (blocked(base)) continue;
    const counts: number[] = [];
    for (const motion of ["no-preference", "reduce"] as const) {
      const ctx = await context(browser, slot, "lt", motion);
      try {
        const page = await ctx.newPage();
        const w: Where = motion === "reduce" ? { ...base, screen: { ...screen, label: `${screen.label}-rm` } } : base;
        const r = await measureRoute(page, w, route, consoleCounter(page));
        defects.push(...r.defects);
        counts.push(r.measured ? r.metrics.anim_running! : -1);
      } finally {
        await ctx.close();
      }
    }
    const [normal, reduced] = counts as [number, number];
    // respected: nothing runs under `reduce`, or fewer than without it; "na" when nothing ran either way.
    const respected = normal < 0 || reduced < 0 ? "na" : normal === 0 && reduced === 0 ? "na" : reduced === 0 || reduced < normal ? "1" : "0";
    row({ ...base, screen: { ...screen, label: `${screen.label}-rm` } }, route, [["role", role], ["anim_normal", normal < 0 ? "na" : n(normal)], ["anim_reduce", reduced < 0 ? "na" : n(reduced)], ["rm_respected", respected]]);
  }
  expect(defects, defects.join("\n")).toEqual([]);
});
