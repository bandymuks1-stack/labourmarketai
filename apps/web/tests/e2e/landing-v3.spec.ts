import { expect as baseExpect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * LANDING V3 — the approved structure, walked in all six languages
 * (owner-approved 2026-11-13).
 *
 * For every routed locale, at a phone and a desktop width, in both themes:
 * the first screen, the buyer's goal (the fourth) opened, "Offer services"
 * opened (it now also holds the order-finding areas), and a request form
 * opened through the buyer goal's action. Each state is asserted and then
 * captured to `docs/audits/evidence/landing-v3/final/`.
 *
 * Read-only: nothing is submitted. Runs signed-out against any build.
 */
const expect = baseExpect.configure({ timeout: 20_000 });
const SHOTS = join(process.cwd(), "..", "..", "docs", "audits", "evidence", "landing-v3", "final");
const LOCALES = ["lt", "en", "ru", "pl", "de", "nl"] as const;
const SIZES = [
  { name: "375", width: 375, height: 740, phone: true },
  { name: "1440", width: 1440, height: 900, phone: false },
] as const;
const THEMES = ["light", "dark"] as const;

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Card texts that are cut short (clamped) inside one rail. */
const cutTexts = (page: Page, testId: string) =>
  page.getByTestId(testId).locator("a[data-rail-card] span").evaluateAll((spans) =>
    spans
      .filter((el) => el.children.length === 0 && el.scrollHeight > el.clientHeight + 1)
      .map((el) => el.textContent ?? ""),
  );

/** Wait until the navigator's script is attached, so a tap is taken by it. */
const alive = (page: Page) =>
  page.getByTestId("goal-rail").locator("a[data-rail-card]").first().evaluate(
    (el) =>
      new Promise<void>((done) => {
        const ready = () => Object.keys(el).some((k) => k.startsWith("__reactProps$"));
        const wait = () => (ready() ? done() : requestAnimationFrame(wait));
        wait();
      }),
  );

for (const locale of LOCALES) {
  for (const size of SIZES) {
    for (const theme of THEMES) {
      const tag = `${locale}-${size.name}${theme === "dark" ? "-dark" : ""}`;

      test(`${tag}: first screen, buyer goal, services, request form`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width: size.width, height: size.height },
          colorScheme: theme,
          isMobile: size.phone,
          hasTouch: size.phone,
          reducedMotion: "reduce",
        });
        await context.addInitScript((value) => {
          try {
            window.localStorage.setItem("theme", value);
          } catch {
            /* storage may be unavailable; the colour scheme still applies */
          }
        }, theme);
        const page = await context.newPage();
        const press = (testId: string, cardId: string) => {
          const el = page.getByTestId(testId).locator(`[data-card-id="${cardId}"]`);
          return size.phone ? el.tap() : el.click();
        };

        // ── 1. The first screen ────────────────────────────────────────────
        await page.goto(`/${locale}`);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByTestId("goal-lead")).toBeVisible();
        const rail = page.getByTestId("goal-rail");
        const shown = size.phone ? ["work", "workers", "services", "contractors"] : ["work", "workers", "services", "contractors", "partners", "agencies"];
        for (const id of shown) {
          const box = (await rail.locator(`[data-card-id="${id}"]`).boundingBox())!;
          expect(box.x, `${id} starts on screen`).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width, `${id} ends on screen`).toBeLessThanOrEqual(size.width + 0.5);
          expect(box.y + box.height, `${id} is on the first screen`).toBeLessThan(size.height);
        }
        if (size.phone) {
          await expect(page.getByTestId("goal-more-choices").locator("summary")).toBeVisible();
          await expect(rail.locator('[data-card-id="partners"]')).toBeHidden();
        } else {
          // The request services are visible with no tap on a wide screen.
          await expect(page.getByTestId("request-door-b2b-open")).toBeVisible();
        }
        // One of each block, in the approved order.
        const tops: number[] = [];
        for (const id of ["goal-navigator", "public-entry", "landing-need-path", "landing-market-facts", "landing-how", "site-footer-compact"]) {
          await expect(page.getByTestId(id)).toHaveCount(1);
          tops.push((await page.getByTestId(id).evaluate((el) => el.getBoundingClientRect().top + window.scrollY)));
        }
        const [nav, entry, need, market, how, footer] = tops as [number, number, number, number, number, number];
        expect(nav).toBeLessThan(entry);
        expect(Math.min(entry, need)).toBeLessThan(market);
        expect(market).toBeLessThan(how);
        expect(how).toBeLessThan(footer);
        // Nothing of the removed sections, no chips, no numbers in the box.
        for (const gone of ["entry-example", "entry-numbers", "landing-close", "landing-first-facts"]) {
          await expect(page.getByTestId(gone)).toHaveCount(0);
        }
        expect(await overflow(page), "the page scrolls sideways").toBeLessThanOrEqual(1);
        expect(await cutTexts(page, "goal-rail"), "a goal card text is cut").toEqual([]);
        // The example in the field is whole (the owner saw it cut on a phone).
        const example = await page.getByTestId("entry-input").evaluate((el) => {
          const field = el as HTMLInputElement;
          const own = getComputedStyle(field);
          const shown = getComputedStyle(field, "::placeholder");
          const canvas = document.createElement("canvas").getContext("2d")!;
          canvas.font = `${shown.fontWeight} ${shown.fontSize} ${own.fontFamily}`;
          const room = field.clientWidth - parseFloat(own.paddingLeft) - parseFloat(own.paddingRight);
          return { text: field.placeholder, width: canvas.measureText(field.placeholder).width, room };
        });
        expect(example.text.length).toBeGreaterThan(0);
        expect(example.width, `"${example.text}" is wider than the field`).toBeLessThanOrEqual(example.room);
        await alive(page);
        await page.screenshot({ path: join(SHOTS, `${tag}-1-first-screen.png`) });
        await page.screenshot({ path: join(SHOTS, `${tag}-0-full-page.png`), fullPage: true });

        // ── 2. The buyer's goal (the fourth) ───────────────────────────────
        await press("goal-rail", "contractors");
        const panel = page.getByTestId("goal-panel");
        await expect(panel).toHaveAttribute("data-goal", "contractors");
        const actions = page.getByTestId("function-rail").locator("a[data-rail-card]");
        await expect(actions).toHaveCount(2);
        await expect(actions.nth(0)).toHaveAttribute("href", "#request=b2b");
        await expect(actions.nth(1)).toHaveAttribute("href", "#request=project");
        expect(await overflow(page)).toBeLessThanOrEqual(1);
        expect(await cutTexts(page, "function-rail"), "an action text is cut").toEqual([]);
        await panel.scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(SHOTS, `${tag}-2-goal-contractors.png`) });

        // ── 3. "Offer services" holds four actions now ─────────────────────
        await press("goal-rail", "services");
        await expect(panel).toHaveAttribute("data-goal", "services");
        const serviceActions = page.getByTestId("function-rail").locator("a[data-rail-card]");
        await expect(serviceActions).toHaveCount(4);
        for (const [index, path] of ["/dashboard/services", "/dashboard/service-requests", "/dashboard/listings", "/dashboard/commercial"].entries()) {
          await expect(serviceActions.nth(index)).toHaveAttribute("href", new RegExp(`/${locale}${path}$`));
        }
        expect(await overflow(page)).toBeLessThanOrEqual(1);
        expect(await cutTexts(page, "function-rail"), "an action text is cut").toEqual([]);
        await panel.scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(SHOTS, `${tag}-3-goal-services.png`) });

        // ── 4. A request form opened through the buyer goal's action ───────
        await press("goal-rail", "contractors");
        await press("function-rail", "b2bEnquiry");
        await expect(page).toHaveURL(new RegExp(`/${locale}#request=b2b$`));
        const form = page.getByTestId("request-door-panel");
        await expect(form).toBeVisible();
        await expect(form).toHaveAttribute("data-door", "b2b");
        await expect(page.getByTestId("landing-need-path")).toHaveAttribute("open", "");
        await expect(page.getByTestId("request-door-form")).toBeInViewport();
        expect(await overflow(page)).toBeLessThanOrEqual(1);
        await page.waitForTimeout(400); // the scroll to the form settles
        await page.screenshot({ path: join(SHOTS, `${tag}-4-request-form.png`) });

        await context.close();
      });
    }
  }
}
