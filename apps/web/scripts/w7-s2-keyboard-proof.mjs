/**
 * W7-S2 keyboard, colour-independence and persistence proof. LOCAL ONLY.
 *
 * The measurement script proves names and sizes. This proves the things only
 * interaction can: that the radiogroup contract actually works, that selection
 * survives a save and a reload, and that the stored values are the same three
 * business states as before.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.UX_BASE ?? "http://127.0.0.1:3480";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) {
  console.error(`REFUSED_NON_LOCAL_CAPTURE: ${BASE}`);
  process.exit(1);
}
const OUT = join(process.cwd(), "..", "..", "docs", "audits", "evidence", "w7-s2-profile-accessibility");
mkdirSync(OUT, { recursive: true });

const FORM = '[data-testid="worker-availability-prefs"]';
const GROUP = "willing_to_relocate";
let failures = 0;
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
for (const vp of [
  { name: "1440", width: 1440, height: 900 },
  { name: "375", width: 375, height: 812 },
]) {
  console.log(`\n─── ${vp.name} ───`);
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: "lt-LT" });
  const page = await ctx.newPage();
  const errors = [];
  const hydration = [];
  page.on("console", (m) => {
    const t = m.text();
    if (/hydrat|did not match/i.test(t)) hydration.push(t.slice(0, 200));
    else if (m.type() === "error" && !/upgrade-insecure-requests/.test(t)) errors.push(t.slice(0, 200));
  });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

  await page.goto(`${BASE}/lt/auth/login`, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  await page.fill('input[type="email"]', "dev.worker@local.test");
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 120_000 });
  await page.goto(`${BASE}/lt/dashboard/profile`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForTimeout(8000);
  await page.locator(FORM).scrollIntoViewIfNeeded();

  // ── 1. one tab stop per radiogroup ──────────────────────────────────────
  const tabStops = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    return [...root.querySelectorAll('[role="radiogroup"]')].map(
      (g) => [...g.querySelectorAll('[role="radio"]')].filter((r) => r.tabIndex === 0).length,
    );
  }, FORM);
  ok("every radiogroup exposes exactly ONE tab stop", tabStops.every((n) => n === 1), JSON.stringify(tabStops));

  // ── 2. arrow keys move the selection ────────────────────────────────────
  const sel = () =>
    page.evaluate(
      (g) =>
        [...document.querySelectorAll(`[data-testid^="prefs-tristate-${g}-"]`)]
          .filter((e) => e.getAttribute("role") === "radio")
          .find((e) => e.getAttribute("aria-checked") === "true")
          ?.getAttribute("data-testid") ?? null,
      GROUP,
    );
  await page.locator(`[data-testid="prefs-tristate-${GROUP}-not_stated"]`).focus();
  const start = await sel();
  await page.keyboard.press("ArrowRight");
  const afterRight = await sel();
  await page.keyboard.press("ArrowRight");
  const afterRight2 = await sel();
  await page.keyboard.press("ArrowLeft");
  const afterLeft = await sel();
  await page.keyboard.press("End");
  const afterEnd = await sel();
  await page.keyboard.press("Home");
  const afterHome = await sel();
  ok("ArrowRight advances the selection", afterRight !== start && afterRight?.endsWith("-yes"), `${start} → ${afterRight}`);
  ok("ArrowRight advances again", afterRight2?.endsWith("-no"), String(afterRight2));
  ok("ArrowLeft goes back", afterLeft?.endsWith("-yes"), String(afterLeft));
  ok("End selects the last option", afterEnd?.endsWith("-no"), String(afterEnd));
  ok("Home selects the first option", afterHome?.endsWith("-not_stated"), String(afterHome));

  // ── 3. focus follows selection, and is visible ──────────────────────────
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return {
      testid: el?.getAttribute("data-testid"),
      focusVisible: el?.matches(":focus-visible"),
      ring: cs.boxShadow !== "none" || cs.outlineStyle !== "none",
    };
  });
  ok("focus follows the selection", focus.testid === `prefs-tristate-${GROUP}-not_stated`, JSON.stringify(focus));
  ok("focus ring is visible", focus.focusVisible === true && focus.ring === true, JSON.stringify(focus));

  // ── 4. Space / Enter activate a licence toggle ──────────────────────────
  const licB = page.locator('[data-testid="prefs-licence-B"]');
  await licB.focus();
  const before = await licB.getAttribute("aria-pressed");
  await page.keyboard.press("Space");
  await page.waitForTimeout(250);
  const afterSpace = await licB.getAttribute("aria-pressed");
  ok("Space toggles a licence chip", before !== afterSpace, `${before} → ${afterSpace}`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  const afterEnter = await licB.getAttribute("aria-pressed");
  ok("Enter toggles it back", afterEnter === before, `${afterSpace} → ${afterEnter}`);

  // ── 5. selection is not encoded by colour alone ─────────────────────────
  const marks = await page.evaluate((s) => {
    const root = document.querySelector(s);
    const on = [...root.querySelectorAll('[aria-checked="true"], [aria-pressed="true"]')];
    return {
      total: on.length,
      withMark: on.filter((e) => e.querySelector("[data-selected-mark]")).length,
    };
  }, FORM);
  ok("every selected control carries a non-colour mark", marks.total > 0 && marks.total === marks.withMark, JSON.stringify(marks));

  // ── 6. tab order is coherent: the form's controls come in DOM order ─────
  await page.locator(`[data-testid="prefs-tristate-${GROUP}-not_stated"]`).focus();
  const order = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    const id = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
    if (id) order.push(id);
  }
  const domOrder = await page.evaluate((s) => {
    const root = document.querySelector(s);
    return [...root.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid"));
  }, FORM);
  const seen = order.filter((id) => domOrder.includes(id));
  const monotonic = seen.every(
    (id, i) => i === 0 || domOrder.indexOf(id) > domOrder.indexOf(seen[i - 1]),
  );
  ok("Tab order follows DOM order (no traps, no jumps back)", monotonic, seen.slice(0, 8).join(" → "));

  // ── 7. save + reload persistence, and the stored value is unchanged ─────
  await page.locator(`[data-testid="prefs-tristate-${GROUP}-yes"]`).click();
  const hiddenBefore = await page.evaluate(
    (g) => document.querySelector(`input[type=hidden][name="${g}"]`)?.value,
    GROUP,
  );
  ok("the hidden input carries the business value", hiddenBefore === "yes", String(hiddenBefore));
  await page.locator('[data-testid="prefs-save"]').click();
  await page.waitForSelector('[data-testid="prefs-saved"], [data-testid="prefs-error"]', { timeout: 60_000 });
  const savedOk = await page.locator('[data-testid="prefs-saved"]').count();
  ok("save reports success", savedOk === 1);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const afterReload = await sel();
  ok("the saved choice survives a reload", afterReload?.endsWith("-yes"), String(afterReload));

  // reset to the fixture state so the next run starts clean
  await page.locator(`[data-testid="prefs-tristate-${GROUP}-not_stated"]`).click();
  await page.locator('[data-testid="prefs-save"]').click();
  await page.waitForSelector('[data-testid="prefs-saved"]', { timeout: 60_000 });

  // ── 8. honesty gates ────────────────────────────────────────────────────
  ok("no horizontal overflow", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const clipped = await page.evaluate((s) => {
    const root = document.querySelector(s);
    return [...root.querySelectorAll("button, input, textarea")].filter((e) => {
      const b = e.getBoundingClientRect();
      return e.type !== "hidden" && b.height > 0 && e.scrollWidth > e.clientWidth + 1;
    }).length;
  }, FORM);
  ok("no clipped controls", clipped === 0, `clipped=${clipped}`);
  ok("zero console errors", errors.length === 0, errors.join(" | "));
  ok("zero hydration warnings", hydration.length === 0, hydration.join(" | "));

  await page.locator(FORM).screenshot({ path: join(OUT, `after-keyboard-${vp.name}.png`), caret: "initial" });
  await ctx.close();
}
await browser.close();
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
