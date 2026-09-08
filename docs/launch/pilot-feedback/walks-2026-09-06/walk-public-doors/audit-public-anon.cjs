// ANONYMOUS PUBLIC AUDIT — labourmarket.ai public doors (window 6, lane F).
//
// Read-only. No session, no cookie, no form submitted. Records per public route
// and per viewport (1280 / 390 / 320): the first-screen copy (h1 + lead), the
// doors of the final CTA band (text + href), the example chips of the public
// entry, horizontal overflow (scrollWidth vs innerWidth), failed requests
// (>= 400), console errors, DOMContentLoaded / load timings, residue words
// ("demo", "test", "LABMA", "placeholder", "lorem"), payment-copy lines, and
// the SEO head (canonical, hreflang count, JSON-LD count, robots).
//
//   EXPECT_BUILD=<sha> LABEL=before node docs/launch/pilot-feedback/walks-2026-09-06/walk-public-doors/audit-public-anon.cjs
const fs = require("node:fs"), path = require("node:path");
const ROOT = "C:/Users/Mano/Documents/labourmarketai";
const { chromium } = require(ROOT + "/node_modules/@playwright/test");
const HOST = "https://labourmarket.ai";
const LABEL = process.env.LABEL || "before";
const EXPECT_BUILD = process.env.EXPECT_BUILD;
if (!/^[0-9a-f]{7,40}$/.test(EXPECT_BUILD || "")) throw new Error("EXPECT_BUILD required");

const ROUTES = [
  "/lt", "/en", "/lt/for-workers", "/lt/for-companies", "/lt/for-agencies",
  "/lt/professions", "/lt/pricing", "/lt/auth/signup", "/lt/company-need",
];
const VIEWPORTS = { desktop: { width: 1280, height: 900 }, m390: { width: 390, height: 844 }, m320: { width: 320, height: 568 } };
const OUT = path.join(__dirname, LABEL); fs.mkdirSync(OUT, { recursive: true });
const lines = [];
const log = (o) => { const s = JSON.stringify(o); console.log(s); lines.push(s); };

(async () => {
  const health = await (await fetch(HOST + "/api/health")).json();
  log({ step: "health", build: health.build, label: LABEL });
  if (!String(health.build).startsWith(EXPECT_BUILD.slice(0, 7))) throw new Error("not on expected build: " + health.build);
  const b = await chromium.launch();
  for (const route of ROUTES) {
    for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
      const c = await b.newContext({ viewport, locale: route.startsWith("/en") ? "en-GB" : "lt-LT" });
      const p = await c.newPage();
      const failed = [], consoleErrors = [];
      p.on("response", (r) => { if (r.status() >= 400) failed.push(r.status() + " " + r.url().replace(HOST, "")); });
      p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
      p.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)));
      const t0 = Date.now();
      let status = null;
      try {
        const resp = await p.goto(HOST + route, { waitUntil: "load", timeout: 60000 });
        status = resp ? resp.status() : null;
      } catch (e) { log({ route, vp: vpName, error: String(e).slice(0, 200) }); await c.close(); continue; }
      await p.waitForTimeout(1500);
      const data = await p.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const q = (s) => Array.from(document.querySelectorAll(s));
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, " ").trim() : null);
        const h1 = document.querySelector("h1");
        const lead = h1 && h1.nextElementSibling ? txt(h1.nextElementSibling) : null;
        // The final CTA band = the section holding both /about and /company-need doors, or the last section with >= 3 anchors.
        const sections = q("section");
        const band = sections.find((s) => s.querySelector('a[href*="/about"]') && s.querySelector('a[href*="/company-need"]'));
        const doors = band ? q("section").filter((s) => s === band)[0] : null;
        const doorList = doors ? Array.from(doors.querySelectorAll("a")).map((a) => ({ text: txt(a), href: a.getAttribute("href") })) : [];
        const examples = q('[data-testid="entry-example"]').map((b) => txt(b));
        const entry = document.querySelector('[data-testid="public-entry"]');
        const entryLabel = entry ? txt(entry.querySelector("label")) : null;
        const placeholder = entry ? (entry.querySelector("input") || {}).placeholder || null : null;
        const body = document.body.innerText;
        const residue = {};
        for (const w of ["demo", "LABMA", "placeholder", "lorem", "test "]) {
          const re = new RegExp("[^\\n]{0,40}" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\\n]{0,40}", "gi");
          const m = body.match(re); if (m) residue[w] = m.slice(0, 5);
        }
        const payment = (body.match(/[^\n]*(€|EUR|nemokam|mokam|kaina|free|price)[^\n]*/gi) || []).slice(0, 12);
        const heads = {
          canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null,
          hreflang: q('link[rel="alternate"][hreflang]').length,
          jsonld: q('script[type="application/ld+json"]').length,
          robots: (document.querySelector('meta[name="robots"]') || {}).content || null,
          title: document.title,
        };
        return {
          h1: txt(h1), lead, entryLabel, placeholder, examples, doors: doorList,
          scrollWidth: document.scrollingElement.scrollWidth, innerWidth: window.innerWidth,
          overflowPx: document.scrollingElement.scrollWidth - window.innerWidth,
          dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
          load: nav ? Math.round(nav.loadEventEnd) : null,
          ttfb: nav ? Math.round(nav.responseStart) : null,
          residue, payment, heads,
        };
      });
      // Which elements overflow at this width (right edge past the viewport)?
      const overflowers = data.overflowPx > 0 ? await p.evaluate(() => {
        const w = window.innerWidth; const out = [];
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.right > w + 1 && r.width > 0) out.push((el.tagName + "." + String(el.className).replace(/\s+/g, ".").slice(0, 60)) + " right=" + Math.round(r.right));
          if (out.length >= 8) break;
        }
        return out;
      }) : [];
      const shot = path.join(OUT, route.replace(/\//g, "_").replace(/^_/, "") + "-" + vpName + ".png");
      await p.screenshot({ path: shot, fullPage: vpName !== "desktop" }).catch(() => {});
      log({ route, vp: vpName, status, wallMs: Date.now() - t0, ...data, overflowers, failed, consoleErrors: consoleErrors.slice(0, 6), shot: path.basename(shot) });
      await c.close();
    }
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, "audit.jsonl"), lines.join("\n") + "\n");
  log({ done: true, out: OUT });
})().catch((e) => { console.error(e); process.exit(1); });
