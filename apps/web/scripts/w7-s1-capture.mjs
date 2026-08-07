/**
 * W7-S1 BEFORE/AFTER capture — LOCAL ONLY.
 *
 * Measures `/dashboard/profile` for one identity at 1440 and 375: rendered
 * height, card/section/heading counts, unlabelled inputs, sub-44px targets,
 * horizontal overflow, console errors, hydration warnings, TTFB (5 runs,
 * median), and a full-page PNG. Also samples the primary action's y position
 * after interactivity to catch a layout jump.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.UX_BASE ?? "http://127.0.0.1:3460";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) {
  console.error(`REFUSED_NON_LOCAL_CAPTURE: ${BASE}`);
  process.exit(1);
}
const PHASE = process.env.UX_PHASE ?? "after";
const EMAIL = process.env.UX_EMAIL ?? "dev.worker@local.test";
const TAG = process.env.UX_TAG ?? "worker-partial";
const OUT = join(process.cwd(), "..", "..", "docs", "audits", "evidence", "w7-s1");
mkdirSync(OUT, { recursive: true });

const ROUTE = "/lt/dashboard/profile";
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
    if (/hydrat|did not match|Text content does not match/i.test(txt)) hydration.push(txt.slice(0, 240));
    else if (m.type() === "error" && !/upgrade-insecure-requests/.test(txt)) consoleErrors.push(txt.slice(0, 240));
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 240)));

  await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|onboarding/, { timeout: 120_000 });
  if (/auth\/login/.test(page.url())) throw new Error(`LOGIN_FAILED ${EMAIL}`);

  // warm the route so TTFB measures the page, not the dev compiler
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForTimeout(4000);

  const ttfbs = [];
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    ttfbs.push(Date.now() - t0);
    await page.waitForTimeout(700);
  }
  ttfbs.sort((a, b) => a - b);
  const ttfbMedian = ttfbs[2];

  consoleErrors.length = 0;
  hydration.length = 0;
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 120_000 });

  // layout-jump probe: where is the primary action right after interactivity,
  // and where is it once every streamed segment has resolved?
  const primaryY = async () =>
    page.evaluate(() => {
      const el =
        document.querySelector('[data-testid="profile-hub-primary-action"]') ??
        document.querySelector('[data-testid="profile-hub-overview"]');
      return el ? Math.round(el.getBoundingClientRect().y + scrollY) : null;
    });
  await page.waitForTimeout(1200);
  const primaryEarly = await primaryY();
  await page.waitForTimeout(7000);
  const primaryLate = await primaryY();

  const m = await page.evaluate(() => {
    const rect = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { y: Math.round(b.y + scrollY), h: Math.round(b.height) };
    };
    return {
      url: location.href,
      docHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      cardBorders: document.querySelectorAll(".card-border").length,
      sections: document.querySelectorAll("section").length,
      h1: document.querySelectorAll("h1").length,
      h2: [...document.querySelectorAll("h2")].map((h) => h.textContent.trim()),
      h3: document.querySelectorAll("h3").length,
      buttons: document.querySelectorAll("button").length,
      links: document.querySelectorAll("a").length,
      unlabelledInputs: [...document.querySelectorAll("input, textarea, select")].filter(
        (e) =>
          !e.getAttribute("aria-label") &&
          !e.getAttribute("aria-labelledby") &&
          !(e.id && document.querySelector(`label[for="${e.id}"]`)) &&
          !e.closest("label"),
      ).length,
      smallTargets: [...document.querySelectorAll("button, a, input, select, summary")]
        .map((e) => e.getBoundingClientRect())
        .filter((b) => b.height > 0 && b.height < 44).length,
      // the surfaces this slice consolidated — must be exactly one now
      hub: rect('[data-testid="profile-hub-overview"]'),
      stateStrip: rect('[data-testid="profile-state-strip"]'),
      liveProfile: rect('[data-testid="live-profile-section"]'),
      setupJourney: rect('[data-testid="worker-setup-journey"]'),
      cvGrid: rect('[data-testid="cv-completeness-grid"]'),
      reviewBanner: rect('[data-testid="skills-review-banner"]'),
      missing: rect('[data-testid="profile-hub-missing"]'),
      primaryAction: rect('[data-testid="profile-hub-primary-action"]'),
      doneSummary: rect('[data-testid="profile-hub-done-summary"]'),
      // editors still reachable below the overview
      editorsPresent: [
        "#profile-edit",
        "#cv-availability",
        "#cv-languages",
        "#capabilities",
        "#managed-companies",
        "#profile-identity",
      ].filter((id) => document.querySelector(id) !== null),
      text: document.body.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 1600),
    };
  });

  await page.screenshot({
    path: join(OUT, `${PHASE}-${TAG}-${vp.name}.png`),
    fullPage: true,
    caret: "initial",
  });

  results.push({
    phase: PHASE,
    tag: TAG,
    viewport: vp.name,
    ttfbRuns: ttfbs,
    ttfbMedian,
    primaryEarly,
    primaryLate,
    layoutJumpPx: primaryEarly != null && primaryLate != null ? Math.abs(primaryLate - primaryEarly) : null,
    consoleErrors: [...consoleErrors],
    hydrationWarnings: [...hydration],
    ...m,
  });
  console.log(
    `[${PHASE}/${TAG}@${vp.name}] docH=${m.docHeight} folds=${(m.docHeight / vp.height).toFixed(1)} cards=${m.cardBorders} sec=${m.sections} h2=${m.h2.length} unlabelled=${m.unlabelledInputs} sub44=${m.smallTargets} overflow=${m.horizontalOverflow} ttfb=${ttfbMedian}ms jump=${primaryEarly != null && primaryLate != null ? Math.abs(primaryLate - primaryEarly) : "?"}px console=${consoleErrors.length} hydration=${hydration.length}`,
  );
  await ctx.close();
}
await browser.close();
writeFileSync(join(OUT, `${PHASE}-${TAG}.json`), JSON.stringify(results, null, 2));
console.log(`wrote ${join(OUT, `${PHASE}-${TAG}.json`)}`);
