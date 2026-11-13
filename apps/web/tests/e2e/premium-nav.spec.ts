import { expect as baseExpect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

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
      // The key is pressed once the menu's script is attached: a key pressed
      // in the moment between the page loading and that is not taken (seen
      // on a production build, about one run in nine).
      await more.evaluate(
        (el) =>
          new Promise<void>((done) => {
            const alive = () => Object.keys(el).some((k) => k.startsWith("__reactProps$"));
            const wait = () => (alive() ? done() : requestAnimationFrame(wait));
            wait();
          }),
      );
      await more.focus();
      await page.keyboard.press("Enter");
      const links = page.getByTestId("intent-more-links");
      await expect(links.locator("a").first()).toBeFocused();
      await expect(links.locator("a[href$='/pricing']")).toBeVisible();
      await expect(links.locator("a[href$='/about']")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(more).toBeFocused();
    });

    test("the assistant entry is in the bar and points at the conversation home", async ({ page }) => {
      await page.goto("/en/pricing");
      await expect(page.getByTestId("intent-bar-assistant")).toHaveAttribute("href", /\/en\/dashboard$/);
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

// Evidence: an inner page's header at every checked width, light and dark.
const INNER_SHOTS = join(process.cwd(), "..", "..", "docs", "audits", "evidence", "premium-nav");
for (const vp of [
  { name: "320", width: 320, height: 640 },
  { name: "375", width: 375, height: 812 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`evidence: inner page header @${vp.name}px, ${theme}`, async ({ browser }) => {
      mkdirSync(INNER_SHOTS, { recursive: true });
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      await context.addInitScript((t) => {
        try {
          localStorage.setItem("theme", t);
        } catch {
          /* storage blocked: the page keeps its default theme */
        }
      }, theme);
      const page = await context.newPage();
      await page.goto("/en/pricing");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(await headerOverflow(page), `header overflow @${vp.name} ${theme}`).toEqual([]);
      if (vp.width >= 1024) await expect(page.getByTestId("intent-bar")).toBeVisible();
      else await expect(page.getByTestId("mobile-nav-toggle")).toBeVisible();
      // The Next.js development indicator exists only under `next dev`.
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      await page.screenshot({
        path: join(INNER_SHOTS, `inner-${vp.name}${theme === "dark" ? "-dark" : ""}.png`),
      });
      await context.close();
    });
  }
}
