/**
 * AFTER-proof for the two slices. LOCAL ONLY.
 *  1. pre-hydration submit must NOT put credentials in the query string;
 *  2. the command finder must offer the canonical destinations to a person
 *     with no command history.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://127.0.0.1:3450";
const OUT = join(process.cwd(), "..", "..", "docs", "audits", "evidence", "w7-ux-audit");
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();

// ── 1. pre-hydration submit ────────────────────────────────────────────────
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/lt/auth/login`, { waitUntil: "domcontentloaded" });
  await p.fill('input[type="email"]', "leak.probe@local.test");
  await p.fill('input[type="password"]', "SuperSecret123");
  await p.click('button[type="submit"]').catch(() => {});
  await p.waitForTimeout(2500);
  const url = p.url();
  const leaked = /password=/.test(url) || /SuperSecret123/.test(url);
  console.log(`[1] JS-disabled submit → ${url}`);
  console.log(`[1] CREDENTIALS IN URL: ${leaked ? "YES — STILL BROKEN" : "no"}`);
  await ctx.close();
}

// ── 2. command finder starters ─────────────────────────────────────────────
for (const vp of [{ n: "1440", w: 1440, h: 900 }, { n: "375", w: 375, h: 812 }]) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, locale: "lt-LT" });
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => { if (m.type() === "error" && !/upgrade-insecure-requests/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await p.goto(`${BASE}/lt/auth/login`, { waitUntil: "load" });
  await p.waitForTimeout(3500);
  await p.fill('input[type="email"]', "dev.worker@local.test");
  await p.fill('input[type="password"]', "password");
  await p.click('button[type="submit"]');
  await p.waitForURL(/dashboard/, { timeout: 90000 });
  await p.goto(`${BASE}/lt/dashboard`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(6000);

  await p.click('[data-testid="chat-command-search"]');
  await p.waitForSelector('#command-finder-input', { timeout: 20000 });
  await p.waitForTimeout(1200);
  const found = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid^="command-finder-starter-"]')]
      .map((a) => ({ id: a.getAttribute("data-testid"), label: a.textContent.trim().replace(/\s+/g, " "), href: a.getAttribute("href") }));
    return {
      starters: rows,
      overflow: document.documentElement.scrollWidth > innerWidth,
      dialogText: (document.querySelector('[data-testid="command-finder"]')?.innerText || "").slice(0, 400),
    };
  });
  console.log(`[2 @${vp.n}] starters=${found.starters.length} overflow=${found.overflow} consoleErrors=${errs.length}`);
  for (const s of found.starters) console.log(`      ${s.label}  →  ${s.href}`);
  if (errs.length) console.log("      ERRORS:", errs);
  await p.screenshot({ path: join(OUT, `after-command-finder-starters-${vp.n}.png`), fullPage: false, caret: "initial" });

  // keyboard: the first starter must be reachable by Tab from the input
  await p.focus("#command-finder-input");
  await p.keyboard.press("Tab");
  const focused = await p.evaluate(() => document.activeElement?.getAttribute("data-testid") || document.activeElement?.tagName);
  console.log(`[2 @${vp.n}] Tab from input → ${focused}`);
  await ctx.close();
}
await b.close();
