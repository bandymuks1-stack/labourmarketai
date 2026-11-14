/** R9 self-QA: drive the landing like a visitor. Run from apps/web. */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(join(process.cwd(), "package.json"));
const { chromium } = require("@playwright/test");
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "qa");
mkdirSync(out, { recursive: true });
const url = "file:///" + join(here, "index.html").replace(/\\/g, "/");

const b = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
p.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text().slice(0, 200)); });
await p.goto(url, { waitUntil: "networkidle" });
await p.waitForTimeout(1800);
await p.screenshot({ path: join(out, "d1-intro.png") });

await p.mouse.move(900, 300);
await p.mouse.wheel(0, 2600);
await p.waitForTimeout(2600);
await p.screenshot({ path: join(out, "d2-zoomed.png") });

await p.click('#chips button:nth-child(1)');
await p.waitForTimeout(3400);
await p.screenshot({ path: join(out, "d3-work.png") });

await p.click('#chips button:nth-child(2)');
await p.waitForTimeout(3200);
await p.screenshot({ path: join(out, "d4-demand.png") });

await p.click('#chips button:nth-child(3)');
await p.waitForTimeout(3200);
await p.screenshot({ path: join(out, "d5-value.png") });

await p.close();

const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
m.on("pageerror", (e) => console.log("[pageerror-m]", String(e).slice(0, 300)));
await m.goto(url, { waitUntil: "networkidle" });
await m.waitForTimeout(2200);
await m.screenshot({ path: join(out, "m1-intro.png") });
await m.tap('#chips button:nth-child(3)');
await m.waitForTimeout(3200);
await m.screenshot({ path: join(out, "m2-value.png") });
await m.close();

await b.close();
console.log("done →", out);
