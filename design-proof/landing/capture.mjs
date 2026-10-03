// Evidence capture for the cinematic landing. Usage:
//   node capture.mjs <before|after> <baseUrl> [shots|video|reduced|perf|all]
// Writes into design-proof/landing/<label>/...
import { chromium } from "../../node_modules/@playwright/test/index.mjs";
import { mkdirSync, writeFileSync, readdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [label = "after", base = "http://127.0.0.1:3201", what = "all"] = process.argv.slice(2);
const out = join(here, label);
mkdirSync(out, { recursive: true });

const PAGES = [
  { key: "home", path: "/en" },
  { key: "for-workers", path: "/en/for-workers" },
  { key: "for-companies", path: "/en/for-companies" },
];
const VPS = [
  { key: "1440", width: 1440, height: 900 },
  { key: "375", width: 375, height: 812 },
];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
}

async function shots(browser) {
  for (const vp of VPS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    for (const p of PAGES) {
      const page = await ctx.newPage();
      await page.goto(base + p.path, { waitUntil: "load" });
      await settle(page);
      await page.screenshot({ path: join(out, `${p.key}-${vp.key}-00-first-screen.png`) });
      const story = await page.locator('[data-testid="cinematic-story"]').count();
      if (story) {
        // one frame per scene, camera settled
        for (let i = 0; i < 9; i++) {
          await page.evaluate((i) => {
            const b = document.querySelector(`.cine-beat[data-beat="${i}"]`);
            const r = b.getBoundingClientRect();
            window.scrollTo(0, window.scrollY + r.top + Math.min(r.height, innerHeight) / 2 - innerHeight / 2 + 4);
          }, i);
          await wait(i === 6 ? 3800 : 3000);
          const sc = await page.locator('[data-testid="cinematic-story"]').getAttribute("data-scene");
          await page.screenshot({ path: join(out, `${p.key}-${vp.key}-scene-${i + 1}.png`) });
          if (String(sc) !== String(i)) console.warn(`  ! ${p.key}@${vp.key} expected scene ${i}, got ${sc}`);
        }
      } else {
        // BEFORE: stepped scroll frames through the page's key sections
        const h = await page.evaluate(() => document.documentElement.scrollHeight);
        const step = Math.round(vp.height * 0.9);
        let n = 1;
        for (let y = step; y < Math.min(h, step * 9); y += step, n++) {
          await page.evaluate((y) => window.scrollTo(0, y), y);
          await wait(2400);
          await page.screenshot({ path: join(out, `${p.key}-${vp.key}-scroll-${String(n).padStart(2, "0")}.png`) });
        }
        const t = page.locator('[data-testid="work-record-transition"]');
        if (await t.count()) {
          await t.scrollIntoViewIfNeeded();
          await wait(14000);
          await t.screenshot({ path: join(out, `${p.key}-${vp.key}-transition-final.png`) });
        }
      }
      await page.close();
    }
    await ctx.close();
  }
}

async function videos(browser) {
  for (const vp of VPS) {
    for (const p of PAGES) {
      const dir = join(out, "video-tmp");
      mkdirSync(dir, { recursive: true });
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, recordVideo: { dir, size: { width: vp.width, height: vp.height } } });
      const page = await ctx.newPage();
      await page.goto(base + p.path, { waitUntil: "load" });
      await settle(page);
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      const story = await page.locator('[data-testid="cinematic-story"]').count();
      const startY = story ? await page.evaluate(() => document.querySelector('[data-testid="cinematic-story"]').getBoundingClientRect().top + scrollY - 200) : 0;
      const endY = story
        ? await page.evaluate(() => { const s = document.querySelector('[data-testid="cinematic-story"]'); return s.getBoundingClientRect().bottom + scrollY - innerHeight; })
        : Math.min(total - vp.height, vp.height * 9);
      await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, startY));
      await wait(800);
      // human-ish wheel scrolling: 60px every 32ms
      let y = Math.max(0, startY);
      while (y < endY) {
        y += 36;
        await page.mouse.wheel(0, 36);
        await wait(24);
      }
      await wait(2500);
      await ctx.close();
      const f = readdirSync(dir).filter((x) => x.endsWith(".webm")).sort().pop();
      renameSync(join(dir, f), join(out, `scroll-${p.key}-${vp.key}.webm`));
    }
  }
}

