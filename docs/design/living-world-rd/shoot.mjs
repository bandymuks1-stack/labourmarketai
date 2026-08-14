// R&D screenshot harness — local file:// prototypes only. Not a test, not production.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
// resolve @playwright/test from apps/web (script lives under docs/, outside the workspace packages)
const require = createRequire(join(process.cwd(), "package.json"));
const { chromium } = require("@playwright/test");

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "screenshots");
const targets = [
  { file: "a-workday-ledger.html", slug: "a-workday-ledger" },
  { file: "b-terra-viva.html", slug: "b-terra-viva" },
  { file: "c-evidence-atelier.html", slug: "c-evidence-atelier" },
];

const browser = await chromium.launch();
for (const t of targets) {
  const url = "file:///" + join(here, t.file).replace(/\\/g, "/");
  // desktop
  let page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(5200); // let entrance motion complete → frozen-frame test
  await page.screenshot({ path: join(outDir, `${t.slug}-desktop-hero.png`) });
  // interaction state (click the primary interactive control if present)
  const btn = page.locator("#recordBtn, #pinBtn").first();
  if (await btn.count()) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(2600);
    await page.screenshot({ path: join(outDir, `${t.slug}-desktop-after-action.png`) });
  } else {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(5600);
    await page.screenshot({ path: join(outDir, `${t.slug}-desktop-ledger.png`) });
  }
  // full page
  await page.screenshot({ path: join(outDir, `${t.slug}-desktop-full.png`), fullPage: true });
  await page.close();
  // mobile
  page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(5200);
  await page.screenshot({ path: join(outDir, `${t.slug}-mobile-hero.png`) });
  await page.screenshot({ path: join(outDir, `${t.slug}-mobile-full.png`), fullPage: true });
  await page.close();
  console.log("done:", t.slug);
}
await browser.close();
