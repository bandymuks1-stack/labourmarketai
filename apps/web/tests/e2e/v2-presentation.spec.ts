import { expect as baseExpect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * V2 PRESENTATION FIXES — evidence and the checks that go with it
 * (owner P0 2026-11-13).
 *
 * The same file produces the BEFORE and the AFTER images: run it against a
 * build of the previous head with `V2_PHASE=before`, and against this branch
 * with `V2_PHASE=after` (the default). Screens: the landing, an inner page
 * (pricing) and sign-in, at 375 and 1440px, light and dark. The assertions run
 * in the `after` phase only.
 */

const expect = baseExpect.configure({ timeout: 20_000 });
const PHASE = process.env.V2_PHASE === "before" ? "before" : "after";
const SHOTS = join(process.cwd(), "..", "..", "docs", "audits", "evidence", "v2-presentation", PHASE);
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

async function settle(page: Page) {
  // The Next.js development indicator exists only under `next dev`.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

const SCREENS = [
  { name: "landing", path: "/en" },
  { name: "pricing", path: "/en/pricing" },
  { name: "sign-in", path: "/en/auth/login" },
] as const;

for (const vp of [
  { name: "375", width: 375, height: 740 },
  { name: "1440", width: 1440, height: 900 },
] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const screen of SCREENS) {
      test(`evidence (${PHASE}): ${screen.name} @${vp.name}px, ${theme}`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          hasTouch: vp.width < 1000,
          isMobile: vp.width < 700,
        });
        await context.addInitScript((t) => {
          try {
            localStorage.setItem("theme", t);
          } catch {
            /* storage blocked: the page keeps its default theme */
          }
        }, theme);
        const page = await context.newPage();
        await page.goto(screen.path);
        await expect(page.locator("h1").first()).toBeVisible();
        await settle(page);
        await page.screenshot({
          path: join(SHOTS, `${screen.name}-${vp.name}${theme === "dark" ? "-dark" : ""}.png`),
        });
        if (screen.name === "landing") {
          await page.screenshot({
            path: join(SHOTS, `landing-full-${vp.name}${theme === "dark" ? "-dark" : ""}.png`),
            fullPage: true,
          });
        }
        await context.close();
      });
    }
  }
}

test.describe("the landing's first screen says who, how much and how", () => {
  test.skip(PHASE === "before", "assertions describe the new head");

  test("phone 375×740: all six goals, sign up and the three facts start on the first screen", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 740 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto("/en");
    const rail = page.getByTestId("goal-rail");
    await expect(rail.locator("[data-card-id]")).toHaveCount(6);
    const boxes = await rail.locator("[data-card-id]").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, bottom: r.bottom };
      }),
    );
    for (const b of boxes) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(375.5);
      expect(b.bottom, "every goal card is above the fold").toBeLessThan(740);
    }
    const signUp = (await page.getByTestId("landing-signup").getByRole("link").boundingBox())!;
    expect(signUp.y + signUp.height, "Sign up is above the fold").toBeLessThan(740);
    const facts = page.getByTestId("landing-first-facts");
    await expect(facts.locator("[data-fact]")).toHaveCount(3);
    expect((await facts.boundingBox())!.y, "the facts start on the first screen").toBeLessThan(740);
    await expect(facts).toContainText("every profession and sector");
    await expect(facts).toContainText("free for people");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(1);
    await context.close();
  });

  test("desktop 1440: the sentence field and ONE closed request block share a row; the doors are one click away", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en");
    const entry = (await page.getByTestId("public-entry").boundingBox())!;
    const block = page.getByTestId("landing-request-block");
    const blockBox = (await block.boundingBox())!;
    // Side by side: the right half is no longer empty.
    expect(blockBox.x).toBeGreaterThan(entry.x + entry.width - 1);
    expect(Math.abs(blockBox.y - entry.y)).toBeLessThan(40);
    // Closed at rest: no three cards that read like the goals again.
    await expect(page.getByTestId("request-door-worker-search-open")).toBeHidden();
    await expect(page.getByTestId("entry-example")).toHaveCount(2);
    await expect(page.getByTestId("entry-more-examples")).toHaveCount(0);
    await block.locator("summary").click();
    await expect(page.getByTestId("request-door-worker-search-open").first()).toBeVisible();
  });

  test("the example is not a construction one", async ({ page }) => {
    await page.goto("/en");
    const placeholder = await page.getByTestId("entry-input").getAttribute("placeholder");
    expect(placeholder ?? "").not.toMatch(/scaffold/i);
    await page.getByTestId("entry-example").first().click();
    await expect(page.getByTestId("entry-understanding")).toBeVisible();
    await expect(page.getByTestId("entry-input")).not.toHaveValue(/scaffold/i);
  });

  test("education institutions have a door behind More", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en");
    await page.getByTestId("intent-toggle-more").click();
    const door = page
      .getByTestId("intent-more-links")
      .getByRole("link", { name: "For schools and training providers" });
    await expect(door).toBeVisible();
    await expect(door).toHaveAttribute("href", /\/dashboard\/start\/company\?capability=training_provider$/);
  });
});

test.describe("inner pages and sign-in on the V2 scale", () => {
  test.skip(PHASE === "before", "assertions describe the new head");

  test("the inner-page headline is one step above the landing's, not a 60px hero; no live dot", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en/pricing");
    const size = await page.locator("main h1").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeLessThanOrEqual(40);
    expect(size).toBeGreaterThanOrEqual(30);
    await expect(page.locator("main section").first().locator(".live-dot")).toHaveCount(0);
  });

  test("a sign-in field shows focus with a ring, not only a border colour", async ({ page }) => {
    await page.goto("/en/auth/login");
    const email = page.locator('input[name="email"]');
    await email.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    const shadow = await email.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow, "a focus ring is drawn").not.toBe("none");
  });
});
