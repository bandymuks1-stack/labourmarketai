/**
 * Local credentialed smoke for feat/cc/pilot-role-dashboards.
 *
 * The test session user holds all four user-facing roles
 * (worker / company / agency / customer), so every role-context route is
 * reachable without role-switching.
 *
 * Captures one screenshot per role context for evidence:
 *   01-company-dashboard.png
 *   02-agency-dashboard.png
 *   03-buyer-dashboard.png
 *
 * Asserts the structural invariants the guards encode (testid
 * presence, pilot disclaimer, first-action card, link to
 * /dashboard/profile) at the rendered-DOM level — on the surfaces that carry
 * them today (see the note above the tests).
 */
import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import lt from "../../messages/lt.json";

const STORAGE_STATE = join(__dirname, ".storage-state.json");
/** The company/agency contexts are role-gated on the HELD company role. The
 *  generic file's identity is whatever the last mint chose (measured
 *  2026-10-23: dev.worker → `?notice=needs_company_role`), so they pin the
 *  company-actor session exactly as demand-flow.spec.ts does. The buyer room
 *  stays on the generic session: it needs the `customer` role, which no local
 *  dev fixture holds — mint it for a user that does. */
const COMPANY_STATE = join(__dirname, ".storage-state.company.json");
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

/**
 * WHERE EACH ROLE CONTEXT LIVES NOW. The three "pilot role dashboards" (#53)
 * were deliberately dissolved, not lost:
 *   - #164 removed the "pilotinis skydas" framing from product UI (§18), so the
 *     headings are the plain role titles from `roleDashboards.*.title`;
 *   - #908 (W1) retired /dashboard/agency — a permanent redirect to the company
 *     page, the one organization space;
 *   - #1746 split /dashboard/company into doors: the first action lives on the
 *     Needs door, the disclaimer + profile link on Settings (the disclaimer
 *     inside its "More tools" fold, opened by the page's own #settings-more
 *     deep link).
 * The invariants are unchanged — testid presence, the honest disclaimer, a
 * first action, the link back to /dashboard/profile, and no fake "verified"
 * copy — each asserted on the surface that now carries it.
 */
const company = lt.roleDashboards.company;
const buyer = lt.roleDashboards.buyer;

async function assertNoFakeVerifiedCopy(page: Page): Promise<void> {
  // Honesty: the visible rendered text never carries fake verified copy.
  const visibleText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(visibleText).not.toMatch(/(^|\s)Patvirtinta(\s|$|[.,])/);
  expect(visibleText).not.toMatch(/(^|\s)Verified(\s|$|[.,])/);
  expect(visibleText).not.toMatch(/(^|\s)Confirmed(\s|$|[.,])/);
}

async function assertProfileLink(page: Page, testid: string): Promise<void> {
  const link = page.getByTestId(testid);
  await expect(link).toBeVisible();
  // The profile link points back at the universal capability surface.
  expect(await link.getAttribute("href")).toMatch(/\/lt\/dashboard\/profile/);
}

test.describe("organization role contexts (company session)", () => {
  test.skip(
    !existsSync(COMPANY_STATE),
    `Storage state ${COMPANY_STATE} missing — mint it with E2E_OWNER_EMAIL=dev.company@local.test E2E_STORAGE_FILE=.storage-state.company.json.`,
  );
  test.use({ storageState: COMPANY_STATE });

  test("company role context: home, first action on Needs, disclaimer + profile link on Settings", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/lt/dashboard/company", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/lt\/dashboard\/company/);
    await expect(page.getByRole("heading", { name: company.title, level: 1 })).toBeVisible();
    await expect(page.getByTestId("company-dashboard")).toBeVisible();
    await assertNoFakeVerifiedCopy(page);
    await shot(page, "01-company-dashboard");

    await page.goto("/lt/dashboard/company/needs", { waitUntil: "networkidle" });
    await expect(page.getByTestId("company-dashboard-first-action")).toBeVisible();
    await assertNoFakeVerifiedCopy(page);

    await page.goto("/lt/dashboard/company/settings#settings-more", { waitUntil: "networkidle" });
    await expect(page.getByTestId("company-settings")).toBeVisible();
    await expect(page.getByTestId("company-dashboard-pilot-disclaimer")).toBeVisible();
    await assertProfileLink(page, "company-dashboard-profile-link");
    // No blanket "no Patvirtinta" scan HERE: Settings is the surface that shows
    // the organization's REAL verification state ("Patvirtinta — … suteikiama
    // tik po realios patikros" for a company an admin verified), so the word is
    // a fact on this page, not fake copy. The scan keeps guarding the home and
    // Needs doors above, which carry the old dashboard's content.
  });

  test("agency role context: the retired /dashboard/agency lands on the company space", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto("/lt/dashboard/agency", { waitUntil: "networkidle" });
    // #908: a permanent canonical redirect, locale preserved — never a 404.
    await expect(page).toHaveURL(/\/lt\/dashboard\/company(?:[/?#]|$)/);
    await expect(page.getByTestId("company-dashboard")).toBeVisible();
    await assertNoFakeVerifiedCopy(page);
    await shot(page, "02-agency-dashboard");
  });
});

test("buyer role dashboard renders with disclaimer + first-action", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/lt/dashboard/buyer", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/lt\/dashboard\/buyer/);
  await expect(page.getByRole("heading", { name: buyer.title, level: 1 })).toBeVisible();
  await expect(page.getByTestId("buyer-dashboard")).toBeVisible();
  await expect(page.getByTestId("buyer-dashboard-pilot-disclaimer")).toBeVisible();
  await expect(page.getByTestId("buyer-dashboard-first-action")).toBeVisible();
  await assertProfileLink(page, "buyer-dashboard-profile-link");
  await assertNoFakeVerifiedCopy(page);
  await shot(page, "03-buyer-dashboard");
});
