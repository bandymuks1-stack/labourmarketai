import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, type Page } from "./prod-walk";

import { installObservers } from "./ux-probes";

/**
 * PRODUCTION — IS THE SLOW NON-LT HOME A LOCALE PROBLEM OR SERVER LOAD?
 * (owner decision 2026-10-26, point 5). READ-ONLY: nothing is written.
 *
 * The ux-metrics walk measured LCP 7–39 s on non-LT locales while LT stayed
 * ~2–5 s. There DCL ≈ load ≈ LCP, i.e. the time is the server's streamed
 * response, not painting — but the non-LT sweeps ran later and two at a time,
 * so load and locale were confounded. This walk removes both confounders:
 *
 *   - ONE context, strictly sequential (no parallel sweep);
 *   - the same pages in every locale, the locale order ROTATED per page, so no
 *     locale always goes first or last;
 *   - two rounds (round 1 = cold for that locale, round 2 = warm);
 *   - `/api/health` timed right before every page, so server load at that
 *     moment sits on the same line as the page timing.
 *
 * One `[lcp]` line per page — numbers only.
 */
const state = resolve(__dirname, ".storage-state.prod-qa.worker.json");
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state);
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 900_000, retries: 0 });

const LOCALES = ["lt", "en", "ru", "de", "nl", "pl"] as const;
const PAGES = ["/dashboard", "/dashboard/journal", "/dashboard/opportunities", "/dashboard/profile"] as const;

async function healthMs(page: Page): Promise<number> {
  const t0 = Date.now();
  const ok = await page.request
    .get("/api/health", { timeout: 30_000 })
    .then((r) => r.ok())
    .catch(() => false);
  return ok ? Date.now() - t0 : -1;
}

async function timings(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const ux = (window as unknown as { __ux?: { lcp: number } }).__ux;
    return {
      ttfb: Math.round(nav?.responseStart ?? 0),
      resp_end: Math.round(nav?.responseEnd ?? 0),
      dcl: Math.round(nav?.domContentLoadedEventEnd ?? 0),
      lcp: Math.round(ux?.lcp ?? 0),
      html_kb: Math.round((nav?.encodedBodySize ?? 0) / 1024),
    };
  });
}

test("worker phone: every locale, same pages, rotated order, two rounds", async ({ browser }) => {
  const ctx = await browser.newContext({
    storageState: state,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await ctx.addInitScript(installObservers);
  const page = await ctx.newPage();
  try {
    for (const round of [1, 2]) {
      for (const [pi, path] of PAGES.entries()) {
        const order = LOCALES.map((_, i) => LOCALES[(i + pi + round) % LOCALES.length]!);
        for (const locale of order) {
          const health = await healthMs(page);
          const t0 = Date.now();
          const ok = await page
            .goto(`/${locale}${path}`, { waitUntil: "load", timeout: 90_000 })
            .then(() => true)
            .catch(() => false);
          const wall = Date.now() - t0;
          await page.waitForTimeout(1_500); // let LCP settle
          const t = ok ? await timings(page) : {};
          const kv = Object.entries({ health_ms: health, wall_ms: wall, ok: ok ? 1 : 0, ...t })
            .map(([k, v]) => `${k}=${v}`)
            .join(" ");
          console.info(`[lcp] round=${round} locale=${locale} page=${path} ${kv}`);
        }
      }
    }
  } finally {
    await ctx.close();
  }
});
