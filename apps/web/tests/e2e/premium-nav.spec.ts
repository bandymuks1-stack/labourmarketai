import { expect as baseExpect, test, type Page } from "@playwright/test";

/**
 * PREMIUM NAVIGATION — the six public intents, proven in a real browser
 * (owner P0 2026-11-12). Public pages, no session needed.
 *
 *   desktop (1024, 1280, 1440; lt and de): the six intents are visible by
 *     name without opening anything, none is cut, nothing overflows; an intent
 *     plus a destination is TWO actions (counted, mouse and keyboard); Escape
 *     returns focus; a destination answers (not a 404);
 *   mobile (320, 375, 768): the hamburger shows the same six intents, each
 *     expands to its links, nothing in the header escapes the viewport, every
 *     row is a 44px target, and a link navigates.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
const MIN_TOUCH_PX = 43.5;
const INTENTS = ["work", "workers", "services", "orders", "partners", "agencies"] as const;

async function headerOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const out: string[] = [];
    document.querySelectorAll("header *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 0.5 || r.left < -0.5)) {
        out.push(`${el.tagName.toLowerCase()} [${Math.round(r.left)}..${Math.round(r.right)}] vw=${vw}`);
      }
    });
    return out;
  });
}

for (const width of [1024, 1280, 1440] as const) {
  test.describe(`desktop intent bar @${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    // Lithuanian (the default) and German (the longest labels).
    for (const locale of ["lt", "de"] as const) {
      test(`${locale}: the six intents are visible, whole and inside the viewport`, async ({ page }) => {
        await page.goto(`/${locale}/pricing`);
        await expect(page.getByTestId("mobile-nav-toggle")).toBeHidden();
        for (const id of INTENTS) {
          const t = page.getByTestId(`intent-toggle-${id}`);
          await expect(t).toBeVisible();
          await expect(t).toHaveAttribute("aria-expanded", "false");
          // The name is not cut: its text box is as wide as its content.
          const cut = await t.locator("span").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
          expect(cut, `${locale} ${id} label is cut at ${width}px`).toBe(false);
        }
        expect(await headerOverflow(page), "header overflow").toEqual([]);
      });
    }

    test("keyboard: Enter on an intent, Enter on its first destination — two actions", async ({ page }) => {
      await page.goto("/en/pricing");
      const toggle = page.getByTestId("intent-toggle-workers");
      await toggle.focus();
      await page.keyboard.press("Enter"); // action 1
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByTestId("intent-menu-panel")).toBeVisible();
      for (const id of INTENTS) {
        await expect(page.getByTestId(`intent-column-${id}`)).toBeVisible();
      }
      await expect(page.getByTestId("intent-column-workers")).toHaveAttribute("data-active", "true");
      const first = page.getByTestId("intent-link-workers-companyNeed");
      await expect(first).toBeFocused();
      const [response] = await Promise.all([
        page.waitForNavigation(),
        page.keyboard.press("Enter"), // action 2
      ]);
      expect(response?.status() ?? 200).toBeLessThan(400);
      await expect(page).toHaveURL(/\/company-need$/);
      await expect(page.getByTestId("intent-menu-panel")).toHaveCount(0);
    });

    test("Escape closes the panel and returns focus to the intent that opened it", async ({ page }) => {
      await page.goto("/en/pricing");
      const toggle = page.getByTestId("intent-toggle-work");
      await toggle.click();
      await expect(page.getByTestId("intent-link-work-jobs")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("intent-menu-panel")).toHaveCount(0);
      await expect(toggle).toBeFocused();
    });

    test("every intent reaches each of its destinations in two actions", async ({ page }) => {
      await page.goto("/en/pricing");
      for (const id of INTENTS) {
        await page.getByTestId(`intent-toggle-${id}`).click(); // action 1
        const links = page.getByTestId(`intent-column-${id}`).locator("a");
        expect(await links.count()).toBeGreaterThan(0);
        for (const link of await links.all()) {
          await expect(link).toBeVisible(); // action 2 would be this click
        }
        await page.keyboard.press("Escape");
      }
    });

    test("More holds the older links: pricing and about are two actions away", async ({ page }) => {
      await page.goto("/en");
      const more = page.getByTestId("intent-toggle-more");
      await more.focus();
      await page.keyboard.press("Enter");
      const links = page.getByTestId("intent-more-links");
      await expect(links.locator("a").first()).toBeFocused();
      await expect(links.locator("a[href$='/pricing']")).toBeVisible();
      await expect(links.locator("a[href$='/about']")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(more).toBeFocused();
    });

    test("the assistant input is in the header; asking carries the words to the conversation home", async ({ page }) => {
      await page.goto("/en/pricing");
      const ask = page.getByTestId("header-ask");
      await expect(ask).toBeVisible();
      // One assistant entry, not two: the bar has no second link beside it.
      await expect(page.getByTestId("intent-bar-assistant")).toHaveCount(0);
      await expect(page.getByTestId("bottom-ask")).toBeHidden();
      expect(await headerOverflow(page), "header overflow with the input").toEqual([]);
      const field = ask.getByRole("textbox");
      expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
      await field.fill("I need two welders in Kaunas");
      await field.press("Enter");
      await page.waitForURL(/say(=|%3D)/, { timeout: 60_000 });
      // Signed in: the conversation home with the sentence. Signed out: the
      // sign-in page carrying the same destination. Either way the words travel.
      expect(decodeURIComponent(decodeURIComponent(page.url())).replace(/\+/g, " ")).toContain(
        "say=I need two welders in Kaunas",
      );
    });
  });
}

for (const width of [320, 375, 768] as const) {
  test.describe(`mobile menu @${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("the hamburger carries the six intents and their links", async ({ page }) => {
      await page.goto("/lt/pricing");
      await expect(page.getByTestId("intent-bar")).toBeHidden();

      await page.getByTestId("mobile-nav-toggle").click();
      await expect(page.getByTestId("mobile-nav-intents")).toBeVisible();
      await expect(page.getByTestId("mobile-nav-assistant")).toBeVisible();
      expect(await headerOverflow(page), "open header overflow").toEqual([]);

      for (const id of INTENTS) {
        const t = page.getByTestId(`mobile-intent-toggle-${id}`);
        await expect(t).toBeVisible();
        const box = await t.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
      }

      const work = page.getByTestId("mobile-intent-toggle-work");
      await work.click();
      await expect(work).toHaveAttribute("aria-expanded", "true");
      const jobs = page.getByTestId("mobile-intent-link-work-jobs");
      await expect(jobs).toBeVisible();
      expect((await jobs.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
      expect(await headerOverflow(page), "expanded header overflow").toEqual([]);

      await jobs.click();
      await expect(page).toHaveURL(/\/lt\/jobs/);
      await expect(page.getByTestId("mobile-nav-menu")).toHaveCount(0);
    });

    test("Escape closes the panel and returns focus", async ({ page }) => {
      await page.goto("/lt/pricing");
      const toggle = page.getByTestId("mobile-nav-toggle");
      await toggle.click();
      await page.getByTestId("mobile-intent-toggle-services").focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByTestId("mobile-intent-link-services-myServices"),
      ).toHaveAttribute("href", /\/dashboard\/services$/);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("mobile-nav-menu")).toHaveCount(0);
      await expect(toggle).toBeFocused();
    });
  });
}

test.describe("signed-out visitor follows an account link", () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  // Independent review of e251185 (P3): the one account link with a query.
  test("Set up your agency → login keeps the whole destination, query included", async ({ page }) => {
    await page.goto("/en/pricing");
    await page.getByTestId("intent-toggle-agencies").click();
    await page.getByTestId("intent-link-agencies-setUpAgency").click();
    await page.waitForURL(/\/(auth\/login|dashboard\/start\/company)/);
    // The login redirect is the middleware's, and it needs the auth backend.
    // A server started without one (no Supabase environment) lets the request
    // through, which proves nothing either way — so say so instead of passing.
    test.skip(
      !/\/auth\/login/.test(page.url()),
      "No auth backend in this environment: the signed-out redirect cannot be exercised. Run against the local stack or a deployed build.",
    );
    await expect(page).toHaveURL(/\/en\/auth\/login\?next=/);
    const next = new URL(page.url()).searchParams.get("next") ?? "";
    expect(next).toContain("/dashboard/start/company");
    expect(next).toContain("type=staffing_agency");
  });
});

test.describe("phone header", () => {
  for (const width of [360, 375] as const) {
    // Lithuanian (the default), German and Polish: the longest Sign in labels.
    for (const locale of ["lt", "pl"] as const) {
      test(`${locale} @${width}px: whole logo, language, Sign in and the menu, nothing clipped`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width, height: 740 },
          hasTouch: true,
          isMobile: true,
        });
        const page = await context.newPage();
        await page.goto(`/${locale}`);
        expect(await headerOverflow(page), "header overflow").toEqual([]);
        // The wordmark is whole: visible and not cut.
        const word = page.locator("header a span").first();
        await expect(word).toBeVisible();
        expect(await word.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
        await expect(page.getByTestId("header-auth").locator("a[href*='/auth/login']")).toBeVisible();
        await expect(page.getByTestId("header-auth").locator("a[href*='/auth/signup']")).toBeHidden();
        await expect(page.getByTestId("mobile-nav-toggle")).toBeVisible();
        // The goals start within the first ~300px of the screen.
        const rail = (await page.getByTestId("goal-rail").boundingBox())!;
        expect(rail.y, "goal rail top").toBeLessThan(300);
        // Sign up and the theme toggle are the first row of the menu.
        await page.getByTestId("mobile-nav-toggle").tap();
        const auth = page.getByTestId("mobile-nav-auth");
        await expect(auth.locator("a[href*='/auth/signup']")).toBeVisible();
        await expect(auth.getByTestId("menu-theme-toggle")).toBeVisible();
        await context.close();
      });
    }
  }
});

for (const width of [320, 375, 768] as const) {
  test.describe(`assistant bar @${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test("inner page: the bar is at the bottom, inside the screen, and leaves while a field has focus", async ({ page }) => {
      await page.goto("/en/company-need");
      const bar = page.getByTestId("bottom-ask");
      await expect(bar).toBeVisible();
      await expect(page.getByTestId("header-ask")).toBeHidden();
      const box = (await bar.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
      expect(Math.round(box.y + box.height)).toBe(800);
      expect((await bar.getByRole("textbox").boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
      expect((await bar.getByRole("button").boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        "page scrolls sideways",
      ).toBeLessThanOrEqual(1);

      // A field of the page's own form takes focus: the bar gets out of the way.
      // A text field (a radio or a checkbox opens no keyboard and leaves the bar).
      const own = page
        .locator('main textarea, main input[type="text"], main input[type="email"], main input[type="number"], main input:not([type])')
        // Not the hidden spam-trap field.
        .locator("visible=true")
        .first();
      await own.focus();
      await expect(bar).toBeHidden();
      await own.blur();
      await expect(bar).toBeVisible();
      // Its own field does not hide it.
      await bar.getByRole("textbox").focus();
      await expect(bar).toBeVisible();
    });

    test("the bar never covers the end of the page", async ({ page }) => {
      await page.goto("/en/pricing");
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const barTop = (await page.getByTestId("bottom-ask").boundingBox())!.y;
      const lastLink = page.locator("footer a").last();
      const link = (await lastLink.boundingBox())!;
      expect(link.y + link.height, "last footer link is above the bar").toBeLessThanOrEqual(barTop + 0.5);
    });

    test("the landing has its own sentence field and no assistant bar", async ({ page }) => {
      await page.goto("/en");
      await expect(page.getByTestId("bottom-ask")).toHaveCount(0);
      await expect(page.getByTestId("header-ask")).toHaveCount(0);
    });
  });
}
