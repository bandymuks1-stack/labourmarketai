/**
 * W7-S4 BEFORE/AFTER capture — LOCAL ONLY.
 *
 * W7-S4 moves two blocks OFF `/dashboard/profile` and ONTO
 * `/dashboard/network`. Measuring only the page that shrank would be the
 * dishonest half of the story — a move looks like a win on every metric if you
 * never look at the destination. Both routes are therefore measured with the
 * SAME rubric, at 1440 and 375.
 *
 * Metrics follow the slices they continue:
 *   - W7-S1: docHeight, folds, `.card-border` cards, `<section>`, `<h2>`,
 *     horizontal overflow, console errors, hydration warnings;
 *   - W7-S2: unlabelled inputs counted PERCEIVABLE-only (an `input[type=hidden]`
 *     is not exposed to assistive tech, and counting it overstated the debt
 *     16× in the original audit), plus sub-44px targets.
 *
 * Refuses any non-loopback base URL.
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
const OUT = join(process.cwd(), "..", "..", "docs", "audits", "evidence", "w7-s4");
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { key: "profile", path: "/lt/dashboard/profile" },
  { key: "network", path: "/lt/dashboard/network" },
];

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
    const txt = m.text();
    if (/hydrat|did not match|Text content does not match/i.test(txt))
      hydration.push(txt.slice(0, 240));
    else if (m.type() === "error" && !/upgrade-insecure-requests/.test(txt))
      consoleErrors.push(txt.slice(0, 240));
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 240)));

  await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|onboarding/, { timeout: 120_000 });
  if (/auth\/login/.test(page.url())) throw new Error(`LOGIN_FAILED ${EMAIL}`);

  for (const route of ROUTES) {
    // Warm first so the measurement reflects the page, not the dev compiler.
    await page.goto(`${BASE}${route.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    await page.waitForTimeout(5000);

    consoleErrors.length = 0;
    hydration.length = 0;
    await page.goto(`${BASE}${route.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.waitForTimeout(6000);

    const m = await page.evaluate(() => {
      const named = (e) =>
        !!e.getAttribute("aria-label") ||
        !!e.getAttribute("aria-labelledby") ||
        !!(e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)) ||
        !!e.closest("label");
      const fields = [...document.querySelectorAll("input, textarea, select")];
      const perceivable = fields.filter((e) => e.type !== "hidden");
      const has = (s) => document.querySelector(s) !== null;
      return {
        url: location.href,
        docHeight: document.documentElement.scrollHeight,
        innerWidth,
        horizontalOverflow:
          document.documentElement.scrollWidth > innerWidth,
        cardBorders: document.querySelectorAll(".card-border").length,
        sections: document.querySelectorAll("section").length,
        h1: document.querySelectorAll("h1").length,
        h2: document.querySelectorAll("h2").length,
        totalFields: fields.length,
        perceivableFields: perceivable.length,
        unlabelledPerceivable: perceivable.filter((e) => !named(e)).length,
        unlabelledPerceivableDetail: perceivable
          .filter((e) => !named(e))
          .map((e) => `${e.tagName}:${e.type ?? ""}#${e.id || "-"}`),
        unlabelledIncludingHidden: fields.filter((e) => !named(e)).length,
        sub44: [
          ...document.querySelectorAll("button, a, input, select, summary"),
        ]
          .map((e) => e.getBoundingClientRect())
          .filter((b) => b.height > 0 && b.height < 44).length,
        // ── the W7-S4 subjects themselves ──
        // Presence is recorded per ROUTE (see the row's `route` field), so
        // these keys name the CONTROL, never the page it used to live on.
        moved: {
          managedCompaniesSection: has(
            '[data-testid="profile-managed-companies"]',
          ),
          profileAddCompanyCta: has('[data-testid="profile-add-company"]'),
          networkAddCompanyCta: has('[data-testid="network-add-company"]'),
          organizationsSection: has('[data-testid="network-organizations"]'),
          messageCompanyButton: has(
            '[data-testid="message-button-messageCompany"]',
          ),
          messageEmployerWrapper: has(
            '[data-testid="network-message-employer"]',
          ),
          profileNetworkHandoffLink: has(
            '[data-testid="profile-network-link"]',
          ),
        },
        quickNavHrefs: [
          ...document.querySelectorAll('[data-testid="page-quick-nav"] a'),
        ].map((a) => a.getAttribute("href")),
        // A quick-nav chip whose target is absent is a dead control.
        deadAnchors: [
          ...document.querySelectorAll('[data-testid="page-quick-nav"] a'),
        ]
          .map((a) => a.getAttribute("href"))
          .filter(
            (h) => h && h.startsWith("#") && !document.querySelector(h),
          ),
      };
    });

    await page.screenshot({
      path: join(OUT, `${PHASE}-${route.key}-${vp.name}.png`),
      fullPage: true,
      caret: "initial",
    });

    results.push({
      phase: PHASE,
      route: route.key,
      viewport: vp.name,
      folds: +(m.docHeight / vp.height).toFixed(2),
      consoleErrors: [...consoleErrors],
      hydrationWarnings: [...hydration],
      ...m,
    });
    console.log(
      `[${PHASE}/${route.key}@${vp.name}] docH=${m.docHeight} folds=${(m.docHeight / vp.height).toFixed(1)} cards=${m.cardBorders} sec=${m.sections} h2=${m.h2} unlabelledPerceivable=${m.unlabelledPerceivable} sub44=${m.sub44} overflow=${m.horizontalOverflow} deadAnchors=${m.deadAnchors.length} console=${consoleErrors.length} hydration=${hydration.length}`,
    );
  }
  await ctx.close();
}
await browser.close();
writeFileSync(join(OUT, `${PHASE}.json`), JSON.stringify(results, null, 2));
console.log(`wrote ${join(OUT, `${PHASE}.json`)}`);
