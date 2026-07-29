/**
 * PRODUCTION verification for the owner visual-acceptance round (read-only).
 *
 * Public surfaces only — the authenticated chain (chat → journal → card →
 * overlays → workspace switch) is verified with a real signed-in session in
 * the browser and recorded in docs/local/owner-visible-rebuild-progress.md.
 *
 * Usage: node scripts/verify-prod-owner-visual-acceptance.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE || "https://labourmarket.ai";
const OUT = resolve(
  process.cwd(),
  "..",
  "..",
  "docs",
  "audits",
  "evidence",
  "owner-visual-acceptance-2026",
);
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch();
// The owner's mandated viewport matrix (§16).
const VIEWPORTS = [
  [360, 800],
  [390, 844],
  [412, 915],
  [768, 1024],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
];

for (const [width, height] of VIEWPORTS) {
  const tag = `${width}`;
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${BASE}/lt`, { waitUntil: "networkidle" });

  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  check(`§3.1 landing length @${tag}`, h > 0, `${h}px (~${(h / height).toFixed(1)} screens)`);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check(`§16 no horizontal overflow @${tag}`, overflow <= 0, `${overflow}px`);

  const removed = await page.evaluate(() =>
    ["conversation-os", "draft-board", "market-pulse"].map(
      (t) => document.querySelectorAll(`[data-testid*="${t}"]`).length,
    ),
  );
  check(`§3.1 duplicated sections removed @${tag}`, removed.every((n) => n === 0), removed.join(","));

  const sectors = await page.locator('[data-testid="live-demo-sectors"] button').count();
  check(`§3.3 four sector scenarios @${tag}`, sectors === 4, `count=${sectors}`);

  const card = await page.locator('[data-testid="playercards-canonical-card"]').count();
  check(`§3.7 canonical WorkerPlayerCard @${tag}`, card === 1, `count=${card}`);

  const text = await page.evaluate(() => document.body.innerText);
  check(`§3.5/§11 no PLACEHOLDER @${tag}`, !/PLACEHOLDER/i.test(text));
  check(`§3.7 no medal tiers @${tag}`, !/\bauksas\b|\bsidabras\b|\bbronza\b/i.test(text));
  check(`§11 no raw enum on landing @${tag}`, !/\bemployee\b|\bowner\b/.test(text));

  if (width === 1440 || width === 390) {
    await page.screenshot({ path: `${OUT}/prod-landing-lt-${tag}-full.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}/prod-landing-lt-${tag}-hero.png` });
  }

  // Login: same-tab Google, no popup script (P0 from the previous round).
  await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "networkidle" });
  const gis = await page.evaluate(
    () => document.querySelectorAll('script[src*="gsi"], script[src*="accounts.google.com/gsi"]').length,
  );
  check(`P0 login carries no GIS popup script @${tag}`, gis === 0, `scripts=${gis}`);
  if (width === 1440) await page.screenshot({ path: `${OUT}/prod-login-lt-${tag}.png` });

  await page.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(` - ${f.name} ${f.detail}`);
}
process.exit(failed.length ? 1 : 0);
