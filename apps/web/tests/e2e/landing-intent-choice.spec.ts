import { expect as baseExpect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * FIRST-VISITOR WALK of the goal navigator (owner-approved structure
 * 2026-11-12): six goals in one rail, one active panel.
 *
 * Phones run with TOUCH emulation and use taps and a real swipe gesture;
 * the desktop width uses the keyboard. Each walk COUNTS navigation actions
 * from the home screen to the start of a top task and fails above two (goal,
 * function). It proves reachability, action count, history and layout.
 * Whether a first-time visitor understands the choices within five seconds
 * is NOT something this spec can show — that needs people.
 *
 * Screenshots of each state go to docs/audits/evidence/premium-nav/.
 */

const expect = baseExpect.configure({ timeout: 20_000 });
const SHOTS = join(process.cwd(), "..", "..", "docs", "audits", "evidence", "premium-nav");
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

const TASKS = [
  { role: "worker", goal: "work", fn: "jobs", url: /\/jobs$/ },
  { role: "employer", goal: "workers", fn: "companyNeed", url: /\/company-need$/ },
  // Signed-out, a signed-in function answers with the login page carrying the
  // destination — the visitor signs in only when opening the function.
  { role: "company-b2b", goal: "services", fn: "myServices", url: /dashboard(%2F|\/)services/ },
  { role: "agency", goal: "agencies", fn: "forAgencies", url: /\/for-agencies$/ },
] as const;

/** A card of a rail, and a named part of a rail (track, hint, prev, next). */
const card = (page: Page, rail: string, id: string) =>
  page.getByTestId(rail).locator(`[data-card-id="${id}"]`);
const part = (page: Page, rail: string, name: string) =>
  page.getByTestId(rail).locator(`[data-rail-part="${name}"]`);

/** The Next.js development indicator (a round button, bottom left) exists
 *  only under `next dev`; hide it so the evidence shows product UI only. */
async function hideDevTools(page: Page): Promise<void> {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

async function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.body.scrollWidth - window.innerWidth);
}

