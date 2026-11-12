import { expect as baseExpect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * FIRST-VISITOR WALK of the public landing (owner priority 2026-11-12).
 *
 * Counts NAVIGATION ACTIONS from the landing to the start of each top public
 * task and fails above two. It proves reachability and click count only —
 * whether a real first-time visitor understands the choices within five
 * seconds is NOT something this spec can show; that needs people.
 *
 * 360px and 1440px. Screenshots of each state are written to
 * docs/audits/evidence/premium-nav/ for the reviewer.
 */

const expect = baseExpect.configure({ timeout: 15_000 });
const SHOTS = join(process.cwd(), "..", "..", "docs", "audits", "evidence", "premium-nav");
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

/** Top public tasks per role: the landing card (1 action) and where it lands. */
const TASKS = [
  { role: "worker", intent: "work", url: /\/jobs$/ },
  { role: "employer", intent: "workers", url: /\/company-need$/ },
  // Signed-out, a signed-in destination answers with the login page that
  // carries the destination in ?next= — the start of the function for a guest.
  { role: "company-b2b", intent: "services", url: /\/(dashboard\/services|auth\/login\?next=.*dashboard(%2F|\/)services)/ },
  { role: "agency", intent: "agencies", url: /\/for-agencies$/ },
] as const;

for (const viewport of [
  { name: "360", width: 360, height: 740 },
  { name: "1440", width: 1440, height: 900 },
] as const) {
  test.describe(`landing @${viewport.name}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("the six choices are on the page and inside the viewport width", async ({ page }) => {
      await page.goto("/en");
      const choice = page.getByTestId("landing-intent-choice");
      await expect(choice).toBeVisible();
      await expect(choice.locator("a")).toHaveCount(6);
      for (const card of await choice.locator("a").all()) {
        const box = (await card.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(-0.5);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
        expect(box.height).toBeGreaterThanOrEqual(43.5);
      }
      await page.screenshot({ path: join(SHOTS, `landing-${viewport.name}.png`) });
    });

    for (const task of TASKS) {
      test(`${task.role}: start of the top task in <= 2 actions`, async ({ page }) => {
        await page.goto("/en");
        let actions = 0;
        await page.getByTestId(`landing-intent-${task.intent}`).click();
        actions += 1;
        await expect(page).toHaveURL(task.url);
        expect(actions).toBeLessThanOrEqual(2);
      });
    }

    test("menu state for the reviewer", async ({ page }) => {
      await page.goto("/en/pricing");
      if (viewport.width < 1024) {
        await page.getByTestId("mobile-nav-toggle").click();
        await expect(page.getByTestId("mobile-nav-intents")).toBeVisible();
      } else {
        await page.getByTestId("intent-toggle-work").click();
        await expect(page.getByTestId("intent-menu-panel")).toBeVisible();
      }
      await page.screenshot({ path: join(SHOTS, `menu-${viewport.name}.png`) });
    });
  });
}
