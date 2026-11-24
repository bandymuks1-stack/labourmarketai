// Local visual QA — owner visual acceptance round (landing + public shell).
// Production build on :3100. Screenshots → ../../docs/audits/evidence/owner-visual-acceptance-2026/.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = "../../docs/audits/evidence/owner-visual-acceptance-2026";
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch();
for (const [w, h, tag] of [[1440, 900, "1440"], [390, 844, "390"]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto("http://localhost:3100/lt", { waitUntil: "networkidle" });

  // 3.1 — page length
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  check(`landing height @${tag}`, true, `${height}px (~${(height / h).toFixed(1)} screens)`);

  // no removed sections
  for (const gone of ["conversation-os", "draft-board", "market-pulse"]) {
    const n = await page.locator(`[data-testid*="${gone}"]`).count();
    check(`removed section absent (${gone}) @${tag}`, n === 0, `count=${n}`);
  }
  // 3.3 — sector chips present + interactive
  const sectors = await page.locator('[data-testid="live-demo-sectors"] button').count();
  check(`sector chips @${tag}`, sectors === 4, `count=${sectors}`);
  if (sectors === 4) {
    await page.locator('[data-testid="live-demo-sector-horeca"]').click();
    await page.waitForTimeout(400);
    const said = await page.locator('[data-testid="live-product-demo"]').innerText();
    check(`horeca scenario renders @${tag}`, /virtuv|porcij/i.test(said), said.slice(0, 60).replace(/\n/g, " "));
  }
  // 3.7 — canonical card, no medals/OVR
  const card = await page.locator('[data-testid="playercards-canonical-card"]').count();
  check(`canonical WorkerPlayerCard on landing @${tag}`, card === 1, `count=${card}`);
  const bodyText = await page.evaluate(() => document.body.innerText);
  check(`no PLACEHOLDER on landing @${tag}`, !/PLACEHOLDER/i.test(bodyText));
  check(`no medal tiers on landing @${tag}`, !/auksas|sidabras|bronza/i.test(bodyText));
  // horizontal overflow
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`no horizontal overflow @${tag}`, overflow <= 0, `${overflow}px`);

  await page.screenshot({ path: `${OUT}/landing-lt-${tag}-full.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/landing-lt-${tag}-hero.png` });

  // login page quick look
  await page.goto("http://localhost:3100/lt/auth/login", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/login-lt-${tag}.png` });
  const gis = await page.evaluate(() => document.querySelectorAll('script[src*="gsi"]').length);
  check(`login has no GIS popup script @${tag}`, gis === 0, `scripts=${gis}`);

  await page.close();
}
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