for (const vp of [
  { name: "320", width: 320, height: 640, touch: true },
  { name: "360", width: 360, height: 740, touch: true },
  { name: "375", width: 375, height: 812, touch: true },
  { name: "390", width: 390, height: 844, touch: true },
  { name: "768", width: 768, height: 1024, touch: true },
  { name: "1440", width: 1440, height: 900, touch: false },
] as const) {
  test.describe(`home @${vp.name}px`, () => {
    test.use({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
      isMobile: vp.width < 700,
    });

    const press = async (page: Page, target: string | Locator) => {
      const el = typeof target === "string" ? page.getByTestId(target) : target;
      if (vp.touch) await el.tap();
      else {
        await el.focus();
        await page.keyboard.press("Enter");
      }
    };

    test("the six goals are on the first screen; nothing chosen means no panel", async ({ page }) => {
      await page.goto("/en");
      const rail = page.getByTestId("goal-rail");
      await expect(rail).toBeVisible();
      await expect(rail.locator("a")).toHaveCount(6);
      const first = (await card(page, "goal-rail", "work").boundingBox())!;
      expect(first.y + first.height, "first goal card is above the fold").toBeLessThan(vp.height);
      expect(first.height, "comfortable to tap").toBeGreaterThanOrEqual(44);
      expect(first.width).toBeGreaterThanOrEqual(88);
      await expect(page.getByTestId("goal-panel")).toHaveCount(0);
      expect(await sidewaysOverflow(page), "page scrolls sideways").toBeLessThanOrEqual(1);
      if (vp.width < 700) {
        // Three whole cards and part of a fourth; the hint says there is more.
        const fourth = (await card(page, "goal-rail", "orders").boundingBox())!;
        expect(fourth.x).toBeLessThan(vp.width);
        expect(fourth.x + fourth.width).toBeGreaterThan(vp.width - 16);
        await expect(part(page, "goal-rail", "hint")).toBeVisible();
      }
      if (vp.width >= 1440) {
        // Wide: all six in one row, no arrows.
        const last = (await card(page, "goal-rail", "agencies").boundingBox())!;
        expect(last.x + last.width).toBeLessThanOrEqual(vp.width);
        await expect(part(page, "goal-rail", "next")).toHaveCount(0);
      }
      if (vp.width < 640) {
        // Phone: the header has room for Sign in only, so Sign up is an
        // action on the first screen (and first in the menu).
        const signUp = page.getByTestId("landing-signup").getByRole("link");
        await expect(signUp).toBeVisible();
        await expect(signUp).toHaveAttribute("href", /\/auth\/signup$/);
        const box = (await signUp.boundingBox())!;
        expect(box.y + box.height, "Sign up is above the fold").toBeLessThan(vp.height);
        expect(box.height).toBeGreaterThanOrEqual(43.5);
      } else {
        await expect(page.getByTestId("landing-signup")).toBeHidden();
        await expect(page.getByTestId("header-auth").getByRole("link", { name: "Sign up" })).toBeVisible();
      }
      if (vp.width >= 1024) {
        // The goals appear ONCE on the landing: as cards. The header bar keeps
        // More and the assistant only.
        await expect(page.getByTestId("intent-bar")).toBeVisible();
        await expect(page.getByTestId("intent-bar").getByRole("button")).toHaveCount(1);
        await expect(page.getByTestId("intent-toggle-more")).toBeVisible();
        await expect(page.getByTestId("intent-bar-assistant")).toBeVisible();
        await page.getByTestId("intent-toggle-more").click();
        await expect(page.getByTestId("intent-more-links").getByRole("link").first()).toBeVisible();
        await page.keyboard.press("Escape");
        // No sparse second row: More and the assistant sit in the header's
        // first row, level with the logo.
        const logo = (await page.locator("header a").first().boundingBox())!;
        const more = (await page.getByTestId("intent-toggle-more").boundingBox())!;
        expect(Math.abs(more.y + more.height / 2 - (logo.y + logo.height / 2))).toBeLessThan(12);
        // Leave no focus ring in the evidence image.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      }
      await hideDevTools(page);
      await page.screenshot({ path: join(SHOTS, `home-${vp.name}.png`) });
    });

    for (const task of TASKS) {
      test(`${task.role}: start of the top task in <= 2 actions; Back closes the panel`, async ({ page }) => {
        await page.goto("/en");
        let actions = 0;

        // Bringing a card into view (swipe / scroll) is not a navigation action.
        await card(page, "goal-rail", task.goal).scrollIntoViewIfNeeded();
        const railScroll = () =>
          part(page, "goal-rail", "track").evaluate((el) => el.scrollLeft);
        // Let scroll-snap settle before reading the position.
        await page.waitForTimeout(500);
        const before = await railScroll();
        await press(page, card(page, "goal-rail", task.goal));
        actions += 1;

        const panel = page.getByTestId("goal-panel");
        await expect(panel).toBeVisible();
        await expect(panel).toHaveAttribute("data-goal", task.goal);
        await expect(page).toHaveURL(new RegExp(`/en#goal=${task.goal}$`));
        await expect(card(page, "goal-rail", task.goal)).toHaveAttribute("aria-current", "true");
        // Choosing a goal does not reset the rail's position.
        expect(Math.abs((await railScroll()) - before)).toBeLessThanOrEqual(2);
        expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(1);
        if (task.role === "worker") {
          await hideDevTools(page);
          await page.screenshot({ path: join(SHOTS, `goal-${vp.name}.png`) });
        }

        // Back closes the panel and returns to the choice.
        await page.goBack();
        await expect(page.getByTestId("goal-panel")).toHaveCount(0);
        await expect(page).toHaveURL(/\/en$/);
        await page.goForward();
        await expect(page.getByTestId("goal-panel")).toBeVisible();

        await card(page, "function-rail", task.fn).scrollIntoViewIfNeeded();
        await press(page, card(page, "function-rail", task.fn));
        actions += 1;
        await expect(page).toHaveURL(task.url);
        expect(actions).toBeLessThanOrEqual(2);
      });
    }

    test("professions: switch, filter by sector, full list, a card opens the filtered board", async ({ page }) => {
      await page.goto("/en");
      await press(page, card(page, "goal-rail", "work"));
      await press(page, "goal-tab-professions");
      await expect(page.getByTestId("function-rail")).toHaveCount(0);
      const box = page.getByTestId("profession-box");
      await expect(box).toBeVisible();
      await hideDevTools(page);
      await page.screenshot({ path: join(SHOTS, `professions-${vp.name}.png`) });

      const allCount = await page.getByTestId("profession-rail").locator("a").count();
      expect(allCount).toBeGreaterThanOrEqual(40);
      await press(page, "sector-chip-hospitality_food");
      const some = await page.getByTestId("profession-rail").locator("a").count();
      expect(some).toBeGreaterThan(0);
      expect(some).toBeLessThan(allCount);

      await press(page, "profession-full-list");
      await expect(page.getByTestId("profession-rail")).toHaveCount(0);
      await expect(page.getByTestId("profession-list").locator("a")).toHaveCount(some);
      await press(page, "profession-full-list");

      const firstProfession = page.getByTestId("profession-rail").locator("a").first();
      await expect(firstProfession).toHaveAttribute("href", /\/en\/jobs\?profession=[a-z_]+$/);
      if (vp.touch) await firstProfession.tap();
      else await firstProfession.click();
      await expect(page).toHaveURL(/\/en\/jobs\?profession=[a-z_]+/);
    });

    test("Close returns to all goals; a goal with no catalogue has no switch", async ({ page }) => {
      await page.goto("/en");
      await card(page, "goal-rail", "partners").scrollIntoViewIfNeeded();
      await press(page, card(page, "goal-rail", "partners"));
      await expect(page.getByTestId("goal-panel")).toBeVisible();
      await expect(page.getByTestId("goal-tab-professions")).toHaveCount(0);
      await press(page, "goal-panel-close");
      await expect(page.getByTestId("goal-panel")).toHaveCount(0);
      await expect(page).toHaveURL(/\/en$/);
    });

    test("a shared goal link opens the same view with the panel open", async ({ page }) => {
      await page.goto("/en#goal=orders");
      await expect(page.getByTestId("goal-panel")).toHaveAttribute("data-goal", "orders");
      await expect(card(page, "goal-rail", "orders")).toHaveAttribute("aria-current", "true");
      await press(page, "goal-panel-close");
      await expect(page.getByTestId("goal-panel")).toHaveCount(0);
      await expect(page).toHaveURL(/\/en$/);
    });
  });
}

test.describe("Close never leaves the page it was opened on", () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  // Codex P2 on c1caca4: two goals, Back, Close went back past the landing.
  test("jobs → home → work → workers → Back → Close stays on home", async ({ page }) => {
    await page.goto("/en/pricing");
    await page.goto("/en");
    await page.getByTestId("goal-rail").locator('[data-card-id="work"]').click();
    await page.getByTestId("goal-rail").locator('[data-card-id="workers"]').click();
    await expect(page.getByTestId("goal-panel")).toHaveAttribute("data-goal", "workers");
    await page.goBack();
    await expect(page.getByTestId("goal-panel")).toHaveAttribute("data-goal", "work");
    await page.getByTestId("goal-panel-close").click();
    await expect(page.getByTestId("goal-panel")).toHaveCount(0);
    await expect(page).toHaveURL(/\/en$/);
    // And once more through Forward: still the same page.
    await page.goForward();
    await expect(page.getByTestId("goal-panel")).toHaveAttribute("data-goal", "work");
    await page.goForward();
    await expect(page.getByTestId("goal-panel")).toHaveAttribute("data-goal", "workers");
    await page.getByTestId("goal-panel-close").click();
    await expect(page.getByTestId("goal-panel")).toHaveCount(0);
    await expect(page).toHaveURL(/\/en$/);
  });
});

