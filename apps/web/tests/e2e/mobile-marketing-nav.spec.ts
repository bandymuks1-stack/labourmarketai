import { expect as baseExpect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * MOBILE MARKETING NAV — beta foundation audit M1, proven in a real browser.
 *
 * Before this fix the six primary marketing links rendered only inside the
 * `hidden lg:flex` desktop nav and no mobile menu component existed, so below
 * 1024px the public header offered logo + Sign in + Start now + theme +
 * locale and NOTHING that reached /for-workers, /for-companies,
 * /for-agencies, /#how-it-works, /pricing or /about.
 *
 * Proven here at 320 / 375 / 768 (the widths named in the audit):
 *   1. every marketing link is REACHABLE from the header (opened, visible,
 *      and its href correct);
 *   2. the page does not scroll horizontally at any of those widths, open
 *      or closed — a menu that causes overflow trades one defect for another;
 *   3. the disclosure button and every menu row are >= 44px touch targets,
 *      MEASURED from the live bounding box, not read off a class name;
 *   4. clicking a link navigates AND closes the menu;
 *   5. Escape closes it and returns focus to the trigger;
 *   6. at 1280 the menu button is gone and the desktop nav is back — the fix
 *      must not double up the links on desktop.
 *
 * Public pages, no session needed.
 */

const SHOTS = join(
  process.cwd(),
  "..",
  "..",
  "docs",
  "audits",
  "evidence",
  "mobile-marketing-nav",
);
const expect = baseExpect.configure({ timeout: 15_000 });

/** The audit's widths. 320 is the narrowest phone still in real use. */
const MOBILE_WIDTHS = [320, 375, 768] as const;

/** Apple/WCAG 2.2 minimum. A 0.5px sub-pixel rounding slack, nothing more. */
const MIN_TOUCH_PX = 43.5;

/** The canonical public IA — the links a visitor must be able to reach. */
const EXPECTED_LINKS: ReadonlyArray<{ href: string }> = [
  { href: "/for-workers" },
  { href: "/for-companies" },
  { href: "/for-agencies" },
  { href: "/pricing" },
  { href: "/about" },
];

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

/**
 * Every header element whose box escapes the viewport.
 *
 * NOT `documentElement.scrollWidth > clientWidth`: this app sets
 * `html { overflow-x: hidden }`, so that comparison returns "no overflow"
 * while the content is silently CLIPPED. It reported a clean 320 on the very
 * header that was 545px wide with the theme toggle and locale switcher
 * off-screen — a green assertion over a broken header. Element boxes are
 * measured directly instead, which cannot be hidden by a clip.
 *
 * Scoped to the header on purpose: this spec's subject is the nav, and a
 * page-wide assertion here would fail for defects in components it does not
 * touch. The ~29px landing overflow this comment used to record as
 * pre-existing (hero ask chips, the market-map demo caption) was fixed on
 * 2026-08-09 and is now measured page-wide, at 320/360/375, by
 * landing-mobile-overflow.spec.ts. The two specs together leave no gap.
 */
async function headerOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const out: string[] = [];
    document.querySelectorAll("header *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 0.5 || r.left < -0.5)) {
        out.push(
          `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 20)}" ` +
            `[${Math.round(r.left)}..${Math.round(r.right)}] vw=${vw}`,
        );
      }
    });
    return out;
  });
}

