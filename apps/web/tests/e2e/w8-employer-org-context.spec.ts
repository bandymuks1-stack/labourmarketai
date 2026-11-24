/**
 * W8 SLICE 1 — EMPLOYER ORGANIZATION CONTEXT TRUTH: browser proof.
 *
 * The W8 audit's P0-1 was that switching workspaces changed the chip and
 * nothing else. This spec proves the opposite against REAL rows on the local
 * stack: the active workspace decides whether employer data is served at all,
 * and a workspace that is not acting for a company gets an honest state
 * instead of somebody else's demands.
 *
 * Fixture (local Supabase, `supabase/dev-fixtures.sql` + the slice-1 proof rows):
 *   - employer A `dev.company@local.test` OWNS org "Dev Construction"
 *     (companies.cccccccc-…0001) and has DEMAND-A;
 *   - employer A is ALSO an active MANAGER of "Beta Montage" — a real second
 *     workspace whose company he does not own;
 *   - employer B `dev.company2@local.test` OWNS "Beta Montage"
 *     (companies.cccccccc-…0002) and has DEMAND-B.
 *
 * A single owner cannot hold two company-BOUND organizations today
 * (`companies_profile_id_key` is 1:1 per profile), so the two-context proof
 * deliberately uses two accounts plus a cross-org manager membership rather
 * than claiming a multi-company owner already works. That limitation is a W9
 * owner decision, not something this spec pretends away.
 *
 * Skips cleanly unless `E2E_W8_LOCAL=1` — it needs the seeded local stack.
 */
import { test, expect, type Page } from "@playwright/test";

test.skip(
  process.env.E2E_W8_LOCAL !== "1",
  "Needs the seeded local stack (E2E_W8_LOCAL=1).",
);

const A_EMAIL = "dev.company@local.test";
const B_EMAIL = "dev.company2@local.test";
const PASSWORD = "password";

const ORG_A = "Dev Construction";
const ORG_B = "Beta Montage";
const DEMAND_A = "DEMAND-A Alpha roofers";
const DEMAND_B = "DEMAND-B Beta welders";
/** Employer B's demand id — used for the cross-context deep-link probe. */
const DEMAND_B_ID = "11111111-0000-0000-0000-00000000000b";

const SCOUTING = "/en/dashboard/company/scouting";

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/en/auth/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

async function signOut(page: Page): Promise<void> {
  await page.goto("/en/auth/logout");
  await page.waitForURL(/\/(en|lt)(\/|$)/, { timeout: 60_000 });
}

