/**
 * R7 self-review harness. Run from apps/web:
 *   node ../../docs/design/living-world-r5/r7/shoot-r7.mjs
 *
 * Two passes: default GPU renders the app surfaces correctly but loses the
 * WebGL world; swiftshader renders the world but corrupts DOM compositing
 * after view transitions. So app views shoot on default GL, world views on
 * swiftshader.
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

async function shot(page, name) {
  await page.waitForTimeout(650);
  await page.screenshot({ path: join(outDir, name + ".png") });
  console.log("✓", name);
}

/* ── pass A: app surfaces + mobile (default GL) ── */
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);

  await page.click('[data-enter="me"]');
  await shot(page, "02_PERSONAL_WORKSPACE");

  await page.click('.nav-it[data-go="journal"]');
  await shot(page, "03_WORK_JOURNAL");

  await page.click('.nav-it[data-go="identity"]');
  await shot(page, "04_LIVING_IDENTITY");

  await page.click('.nav-it[data-go="opps"]');
  await shot(page, "05_OPPORTUNITY_DISCOVERY");

  await page.click(".op-card");
  await shot(page, "06_OPPORTUNITY_DETAIL");
  await page.click("#drClose");

  await page.click('[data-ctx-btn="org"]');
  await shot(page, "07_ORGANIZATION_WORKSPACE");

  await page.click('.nav-it[data-go="project"]');
  await shot(page, "08_PROJECT_OBJECT");

  await page.click('.tab[data-tab="capacity"]');
  await page.waitForTimeout(300);
  await page.click("[data-inq]");
  await shot(page, "09_CAPACITY_INQUIRY");

  await page.click("#iqActivate");
  await shot(page, "10_DISCOVERY");

  await page.close();

  const m = await browser.newPage({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  m.on("pageerror", (e) => console.log("[pageerror-m]", String(e).slice(0, 300)));
  await m.goto(url, { waitUntil: "networkidle" });
  await m.waitForTimeout(1600);

  await m.tap('[data-enter="me"]');
  await shot(m, "M_01_WORKSPACE");
  await m.tap('.tb[data-go="journal"]');
  await shot(m, "M_02_JOURNAL");
  await m.tap('.tb[data-go="opps"]');
  await shot(m, "M_03_OPPORTUNITY");
  await m.tap('.tb[data-go="orgtoday"]');
  await shot(m, "M_04_ORGANIZATION");
  await m.close();
  await browser.close();
}

/* ── pass B: world surfaces (swiftshader WebGL) ── */
{
  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("[pageerror-w]", String(e).slice(0, 300)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(2800);

  await shot(page, "01_ENTRY");

  await page.click('[data-enter="me"]');
  await page.waitForTimeout(400);
  await page.click('.nav-it[data-go="world"]');
  await page.waitForTimeout(1800);
  await shot(page, "11_LIVING_WORLD");

  await page.click('.wl-lv[data-lv="2"]');
  await page.waitForTimeout(3200);
  await shot(page, "11b_LIVING_WORLD_GOTEBORG");

  await page.close();
  await browser.close();
}

console.log("done →", outDir);
