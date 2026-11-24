/**
 * W7-S3 regression capture — LOCAL ONLY.
 *
 * This slice claims BEHAVIOUR-IDENTICAL, so the primary artefact is a DOM
 * FINGERPRINT that can be diffed byte-for-byte between BEFORE and AFTER: every
 * testid with its text, every heading, every link href, every input, plus the
 * page geometry. Timing is captured too (12 runs → p25/median/p75) but is
 * reported as secondary, because dev-server noise on this repo exceeds any
 * difference it could show.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.UX_BASE ?? "http://127.0.0.1:3470";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) {
  console.error(`REFUSED_NON_LOCAL_CAPTURE: ${BASE}`);
  process.exit(1);
}
const PHASE = process.env.UX_PHASE ?? "after";
const EMAIL = process.env.UX_EMAIL ?? "dev.worker@local.test";
const TAG = process.env.UX_TAG ?? "worker-partial";
const RUNS = Number(process.env.UX_RUNS ?? 12);
const OUT = join(process.cwd(), "..", "..", "docs", "audits", "evidence", "w7-s3");
mkdirSync(OUT, { recursive: true });

const ROUTE = "/lt/dashboard/profile";
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];

const results = [];
const browser = await chromium.launch();

for (const vp of [
  { name: "1440", width: 1440, height: 900 },
  { name: "375", width: 375, height: 812 },
]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "lt-LT",
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const hydration = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/hydrat|did not match|Text content does not match/i.test(t)) hydration.push(t.slice(0, 240));
    else if (m.type() === "error" && !/upgrade-insecure-requests/.test(t)) consoleErrors.push(t.slice(0, 240));
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 240)));

  await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|onboarding/, { timeout: 120_000 });
  if (/auth\/login/.test(page.url())) throw new Error(`LOGIN_FAILED ${EMAIL}`);

  // warm the route so timing measures the page, not the dev compiler
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForTimeout(5000);

  const ttfb = [];
  const serverTiming = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = Date.now();
    const resp = await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    ttfb.push(Date.now() - t0);
    // Navigation Timing's responseStart − requestStart is the server's own
    // think time, free of the harness's own overhead.
    const st = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      return n ? Math.round(n.responseStart - n.requestStart) : null;
    });
    if (typeof st === "number") serverTiming.push(st);
    if (resp && resp.status() !== 200) throw new Error(`status ${resp.status()}`);
    await page.waitForTimeout(500);
  }
  ttfb.sort((a, b) => a - b);
  serverTiming.sort((a, b) => a - b);

  consoleErrors.length = 0;
  hydration.length = 0;
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(8000);

  const dom = await page.evaluate(() => {
    const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
    return {
      docHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      skeletonMounted: Boolean(
        document.querySelector(".animate-pulse") &&
          document.querySelector(".animate-pulse").getBoundingClientRect().height > 0,
      ),
      cardBorders: document.querySelectorAll(".card-border").length,
      sections: document.querySelectorAll("section").length,
      inputs: document.querySelectorAll("input, textarea, select").length,
      buttons: document.querySelectorAll("button").length,
      // ── the fingerprint: everything a user can see or act on ──────────
      headings: [...document.querySelectorAll("h1,h2,h3")].map(
        (h) => `${h.tagName}:${norm(h.textContent)}`,
      ),
      testids: [...document.querySelectorAll("[data-testid]")]
        .map((e) => `${e.getAttribute("data-testid")}|${norm(e.textContent).slice(0, 80)}`)
        .sort(),
      hrefs: [...document.querySelectorAll("a[href]")]
        .map((a) => a.getAttribute("href"))
        .sort(),
      inputNames: [...document.querySelectorAll("input, textarea, select")]
        .map((e) => `${e.tagName}:${e.getAttribute("name") ?? e.getAttribute("data-testid") ?? e.type ?? "?"}`)
        .sort(),
      anchorIds: [...document.querySelectorAll("[id]")].map((e) => e.id).sort(),
    };
  });

  await page.screenshot({
    path: join(OUT, `${PHASE}-${TAG}-${vp.name}.png`),
    fullPage: true,
    caret: "initial",
  });

  const row = {
    phase: PHASE,
    tag: TAG,
    viewport: vp.name,
    ttfb: { runs: ttfb, p25: pct(ttfb, 0.25), median: pct(ttfb, 0.5), p75: pct(ttfb, 0.75) },
    serverThinkMs: serverTiming.length
      ? { runs: serverTiming, p25: pct(serverTiming, 0.25), median: pct(serverTiming, 0.5), p75: pct(serverTiming, 0.75) }
      : null,
    consoleErrors: [...consoleErrors],
    hydrationWarnings: [...hydration],
    ...dom,
  };
  results.push(row);
  console.log(
    `[${PHASE}/${TAG}@${vp.name}] docH=${dom.docHeight} cards=${dom.cardBorders} sec=${dom.sections} headings=${dom.headings.length} testids=${dom.testids.length} hrefs=${dom.hrefs.length} inputs=${dom.inputs} overflow=${dom.horizontalOverflow} skeleton=${dom.skeletonMounted} ttfb(p25/med/p75)=${row.ttfb.p25}/${row.ttfb.median}/${row.ttfb.p75} server=${row.serverThinkMs ? `${row.serverThinkMs.p25}/${row.serverThinkMs.median}/${row.serverThinkMs.p75}` : "?"} console=${consoleErrors.length} hydration=${hydration.length}`,
  );
  await ctx.close();
}
await browser.close();
writeFileSync(join(OUT, `${PHASE}-${TAG}.json`), JSON.stringify(results, null, 2));
console.log(`wrote ${join(OUT, `${PHASE}-${TAG}.json`)}`);
