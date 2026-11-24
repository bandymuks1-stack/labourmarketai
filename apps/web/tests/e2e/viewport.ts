import { expect, type Page } from "@playwright/test";

/**
 * "IS IT ON SCREEN?" — measured the way the question is asked.
 *
 * ## The defect this replaces
 *
 * Two specs asked whether a deep link had scrolled its target into view, in
 * the same words — *"is scrolled into view, not left below the fold"* — and
 * both measured it with `boundingBox().y < 900`.
 *
 * On the main frame Playwright's `boundingBox()` returns **document** space,
 * not viewport space. Measured on `/lt/dashboard/profile#cv-availability`:
 *
 * ```
 * getBoundingClientRect().top   79.5     ← on screen, 80px below the top
 * window.scrollY              2098
 * boundingBox().y             2177.5     ← 79.5 + 2098
 * ```
 *
 * So `boundingBox().y < 900` was never the stated question. It asked "does
 * this element live in the first 900px of the DOCUMENT", which is true only
 * while the page is short. Both specs therefore passed **for the wrong
 * reason** on a sparse fixture account, and both began failing — at exactly
 * `2177.5`, deterministically — once that account had accumulated enough
 * history to make the page tall. The deep links were working the whole time.
 *
 * That is the #1319 family in a third form. #1319: a selector that can never
 * fail. `cv-upload-authenticated`: a spec asserting a surface that does not
 * exist. This one: an assertion whose measurement does not mean what its
 * message says — a false green that turns into a false red, and points at the
 * product either way.
 *
 * ## What "on screen" actually means
 *
 * The element's own rect, relative to the viewport, overlapping it. Nothing
 * about the document, nothing about how far the page has scrolled.
 */

/** Viewport-relative top of the first match — `getBoundingClientRect().top`,
 *  read in the page. Never `boundingBox()`, for the reason above. */
export async function viewportTop(page: Page, selector: string): Promise<number> {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "attached" });
  return el.evaluate((n) => n.getBoundingClientRect().top);
}

/**
 * Assert the element is genuinely visible in the current viewport: it starts
 * above the bottom edge and ends below the top edge.
 *
 * `maxTop` bounds how far down it may sit — pass it when "in view" is not
 * enough and the element is supposed to be near the top, as a deep-link
 * target is. It is compared against the VIEWPORT, so it stays true no matter
 * how tall the page becomes.
 */
export async function expectInViewport(
  page: Page,
  selector: string,
  why: string,
  opts: { maxTop?: number } = {},
): Promise<void> {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "attached" });
  const rect = await el.evaluate((n) => {
    const r = n.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
      documentTop: r.top + window.scrollY,
    };
  });

  // A failure here has exactly two shapes and they need different fixes, so
  // the message carries the numbers that tell them apart: `scrollY: 0` with a
  // large `top` means the scroll never happened, while a scrolled page with a
  // large `top` means it happened and something moved the target afterwards.
  const where =
    `${why} (top ${Math.round(rect.top)}, bottom ${Math.round(rect.bottom)}, ` +
    `viewport ${rect.viewportHeight}, scrollY ${Math.round(rect.scrollY)}, ` +
    `document top ${Math.round(rect.documentTop)})`;

  expect(rect.top, `${where} — starts below the bottom edge of the viewport`).toBeLessThan(
    rect.viewportHeight,
  );
  expect(rect.bottom, `${where} — ends above the top edge of the viewport`).toBeGreaterThan(0);
  if (opts.maxTop !== undefined) {
    expect(rect.top, `${where} — sits lower than ${opts.maxTop}px in the viewport`).toBeLessThan(
      opts.maxTop,
    );
  }
}