for (const width of MOBILE_WIDTHS) {
  test.describe(`@${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test(`every marketing link is reachable from the header at ${width}px`, async ({
      page,
    }) => {
      // The header is on EVERY marketing page, so a warning it emits is a
      // warning on the whole public site. Passing the auth section across the
      // server→client boundary produced a real "unique key prop" warning on
      // first build of this PR (see the `key` note in site-nav.tsx).
      const consoleErrors: string[] = [];
      page.on("console", (m) => {
        // Pre-existing, unrelated to the nav: the report-only CSP header.
        if (m.type() === "error" && !/upgrade-insecure-requests/i.test(m.text())) {
          consoleErrors.push(m.text());
        }
      });
      page.on("pageerror", (e) => consoleErrors.push(e.message));

      await page.goto("/lt");

      const toggle = page.getByTestId("mobile-nav-toggle");
      await expect(toggle, "the disclosure button must exist below lg").toBeVisible();

      // CLOSED: nothing in the header escapes the viewport, and the panel is
      // genuinely absent.
      expect(await headerOverflow(page), `closed header overflow at ${width}px`).toEqual(
        [],
      );
      await expect(page.getByTestId("mobile-nav-menu")).toHaveCount(0);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");

      // The trigger is a real 44px target — measured, not inferred.
      const box = await toggle.boundingBox();
      expect(box, "toggle bounding box").not.toBeNull();
      expect(box!.width, `toggle width at ${width}px`).toBeGreaterThanOrEqual(
        MIN_TOUCH_PX,
      );
      expect(box!.height, `toggle height at ${width}px`).toBeGreaterThanOrEqual(
        MIN_TOUCH_PX,
      );

      await toggle.click();
      const menu = page.getByTestId("mobile-nav-menu");
      await expect(menu).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");

      // OPEN: still nothing escaping (the panel is right-anchored).
      expect(await headerOverflow(page), `open header overflow at ${width}px`).toEqual(
        [],
      );

      // Every canonical marketing link is present, visible and correctly
      // targeted. The locale prefix is applied by the i18n Link.
      for (const { href } of EXPECTED_LINKS) {
        const link = menu.locator(`a[href$="${href}"]`);
        await expect(link, `${href} reachable at ${width}px`).toBeVisible();
      }
      // The landing anchor is same-page, so it is matched separately.
      await expect(
        menu.locator('a[href*="#how-it-works"]'),
        `#how-it-works reachable at ${width}px`,
      ).toBeVisible();

      // Every marketing row is a >= 44px touch target, measured live. Scoped
      // to DIRECT children: the auth section below is a nested div that is
      // display:none from `sm` up, and a hidden element has no box to measure.
      const rows = await menu.locator("> a").all();
      expect(rows.length, "menu row count").toBeGreaterThanOrEqual(6);
      for (const row of rows) {
        const rb = await row.boundingBox();
        expect(rb, "row bounding box").not.toBeNull();
        expect(
          rb!.height,
          `row "${(await row.textContent())?.trim()}" height at ${width}px`,
        ).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
      }

      // The auth CTAs are reachable at EVERY width — in the panel below `sm`
      // (where the header row cannot fit them) and in the header from `sm` up.
      // Whichever side owns them, both must be one tap from the header.
      const inPanel = menu.getByTestId("mobile-nav-auth");
      const headerCtas = page.locator("header > div > div a[data-testid='auth-cta-link']");
      if (width < 640) {
        await expect(inPanel, `auth CTAs belong in the panel at ${width}px`).toBeVisible();
        await expect(inPanel.locator("a[href*='/auth/login']")).toBeVisible();
        await expect(inPanel.locator("a[href*='/auth/signup']")).toBeVisible();
        await expect(headerCtas.first(), "header CTAs hidden below sm").toBeHidden();
      } else {
        await expect(inPanel, `auth CTAs belong in the header at ${width}px`).toBeHidden();
        await expect(headerCtas.first()).toBeVisible();
      }

      await page.screenshot({
        path: join(SHOTS, `open-${width}.png`),
        fullPage: false,
      });

      expect(consoleErrors, `console errors at ${width}px`).toEqual([]);
    });

    test(`clicking a link navigates and closes the menu at ${width}px`, async ({
      page,
    }) => {
      await page.goto("/lt");
      await page.getByTestId("mobile-nav-toggle").click();
      await expect(page.getByTestId("mobile-nav-menu")).toBeVisible();

      await page.getByTestId("mobile-nav-menu").locator('a[href$="/pricing"]').click();

      // COLD-COMPILE BUDGET. Against `next dev` the FIRST navigation to
      // /pricing compiles the route, and the App Router only changes the URL
      // once the RSC payload lands — so a cold run sits at /lt well past the
      // 15s default and reads exactly like a dead link. Measured here on
      // 2026-08-08: cold 320px run exceeded 15s, the same test passed in 8.2s
      // once warm. Same trap the webServer timeout note in playwright.config.ts
      // records. This raises ONLY this deadline; a genuinely dead link still
      // fails, just 60s later.
      await expect(page).toHaveURL(/\/lt\/pricing/, { timeout: 60_000 });
      // Closed after navigation — a menu left open over the destination is
      // the classic mobile-menu defect.
      await expect(page.getByTestId("mobile-nav-menu")).toHaveCount(0);
      await expect(page.getByTestId("mobile-nav-toggle")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(
        await headerOverflow(page),
        `header overflow on /pricing at ${width}px`,
      ).toEqual([]);
    });

    test(`Escape closes the menu and returns focus to the trigger at ${width}px`, async ({
      page,
    }) => {
      await page.goto("/lt");
      const toggle = page.getByTestId("mobile-nav-toggle");
      await toggle.click();
      await expect(page.getByTestId("mobile-nav-menu")).toBeVisible();

      await page.keyboard.press("Escape");

      await expect(page.getByTestId("mobile-nav-menu")).toHaveCount(0);
      await expect(toggle).toBeFocused();
    });
  });
}

test.describe("@1280px desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("the desktop nav is back and the menu button is gone", async ({ page }) => {
    await page.goto("/lt");

    // The links live in the header's own nav at this width...
    await expect(page.locator("header nav a[href$='/for-workers']")).toBeVisible();
    // ...and the disclosure button must not be offered alongside them.
    await expect(page.getByTestId("mobile-nav-toggle")).toBeHidden();
    expect(await headerOverflow(page), "desktop header overflow").toEqual([]);
  });
});
