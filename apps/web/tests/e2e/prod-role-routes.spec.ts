import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Page } from "./prod-walk";
import { COMMON_ROUTES, EMPLOYER_ROUTES } from "./prod-walk-routes";

/**
 * PRODUCTION ROLE ROUTES — owner programme 2026-10-12 §7: every main role can
 * sign in, understand what it can do, and reach its working surfaces.
 *
 * Runs only inside `.github/workflows/prod-qa-walk.yml` (spec=role-routes) with
 * the minted synthetic cast. Read-only: it opens pages, it never submits.
 * Each route is a SOFT check, so one run reports every broken surface instead
 * of stopping at the first.
 *
 * A route FAILS when: the response is 4xx/5xx, the branded not-found page renders
 * (it has a <main> with text, so the content checks alone passed a missing page —
 * audit 2026-10-18), the person is bounced to sign-in, the error boundary
 * renders, or the page shows no main content.
 */
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1";
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
// The budget scales with the routes an actor opens: a healthy owner pass was
// ~250 s for 28 routes (2026-10-22), so a flat 300 s cut the 27th route of a
// merely slow run. Slow surfaces stay visible by name (SLOW in the log).
test.describe.configure({ retries: 0 });

// The route lists are shared with the ux-metrics walk (one copy: ./prod-walk-routes).
const COMMON = COMMON_ROUTES;
const EMPLOYER = EMPLOYER_ROUTES;

const CAST: readonly { slot: string; role: string; routes: readonly string[] }[] = [
  { slot: "worker", role: "worker", routes: COMMON },
  { slot: "worker2", role: "worker (second)", routes: COMMON },
  { slot: "owner", role: "company owner", routes: [...COMMON, ...EMPLOYER] },
  { slot: "manager", role: "manager", routes: [...COMMON, ...EMPLOYER] },
  { slot: "agency", role: "agency", routes: [...COMMON, ...EMPLOYER] },
];

/** Per-route timing of the LAST check (ms): time to first byte of the
 *  document and the whole navigation. Logged so a slow route is a number in
 *  the run log, not a guess (owner 2026-10-15: the manager's /reports took
 *  >45 s once, two minutes after a deploy). */
const lastTiming: { ttfb: number | null; total: number } = { ttfb: null, total: 0 };

async function check(page: Page, route: string): Promise<string | null> {
  const started = Date.now();
  const res = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch((e: Error) => e);
  lastTiming.total = Date.now() - started;
  lastTiming.ttfb = null;
  if (res instanceof Error) return `navigation failed: ${res.message.split("\n")[0]}`;
  const timing = res?.request().timing();
  if (timing && timing.responseStart > 0) lastTiming.ttfb = Math.round(timing.responseStart);
  if (res && res.status() >= 400) return `HTTP ${res.status()}`;
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
  if (/\/auth\/(login|sign-?in)/.test(page.url())) return `bounced to sign-in (${new URL(page.url()).pathname})`;
  if (await page.getByTestId("error-boundary-message").isVisible().catch(() => false)) return "error boundary rendered";
  if (await page.getByTestId("global-error-message").isVisible().catch(() => false)) return "global error rendered";
  if (await page.getByTestId("branded-not-found").isVisible().catch(() => false)) return "not found (404 page)";
  // The home IS the chat: its proof is the composer, not a <main> text block.
  // A role redirect lands there too, with a ?notice= that explains why.
  if (new URL(page.url()).pathname.replace(/\/$/, "") === "/lt/dashboard") {
    const composer = page.getByTestId("composer-input");
    return (await composer.waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false)) ? null : "chat composer missing";
  }
  const main = page.locator("main").first();
  if (!(await main.isVisible().catch(() => false))) return "no main content";
  if ((await main.innerText().catch(() => "")).trim().length < 20) return "main content is empty";
  return null;
}

for (const actor of CAST) {
  test(`${actor.role}: every working surface opens`, async ({ browser }) => {
    test.setTimeout(actor.routes.length * 20_000); // 28 routes -> 560 s, 15 -> 300 s
    test.skip(!existsSync(state(actor.slot)), `no session for ${actor.slot}`);
    const ctx = await browser.newContext({ storageState: state(actor.slot), locale: "lt-LT" });
    const page = await ctx.newPage();
    const failures: string[] = [];
    for (const route of actor.routes) {
      const problem = await check(page, route);
      // A redirect to another surface with a notice is a role decision, not a
      // failure — it is recorded so the report shows where each role lands.
      const landed = new URL(page.url()).pathname + new URL(page.url()).search;
      console.info(
        `[role-routes] ${actor.slot} ${route} -> ${landed} ttfb_ms=${lastTiming.ttfb ?? "?"} nav_ms=${lastTiming.total}${lastTiming.total > 20_000 ? " SLOW" : ""} ${problem ? "FAIL " + problem : "ok"}`,
      );
      if (problem) failures.push(`${route}: ${problem}`);
      expect.soft(problem, `${actor.role} ${route}`).toBeNull();
    }
    await ctx.close();
    expect(failures, failures.join("\n")).toEqual([]);
  });
}
