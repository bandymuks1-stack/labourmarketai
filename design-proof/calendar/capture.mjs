// Work in Time - proof capture. LOCAL STACK ONLY (127.0.0.1). Uses LOCAL FIXTURE identities
// minted by apps/web/scripts/e2e-mint-session.ts. Nothing here touches production.
//
//   node design-proof/calendar/capture.mjs <label> <baseUrl> <actor> <storageFile> <routeSet>
//   label   = before | after
//   actor   = company | worker | agency
//   routeSet= all | me
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [label, base, actor, storage, routeSet = "all"] = process.argv.slice(2);
const axeSrc = readFileSync(join(here, "../../node_modules/axe-core/axe.min.js"), "utf8");
const out = join(here);
mkdirSync(out, { recursive: true });

const PERSON = process.env.WIT_PERSON || "1249b2b9-d246-431a-bc46-0e0acde4230e"; // Bram Fixture (overlap)
const PROJECT = process.env.WIT_PROJECT || "eeeeeeee-0000-0000-0000-000000000001";
const routes =
  routeSet === "me"
    ? [["my-time", "/en/dashboard/planning"]]
    : [
        ["my-time", "/en/dashboard/planning"],
        ["people-in-time", "/en/dashboard/planning?lens=people"],
        ["projects-in-time", "/en/dashboard/planning?lens=projects"],
        ["people-focus", `/en/dashboard/planning?lens=people&focus=person:${PERSON}`],
        ["projects-focus", `/en/dashboard/planning?lens=projects&focus=project:${PROJECT}`],
      ];
const viewports = [
  ["1440", { width: 1440, height: 900 }],
  ["375", { width: 375, height: 812 }],
];

const browser = await chromium.launch();
const report = { label, actor, base, shots: [], axe: {}, notes: [] };
for (const [vpName, vp] of viewports) {
  const ctx = await browser.newContext({
    viewport: vp,
    storageState: storage,
    deviceScaleFactor: vpName === "375" ? 2 : 1,
  });
  const page = await ctx.newPage();
  // warm (cold first page is a known false-negative; see local-acceptance-walk-recipe)
  await page.goto(base + "/en/dashboard", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  for (const [name, path] of routes) {
    const res = await page.goto(base + path, { waitUntil: "load", timeout: 240000 }).catch((e) => ({ err: String(e) }));
    await page.waitForTimeout(3500);
    const url = page.url();
    const file = `${label}-${actor}-${name}-${vpName}.png`;
    await page.screenshot({ path: join(out, file), fullPage: true });
    const info = await page.evaluate(() => ({
      title: document.title,
      lens: document.querySelector("[data-testid=planning-page]")?.getAttribute("data-lens") ?? "me",
      h1: document.querySelector("h1")?.textContent ?? null,
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    report.shots.push({ file, path, finalUrl: url, status: res?.status?.() ?? res?.err ?? null, ...info });
    if (label === "after" && vpName === "1440") {
      await page.addScriptTag({ content: axeSrc });
      const r = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const res = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
        return res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help, sample: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
      });
      report.axe[name] = r;
    }
    if (vpName === "375" && label === "after") {
      // 44px touch-target audit on interactive elements inside the Work in Time surfaces
      const small = await page.evaluate(() => {
        const roots = document.querySelectorAll("[data-testid^=wit-], [data-testid=planning-page]");
        const seen = new Set();
        const bad = [];
        for (const a of document.querySelectorAll("main a, main button, main input, main summary")) {
          const r = a.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (a.closest(".sr-only")) continue;
          if (r.height < 43.5 || r.width < 43.5) {
            const key = (a.getAttribute("data-testid") || a.textContent || "").trim().slice(0, 40) + "|" + Math.round(r.width) + "x" + Math.round(r.height);
            if (!seen.has(key)) { seen.add(key); bad.push(key); }
          }
        }
        return { roots: roots.length, bad: bad.slice(0, 25) };
      });
      report.notes.push({ name, vp: vpName, smallTargets: small });
    }
  }
  await ctx.close();
}

if (label === "after" && routeSet !== "me") {
  // keyboard / focus pass + reduced motion, on People in Time and My Time at 1440
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: storage, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  for (const [name, path] of [["people", "/en/dashboard/planning?lens=people"], ["my-time", "/en/dashboard/planning"]]) {
    await page.goto(base + path, { waitUntil: "load", timeout: 240000 });
    await page.waitForTimeout(3000);
    const motion = await page.evaluate(() => {
      const q = (s) => [...document.querySelectorAll(s)].slice(0, 8).map((e) => getComputedStyle(e).animationName);
      return { now: q(".wit-now"), bar: q(".wit-bar"), grow: q(".wit-grow-y") };
    });
    const stops = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const s = await page.evaluate(() => {
        const e = document.activeElement;
        if (!e || e === document.body) return null;
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        return {
          tag: e.tagName.toLowerCase(),
          id: e.getAttribute("data-testid") || (e.textContent || "").trim().slice(0, 30),
          ring: cs.boxShadow !== "none" || (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0),
          inView: r.bottom > 0 && r.top < innerHeight,
        };
      });
      if (s) stops.push(s);
    }
    report.notes.push({
      name: `keyboard-${name}`,
      reducedMotion: motion,
      tabStops: stops.length,
      withoutVisibleRing: stops.filter((s) => !s.ring).map((s) => `${s.tag}:${s.id}`).slice(0, 15),
      first12: stops.slice(0, 12).map((s) => `${s.tag}:${s.id}`),
    });
    if (name === "people") {
      await page.screenshot({ path: join(out, `after-${actor}-people-keyboard-focus-1440.png`) });
    }
  }
  await ctx.close();
}
await browser.close();
writeFileSync(join(out, `report-${label}-${actor}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1).slice(0, 6000));
