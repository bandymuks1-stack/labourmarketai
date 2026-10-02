// Quick look while tuning: node peek.mjs <path> <width> <height> <scenes comma list> [outdir]
import { chromium } from "../../node_modules/@playwright/test/index.mjs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const [path = "/en/for-workers", w = "1440", h = "900", scenes = "0,1,2", dir = "peek"] = process.argv.slice(2);
const out = join(here, dir);
mkdirSync(out, { recursive: true });
const base = process.env.BASE ?? "http://127.0.0.1:3201";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +w, height: +h } });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("console.error:", m.text().slice(0, 200)); });
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 300)));
await page.goto(base + path, { waitUntil: "load", timeout: 300000 });
await page.waitForLoadState("networkidle").catch(() => {});
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
const slug = path.replace(/\W+/g, "_");
for (const s of scenes.split(",").map(Number)) {
  await page.evaluate((i) => {
    const b = document.querySelector(`.cine-beat[data-beat="${i}"]`);
    const r = b.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + r.top + Math.min(r.height, innerHeight) / 2 - innerHeight / 2 + 4);
  }, s);
  await wait(s === 6 ? 3600 : 2600);
  const sc = await page.locator('[data-testid="cinematic-story"]').getAttribute("data-scene");
  await page.screenshot({ path: join(out, `${slug}-${w}-s${s}.png`) });
  console.log("scene", s, "->", sc);
}
await browser.close();
