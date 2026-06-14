/**
 * Visual evidence capture for Staffing Operating Model v1 (PR12).
 *
 * Screenshots the public staffing routes (desktop + mobile) against a running
 * server. Read-only: it only navigates and captures — no data is created. The
 * match-preview route is additionally filled + submitted to evidence the
 * deterministic fit result + the honest "AI explanation not enabled" state
 * (the AI provider is disabled, so this is the true production state).
 *
 *   BASE=http://localhost:3100 OUT=../docs/evidence/.../screenshots \
 *     node scripts/capture-staffing-screenshots.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = resolve(process.env.OUT || "../docs/evidence/staffing-operating-model-v1/screenshots");

const DESKTOP = { width: 1366, height: 900 };
const MOBILE = { width: 390, height: 844 };

const ROUTES = [
  { path: "/en/work-abroad", name: "work-abroad" },
  { path: "/en/worker-intake", name: "worker-intake" },
  { path: "/en/company-need", name: "company-need" },
  { path: "/en/match-preview", name: "match-preview" },
  { path: "/lt/work-abroad", name: "work-abroad-lt" },
];

async function shoot(browser, viewport, suffix) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  for (const r of ROUTES) {
    await page.goto(BASE + r.path, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${r.name}-${suffix}.png`, fullPage: true });
    console.log(`captured ${r.name}-${suffix}`);
  }
  await ctx.close();
}

async function shootMatchResult(browser, viewport, suffix) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(BASE + "/en/match-preview", { waitUntil: "networkidle", timeout: 60000 });
  await page.selectOption('select[name="w_profession"]', "tiler").catch(() => {});
  await page.selectOption('select[name="n_profession"]', "tiler").catch(() => {});
  await page.fill('input[name="n_country"]', "NL").catch(() => {});
  await page.fill('input[name="w_available_from"]', "2026-07-01").catch(() => {});
  await page.fill('input[name="n_start_date"]', "2026-07-15").catch(() => {});
  await page.click('[data-testid="match-preview-submit"]').catch(() => {});
  await page.waitForSelector('[data-testid="match-preview-result"]', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/match-preview-result-${suffix}.png`, fullPage: true });
  console.log(`captured match-preview-result-${suffix}`);
  await ctx.close();
}

const browser = await chromium.launch();
mkdirSync(OUT, { recursive: true });
await shoot(browser, DESKTOP, "desktop");
await shoot(browser, MOBILE, "mobile");
await shootMatchResult(browser, DESKTOP, "desktop");
await shootMatchResult(browser, MOBILE, "mobile");
await browser.close();
console.log("done →", OUT);