/** Pick a workspace through the ONE canonical chip. */
async function switchWorkspace(page: Page, label: string): Promise<void> {
  const chip = page.getByTestId("workspace-chip");
  await expect(chip).toBeVisible();
  await chip.getByRole("button").first().click();
  const menu = page.getByTestId("workspace-chip-menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: label, exact: false }).click();
  await expect(menu).toBeHidden({ timeout: 30_000 });
  await expect(chip).toContainText(label, { timeout: 30_000 });
}

/**
 * Make `label` the active workspace, whatever it currently is.
 *
 * `switchActiveOrganization` writes BOTH the httpOnly session cookie AND the
 * durable `profiles.active_organization_id` pointer, so a workspace chosen by
 * one test is still active for the next one even in a fresh browser context —
 * the pointer lives on the account, which is exactly the cross-session
 * behaviour the product promises. Each test therefore states its own starting
 * workspace instead of assuming a default.
 */
async function ensureWorkspace(page: Page, label: string): Promise<void> {
  const chip = page.getByTestId("workspace-chip");
  await expect(chip).toBeVisible({ timeout: 60_000 });
  if ((await chip.innerText()).includes(label)) return;
  await switchWorkspace(page, label);
}

/** The scouting main region (the layout also renders a chrome <main>). */
function scoutingMain(page: Page) {
  return page.locator("main").filter({ hasText: "Scouting" }).last();
}

test.describe("the chip is where the employer works", () => {
  test("the FULL chrome shows the active workspace, on desktop and at 375px", async ({
    page,
  }) => {
    await signIn(page, A_EMAIL);
    await page.goto(SCOUTING);
    await ensureWorkspace(page, ORG_A);

    // The audit's finding: this surface had no organization indicator at all.
    const chip = page.getByTestId("workspace-chip");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(ORG_A);

    // Exactly ONE workspace control — never a second switcher.
    await expect(page.getByTestId("workspace-chip")).toHaveCount(1);

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(ORG_A);
    // It truncates rather than pushing the header controls off screen.
    const box = await chip.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(375);

    // Keyboard + screen reader: the trigger is a real button with an
    // accessible name and an expanded state.
    await page.setViewportSize({ width: 1280, height: 900 });
    const trigger = chip.getByRole("button").first();
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("workspace-chip-menu")).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

test.describe("the active workspace decides which employer data exists", () => {
  test("workspace A serves A's demand; workspace B serves neither", async ({ page }) => {
    await signIn(page, A_EMAIL);
    await page.goto(SCOUTING);
    await ensureWorkspace(page, ORG_A);
    await page.goto(SCOUTING);

    // ── Workspace A: the owner's own company → the real surface.
    await expect(scoutingMain(page)).toContainText(DEMAND_A);
    await expect(scoutingMain(page)).not.toContainText(DEMAND_B);
    await expect(page.getByTestId("employer-context-notice")).toHaveCount(0);

    // ── Switch to the organization A only MANAGES.
    await switchWorkspace(page, ORG_B);
    await page.goto(SCOUTING);

    const notice = page.getByTestId("employer-context-notice");
    await expect(notice).toBeVisible();
    // Fail-closed with the honest reason — manager collaboration is not W8-1.
    await expect(notice).toHaveAttribute("data-reason", "company-not-owned");
    await expect(notice).toContainText(ORG_B);
    // THE ASSERTION THAT WAS FALSE BEFORE THIS SLICE: A's demand does not
    // follow A into another workspace…
    await expect(page.locator("body")).not.toContainText(DEMAND_A);
    // …and B's demand is not served either.
    await expect(page.locator("body")).not.toContainText(DEMAND_B);

    // A deep link naming employer B's request cannot resolve from here.
    await page.goto(`${SCOUTING}?request=${DEMAND_B_ID}`);
    await expect(page.getByTestId("employer-context-notice")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(DEMAND_B);

    // Survives a reload: the pointer is a server-side cookie, not client state.
    await page.reload();
    await expect(page.getByTestId("workspace-chip")).toContainText(ORG_B);
    await expect(page.getByTestId("employer-context-notice")).toBeVisible();

    // ── Back to A: the data returns. The switch is real in both directions.
    await switchWorkspace(page, ORG_A);
    await page.goto(SCOUTING);
    await expect(scoutingMain(page)).toContainText(DEMAND_A);
    await expect(page.getByTestId("employer-context-notice")).toHaveCount(0);
  });

  test.afterEach(async ({ page }) => {
    // Leave the account on its own company so the durable pointer never
    // becomes a hidden dependency between tests.
    await page.goto(SCOUTING).catch(() => {});
    await ensureWorkspace(page, ORG_A).catch(() => {});
  });

  /**
   * DUAL-IDENTITY ACCOUNT REQUIRED, and that is a finding rather than a test
   * convenience. Employer A holds `worker` + `company` in the proof fixture —
   * the product's documented "one account, two identities" case. A
   * COMPANY-ONLY account cannot reach the personal workspace at all today:
   * `clearActiveOrganization` nulls the pointer, but with no worker role to
   * switch to the identity stays `company`, and `resolveActiveWorkspaceId`
   * then falls back to the first organization — so the chip snaps straight
   * back. That is a pre-existing defect in the workspace layer (a control that
   * looks like it works and does not), discovered by this slice and recorded
   * for W9; it is NOT introduced here and is deliberately not fixed here.
   */
  test("the personal workspace serves no employer data", async ({ page }) => {
    await signIn(page, A_EMAIL);
    await page.goto(SCOUTING);
    await ensureWorkspace(page, ORG_A);
    await page.goto(SCOUTING);
    await expect(scoutingMain(page)).toContainText(DEMAND_A);

    await switchWorkspace(page, "Personal space");
    await page.goto(SCOUTING);

    const notice = page.getByTestId("employer-context-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute("data-reason", "personal-workspace");
    await expect(page.locator("body")).not.toContainText(DEMAND_A);
    // No raw DB text ever reaches the person.
    await expect(page.locator("body")).not.toContainText(/42P01|42703|PGRST/);
  });

  test("a deep link to another employer's demand stays empty for the wrong owner", async ({
    page,
  }) => {
    // Employer A, correctly inside his OWN company workspace, hand-typing
    // employer B's request id. RLS already refused this; the point here is
    // that the fix did not weaken it, and that the answer is "not found"
    // rather than any of B's content.
    await signIn(page, A_EMAIL);
    await page.goto(SCOUTING);
    await ensureWorkspace(page, ORG_A);
    await page.goto(`${SCOUTING}?request=${DEMAND_B_ID}`);
    await expect(page.locator("body")).not.toContainText(DEMAND_B);
  });
});

test.describe("two accounts, two answers", () => {
  test("employer B sees only B's demand", async ({ page }) => {
    await signIn(page, B_EMAIL);
    await page.goto(SCOUTING);
    await expect(page.getByTestId("workspace-chip")).toContainText(ORG_B);
    await expect(scoutingMain(page)).toContainText(DEMAND_B);
    await expect(scoutingMain(page)).not.toContainText(DEMAND_A);
    await expect(page.getByTestId("employer-context-notice")).toHaveCount(0);
    await signOut(page);
  });
});
