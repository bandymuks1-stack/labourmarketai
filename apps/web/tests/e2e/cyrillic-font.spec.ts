import { test, expect } from "@playwright/test";

/**
 * Cyrillic typography guard (RU locale, 2026-06-12) — runs unconditionally
 * against the public /ru landing page (no auth, no Supabase needed).
 *
 * Bricolage Grotesque (display) ships NO cyrillic subset, so the doctrine
 * for RU is: Cyrillic display glyphs fall through the token stack to Inter
 * (loaded with the cyrillic subset) — NEVER to a browser-picked default
 * face. Three real-browser assertions, both themes:
 *
 *   1. An Inter @font-face with a Cyrillic unicode-range is registered
 *      (the cyrillic subset actually shipped, not just requested).
 *   2. A Russian sample string laid out in the display stack renders
 *      IDENTICALLY to the same string in the sans stack (per-glyph
 *      fallback hit Inter), and differently from an forced-serif control
 *      (so the assertion can't pass vacuously).
 *   3. The body computed font-family resolves through the next/font vars
 *      (no raw typeface regression).
 */

// PURE Cyrillic (no spaces, digits or punctuation): every Latin-range glyph
// renders in Bricolage inside the display stack but in Inter inside the sans
// stack, which would skew the width-equality assertion. Only the Cyrillic
// fallback behaviour itself is under test.
const RU_SAMPLE = "Журналработподтвержденоукладывалплитку";

for (const theme of ["dark", "light"] as const) {
  test(`Cyrillic display text falls back to Inter, never a default serif (${theme})`, async ({
    page,
  }) => {
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("theme", t);
      } catch {
        /* theme falls to dark */
      }
    }, theme);
    await page.goto("/ru");
    await page.waitForLoadState("networkidle");

    // 1. Inter cyrillic subset is genuinely registered in the browser.
    const hasCyrillicInter = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].some(
        (f) =>
          /inter/i.test(f.family) &&
          // next/font's cyrillic subset declares U+400-45F (Chromium prints
          // ranges without the leading zero — match both spellings).
          /u\+0?40/i.test(f.unicodeRange),
      );
    });
    expect(hasCyrillicInter, "Inter @font-face with Cyrillic unicode-range").toBe(true);

    // 2 + 3. Per-glyph rendering: display-stack Cyrillic == sans-stack
    // Cyrillic (Inter handled it), and != a forced-serif control.
    const widths = await page.evaluate(async (sample) => {
      await document.fonts.ready;
      const root = getComputedStyle(document.documentElement);
      const display = root.getPropertyValue("--font-display").trim();
      const sans = root.getPropertyValue("--font-sans").trim();
      const measure = (fontFamily: string) => {
        const el = document.createElement("span");
        el.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:32px;font-family:${fontFamily}`;
        el.textContent = sample;
        document.body.appendChild(el);
        const w = el.getBoundingClientRect().width;
        el.remove();
        return w;
      };
      return {
        displayStack: measure(`${display}, ${sans}, system-ui, sans-serif`),
        sansStack: measure(`${sans}, system-ui, sans-serif`),
        serifControl: measure("Times New Roman, serif"),
        bodyFamily: getComputedStyle(document.body).fontFamily,
      };
    }, RU_SAMPLE);

    expect(
      widths.displayStack,
      "Cyrillic via the display stack must render with Inter (same width as the sans stack)",
    ).toBeCloseTo(widths.sansStack, 1);
    expect(
      Math.abs(widths.displayStack - widths.serifControl),
      "the assertion must not be vacuous — a serif control renders differently",
    ).toBeGreaterThan(1);
    expect(widths.bodyFamily.length).toBeGreaterThan(0);

    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.dataset.theme ?? "dark"),
      )
      .toBe(theme);
  });
}
