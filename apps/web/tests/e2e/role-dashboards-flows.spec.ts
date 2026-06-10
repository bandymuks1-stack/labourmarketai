/**
 * Local credentialed smoke for feat/cc/pilot-role-dashboards.
 *
 * The test session user (sukysdonatas@gmail.com) holds all four
 * user-facing roles (worker / company / agency / customer), so all
 * three new role-context routes are reachable without role-switching.
 *
 * Captures one screenshot per dashboard for evidence:
 *   01-company-dashboard.png
 *   02-agency-dashboard.png
 *   03-buyer-dashboard.png
 *
 * Asserts the structural invariants the guards encode (testid
 * presence, pilot disclaimer, first-action card, link to
 * /dashboard/profile) at the rendered-DOM level.
 */
import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const STORAGE_STATE = join(__dirname, ".storage-state.json");
const SCREENSHOT_DIR = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "runtime",
  "review-evidence",
  "labourmarketai",
  "pilot-role-dashboards",
  "screenshots",
);

test.skip(
  !existsSync(STORAGE_STATE),
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
);

test.use({ storageState: STORAGE_STATE });

mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: true,
  });
}

const cases = [
  {
    label: "company",
    path: "/lt/dashboard/company",
    expectHeading: /Įmonės pilotinis skydas/i,
    testid: "company-dashboard",
    screenshot: "01-company-dashboard",
  },
  {
    label: "agency",
    path: "/lt/dashboard/agency",
    expectHeading: /Agentūros pilotinis skydas/i,
    testid: "agency-dashboard",
    screenshot: "02-agency-dashboard",
  },
  {
    label: "buyer",
    path: "/lt/dashboard/buyer",
    expectHeading: /Pirkėjo pilotinis skydas/i,
    testid: "buyer-dashboard",
    screenshot: "03-buyer-dashboard",
  },
];

for (const { label, path, expectHeading, testid, screenshot } of cases) {
  test(`${label} role dashboard renders with pilot disclaimer + first-action`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));

    await expect(
      page.getByRole("heading", { name: expectHeading, level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId(testid)).toBeVisible();
    await expect(page.getByTestId(`${testid}-pilot-disclaimer`)).toBeVisible();
    await expect(page.getByTestId(`${testid}-first-action`)).toBeVisible();
    await expect(page.getByTestId(`${testid}-profile-link`)).toBeVisible();

    // The profile link points back at the universal capability surface.
    const href = await page.getByTestId(`${testid}-profile-link`).getAttribute("href");
    expect(href).toMatch(/\/lt\/dashboard\/profile/);

    // Honesty: the visible rendered text never carries fake verified
    // copy on these pilot dashboards.
    const visibleText = (await page.locator("body").innerText()).replace(
      /\s+/g,
      " ",
    );
    expect(visibleText).not.toMatch(/(^|\s)Patvirtinta(\s|$|[.,])/);
    expect(visibleText).not.toMatch(/(^|\s)Verified(\s|$|[.,])/);
    expect(visibleText).not.toMatch(/(^|\s)Confirmed(\s|$|[.,])/);

    await shot(page, screenshot);
  });
}
