import { expect as baseExpect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * LANDING HORIZONTAL OVERFLOW — /lt must fit a 320px phone.
 *
 * Measured on 2026-08-09 (Chromium, 320px): `window.innerWidth` 320 against
 * `document.body.scrollWidth` 349 — the landing was 29px too wide, and
 * `html { overflow-x: hidden }` CLIPPED that 29px instead of scrolling it, so
 * the right edge of the hero and the map column were silently cut off.
 *
 * ONE root cause, not five. An `<input>` with no explicit width carries an
 * intrinsic `size`-based min-content of ~205px, and `min-w-0` does not remove
 * it from the intrinsic-sizing pass. In the hero ask form that propagated:
 *
 *     input 205 + gap 8 + submit 78  = form  min-content 291
 *     + card padding/border 34       = card  min-content 325
 *     -> the hero grid track was sized 325 inside a 272px container
 *
 * Everything the audit listed as an offender — the suggestion-chip row, the
 * submit, the map host, the badge, the map caption — was a CONSEQUENCE of that
 * over-wide track, not an independent bug. The fix is `w-0` on the sentence
 * input; since the frozen design contract (2026-09-05, P1) that input lives in
 * components/marketing/public-entry.tsx and the same rule holds there.
 *
 * The public header is NOT this spec's subject: it was fixed separately in
 * PR #1098 and is covered by mobile-marketing-nav.spec.ts. This spec measures
 * the whole page, header included, so the two together leave no gap.
 *
 * Public page, no session needed.
 */

const SHOTS = join(
  process.cwd(),
  "..",
  "..",
  "docs",
  "audits",
  "evidence",
  "landing-mobile-overflow",
);
const expect = baseExpect.configure({ timeout: 15_000 });

/** 320 is the narrowest phone still in real use; 360/375 are the common ones. */
const MOBILE_WIDTHS = [320, 360, 375] as const;

type Offender = {
  tag: string;
  testid: string;
  cls: string;
  text: string;
  left: number;
  right: number;
  width: number;
};

/**
 * Every element whose box escapes the viewport horizontally.
 *
 * NOT `documentElement.scrollWidth > clientWidth`. This app sets
 * `html { overflow-x: hidden }`, so that comparison returned a clean 320 on the
 * very page that was 349px wide — a green assertion over a broken layout. It is
 * the reason this defect survived to a manual report. Element boxes are
 * measured directly instead, which a clip cannot hide.
 *
 * Two classes of element are excluded, both deliberately:
 *
 *   1. VISUALLY HIDDEN elements (`sr-only`). The skip link sits at x=-1 with a
 *      1px box and `clip: rect(0,0,0,0)`; that is the standard screen-reader
 *      technique, not an overflow, and it is present at every width.
 *
 *   2. Elements CLIPPED BY AN ANCESTOR that itself fits. Leaflet positions its
 *      tiles, zoom SVG and attribution well outside the map frame by design;
 *      `[data-testid=market-map]` has `overflow-hidden` and is inside the
 *      viewport, so none of that can reach the page edge. Without this rule the
 *      spec would report ~8 permanent false offenders and teach the next person
 *      to ignore it.
 *
 * The ancestor walk stops AT `body` on purpose. `html`/`body` carry the
 * `overflow-x: hidden` that causes the silent clipping in the first place —
 * treating them as legitimate clippers would excuse exactly the defect under
 * test and make this assertion vacuous.
 */
async function pageOverflow(page: Page): Promise<Offender[]> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const out: Offender[] = [];

    const isVisuallyHidden = (el: Element) => {
      const s = getComputedStyle(el);
      return (
        s.clip === "rect(0px, 0px, 0px, 0px)" ||
        s.clipPath === "inset(50%)" ||
        s.visibility === "hidden"
      );
    };

    /** Clipped by something that is itself on-screen -> cannot reach the edge. */
    const clippedByFittingAncestor = (el: Element) => {
      let n = el.parentElement;
      while (n && n !== document.body) {
        const s = getComputedStyle(n);
        if (s.overflowX !== "visible") {
          const r = n.getBoundingClientRect();
          if (r.right <= vw + 0.5 && r.left >= -0.5) return true;
        }
        n = n.parentElement;
      }
      return false;
    };

    document.querySelectorAll("body *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      if (r.right <= vw + 0.5 && r.left >= -0.5) return;
      if (isVisuallyHidden(el)) return;
      if (clippedByFittingAncestor(el)) return;

      out.push({
        tag: el.tagName.toLowerCase(),
        testid: el.getAttribute("data-testid") ?? "",
        cls: ((el as HTMLElement).className ?? "").toString().slice(0, 90),
        text: (el.textContent ?? "").trim().slice(0, 40),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
      });
    });
    return out;
  });
}

/** Readable failure text — a bare `[]` mismatch says nothing about what moved. */
const describe = (o: Offender[]) =>
  o
    .map(
      (x) =>
        `${x.tag}${x.testid ? `[${x.testid}]` : ""} "${x.text}" ` +
        `x:[${x.left}..${x.right}] w=${x.width} .${x.cls}`,
    )
    .join("\n");

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

