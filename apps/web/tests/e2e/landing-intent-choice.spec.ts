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

    // One rail on every width (owner P0 2026-11-23, CAROUSEL_NAVIGATION_SPEC
    // N1): on a phone the six goals are one swipeable row, the next card
    // peeking — no "More options" part.
    const phone = vp.width < 640;
    /** The card of a goal as this screen shows it. Scrolling it into view is
     *  not a navigation action, so `opened` is always false. */
    const goalCard = async (page: Page, id: string): Promise<{ card: Locator; opened: boolean }> => ({
      card: card(page, "goal-rail", id),
      opened: false,
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
      if (phone) {
        // Phones: ONE rail with all six goals. The first card is whole on the
        // first screen; the rail overflows, so the next card peeks at the
        // right edge and the swipe hint shows. The page never scrolls
        // sideways, and there is no "More options" part.
        const firstBox = (await card(page, "goal-rail", "work").boundingBox())!;
        expect(firstBox.x, "work starts inside the screen").toBeGreaterThanOrEqual(0);
        expect(firstBox.x + firstBox.width, "work ends inside the screen").toBeLessThanOrEqual(vp.width + 0.5);
        const track = (await part(page, "goal-rail", "track").boundingBox())!;
        let peeking = 0;
        for (const id of ["work", "workers", "services", "contractors", "partners", "agencies"]) {
          const box = (await card(page, "goal-rail", id).boundingBox())!;
          expect(box.y + box.height, `${id} sits in the one row above the fold`).toBeLessThan(vp.height);
          expect(box.height, `${id} is a comfortable target`).toBeGreaterThanOrEqual(44);
          if (box.x < track.x + track.width - 8 && box.x + box.width > track.x + track.width + 2) peeking += 1;
        }
        expect(peeking, "one card peeks at the right edge").toBe(1);
        await expect(part(page, "goal-rail", "hint")).toBeVisible();
        await expect(page.getByTestId("goal-more-choices")).toHaveCount(0);
      } else {
        await expect(page.getByTestId("goal-more-choices")).toHaveCount(0);
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
        // Whole on the first screen from 360px up — the assertion this walk
        // always made. On the narrowest phone (320×640) the first-visit
        // cookie notice and the approved V3 lead leave less room: the button
        // must then be reached within 60px of the fold.
        if (vp.width >= 360) {
          expect(box.y + box.height, "Sign up is above the fold").toBeLessThan(vp.height);
        } else {
          expect(box.y + box.height, "Sign up is within 60px of the fold").toBeLessThan(vp.height + 60);
        }
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

        // Bringing a card into view (scroll) is not a navigation action.
        const target = await goalCard(page, task.goal);
        if (target.opened) actions += 1;
        await target.card.scrollIntoViewIfNeeded();
        const railScroll = () =>
          part(page, "goal-rail", "track").evaluate((el) => el.scrollLeft);
        // Let scroll-snap settle before reading the position.
        await page.waitForTimeout(500);
        const before = await railScroll();
        await press(page, target.card);
        actions += 1;

        const panel = page.getByTestId("goal-panel");
        await expect(panel).toBeVisible();
        await expect(panel).toHaveAttribute("data-goal", task.goal);
        await expect(page).toHaveURL(new RegExp(`/en#goal=${task.goal}$`));
        await expect(target.card).toHaveAttribute("aria-current", "true");
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
        // Two actions; three on a phone for a goal that lives under "More
        // options" (the owner's choice: four goals first, no carousel).
        expect(actions).toBeLessThanOrEqual(target.opened ? 3 : 2);
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

      // Level 3 is a rail on every width (owner P0 2026-11-23); the full
      // list stays one tap away above.
      const firstProfession = page.getByTestId("profession-rail").locator("a").first();
      await expect(firstProfession).toHaveAttribute("href", /\/en\/jobs\?profession=[a-z_]+$/);
      if (vp.touch) await firstProfession.tap();
      else await firstProfession.click();
      await expect(page).toHaveURL(/\/en\/jobs\?profession=[a-z_]+/);
    });

    test("Close returns to all goals; a goal with no catalogue has no switch", async ({ page }) => {
      await page.goto("/en");
      const partners = (await goalCard(page, "partners")).card;
      await partners.scrollIntoViewIfNeeded();
      await press(page, partners);
      await expect(page.getByTestId("goal-panel")).toBeVisible();
      await expect(page.getByTestId("goal-tab-professions")).toHaveCount(0);
      await press(page, "goal-panel-close");
      await expect(page.getByTestId("goal-panel")).toHaveCount(0);
      await expect(page).toHaveURL(/\/en$/);
    });

    test("a shared goal link opens the same view with the panel open", async ({ page }) => {
      await page.goto("/en#goal=contractors");
      await expect(page.getByTestId("goal-panel")).toHaveAttribute("data-goal", "contractors");
      await expect(card(page, "goal-rail", "contractors")).toHaveAttribute("aria-current", "true");
      await press(page, "goal-panel-close");
      await expect(page.getByTestId("goal-panel")).toHaveCount(0);
      await expect(page).toHaveURL(/\/en$/);
    });

    test("an old link to the retired goal opens the goal that now holds its areas", async ({ page }) => {
      // `#goal=orders` was the provider's "Find orders" until V3 (owner
      // decision D1): its two areas moved into "Offer services".
      await page.goto("/en#goal=orders");
      const panel = page.getByTestId("goal-panel");
      await expect(panel).toHaveAttribute("data-goal", "services");
      await expect(card(page, "goal-rail", "services")).toHaveAttribute("aria-current", "true");
      for (const id of ["myServices", "serviceRequests", "marketListings", "commercial"]) {
        await expect(card(page, "function-rail", id)).toBeVisible();
      }
    });

    test("the buyer's goal opens the matching request form, with no account", async ({ page }) => {
      for (const [fn, door] of [["b2bEnquiry", "b2b"], ["projectEnquiry", "project"]] as const) {
        await page.goto("/en");
        await press(page, card(page, "goal-rail", "contractors"));
        const action = card(page, "function-rail", fn);
        await expect(action).toHaveAttribute("href", `#request=${door}`);
        await press(page, action);
        await expect(page).toHaveURL(new RegExp(`/en#request=${door}$`));
        const need = page.getByTestId("landing-need-path");
        await expect(need).toHaveAttribute("open", "");
        const formPanel = page.getByTestId("request-door-panel");
        await expect(formPanel).toBeVisible();
        await expect(formPanel).toHaveAttribute("data-door", door);
        await expect(page.getByTestId("request-door-form")).toBeInViewport();
        expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(1);
      }
    });

    test("a link from another page opens the request form on arrival", async ({ page }) => {
      await page.goto("/en#request=project");
      await expect(page.getByTestId("request-door-panel")).toHaveAttribute("data-door", "project");
      await expect(page.getByTestId("landing-need-path")).toHaveAttribute("open", "");
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

test.describe("one rail per level on a phone", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
  test("goals, an open goal's actions and professions are rails; the page never scrolls sideways", async ({ page }) => {
    // Owner P0 2026-11-23 (CAROUSEL_NAVIGATION_SPEC N1): every level is a
    // card rail on a phone too. A rail that overflows shows the swipe hint
    // and lets the next card peek; the page itself never scrolls sideways.
    await page.goto("/en#goal=work");
    await expect(page.getByTestId("goal-panel")).toBeVisible();
    for (const rail of ["goal-rail", "function-rail"]) {
      const track = part(page, rail, "track");
      const overflow = await track.evaluate((el) => el.scrollWidth - el.clientWidth);
      if (overflow > 1) await expect(part(page, rail, "hint")).toBeVisible();
      else await expect(part(page, rail, "hint")).toHaveCount(0);
      const first = (await track.locator("a[data-rail-card]").first().boundingBox())!;
      expect(first.x, `${rail}: the first card starts inside the screen`).toBeGreaterThanOrEqual(0);
    }
    expect(
      await part(page, "goal-rail", "track").evaluate((el) => el.scrollWidth - el.clientWidth),
      "six goals do not fit a phone: the goal rail scrolls",
    ).toBeGreaterThan(1);
    await page.getByTestId("goal-tab-professions").tap();
    await expect(page.getByTestId("profession-rail")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
});

// A tablet shows the goals in one row that scrolls sideways under a finger;
// the real touch swipe is exercised here.
test.describe("swipe on a tablet", () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true });
  test("a sideways swipe moves the goal rail and the page stays put", async ({ page }) => {
    await page.goto("/en");
    const track = part(page, "goal-rail", "track");
    await expect(track).toBeVisible();
    expect(
      await track.evaluate((el) => el.scrollWidth - el.clientWidth),
      "the goal rail has something to scroll at this width",
    ).toBeGreaterThan(50);
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

test("a goal chosen before the page finished starting still opens", async ({ page }) => {
  // The goal cards are real links: a tap before the scripts attach sets the
  // fragment natively, and the router then rewrites the address without it.
  // The choice must survive that.
  await page.goto("/en");
  await page.getByTestId("goal-rail").waitFor();
  await page.goto("/en#goal=workers"); // at once: the page is still starting
  const panel = page.getByTestId("goal-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-goal", "workers");
  await expect(page).toHaveURL(/\/en#goal=workers$/, { timeout: 10_000 });
  // …and it does not come back after the person closes it.
  await page.getByTestId("goal-panel-close").click();
  await expect(panel).toHaveCount(0);
  await page.waitForTimeout(3000);
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/en$/);
});

// THE FIRST TAP NEEDS NO SCRIPT. On a slow phone connection the page is
// painted seconds before its scripts are alive; a goal tapped in that time
// must open at once. Proven the strict way: with scripts switched off.
test.describe("with scripts switched off", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });

  test("tapping a goal opens its panel with its functions, and Close closes it", async ({ page }) => {
    await page.goto("/en");
    const early = page.getByTestId("goal-panel-early").locator("visible=true");
    await expect(early).toHaveCount(0);
    await page.getByTestId("goal-rail").locator('[data-card-id="workers"]').tap();
    await expect(page).toHaveURL(/\/en#goal=workers$/);
    await expect(early).toHaveCount(1);
    await expect(early).toHaveAttribute("data-goal", "workers");
    await expect(early.getByTestId("function-rail-early").locator("a").first()).toBeVisible();
    // The page did not jump away from the goal cards.
    await expect(page.getByTestId("goal-rail")).toBeInViewport();
    // Another goal replaces it; never two at once.
    await page.getByTestId("goal-rail").locator('[data-card-id="work"]').tap();
    await expect(early).toHaveCount(1);
    await expect(early).toHaveAttribute("data-goal", "work");
    await early.getByTestId("goal-panel-early-close").tap();
    await expect(early).toHaveCount(0);
  });

  test("a shared goal link shows its panel in the first paint", async ({ page }) => {
    await page.goto("/en#goal=services");
    const early = page.getByTestId("goal-panel-early").locator("visible=true");
    await expect(early).toHaveCount(1);
    await expect(early).toHaveAttribute("data-goal", "services");
  });

  test("a function inside the panel is a real link", async ({ page }) => {
    await page.goto("/en#goal=work");
    const first = page.getByTestId("goal-panel-early").locator("visible=true").getByTestId("function-rail-early").locator("a").first();
    const href = await first.getAttribute("href");
    expect(href).toBeTruthy();
    await first.tap();
    await expect(page).not.toHaveURL(/#goal=/);
  });
});

test("when the scripts are alive there is exactly one panel, the live one", async ({ page }) => {
  await page.goto("/en#goal=work");
  await expect(page.getByTestId("goal-panel")).toBeVisible();
  await expect(page.getByTestId("goal-panel-early")).toHaveCount(0);
  await page.getByTestId("goal-panel-close").click();
  await expect(page.getByTestId("goal-panel")).toHaveCount(0);
  await expect(page.getByTestId("goal-panel-early")).toHaveCount(0);
});

test.describe("coming back to the landing", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("a goal left open is not reopened after visiting another page", async ({ page }) => {
    await page.goto("/en");
    await page.getByTestId("goal-rail").locator('[data-card-id="workers"]').click();
    await expect(page.getByTestId("goal-panel")).toBeVisible();
    // An in-app link away (More → Pricing), then the logo back home.
    await page.getByTestId("intent-toggle-more").click();
    await page.getByTestId("intent-more-links").getByRole("link", { name: "Pricing" }).click();
    await expect(page).toHaveURL(/\/en\/pricing$/);
    await page.locator("header a").first().click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByTestId("goal-rail")).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("goal-panel")).toHaveCount(0);
    await expect(page).toHaveURL(/\/en$/);
  });
});

// Evidence only: the same screens in the dark theme at every checked width,
// and the phone menu.
for (const vp of [
  { name: "320", width: 320, height: 640 },
  { name: "360", width: 360, height: 740 },
  { name: "375", width: 375, height: 812 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const) {
  test(`evidence: the landing and an open goal in the dark theme @${vp.name}px`, async ({ browser }) => {
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
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByTestId("goal-rail")).toBeVisible();
    expect(await sidewaysOverflow(page), "page scrolls sideways (dark)").toBeLessThanOrEqual(1);
    await hideDevTools(page);
    await page.screenshot({ path: join(SHOTS, `home-${vp.name}-dark.png`) });
    await page.goto("/en#goal=work");
    await expect(page.getByTestId("goal-panel")).toBeVisible();
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
