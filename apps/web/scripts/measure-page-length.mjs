#!/usr/bin/env node
/**
 * PAGE LENGTH AUDIT (decision 0034: one screen per block, no long pages).
 *
 * For every static signed-in dashboard route (read from the app directory, so
 * a new page is measured without editing this file) and every role whose
 * signed-in browser state is given, it opens the route at 390 × 844 and
 * 1440 × 900 and records the document height divided by the viewport height.
 * A route the role is turned away from (a redirect to another path) is
 * recorded as such and not ranked.
 *
 * Usage (local stack or any origin the states belong to):
 *   node scripts/measure-page-length.mjs \
 *     --origin http://127.0.0.1:3000 --out ../../docs/audits/page-length.tsv \
 *     --state worker=/path/worker.json --state company=/path/company.json ... \
 *     [--chromium /path/to/chromium]
 *
 * Read-only: it only opens pages. No data is written.
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const ORIGIN = opt("origin", "http://127.0.0.1:3000");
const OUT = opt("out", "page-length.tsv");
const LOCALE = opt("locale", "en");
// A browser binary other than the one this Playwright version expects.
const CHROMIUM = opt("chromium", process.env.PW_CHROMIUM_PATH);
const STATES = args
  .map((a, i) => (a === "--state" ? args[i + 1] : null))
  .filter(Boolean)
  .map((pair) => {
    const [role, path] = pair.split("=");
    return { role, path };
  });
if (STATES.length === 0) {
  console.error("give at least one --state role=path/to/storage-state.json");
  process.exit(2);
}

const VIEWPORTS = [
  { label: "390", width: 390, height: 844 },
  { label: "1440", width: 1440, height: 900 },
];

/** Static routes under app/[locale]/dashboard (no [param] segment). */
function dashboardRoutes() {
  // Relative to this script (apps/web/scripts), so it runs from any directory.
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "[locale]");
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "page.tsx") found.push(`/${relative(root, dir).split(sep).join("/")}`);
    }
  };
  walk(join(root, "dashboard"));
  return found
    .map((r) => r.replace(/\/\([^)]+\)/g, ""))
    .filter((r) => !r.includes("["))
    .sort();
}

const routes = dashboardRoutes();
const rows = [];
const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
for (const { role, path } of STATES) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, storageState: path });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("lm-analytics-consent", "refused");
      } catch {}
    });
    const page = await ctx.newPage();
    for (const route of routes) {
      const want = `/${LOCALE}${route}`;
      let status = 0;
      try {
        const res = await page.goto(`${ORIGIN}${want}`, { waitUntil: "networkidle", timeout: 60_000 });
        status = res?.status() ?? 0;
        await page.waitForTimeout(400);
      } catch {
        status = -1;
      }
      const m = await page
        .evaluate(() => ({
          path: location.pathname,
          docH: document.documentElement.scrollHeight,
          vh: innerHeight,
          h1: document.querySelector("main h1, h1")?.textContent?.trim().slice(0, 60) ?? "",
        }))
        .catch(() => ({ path: "", docH: 0, vh: vp.height, h1: "" }));
      const reached = m.path === want;
      rows.push({
        role,
        viewport: vp.label,
        route,
        status,
        reached,
        landed: reached ? "" : m.path.replace(`/${LOCALE}`, "") || "(error)",
        screens: reached ? Math.round((m.docH / m.vh) * 100) / 100 : null,
        docH: m.docH,
        h1: m.h1.replace(/\s+/g, " "),
      });
      process.stdout.write(`${role}\t${vp.label}\t${route}\t${reached ? (m.docH / m.vh).toFixed(2) : `-> ${m.path}`}\n`);
    }
    await ctx.close();
  }
}
await browser.close();

const ranked = rows
  .filter((r) => r.reached)
  .sort((a, b) => b.screens - a.screens || a.route.localeCompare(b.route));
const header = ["rank", "screens", "role", "viewport", "route", "doc_height_px", "status", "h1"];
const lines = [header.join("\t")];
ranked.forEach((r, i) =>
  lines.push([i + 1, r.screens, r.role, r.viewport, r.route, r.docH, r.status, r.h1].join("\t")),
);
lines.push("");
lines.push(["not_reached", "role", "viewport", "route", "landed_on", "status"].join("\t"));
for (const r of rows.filter((x) => !x.reached))
  lines.push(["-", r.role, r.viewport, r.route, r.landed, r.status].join("\t"));
writeFileSync(OUT, `${lines.join("\n")}\n`);
console.log(`\nwrote ${OUT}: ${ranked.length} reached, ${rows.length - ranked.length} not reached`);