test.describe("Close after arriving on a shared goal link", () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  // Codex P2 on ecd546d: shared link, another goal, Close left the first goal open.
  test("shared #goal=work → workers → Close: no panel, still on the page, one click", async ({ page }) => {
    await page.goto("/en#goal=work");
    await expect(page.getByTestId("goal-panel")).toHaveAttribute("data-goal", "work");
    await page.getByTestId("goal-rail").locator('[data-card-id="workers"]').click();
    await expect(page.getByTestId("goal-panel")).toHaveAttribute("data-goal", "workers");
    await page.getByTestId("goal-panel-close").click();
    await expect(page.getByTestId("goal-panel")).toHaveCount(0);
    await expect(page).toHaveURL(/\/en$/);
  });
});

test.describe("swipe", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
  test("a sideways swipe moves the goal rail and the page stays put", async ({ page }) => {
    await page.goto("/en");
    const track = part(page, "goal-rail", "track");
    const box = (await track.boundingBox())!;
    // A real finger: touchstart, a run of touchmoves to the left, touchend.
    const client = await page.context().newCDPSession(page);
    const y = Math.round(box.y + box.height / 2);
    const startX = Math.round(box.x + box.width - 40);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: startX, y }],
    });
    for (let step = 1; step <= 12; step++) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: startX - step * 20, y }],
      });
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50);
    expect(await page.evaluate(() => window.scrollX)).toBe(0);
  });
});

test("an unknown goal in the address opens nothing", async ({ page }) => {
  await page.goto("/en#goal=nothing");
  await expect(page.getByTestId("goal-rail")).toBeVisible();
  await expect(page.getByTestId("goal-panel")).toHaveCount(0);
});

// Evidence only: the same screen in the dark theme, and the phone menu.
for (const vp of [
  { name: "360", width: 360, height: 740 },
  { name: "1440", width: 1440, height: 900 },
] as const) {
  test(`evidence: an open goal in the dark theme @${vp.name}px`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.width < 1000,
      isMobile: vp.width < 700,
    });
    await context.addInitScript(() => {
      try {
        localStorage.setItem("theme", "dark");
      } catch {
        /* storage blocked: the page keeps its default theme */
      }
    });
    const page = await context.newPage();
    await page.goto("/en#goal=work");
    await expect(page.getByTestId("goal-panel")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await hideDevTools(page);
    await page.screenshot({ path: join(SHOTS, `goal-${vp.name}-dark.png`) });
    await context.close();
  });
}

test("evidence: the phone menu @360px", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 740 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("/en");
  await page.getByTestId("mobile-nav-toggle").tap();
  await expect(page.getByTestId("mobile-nav-menu")).toBeVisible();
  await hideDevTools(page);
  await page.screenshot({ path: join(SHOTS, "menu-360.png") });
  await context.close();
});
