// Concept screenshot harness — local file:// prototypes only. Not a test, not production.
// Run from any directory where @playwright/test or playwright-core resolves (e.g. apps/web):
//   node ../../docs/design/future-2030/shoot.mjs
// Optional: PW_CHROME=<path to chrome.exe> when the bundled browser is not installed.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(join(process.cwd(), "package.json"));
let chromium;
try { ({ chromium } = require("@playwright/test")); } catch { ({ chromium } = require("playwright-core")); }

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "screenshots");
const shots = [
  ["a-future-command.html", "a", [["#phone", "phone", 2], [".desk", "desktop", 1], [".cv", "living-cv", 1]], "#captureBtn,#saveBtn,#confirmSim"],
  ["b-career-universe.html", "b", [[".phone", "phone", 2], [".desk", "desktop", 1], [".proj", "project", 1]], ""],
  ["c-team-performance.html", "c", [[".phone", "phone", 2], [".desk", "desktop", 1], [".season", "season", 1]], "#doneBtn"],
];

const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
for (const [file, slug, frames, clicks] of shots) {
  const url = "file:///" + join(here, file).split("\\").join("/");
  for (const [sel, name, dpr] of frames) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: dpr });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    await page.locator(sel).first().screenshot({ path: join(out, `${slug}-${name}.png`) });
    if (name === "phone" && clicks) {
      for (const c of clicks.split(",")) { await page.click(c); await page.waitForTimeout(1700); }
      await page.locator(sel).first().screenshot({ path: join(out, `${slug}-phone-after-action.png`) });
    }
    await page.close();
  }
  console.log("done:", slug);
}
await browser.close();
