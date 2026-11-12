import { expect as baseExpect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * FIRST-VISITOR WALK of the public home (owner concept 2026-11-12: one
 * navigation system, three levels).
 *
 * Counts NAVIGATION ACTIONS from the home screen to the start of each top
 * public task and fails above two: goal card (1) → function card (2). It
 * proves reachability, click count, history and layout. Whether a real
 * first-time visitor understands the choices within five seconds is NOT
 * something this spec can show — that needs people.
 *
 * 360, 375, 768 and 1440px. Screenshots of each state are written to
 * docs/audits/evidence/premium-nav/ for the reviewer.
 */

const expect = baseExpect.configure({ timeout: 20_000 });
const SHOTS = join(process.cwd(), "..", "..", "docs", "audits", "evidence", "premium-nav");
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

/** Top public task per role: goal → function → where the function starts. */
const TASKS = [
  { role: "worker", goal: "work", fn: "jobs", url: /\/jobs$/ },
  { role: "employer", goal: "workers", fn: "companyNeed", url: /\/company-need$/ },
  // Signed-out, a signed-in function answers with the login page carrying the
  // destination in ?next= — the guest signs in only when opening the function.
  { role: "company-b2b", goal: "services", fn: "myServices", url: /dashboard(%2F|\/)services/ },
  { role: "agency", goal: "agencies", fn: "forAgencies", url: /\/for-agencies$/ },
] as const;

for (const viewport of [
  { name: "360", width: 360, height: 740 },
  { name: "375", width: 375, height: 812 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const) {
  test.describe(`home @${viewport.name}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("level 1: the goal rail is on the first screen and inside the viewport", async ({ page }) => {
      await page.goto("/en");
      const rail = page.getByTestId("goal-rail");
      await expect(rail).toBeVisible();
      const first = page.getByTestId("goal-card-work");
      await expect(first).toBeVisible();
      const box = (await first.boundingBox())!;
      // The first goal card starts above the fold, consent banner showing.
      expect(box.y, "first goal card top").toBeLessThan(viewport.height);
      const railBox = (await rail.boundingBox())!;
      expect(railBox.x).toBeGreaterThanOrEqual(-0.5);
      expect(railBox.x + railBox.width).toBeLessThanOrEqual(viewport.width + 0.5);
      await page.screenshot({ path: join(SHOTS, `home-${viewport.name}.png`) });
    });

    test("every goal is reachable from the keyboard", async ({ page }) => {
      await page.goto("/en");
      await page.getByTestId("goal-card-work").focus();
      for (const id of ["workers", "services", "orders", "partners", "agencies"]) {
        await page.keyboard.press("ArrowRight");
        await expect(page.getByTestId(`goal-card-${id}`)).toBeFocused();
      }
    });

    for (const task of TASKS) {
      test(`${task.role}: start of the top task in <= 2 actions, and Back returns`, async ({ page }) => {
        await page.goto("/en");
        let actions = 0;

        // The goal may be past the visible window on a phone: moving the rail
        // (swipe / arrow keys) is not a navigation action.
        const goal = page.getByTestId(`goal-card-${task.goal}`);
        await goal.focus();
        await page.keyboard.press("Enter");
        actions += 1;
        await expect(page).toHaveURL(new RegExp(`/start/${task.goal}$`));
        await expect(page.getByTestId("goal-function-rail")).toBeVisible();
        // The active goal is marked in the level-1 rail on this view.
        await expect(page.getByTestId(`goal-card-${task.goal}`)).toHaveAttribute("aria-current", "page");
        if (task.role === "worker") {
          await page.screenshot({ path: join(SHOTS, `goal-work-${viewport.name}.png`) });
        }

        const fn = page.getByTestId(`goal-function-${task.fn}`);
        await fn.focus();
        await page.keyboard.press("Enter");
        actions += 1;
        await expect(page).toHaveURL(task.url);
        expect(actions).toBeLessThanOrEqual(2);

        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`/start/${task.goal}$`));
      });
    }

    test("level 3: search and view-all sit beside the profession rail", async ({ page }) => {
      await page.goto("/en/start/work");
      await expect(page.getByTestId("profession-carousel")).toBeVisible();
      await expect(page.getByTestId("goal-view-all")).toHaveAttribute("href", /\/en\/jobs$/);
      await page.locator("#goal-q").fill("welder");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/en\/jobs\?(q=welder|profession=welder)/);
    });

    test("the way back is named", async ({ page }) => {
      await page.goto("/en/start/orders");
      await page.getByTestId("goal-back").click();
      await expect(page).toHaveURL(/\/en$/);
    });
  });
}

test("an unknown goal is a 404, not an empty view", async ({ request }) => {
  const response = await request.get("/en/start/nothing");
  expect(response.status()).toBe(404);
});
