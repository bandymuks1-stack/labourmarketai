import { test, expect, type Page } from "@playwright/test";

/**
 * ACQUISITION CTAs: NO NESTED INTERACTIVE CONTROLS, AND A REAL 44px TARGET.
 *
 * Measured on /lt/create-cv at 320-1440px (2026-08-11), the free-CV CTA — the
 * one the whole worker-acquisition funnel points at — rendered as:
 *
 *     a      "Kurti mano CV — nemokamai →"  264x20   display:inline
 *     button "Kurti mano CV — nemokamai →"  264x44   display:inline-flex
 *
 * `<Link><Button>label</Button></Link>` at 14 call sites across the funnel. The
 * 44px-looking control is a <button> that navigates nothing; the element that
 * actually navigates — the one a screen reader announces as the link, and the
 * FIRST of the two tab stops the pair creates — is a 20px inline box with no
 * focus-visible ring, because every style sat on the button inside it. Nesting
 * interactive content in an <a> is invalid HTML too, so the DOM the browser
 * builds is not the one the JSX suggests.
 *
 * The header signup CTA had the same nesting AND a genuine floor breach: the
 * `sm` button size is 36px, so "Pradėti dabar" was under 44px at every width
 * >= 768px, where the header CTAs are visible.
 *
 * WHY MEASURED AND NOT READ FROM SOURCE. `buttonLinkClassName` can be present
 * on an anchor and still lose: `cn` is a plain joiner with no conflict
 * resolution, and an inline anchor silently drops the geometry the class
 * describes. Only layout proves layout. Its unit-level counterpart is the
 * visual-contract guard, which pins the class grammar itself.
 *
 * INLINE TEXT LINKS ARE DELIBERATELY OUT OF SCOPE (project touch-floor rule:
 * classify inline text separately). The footer legal list and the marketing nav
 * are text links, not controls, and are not asserted here. This spec covers
 * elements that present as CTAs.
 *
 * ONE INSTANCE OF THE DEFECT SURVIVES, AND NOT BY OVERSIGHT. The landing's
 * final CTA band (components/marketing/final-cta-band.tsx) still nests a
 * <Button> in its <Link>. It is inside the owner-gated landing freeze, whose
 * guard says in as many words: if you tripped it, revert — do not regenerate
 * the baseline outside the owner-approved landing plan. The fix was written,
 * tripped lib/guards/landing-freeze.test.ts, and was reverted. It needs an
 * owner decision, not another engineer rediscovering it. The landing route is
 * therefore absent from SURFACES below rather than silently passing.
 *
 * Public pages, no session needed.
 */

const WIDTHS = [320, 360, 375, 390, 412, 768, 1024, 1440] as const;

/**
 * EIGHT NAVIGATIONS PER TEST NEEDS MORE THAN THE 30s DEFAULT.
 *
 * Each case walks every width, and against `next dev` the first request to a
 * route pays its compile. The default budget expired mid-`goto` on the /en
 * routes while the identical /lt cases passed purely because an earlier run had
 * warmed them — a timing artefact that reads exactly like a broken page. This
 * raises the DEADLINE only: every `expect` below keeps its own timeout, so a
 * genuinely short CTA still fails in seconds.
 */
test.describe.configure({ timeout: 180_000 });

/**
 * Each route with the CTA that must hold the floor on it, per locale-agnostic
 * selector. `data-cta-id` comes from TrackedCta (the funnel id, in the DOM);
 * the others are the surfaces' existing testids.
 *
 * `anchor` is the element that must EXIST before anything is measured — an
 * overflow/geometry assertion is trivially satisfied by an error page, and a
 * green measurement of a 500 is exactly how this class of defect survives.
 */
const SURFACES = [
  {
    route: "/create-cv",
    anchor: "[data-testid='create-cv-step-1']",
    ctas: ["[data-cta-id='create_cv_hero']", "[data-cta-id='create_cv_footer']"],
  },
  {
    route: "/for-workers",
    anchor: "h1",
    ctas: ["[data-cta-id='workers_hero']"],
  },
  {
    route: "/for-companies",
    anchor: "h1",
    ctas: ["[data-cta-id='companies_hero']"],
  },
  {
    route: "/company-need",
    anchor: "[data-testid='need-bridge']",
    ctas: ["[data-testid='need-bridge'] a"],
  },
  {
    route: "/worker-intake",
    anchor: "[data-testid='intake-bridge']",
    ctas: ["[data-testid='intake-bridge'] a"],
  },
] as const;

/** Every element that navigates or acts, with the geometry the browser gave it. */
const INTERACTIVE = 'a[href], button, [role="button"]';

type Nested = { outer: string; inner: string; text: string };

