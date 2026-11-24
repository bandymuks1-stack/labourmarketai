// One-off evidence capture for PR #749 (Labour Market OS planning zone).
// Screenshots the PUBLIC surfaces at the required viewports against the
// local dev server. Authenticated planning-zone screenshots are blocked in
// this session (see docs/launch/labour-market-os-browser-proof-v1.md) —
// this script never logs in and sends nothing anywhere.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = "../../docs/audits/evidence/labour-market-os-planning-zone-v1";
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "1440x900", width: 1440, height: 900 },
];

const PAGES = [
  { slug: "login", url: "http://localhost:3000/lt/auth/login" },
  { slug: "company-need", url: "http://localhost:3000/lt/company-need" },
];

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
  });
  const page = await ctx.newPage();
  for (const p of PAGES) {
    await page.goto(p.url, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    await page.screenshot({
      path: `${OUT}/${p.slug}-${vp.name}.png`,
      fullPage: false,
    });
    console.log(`${p.slug} @ ${vp.name}: overflow=${overflow}`);
  }
  await ctx.close();
}
await browser.close();
console.log("done");
