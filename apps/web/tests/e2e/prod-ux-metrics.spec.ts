import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
 *   [ux] <slot> <viewport> <locale> <route> key=value key=value ...
 *
 * Values are numbers only — never page text, names, ids or e-mails. <route> is
 * the static path that was requested (from ./prod-walk-routes). Every integer
 * goes through `n()`: the walk brakes scan the walk log for 5xx markers
 * (`\b50[0-4]\b`, .github/scripts/walk-brakes.mjs INFRA_PATTERN), so a count
 * that happens to be 500-504 is written zero-padded ("0503") instead of
 * reading as a server error. `status=` is the one value left plain: a real 5xx
 * there IS an infrastructure signal.
 *
 * READ-ONLY: it opens pages and reads the DOM; it never clicks, types or submits.
 *
 * Fails ONLY on hard defects (soft-collected, so one run reports all of them):
 * horizontal overflow on the phone, a raw i18n key on screen, an axe "critical"
 * violation (when axe is available, see AXE_SOURCE), more than one visible
 * <main> landmark, the error boundary. Everything else is reported, not judged.
 *
 * LOAD (production DB and the walk budget are tight; the health brake trips at
 * db > 1500 ms): ~115 page loads, the same order as the routine role-routes walk
 * (15 x 2 + 28 x 3 = 114). COMMON surfaces are measured on the worker (the
 * same components render them for every role); owner and agency add their home
 * plus the employer surfaces. Both at desktop 1280x800 and phone 390x844. The
 * locale sweep runs the worker's five key surfaces at phone width in every
 * ACTIVE locale except lt (lt is the worker's phone pass). Two homes are
 * re-measured with `reducedMotion: "reduce"`.
 */
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1";
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
// Never retried: a retry would double the production load of the whole test.
test.describe.configure({ retries: 0 });

// ── Plan ─────────────────────────────────────────────────────────────────────

type Viewport = "desktop" | "phone";
const VIEWPORTS: Record<Viewport, { viewport: { width: number; height: number }; isMobile: boolean; hasTouch: boolean; tapMin: number }> = {
  // Tap floor: 44x44 CSS px on touch (WCAG 2.5.5 / platform guidance), 24x24 on desktop (WCAG 2.5.8).
  desktop: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, tapMin: 24 },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, tapMin: 44 },
};

/** `activeLocales` in lib/i18n/config.ts (6 of the 11 UI locales are routed). Mirrored, not imported:
 *  a Playwright spec cannot resolve the app's `@/` alias. Context `locale` is the browser's language. */
const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de", "pl"] as const;
type Locale = (typeof ACTIVE_LOCALES)[number];
const BROWSER_LOCALE: Record<Locale, string> = { lt: "lt-LT", en: "en-GB", ru: "ru-RU", nl: "nl-NL", de: "de-DE", pl: "pl-PL" };