async function reduced(browser) {
  for (const vp of VPS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: "reduce" });
    for (const p of PAGES) {
      const page = await ctx.newPage();
      await page.goto(base + p.path, { waitUntil: "load" });
      await settle(page);
      const sel = (await page.locator('[data-testid="cinematic-story"]').count()) ? '[data-testid="cinematic-story"]' : '[data-testid="work-record-transition"]';
      const el = page.locator(sel);
      await el.scrollIntoViewIfNeeded();
      await wait(1200);
      await el.screenshot({ path: join(out, `reduced-${p.key}-${vp.key}.png`) });
      await page.close();
    }
    await ctx.close();
  }
}

async function perf(browser) {
  const results = {};
  for (const vp of VPS) {
    for (const p of PAGES) {
      const runs = [];
      for (let r = 0; r < 3; r++) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.width === 375 ? 2 : 1, isMobile: vp.width === 375, hasTouch: vp.width === 375 });
        const page = await ctx.newPage();
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: vp.width === 375 ? 4 : 2 });
        await page.addInitScript(() => {
          window.__m = { lcp: 0, cls: 0, longTotal: 0, longN: 0, inp: 0 };
          new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
          new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__m.longTotal += Math.max(0, e.duration - 50); window.__m.longN++; } }).observe({ type: "longtask", buffered: true });
          new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) window.__m.inp = Math.max(window.__m.inp, e.duration); }).observe({ type: "event", durationThreshold: 16, buffered: true });
        });
        await page.goto(base + p.path, { waitUntil: "load" });
        await page.waitForLoadState("networkidle").catch(() => {});
        await wait(1500);
        // scroll through the whole page like a reader, then click the first rail/CTA to sample INP
        const total = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < total; y += 220) {
          await page.mouse.wheel(0, 220);
          await wait(30);
        }
        await wait(1200);
        await page.evaluate(() => window.scrollTo(0, 0));
        await wait(600);
        try { await page.locator("a[data-cta-id]").first().hover({ timeout: 2000 }); await page.mouse.down(); await page.mouse.up(); } catch {}
        await wait(600);
        const m = await page.evaluate(() => ({ ...window.__m }));
        const res = await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => e.initiatorType === "script" || /\.js(\?|$)/.test(e.name)).reduce((a, e) => ({ js: a.js + (e.transferSize || e.encodedBodySize || 0), n: a.n + 1 }), { js: 0, n: 0 }));
        const img = await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => e.initiatorType === "img" || /_next\/image/.test(e.name)).reduce((a, e) => ({ b: a.b + (e.transferSize || e.encodedBodySize || 0), n: a.n + 1 }), { b: 0, n: 0 }));
        runs.push({ ...m, jsBytes: res.js, jsFiles: res.n, imgBytes: img.b, imgFiles: img.n });
        await ctx.close();
      }
      const med = (k) => runs.map((x) => x[k]).sort((a, b) => a - b)[1];
      results[`${p.key}@${vp.key}`] = {
        lcpMs: Math.round(med("lcp")), cls: +med("cls").toFixed(4), tbtMs: Math.round(med("longTotal")), longTasks: med("longN"), inpMs: Math.round(med("inp")),
        jsKB: Math.round(med("jsBytes") / 1024), jsFiles: med("jsFiles"), imgKB: Math.round(med("imgBytes") / 1024), imgFiles: med("imgFiles"),
        runs: runs.map((x) => ({ lcp: Math.round(x.lcp), cls: +x.cls.toFixed(4) })),
      };
      console.log(p.key, vp.key, JSON.stringify(results[`${p.key}@${vp.key}`]));
    }
  }
  writeFileSync(join(out, "perf.json"), JSON.stringify(results, null, 2));
}

const browser = await chromium.launch();
const _nc = browser.newContext.bind(browser);
browser.newContext = async (o) => { const c = await _nc(o); c.setDefaultNavigationTimeout(400000); c.setDefaultTimeout(60000); return c; };
try {
  if (what === "all" || what === "shots") await shots(browser);
  if (what === "all" || what === "reduced") await reduced(browser);
  if (what === "all" || what === "perf") await perf(browser);
  if (what === "video") await videos(browser);
} finally {
  await browser.close();
}
