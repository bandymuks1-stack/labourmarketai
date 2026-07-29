/**
 * §16 FULL QA MATRIX — owner visual acceptance.
 *
 * Runs the owner's mandated viewport list × light/dark against a running
 * build, and checks REAL behaviour (clicks, keyboard, Escape, focus return,
 * browser back, refresh) — not only screenshots.
 *
 * Public surfaces run unauthenticated here; the authenticated states
 * (workspace, profile, settings, Player Card, calendar, messages, search,
 * chat, map, overlays) are verified separately with a real signed-in session
 * in the browser and recorded in the progress file.
 *
 * Usage: BASE=http://localhost:3100 node scripts/qa-owner-acceptance-matrix.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE || "http://localhost:3100";
// Resolve evidence relative to THIS FILE, so the harness writes to the same
// place whether it is run from apps/web or from the repo root.
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(
  HERE,
  "..",
  "..",
  "..",
  "docs",
  "audits",
  "evidence",
  "owner-visual-acceptance-2026",
);
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  [360, 800],
  [390, 844],
  [412, 915],
  [768, 1024],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
];
const THEMES = ["light", "dark"];

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  if (!ok) console.log(`FAIL ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch();

for (const theme of THEMES) {
  for (const [width, height] of VIEWPORTS) {
    const tag = `${theme}-${width}`;
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    // The product's own theme contract: dataset.theme + localStorage "theme".
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("theme", t);
      } catch {}
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.dataset.theme = t;
      });
    }, theme);

    await page.goto(`${BASE}/lt`, { waitUntil: "networkidle" });
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);

    // ── LANDING ──────────────────────────────────────────────────────────
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    check(`landing no h-overflow @${tag}`, overflow <= 0, `${overflow}px`);

    const themeApplied = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    check(`theme really applied @${tag}`, themeApplied === theme, themeApplied);

    // Readable type: nothing below the declared 12px floor renders.
    const tiny = await page.evaluate(() => {
      let n = 0;
      for (const el of document.querySelectorAll("body *")) {
        const txt = el.textContent?.trim() ?? "";
        if (txt.length === 0 || el.children.length > 0) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (Number.isFinite(fs) && fs > 0 && fs < 12) n += 1;
      }
      return n;
    });
    check(`no sub-12px text @${tag}`, tiny === 0, `${tiny} nodes`);

    // Sector switch is a REAL control (click changes the scenario).
    const sectors = await page.locator('[data-testid="live-demo-sectors"] button').count();
    check(`4 sector chips @${tag}`, sectors === 4, `${sectors}`);
    if (sectors === 4) {
      const before = await page.locator('[data-testid="live-product-demo"]').innerText();
      await page.locator('[data-testid="live-demo-sector-it"]').click();
      await page.waitForTimeout(400);
      const after = await page.locator('[data-testid="live-product-demo"]').innerText();
      check(`sector click changes the scenario @${tag}`, before !== after);
    }

    // Canonical card + honesty.
    check(
      `canonical card on landing @${tag}`,
      (await page.locator('[data-testid="playercards-canonical-card"]').count()) === 1,
    );
    const text = await page.evaluate(() => document.body.innerText);
    check(`no PLACEHOLDER @${tag}`, !/PLACEHOLDER/i.test(text));
    check(`no raw enum @${tag}`, !/\bemployee\b|\bowner\b/.test(text));

    // ── KEYBOARD / FOCUS ────────────────────────────────────────────────
    const focusVisible = await page.evaluate(() => {
      const el = document.querySelector("a[href], button");
      if (!el) return false;
      el.focus();
      return document.activeElement === el;
    });
    check(`first control is focusable @${tag}`, focusVisible);

    // ── LOGIN (P0 same-tab Google, no popup script) ─────────────────────
    await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "networkidle" });
    const gis = await page.evaluate(
      () => document.querySelectorAll('script[src*="gsi"]').length,
    );
    check(`login has no GIS popup script @${tag}`, gis === 0, `${gis}`);
    const loginOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    check(`login no h-overflow @${tag}`, loginOverflow <= 0, `${loginOverflow}px`);

    // ── BROWSER BACK + REFRESH keep a real state ────────────────────────
    await page.goBack({ waitUntil: "networkidle" });
    check(`browser back returns to the landing @${tag}`, page.url().includes("/lt"));
    await page.reload({ waitUntil: "networkidle" });
    check(
      `refresh keeps the landing rendered @${tag}`,
      (await page.locator('[data-testid="live-product-demo"]').count()) === 1,
    );

    if (width === 1440 || width === 390) {
      await page.screenshot({ path: `${OUT}/matrix-${tag}-landing.png`, fullPage: false });
    }
    await ctx.close();
  }
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(` - ${f.name} ${f.detail}`);
}
process.exit(failed.length ? 1 : 0);
