import { test, expect, type Page } from "@playwright/test";

/**
 * D-20 — AN EXPLICIT "PERSONAL" CHOICE MUST SURVIVE NAVIGATION AND RELOAD.
 *
 * THE DEFECT. "I chose personal" and "I have never chosen" were the same stored
 * state. `clearActiveOrganization` DELETED the session cookie, and both
 * resolvers flattened an explicit personal pointer to `null` immediately before
 * resolution — where the single-organization default handed the person straight
 * back to their organization. For a company identity with exactly ONE
 * organization (the ordinary employer account) selecting the personal space was
 * undone on the very next page load, so an employer could not stay in their own
 * worker space to fill their own Work Journal.
 *
 * WHY A BROWSER TEST AND NOT ONLY UNIT CASES. The unit cases pin the resolvers,
 * but the defect spanned three layers — the cookie write, the pointer read, and
 * two resolvers. A pure test of any one of them could stay green while a real
 * person was still bounced back to their company on the next click. This drives
 * the actual control and then LEAVES THE PAGE, which is where the old behaviour
 * reasserted itself.
 *
 * `dev.company@local.test` is deliberate: active_role=company with exactly one
 * owned organization is precisely the affected identity.
 *
 * Local stack only; skips cleanly without it.
 */
const HAS_TEST_SUPABASE = !!process.env.SUPABASE_TEST_URL;
const COMPANY = { email: "dev.company@local.test", password: "password" };

const PERSONAL = "personal";

async function login(page: Page): Promise<void> {
  await page.goto("/lt/auth/login");
  await page.locator('input[type="email"]').fill(COMPANY.email);
  await page.locator('input[type="password"]').fill(COMPANY.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

/** Open the workspace chip menu and return the option ids it offers. */
async function openChip(page: Page): Promise<string[]> {
  const chip = page.locator('[data-testid="workspace-chip"]');
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await chip.locator("button").first().click();
  const menu = page.locator('[data-testid="workspace-chip-menu"]');
  await expect(menu).toBeVisible({ timeout: 15_000 });
  return (
    await menu.locator("[data-testid^='workspace-option-']").evaluateAll((els) =>
      els.map((e) => (e.getAttribute("data-testid") ?? "").replace("workspace-option-", "")),
    )
  );
}

/** Which workspace the chip reports as active, read from `aria-current`. */
async function activeWorkspace(page: Page): Promise<string | null> {
  const ids = await openChip(page);
  const menu = page.locator('[data-testid="workspace-chip-menu"]');
  for (const id of ids) {
    const opt = menu.locator(`[data-testid="workspace-option-${id}"]`);
    if ((await opt.getAttribute("aria-current")) === "true") {
      await page.keyboard.press("Escape");
      return id;
    }
  }
  await page.keyboard.press("Escape");
  return null;
}

async function pickWorkspace(page: Page, id: string): Promise<void> {
  await openChip(page);
  await page
    .locator(`[data-testid="workspace-chip-menu"] [data-testid="workspace-option-${id}"]`)
    .click();
  // The switch is a server action followed by `router.refresh()`. POLL for the
  // chip to actually report the new workspace rather than sleeping a fixed
  // interval: a fixed sleep turns a slow refresh into a "wrong workspace"
  // failure that reads exactly like the defect this spec exists to catch.
  await expect
    .poll(async () => await activeWorkspace(page), { timeout: 30_000 })
    .toBe(id);
}

test.describe("D-20 — explicit personal workspace is respected", () => {
  test.skip(!HAS_TEST_SUPABASE, "Needs the local Supabase stack (pnpm e2e:local).");

  test("Personal -> Organization -> Personal survives navigation and reload", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/lt/dashboard");

    const options = await openChip(page);
    await page.keyboard.press("Escape");
    expect(options, "chip should offer personal + the org").toContain(PERSONAL);
    const orgId = options.find((o) => o !== PERSONAL);
    expect(orgId, "this identity should own exactly one organization").toBeTruthy();

    // The single-org DEFAULT is correct and must remain — an absent choice is a
    // gap the product may fill.
    expect(await activeWorkspace(page)).toBe(orgId);

    // ── choose PERSONAL ──────────────────────────────────────────────────────
    await pickWorkspace(page, PERSONAL);
    expect(await activeWorkspace(page)).toBe(PERSONAL);

    // THE REGRESSION: leaving the page is where the old behaviour reasserted
    // itself — the single-org default overruled the choice on the next render.
    await page.goto("/lt/dashboard/journal");
    expect(
      await activeWorkspace(page),
      "personal must survive navigation to another route",
    ).toBe(PERSONAL);

    await page.goto("/lt/dashboard/planning");
    expect(
      await activeWorkspace(page),
      "personal must survive navigation to the calendar",
    ).toBe(PERSONAL);

    await page.reload();
    expect(
      await activeWorkspace(page),
      "personal must survive a full reload",
    ).toBe(PERSONAL);

    // ── back to the ORGANISATION — the fix must be symmetric ─────────────────
    await pickWorkspace(page, orgId!);
    expect(await activeWorkspace(page)).toBe(orgId);
    await page.goto("/lt/dashboard");
    expect(
      await activeWorkspace(page),
      "an explicit organisation choice must survive too",
    ).toBe(orgId);

    // ── and back to PERSONAL again ───────────────────────────────────────────
    await pickWorkspace(page, PERSONAL);
    await page.goto("/lt/dashboard");
    await page.reload();
    expect(
      await activeWorkspace(page),
      "the round trip must end where the person put it",
    ).toBe(PERSONAL);
  });

  test("the chip and the page agree — no console or page errors during switching", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await login(page);
    await page.goto("/lt/dashboard");
    const options = await openChip(page);
    await page.keyboard.press("Escape");
    const orgId = options.find((o) => o !== PERSONAL)!;

    await pickWorkspace(page, PERSONAL);
    await page.goto("/lt/dashboard/journal");
    await pickWorkspace(page, orgId);
    await page.goto("/lt/dashboard");

    expect(pageErrors, "page errors during workspace switching").toEqual([]);
    // CSP report-only notices are environmental, not product errors.
    const real = consoleErrors.filter(
      (e) => !/Content Security Policy|upgrade-insecure-requests/i.test(e),
    );
    expect(real, "console errors during workspace switching").toEqual([]);
  });
});