const EMPLOYER_SET = ["/lt/dashboard", ...EMPLOYER_ROUTES];
const ACTORS: readonly { slot: string; routes: readonly string[] }[] = [
  { slot: "worker", routes: COMMON_ROUTES },
  { slot: "owner", routes: EMPLOYER_SET },
  { slot: "agency", routes: EMPLOYER_SET },
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
const REDUCED_MOTION: readonly { slot: string; route: string }[] = [
  { slot: "worker", route: "/lt/dashboard" },
  { slot: "owner", route: "/lt/dashboard" },
];
const PLANNED_LOADS =
  ACTORS.reduce((s, a) => s + a.routes.length * 2, 0) + SWEEP_LOCALES.length * LOCALE_SWEEP_ROUTES.length + REDUCED_MOTION.length * 2;
const MAX_LOADS = 120;

const withLocale = (route: string, locale: Locale) => route.replace(/^\/lt(?=\/|$)/, `/${locale}`);

/** Top-level message namespaces (next-intl renders a missing key as `namespace.key`). */
const NAMESPACES: string[] = (() => {
  const base = Object.keys(JSON.parse(readFileSync(resolve(__dirname, "../../messages/lt.json"), "utf8")) as Record<string, unknown>);
  // The taxonomy files lib/i18n/request.ts mounts as their own namespaces.
  return [...base, "professions", "skillNames", "journal", "relationshipTypes", "productivityUnits", "labourMarket"];
})();

// ── Formatting ───────────────────────────────────────────────────────────────

/** An integer for the log, zero-padded only where it would read as a 5xx marker (see header). */
const n = (v: number): string => {
  const r = Math.round(v);
  return r >= 500 && r <= 504 ? `0${r}` : String(r);
};

type Kv = [key: string, value: string];

function line(slot: string, vp: string, locale: string, route: string, kv: Kv[]): string {
  return `[ux] ${slot} ${vp} ${locale} ${route} ${kv.map(([k, v]) => `${k}=${v}`).join(" ")}`;
}

// ── One page ─────────────────────────────────────────────────────────────────

type PageResult = { measured: boolean; navFailed: boolean; metrics: Record<string, number>; defects: string[] };

async function context(browser: Browser, slot: string, vp: Viewport, locale: Locale, reducedMotion: "reduce" | "no-preference" = "no-preference"): Promise<BrowserContext> {
  const v = VIEWPORTS[vp];
  const ctx = await browser.newContext({
    storageState: state(slot),
    locale: BROWSER_LOCALE[locale],
    viewport: v.viewport,
    isMobile: v.isMobile,
    hasTouch: v.hasTouch,
    reducedMotion,
  });
  await ctx.addInitScript(installObservers);
  return ctx;
}

async function measureRoute(page: Page, slot: string, vpLabel: string, vp: Viewport, locale: Locale, route: string): Promise<PageResult> {
  const url = withLocale(route, locale);
  const started = Date.now();
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e: Error) => e);
  if (res instanceof Error) {
    console.info(line(slot, vpLabel, locale, url, [["status", "ERR"], ["measured", "0"]]));
    return { measured: false, navFailed: true, metrics: {}, defects: [] };
  }
  await page.waitForLoadState("load", { timeout: 20_000 }).catch(() => undefined);
  const navMs = Date.now() - started;
  const status = res?.status() ?? 0;
  const landed = new URL(page.url());
  const head: Kv[] = [
    ["status", String(status)],
    ["redir", landed.pathname.replace(/\/$/, "") === url.replace(/\/$/, "") ? "0" : "1"],
    ["landed_locale_ok", landed.pathname.split("/")[1] === locale ? "1" : "0"],
    ["nav_ms", n(navMs)],
  ];
  if (status >= 400 || /\/auth\/(login|sign-?in)/.test(landed.pathname)) {
    // Not the surface: role-routes judges reachability; nothing to measure here.
    console.info(line(slot, vpLabel, locale, url, [...head, ["signin", /\/auth\//.test(landed.pathname) ? "1" : "0"], ["measured", "0"]]));
    return { measured: false, navFailed: false, metrics: {}, defects: [] };
  }
  // Observation window: long tasks / animation frames and layout shifts in the 3 s after load.
  await page.waitForTimeout(3_000);
  const m = await page
    .evaluate(measure, { tapMin: VIEWPORTS[vp].tapMin, locale, namespaces: NAMESPACES })
    .catch(() => null);
  if (!m) {
    console.info(line(slot, vpLabel, locale, url, [...head, ["measured", "0"]]));
    return { measured: false, navFailed: true, metrics: {}, defects: [] };
  }
  const axe = await runAxe(page);
  const clsTop = await page.evaluate(clsTopSource).catch(() => "none");
  const clsGrower = await page.evaluate(clsGrowerSource).catch(() => "none:0");
  const tops = await page.evaluate(componentTops).catch(() => ({ small: "none", cta: "none" }));
  const kv: Kv[] = [...head, ["measured", "1"]];
  // min_font_px keeps one decimal (11.5 px must not print as 12); every other value is an integer.
  for (const [k, v] of Object.entries(m)) kv.push([k, k === "min_font_px" ? v.toFixed(1) : n(v)]);
  if (axe) {
    kv.push(["axe_critical", n(axe.critical)], ["axe_serious", n(axe.serious)], ["axe_moderate", n(axe.moderate)], ["axe_minor", n(axe.minor)], ["axe_nodes", n(axe.nodes)]);
  } else kv.push(["axe", "na"]);
  kv.push(["cls_top", clsTop], ["cls_grower", clsGrower], ["tap_small_top", tops.small], ["cta_ids", tops.cta]);
  console.info(line(slot, vpLabel, locale, url, kv));

  const where = `${slot} ${vpLabel} ${url}`;
  const defects: string[] = [];
  if (vp === "phone" && m.overflow_px! > 1) defects.push(`${where}: horizontal overflow ${n(m.overflow_px!)} px on the phone`);
  if (m.raw_keys! > 0) defects.push(`${where}: ${n(m.raw_keys!)} raw i18n key(s) on screen`);
  if (m.main_count! > 1) defects.push(`${where}: ${n(m.main_count!)} visible <main> landmarks`);
  if (m.error_boundary! > 0) defects.push(`${where}: the error boundary rendered`);
  if (axe && axe.critical > 0) defects.push(`${where}: axe critical rule(s) ${axe.criticalRules.join(",")}`);
  return { measured: true, navFailed: false, metrics: { ...m, nav_ms: navMs }, defects };
}

/** Opens `routes` one after another in ONE context; soft-asserts the hard defects. */
async function sweep(browser: Browser, slot: string, vp: Viewport, locale: Locale, routes: readonly string[]): Promise<void> {
  const ctx = await context(browser, slot, vp, locale);
  const page = await ctx.newPage();
  let navFailures = 0;
  let measured = 0;
  const defects: string[] = [];
  try {
    for (const route of routes) {
      const r = await measureRoute(page, slot, vp, vp, locale, route);
      if (r.navFailed) navFailures++;
      if (r.measured) measured++;
      defects.push(...r.defects);
    }
  } finally {
    await ctx.close();
  }
  console.info(line(slot, vp, locale, "*", [["pages", n(routes.length)], ["measured", n(measured)], ["nav_failed", n(navFailures)], ["hard_defects", n(defects.length)]]));
  // A sweep that could not open a quarter of its pages measured nothing worth a verdict.
  expect.soft(navFailures, `${slot} ${vp} ${locale}: pages that did not open`).toBeLessThanOrEqual(Math.floor(routes.length / 4));
  expect(defects, defects.join("\n")).toEqual([]);
}

const perPageBudget = 30_000;

// ── Tests ────────────────────────────────────────────────────────────────────

// FIRST, and always green: the walk brakes judge a run whose first test failed as an
// infrastructure failure, so a UX defect found later must never be the first step.
test("plan: the measurement fits the production-load budget", () => {
  console.info(
    `[ux] plan loads=${n(PLANNED_LOADS)} actors=${ACTORS.map((a) => `${a.slot}:${n(a.routes.length)}x2`).join(",")} locale_sweep=${n(SWEEP_LOCALES.length)}x${n(LOCALE_SWEEP_ROUTES.length)} reduced_motion=${n(REDUCED_MOTION.length)}x2 axe=${AXE_SOURCE ? "1" : "0"}`,
  );
  expect(PLANNED_LOADS).toBeLessThanOrEqual(MAX_LOADS);
  expect(NAMESPACES.length).toBeGreaterThan(10);
});

for (const actor of ACTORS) {
  for (const vp of ["desktop", "phone"] as const) {
    test(`${actor.slot} ${vp}: every surface measured`, async ({ browser }) => {
      test.skip(!existsSync(state(actor.slot)), `no session for ${actor.slot}`);
      test.setTimeout(actor.routes.length * perPageBudget + 30_000);
      await sweep(browser, actor.slot, vp, "lt", actor.routes);
    });
  }
}

for (const locale of SWEEP_LOCALES) {
  test(`worker phone ${locale}: key surfaces in this locale`, async ({ browser }) => {
    test.skip(!existsSync(state("worker")), "no session for worker");
    test.setTimeout(LOCALE_SWEEP_ROUTES.length * perPageBudget + 30_000);
    await sweep(browser, "worker", "phone", locale, LOCALE_SWEEP_ROUTES);
  });
}

test("reduced motion: running animations with prefers-reduced-motion: reduce", async ({ browser }) => {
  test.setTimeout(REDUCED_MOTION.length * 2 * perPageBudget + 30_000);
  const defects: string[] = [];
  for (const { slot, route } of REDUCED_MOTION) {
    if (!existsSync(state(slot))) continue;
    const counts: number[] = [];
    for (const motion of ["no-preference", "reduce"] as const) {
      const ctx = await context(browser, slot, "desktop", "lt", motion);
      try {
        const r = await measureRoute(await ctx.newPage(), slot, motion === "reduce" ? "desktop-rm" : "desktop", "desktop", "lt", route);
        defects.push(...r.defects);
        counts.push(r.measured ? r.metrics.anim_running! : -1);
      } finally {
        await ctx.close();
      }
    }
    const [normal, reduced] = counts as [number, number];
    // respected: nothing runs under `reduce`, or fewer than without it; "na" when nothing ran either way.
    const respected = normal < 0 || reduced < 0 ? "na" : normal === 0 && reduced === 0 ? "na" : reduced === 0 || reduced < normal ? "1" : "0";
    console.info(line(slot, "desktop-rm", "lt", route, [["anim_normal", normal < 0 ? "na" : n(normal)], ["anim_reduce", reduced < 0 ? "na" : n(reduced)], ["rm_respected", respected]]));
  }
  expect(defects, defects.join("\n")).toEqual([]);
});
