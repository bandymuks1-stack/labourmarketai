/** Landing rebuild — per-section evidence shots (chain, moment, proof, final CTA). */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = resolve(process.cwd(), "..", "..", "docs", "audits", "evidence", "owner-rebuild-after");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const page = await ctx.newPage();
await page.goto(`${BASE}/lt`, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(800);

const shots = [
  ["#how-it-works", "section-chain"],
  ['[data-testid="market-moment"]', "section-moment"],
  ['[data-testid="live-product-demo"]', "section-demo-reduced"],
  ["#proof-band-title", "section-proof-title"],
  ["#trust", "section-trust"],
];
for (const [sel, name] of shots) {
  const el = page.locator(sel).first();
  const n = await el.count();
  if (!n) { console.log(`${name}: MISSING (${sel})`); continue; }
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const target = sel === "#proof-band-title" ? page.locator("section", { has: el }).first() : el;
  await target.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${name}: ok`);
}
await browser.close();
console.log("done");