/**
 * THE ROOT DEFECT, STATED GENERALLY.
 *
 * Not "this one CTA is short" — an interactive element inside another
 * interactive element is always wrong, and it is what made the CTA short. This
 * runs on every route/width so a new `<Link><Button>` anywhere in the funnel
 * fails here rather than waiting for someone to measure it by hand.
 */
async function nestedInteractive(page: Page): Promise<Nested[]> {
  return page.evaluate((sel) => {
    const out: Nested[] = [];
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${
        el.getAttribute("data-testid")
          ? `[${el.getAttribute("data-testid")}]`
          : el.getAttribute("data-cta-id")
            ? `[cta:${el.getAttribute("data-cta-id")}]`
            : ""
      }`;
    for (const el of document.querySelectorAll(sel)) {
      const inner = el.querySelector(sel);
      if (!inner) continue;
      out.push({
        outer: describe(el),
        inner: describe(inner),
        text: (el.textContent ?? "").trim().slice(0, 40),
      });
    }
    return out;
  }, INTERACTIVE);
}

test.describe("acquisition CTAs — structure and touch floor", () => {
  for (const locale of ["lt", "en"] as const) {
    for (const { route, anchor, ctas } of SURFACES) {
      const path = `/${locale}${route}`;

      test(`${path} — CTAs are real links of at least 44px`, async ({
        page,
      }) => {
        for (const width of WIDTHS) {
          await page.setViewportSize({
            width,
            height: width < 768 ? 844 : 900,
          });
          await page.goto(path);

          // The page must have rendered before any geometry is trusted.
          await expect(
            page.locator(anchor).first(),
            `${path} @ ${width}px did not render`,
          ).toBeVisible({ timeout: 30_000 });

          const nested = await nestedInteractive(page);
          expect(
            nested,
            `${path} @ ${width}px: interactive controls nested inside other ` +
              `interactive controls — put the CTA grammar on the <a> itself ` +
              `(buttonLinkClassName), never a <button> inside it:\n` +
              nested
                .map((n) => `  ${n.outer} > ${n.inner}  "${n.text}"`)
                .join("\n"),
          ).toEqual([]);

          for (const selector of ctas) {
            for (const cta of await page.locator(selector).all()) {
              const box = await cta.boundingBox();
              expect(box, `${selector} on ${path} @ ${width}px`).not.toBeNull();
              expect(
                box!.height,
                `${selector} on ${path} @ ${width}px is under the 44px floor`,
              ).toBeGreaterThanOrEqual(44);
              // A CTA that reaches the floor by overflowing the screen has not
              // been fixed.
              expect(
                box!.x + box!.width,
                `${selector} on ${path} @ ${width}px escapes the viewport`,
              ).toBeLessThanOrEqual(width + 0.5);
            }
          }
        }
      });
    }
  }

  test("the header signup CTA holds the floor where it is visible", async ({
    page,
  }) => {
    /**
     * Below `sm` the header CTAs move into the disclosure (see site-nav), so
     * this asserts only the widths where the control is actually on screen —
     * asserting a hidden element would pass on a 0x0 box and prove nothing.
     */
    for (const width of [768, 1024, 1440] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/lt/create-cv");

      const signup = page.locator(
        "header [data-testid='auth-cta-link'][href$='/auth/signup']",
      );
      await expect(signup).toBeVisible({ timeout: 30_000 });

      const box = await signup.boundingBox();
      expect(
        box!.height,
        `header signup CTA @ ${width}px is under the 44px floor`,
      ).toBeGreaterThanOrEqual(44);

      // It is the link itself, not a button wrapped in one.
      const innerControl = await signup.locator(INTERACTIVE).count();
      expect(
        innerControl,
        "the header signup CTA must BE the link, not wrap a <button>",
      ).toBe(0);
    }
  });

  test("the CV CTA still navigates, and shows focus when tabbed to", async ({
    page,
  }) => {
    /**
     * Geometry is not the product. The reason the nesting was wrong is that the
     * anchor carried no focus ring and the pair created two tab stops for one
     * action — so this asserts the keyboard path and the navigation, which a
     * pixel assertion cannot.
     */
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/lt/create-cv");

    const cta = page.locator("[data-cta-id='create_cv_hero']");
    await expect(cta).toBeVisible();

    await cta.focus();
    await expect(cta).toBeFocused();
    const ring = await cta.evaluate((el) => {
      el.classList.add("focus-visible");
      return getComputedStyle(el).getPropertyValue("--tw-ring-color") !== "";
    });
    expect(ring, "the CTA anchor carries the focus-visible ring token").toBe(
      true,
    );

    await cta.click();
    // /auth/signup may still be compiling on a cold dev server.
    await expect(page).toHaveURL(/\/lt\/auth\/signup/, { timeout: 60_000 });
  });
});
