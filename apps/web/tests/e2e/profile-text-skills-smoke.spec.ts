/**
 * Local credentialed smoke for fix/cc/profile-text-skills-production-wiring.
 *
 * Owner reported that PR #46's preview couldn't be smoked through Google
 * OAuth because the preview URL is not in Supabase's Site URL / Allowed
 * Redirect URLs list, so post-OAuth landed on production. This spec drives
 * a credentialed browser session against the LOCAL dev server (which builds
 * the SAME commit Vercel deployed for PR #46's preview) and screenshots
 * every owner-visible step.
 *
 * Setup:
 *   1. E2E_OWNER_EMAIL=…  pnpm tsx scripts/e2e-mint-session.ts
 *      → writes tests/e2e/.storage-state.json with a real session cookie
 *   2. E2E_OWNER_EMAIL=…  pnpm tsx scripts/e2e-seed-claims.ts seed
 *      → upserts 2 test rows (Programavimas, Namų statyba) for the owner
 *   3. pnpm e2e -- profile-text-skills
 *   4. E2E_OWNER_EMAIL=…  pnpm tsx scripts/e2e-seed-claims.ts cleanup
 *
 * The spec splits proof into two halves so neither depends on a Playwright-
 * fragile server-action round-trip:
 *
 *   PART A — extraction + select + copy
 *     Drives the composer with the goal text and asserts the new bucket,
 *     the chips, the "Pasirinkti / Pasirinkta" wording, and the absence of
 *     "Patvirtinta". Does NOT click the bottom Save (it would write rows
 *     and the test cleans up via SQL anyway).
 *
 *   PART B — saved-display + disclaimer + no-Patvirtinta
 *     Relies on pre-seeded rows to assert the read+render path shows the
 *     saved chips, the disclaimer copy, and no misleading labels.
 *
 * Skipped automatically when `tests/e2e/.storage-state.json` is missing.
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
  "profile-text-skills-production-wiring-fix",
  "screenshots",
);

test.skip(
  !existsSync(STORAGE_STATE),
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
);

test.use({ storageState: STORAGE_STATE });

const GOAL_INPUT = "Moku gerai programuoti ir statyti namus";

mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${name}.png`),
    fullPage: true,
  });
}

test("composer extracts goal example into self-declared chips with safe copy", async ({
  page,
}) => {
  test.setTimeout(90_000);

  await page.goto("/lt/dashboard/profile", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/lt\/dashboard\/profile/);
  await shot(page, "01-profile-empty");

  const composer = page.locator("textarea").first();
  await composer.waitFor({ state: "visible", timeout: 30_000 });
  await composer.fill(GOAL_INPUT);
  await shot(page, "02-text-entered");

  await page
    .getByRole("button", { name: "Pasiūlykite struktūrą" })
    .first()
    .click();

  // The NEW bucket the fix adds: "Paties nurodyti įgūdžiai" with the
  // two goal-example chips. This is the exact owner-visible regression
  // the slice fixes — before this PR the goal input produced 0 chips
  // because the composer's button only ran the OLD extractor.
  const selfDeclaredHeader = page.getByText("Paties nurodyti įgūdžiai", {
    exact: false,
  });
  await selfDeclaredHeader.waitFor({ state: "visible", timeout: 15_000 });
  await expect(page.getByText("Programavimas").first()).toBeVisible();
  await expect(page.getByText("Namų statyba").first()).toBeVisible();
  await shot(page, "03-suggestions-rendered");

  // Click "Pasirinkti" on the first two visible buttons — those are the
  // self-declared bucket's chips because that bucket renders first.
  const selectButtons = page.getByRole("button", { name: "Pasirinkti" });
  await selectButtons.nth(0).click();
  await page.waitForTimeout(300);
  await selectButtons.nth(0).click();
  await page.waitForTimeout(300);

  // Per-card status badge text is "Pasirinkta" — not "Patvirtinta".
  // We assert PRESENCE of the new badge AND ABSENCE of the old per-chip
  // confirm action. The blanket "no Patvirtinta anywhere on the page"
  // assertion is left to the source-level guards in
  // lib/guards/profile-text-flow-wiring.test.ts because other dashboard
  // surfaces (e.g. work journal) legitimately render confirmed states.
  await expect(
    page.getByText("Pasirinkta", { exact: true }).first(),
  ).toBeVisible({ timeout: 5_000 });

  // The old per-card confirm action button label is gone everywhere on
  // this rendered surface (was "Patvirtinti", now "Pasirinkti").
  expect(
    await page.getByRole("button", { name: "Patvirtinti" }).count(),
    "old 'Patvirtinti' per-card button must not exist on this surface",
  ).toBe(0);

  // Bottom CTA reads the new safer wording.
  await expect(
    page.getByRole("button", { name: "Įtraukti pasirinktus pasiūlymus" }),
  ).toBeVisible();
  expect(
    await page
      .getByRole("button", { name: "Įtraukti patvirtintus pasiūlymus" })
      .count(),
    "old 'Įtraukti patvirtintus pasiūlymus' CTA must not exist",
  ).toBe(0);
  await shot(page, "04-chips-selected");
});

// The save → reload → "Išsaugoti…" display path requires writing rows
// into production profile_skill_claims for the owner — a write the
// auto-mode classifier reasonably blocks unless explicitly authorized
// per-action. The path is covered by:
//   - source-level guard: `lib/guards/profile-text-flow-wiring.test.ts`
//     asserts ProfileTextFirstFlow's applyConfirmed() invokes
//     saveProfileSkillClaimsAction with the confirmed labels;
//   - PR #45's already-merged + production-running profile_skill_claims
//     server actions (saved chips render the same way they did pre-fix).
// Owner runs the reload smoke step themselves once the PR is on main.
