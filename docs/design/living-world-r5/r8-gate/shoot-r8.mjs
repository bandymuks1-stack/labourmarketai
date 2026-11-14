/** R8 gate shots: 3 screens × (1440, 390). Run from apps/web. */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(join(process.cwd(), "package.json"));
const { chromium } = require("@playwright/test");
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "review");
mkdirSync(out, { recursive: true });
const url = "file:///" + join(here, "gate.html").replace(/\\/g, "/");
const b = await chromium.launch();

async function run(tag, viewport, mobile) {
  const p = await b.newPage({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  p.on("pageerror", (e) => console.log("[pageerror]", tag, String(e).slice(0, 200)));
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: join(out, `PERSONAL_${tag}.png`) });
  await p.click('[data-go="journal"]');
  await p.waitForTimeout(1400);
  await p.screenshot({ path: join(out, `JOURNAL_${tag}.png`) });
  await p.click('[data-ctx="org"]');
  await p.waitForTimeout(1400);
  await p.screenshot({ path: join(out, `ORGANIZATION_${tag}.png`) });
  await p.close();
  console.log("✓", tag);
}
await run("DESKTOP", { width: 1440, height: 900 }, false);
await run("MOBILE", { width: 390, height: 844 }, true);
await b.close();
console.log("done →", out);
