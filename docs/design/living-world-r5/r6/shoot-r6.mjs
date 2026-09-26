/**
 * R6 self-review harness. Run from apps/web:
 *   node ../../docs/design/living-world-r5/r6/shoot-r6.mjs
 *
 * Shoots every mandatory surface at 1440 and 390, before and after the demo
 * interactions, plus reduced motion — the owner's checklist as pixels.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(join(process.cwd(), "package.json"));
const { chromium } = require("@playwright/test");

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "review");
mkdirSync(outDir, { recursive: true });
const url = "file:///" + join(here, "product.html").replace(/\\/g, "/");

const SURFACES = [
  ["#ivadas", "01-entry"],
  ["#darbo-erdve", "02-workspace"],
  ["#dienorastis", "03-journal"],
  ["#istorija", "04-living-cv"],
  ["#atradimas", "05-discovery"],
  ["#paieska", "06-search"],
  ["#kryptys", "07-opportunity-detail"],
  ["#org-erdve", "08-org-workspace"],
  ["#objektas", "09-project"],
  ["#pajegumas", "10-capacity-inquiry"],
  ["#org-profilis", "11-person-to-org"],
  ["#verte-30kg", "12-second-domain"],
];

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

async function goTo(page, sel) {
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el) el.scrollIntoView({ block: "start", behavior: "auto" });
    window.scrollBy(0, -40);
  }, sel);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await page.waitForTimeout(720);
}

async function run(tag, viewport, mobile) {
  const page = await browser.newPage({
    viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => console.log("[pageerror]", tag, String(e).slice(0, 200)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(2400);

  // BEFORE state for causality surfaces
  await goTo(page, "#kryptys");
  await page.screenshot({ path: join(outDir, `${tag}-07-opportunity-before.png`) });

  // fire the demo interactions
  await page.evaluate(() => window.R6 && window.R6.demo());
  await page.waitForTimeout(1100);

  for (const [sel, name] of SURFACES) {
    await goTo(page, sel);
    await page.screenshot({ path: join(outDir, `${tag}-${name}.png`) });
  }

  // film beats — g = j exactly (camera parked on the beat)
  for (const beat of [0, 2, 3, 5, 9]) {
    await page.evaluate((b) => {
      const film = document.querySelector("[data-film]");
      const top = film.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + b * window.innerHeight, behavior: "auto" });
    }, beat);
    await page.waitForTimeout(720);
    await page.screenshot({ path: join(outDir, `${tag}-13-film-${beat}.png`) });
  }
  await page.close();
}

await run("d", { width: 1440, height: 900 }, false);
await run("m", { width: 390, height: 844 }, true);

// reduced motion
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(outDir, "rm-full.png"), fullPage: true });
await page.close();

await browser.close();
console.log("review frames written to", outDir);
