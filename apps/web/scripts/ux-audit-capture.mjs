/**
 * UX audit capture — LOCAL ONLY. Boots a real Chromium (which paints, unlike a
 * hidden preview pane), logs in as a local fixture identity, and records per
 * surface: measurements, console errors, overflow, TTFB and a full-page PNG.
 *
 * Never production: the base URL must be loopback or the script refuses.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.UX_BASE ?? "http://127.0.0.1:3450";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) {
  console.error(`REFUSED_NON_LOCAL_UX_CAPTURE: ${BASE}`);
  process.exit(1);
}
const OUT = process.env.UX_OUT ?? join(process.cwd(), "..", "..", "docs", "audits", "evidence", "w7-ux-audit");
mkdirSync(OUT, { recursive: true });

const IDENTITY = process.env.UX_IDENTITY ?? "worker";
const EMAIL = { worker: "dev.worker@local.test", company: "dev.company@local.test", agency: "dev.agency@local.test" }[IDENTITY];

/** route, label, breakpoints */
const ROUTES = JSON.parse(process.env.UX_ROUTES ?? "null") ?? [
  ["/lt/dashboard", "dashboard-home"],
  ["/lt/dashboard/profile", "profile"],
];

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "375", width: 375, height: 812 },
];

const results = [];

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "lt-LT",
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const consoleMsgs = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") consoleMsgs.push(`${m.type()}: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => consoleMsgs.push(`pageerror: ${String(e).slice(0, 300)}`));

  // login. NOTE: the auth forms are client-only (`<form onSubmit>` with no
  // method), so a submit BEFORE hydration falls back to a native GET and puts
  // the password in the query string. Wait for hydration before clicking, or
  // the capture silently records the login page for every route.
  await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 90_000 }).catch(() => {});
  if (/auth\/login/.test(page.url())) throw new Error(`LOGIN_FAILED for ${EMAIL}: ${page.url()}`);

  for (const [route, label] of ROUTES) {
    consoleMsgs.length = 0;
    const t0 = Date.now();
    const resp = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch(() => null);
    const ttfb = Date.now() - t0;
    // let streamed segments reveal (a real painting browser reveals them)
    await page.waitForTimeout(6000);

    const measured = await page.evaluate(() => {
      const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { y: Math.round(b.y + scrollY), h: Math.round(b.height), w: Math.round(b.width) }; };
      const testids = [...document.querySelectorAll("[data-testid]")]
        .map((e) => { const b = e.getBoundingClientRect(); return { id: e.getAttribute("data-testid"), y: Math.round(b.y + scrollY), h: Math.round(b.height), w: Math.round(b.width) }; })
        .filter((o) => o.h > 0);
      const skeleton = document.querySelector(".animate-pulse");
      return {
        url: location.href,
        title: document.title,
        docHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: innerWidth,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        skeletonStillMounted: Boolean(skeleton && skeleton.getBoundingClientRect().height > 0),
        h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()).slice(0, 5),
        h2: [...document.querySelectorAll("h2")].map((h) => h.textContent.trim()).slice(0, 40),
        cardBorders: document.querySelectorAll(".card-border").length,
        sections: document.querySelectorAll("section").length,
        buttons: document.querySelectorAll("button").length,
        links: document.querySelectorAll("a").length,
        chatRoot: rect(document.querySelector('[data-testid="conversation-chat"]')),
        panel: rect(document.querySelector('[data-testid="context-panel"]')),
        map: rect(document.querySelector('[data-testid="workspace-map"]')),
        composer: rect(document.querySelector('[data-testid="composer-input"]')),
        intro: rect(document.querySelector('[data-testid="personal-workspace-intro"]')),
        smallTargets: [...document.querySelectorAll("button, a, input, select")]
          .map((e) => { const b = e.getBoundingClientRect(); return { t: (e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 40), w: Math.round(b.width), h: Math.round(b.height) }; })
          .filter((o) => o.h > 0 && o.h < 44).length,
        unlabelledInputs: [...document.querySelectorAll("input, textarea, select")]
          .filter((e) => !e.getAttribute("aria-label") && !e.getAttribute("aria-labelledby") && !(e.id && document.querySelector(`label[for="${e.id}"]`)) && !e.closest("label")).length,
        testids,
        text: document.body.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 2500),
      };
    });

    const png = join(OUT, `${IDENTITY}-${label}-${vp.name}.png`);
    await page.screenshot({ path: png, fullPage: true, caret: "initial" });
    results.push({ identity: IDENTITY, route, label, viewport: vp.name, status: resp?.status() ?? null, ttfbMs: ttfb, console: [...consoleMsgs], ...measured, screenshot: png });
    console.log(`[capture] ${IDENTITY} ${label} @${vp.name}  status=${resp?.status()} ttfb=${ttfb}ms docH=${measured.docHeight} overflow=${measured.horizontalOverflow} skeleton=${measured.skeletonStillMounted} console=${consoleMsgs.length}`);
  }
  await ctx.close();
}
await browser.close();
writeFileSync(join(OUT, `measurements-${IDENTITY}.json`), JSON.stringify(results, null, 2));
console.log(`\nWrote ${join(OUT, `measurements-${IDENTITY}.json`)}`);
