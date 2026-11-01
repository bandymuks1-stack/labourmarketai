import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, type Browser, type Page } from "./prod-walk";

import { installObservers } from "./ux-probes";

/**
 * PRODUCTION — DOES THE LIVE SITE SLOW DOWN AT TWO PEOPLE AT ONCE?
 * (owner decision 2026-10-26 §5; the owner approved this two-session check.)
 * READ-ONLY: nothing is written.
 *
 * A controlled sequential walk measured ~2-2.5 s for every page and locale
 * (run 40328663291), while sweeps that ran two groups at once saw 9-18 s
 * first-byte times. This walk measures the SAME pages:
 *   phase "solo": one synthetic session, pages in sequence, three rounds;
 *   phase "pair": two synthetic sessions (worker + owner) doing the same
 *                 sequence at the same time — the load of two people.
 * `/api/health` is timed before each page. One `[conc]` line per page —
 * numbers only. Bounded: 2 phases x 3 rounds x 4 pages, at most 2 sessions.
 */
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && ["worker", "owner"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 900_000, retries: 0 });

const PAGES = ["/lt/dashboard", "/lt/dashboard/journal", "/lt/dashboard/opportunities", "/lt/dashboard/profile"] as const;
const ROUNDS = 3;

async function session(browser: Browser, slot: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext({ storageState: state(slot), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(installObservers);
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

async function sweep(page: Page, phase: string, who: string): Promise<void> {
  for (let round = 1; round <= ROUNDS; round += 1) {
    for (const path of PAGES) {
      const h0 = Date.now();
      const healthy = await page.request.get("/api/health", { timeout: 30_000 }).then((r) => r.ok()).catch(() => false);
      const health = healthy ? Date.now() - h0 : -1;
      const ok = await page.goto(path, { waitUntil: "load", timeout: 90_000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(1_000);
      const t = ok
        ? await page.evaluate(() => {
            const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
            const ux = (window as unknown as { __ux?: { lcp: number } }).__ux;
            return { ttfb: Math.round(nav?.responseStart ?? 0), resp_end: Math.round(nav?.responseEnd ?? 0), lcp: Math.round(ux?.lcp ?? 0) };
          })
        : {};
      const kv = Object.entries({ health_ms: health, ok: ok ? 1 : 0, ...t }).map(([k, v]) => `${k}=${v}`).join(" ");
      console.info(`[conc] phase=${phase} who=${who} round=${round} page=${path} ${kv}`);
    }
  }
}

test("solo, then a pair at once — same pages, same rounds", async ({ browser }) => {
  const worker = await session(browser, "worker");
  const owner = await session(browser, "owner");
  try {
    await sweep(worker.page, "solo", "worker");
    await Promise.all([sweep(worker.page, "pair", "worker"), sweep(owner.page, "pair", "owner")]);
  } finally {
    await worker.close();
    await owner.close();
  }
});