for (const width of MOBILE_WIDTHS) {
  test.describe(`@${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test(`/lt does not overflow the viewport at ${width}px`, async ({ page }) => {
      await page.goto("/lt");

      /**
       * THE PAGE MUST ACTUALLY HAVE RENDERED.
       *
       * Not ceremony. While developing this fix a misconfigured server returned
       * a 500 and the overflow scan reported a perfectly clean
       * `body.scrollWidth=304` — a passing measurement of an error page. An
       * overflow assertion is trivially satisfiable by a blank document, so the
       * spec states what must be on screen BEFORE it measures anything.
       */
      await expect(page.getByTestId("public-entry")).toBeVisible();
      await expect(page.getByTestId("entry-input")).toBeVisible();
      await expect(page.getByTestId("entry-submit")).toBeVisible();
      await expect(page.getByTestId("entry-example").first()).toBeVisible();
      // The understanding card (with its two door links) is the widest thing
      // the entry renders, so it is produced — by routing the first example
      // sentence live — BEFORE anything is measured.
      await page.getByTestId("entry-example").first().click();
      await expect(page.getByTestId("entry-understanding")).toBeVisible();

      const offenders = await pageOverflow(page);
      expect(
        offenders,
        `elements escaping a ${width}px viewport on /lt:\n${describe(offenders)}`,
      ).toEqual([]);

      /**
       * The named offenders from the 2026-08-09 audit, asserted individually.
       *
       * The scan above already covers them, but a generic "nothing overflows"
       * failure does not say WHICH regression happened. These name the exact
       * boxes that were off-screen — chip row, submit, map host, badge, caption
       * — so a future regression reads as itself rather than as a statistic.
       */
      const named: ReadonlyArray<readonly [string, string]> = [
        ["entry example chips", "[data-testid='entry-example']"],
        ["entry Suprasti submit", "[data-testid='entry-submit']"],
        ["entry understanding card", "[data-testid='entry-understanding']"],
        // Scoped to the entry: the header carries its own (mobile-hidden)
        // auth links, whose null boxes are not this spec's subject.
        ["entry door links", "[data-testid='public-entry'] [data-testid='auth-cta-link']"],
      ];
      for (const [name, selector] of named) {
        for (const el of await page.locator(selector).all()) {
          const box = await el.boundingBox();
          expect(box, `${name} bounding box at ${width}px`).not.toBeNull();
          expect(
            box!.x + box!.width,
            `${name} right edge at ${width}px`,
          ).toBeLessThanOrEqual(width + 0.5);
          expect(box!.x, `${name} left edge at ${width}px`).toBeGreaterThanOrEqual(
            -0.5,
          );
        }
      }

      // The public-numbers line is the last element of the entry; when the
      // canonical reader answered it is the widest single line, so its edge
      // is asserted individually. When the reader could not answer the line
      // is honestly absent, and that is not an overflow.
      const numbers = page.getByTestId("entry-numbers");
      if ((await numbers.count()) > 0) {
        const numBox = await numbers.boundingBox();
        expect(numBox, `numbers line bounding box at ${width}px`).not.toBeNull();
        expect(
          numBox!.x + numBox!.width,
          `numbers line right edge at ${width}px`,
        ).toBeLessThanOrEqual(width + 0.5);
      }

      await page.screenshot({
        path: join(SHOTS, `landing-${width}.png`),
        fullPage: false,
      });
      // The understanding card may sit BELOW the fold, so the shot above does
      // not show it. Second frame, scrolled to it, so the evidence actually
      // pictures the boxes this spec is about.
      await page.getByTestId("entry-understanding").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: join(SHOTS, `landing-${width}-entry.png`),
        fullPage: false,
      });
    });

    test(`the entry row stays usable at ${width}px`, async ({ page }) => {
      /**
       * The fix works by giving the sentence input `w-0` and letting `flex-1`
       * grow it. That is only correct if the field still ends up a real,
       * typable control — a 0px input that never grows would "fix" the
       * overflow by destroying the one interactive element on the landing.
       */
      await page.goto("/lt");

      const input = page.getByTestId("entry-input");
      await expect(input).toBeVisible();
      /**
       * Both boxes are read in ONE evaluate so they cannot come from different
       * frames — two separate `boundingBox()` calls straddling a layout
       * transition once produced a 5.5px phantom overlap (the layout was fine,
       * the measurement was not).
       */
      await expect(page.getByTestId("entry-submit")).toBeVisible();

      const row = await page.evaluate(() => {
        const rect = (sel: string) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width };
        };
        return {
          input: rect("[data-testid='entry-input']"),
          submit: rect("[data-testid='entry-submit']"),
        };
      });
      expect(row.input, "ask input bounding box").not.toBeNull();
      expect(row.submit, "submit bounding box").not.toBeNull();

      // Comfortably more than the submit button, and nowhere near collapsed.
      expect(
        row.input!.width,
        `ask input width at ${width}px — it must still fill the row`,
      ).toBeGreaterThan(100);

      // Input and submit share one row without colliding or wrapping.
      expect(
        row.submit!.x,
        `submit must sit to the right of the input at ${width}px`,
      ).toBeGreaterThanOrEqual(row.input!.x + row.input!.width - 0.5);
      expect(
        Math.abs(row.submit!.y - row.input!.y),
        `input and submit must stay on one row at ${width}px`,
      ).toBeLessThan(8);

      // It genuinely accepts input.
      await input.fill("Kur trūksta suvirintojų?");
      await expect(input).toHaveValue("Kur trūksta suvirintojų?");
    });
  });
}

test.describe("@1280px desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the desktop entry still fits", async ({ page }) => {
    /**
     * `w-0 flex-1` must be invisible above the breakpoint. At 1280 the
     * sentence input should still be a wide field.
     */
    await page.goto("/lt");
    await expect(page.getByTestId("public-entry")).toBeVisible();

    const inputBox = await page.getByTestId("entry-input").boundingBox();
    expect(inputBox, "ask input bounding box at 1280px").not.toBeNull();
    expect(
      inputBox!.width,
      "the ask input must still be a full-width field on desktop",
    ).toBeGreaterThan(300);

    const offenders = await pageOverflow(page);
    expect(
      offenders,
      `elements escaping a 1280px viewport on /lt:\n${describe(offenders)}`,
    ).toEqual([]);
  });
});
