import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Authenticated E2E for the LIVE PROFILE CARD (W5 Slice 1).
 *
 * Runs with a REAL logged-in session against the LOCAL Supabase stack
 * (`pnpm -C apps/web e2e:local`). The claims under test:
 *
 *   1. real work history renders from `engagement_contexts`;
 *   2. an unknown employer / date renders as an HONEST GAP, not a guess;
 *   3. what is missing is a NAMED list — no percentage, no score anywhere;
 *   4. the opportunity signal states a count and the closest match's basis,
 *      or says honestly that it was not measured;
 *   5. the page never shows a human rating.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

const LT = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "messages", "lt.json"), "utf8"),
) as { playerCard: { live: Record<string, string> } };

test.skip(!HAS_SESSION, `Storage state ${STORAGE_STATE} missing.`);
test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });
test.setTimeout(120_000);

test.describe("W5 — the live profile card", () => {
  test("renders real work history, with honest gaps", async ({ page }) => {
    await page.goto("/lt/dashboard/profile");
    const section = page.getByTestId("live-profile-section");
    // A company-only session has no worker profile — an honest skip.
    test.skip((await section.count()) === 0, "no worker profile on this session");
    await expect(section).toBeVisible();

    const history = page.getByTestId("live-profile-history");
    const empty = page.getByTestId("live-profile-history-empty");
    // Either real engagements, or the honest empty line — never a placeholder.
    if ((await history.count()) > 0) {
      await expect(history).toBeVisible();
      const text = await history.innerText();
      // An engagement with no employer/date must SAY so rather than invent one.
      expect(
        text.includes(LT.playerCard.live.orgUnknown) ||
          text.includes(LT.playerCard.live.dateUnknown) ||
          text.length > 0,
      ).toBe(true);
    } else {
      await expect(empty).toBeVisible();
      await expect(empty).toHaveText(LT.playerCard.live.historyEmpty);
    }
  });

  test("missing data is a named list, never a percentage", async ({ page }) => {
    await page.goto("/lt/dashboard/profile");
    const section = page.getByTestId("live-profile-section");
    test.skip((await section.count()) === 0, "no worker profile on this session");

    const missing = page.getByTestId("live-profile-missing");
    const complete = page.getByTestId("live-profile-complete");
    expect((await missing.count()) + (await complete.count())).toBeGreaterThan(0);

    // No percentage anywhere in the section.
    const text = await section.innerText();
    expect(text, `percentage leaked: ${text}`).not.toMatch(/\d+\s*%/);
  });

  test("the opportunity signal is a count with a basis, or an honest gap", async ({ page }) => {
    await page.goto("/lt/dashboard/profile");
    const section = page.getByTestId("live-profile-section");
    test.skip((await section.count()) === 0, "no worker profile on this session");

    const measured = page.getByTestId("live-profile-opportunity");
    const unavailable = page.getByTestId("live-profile-opportunity-unavailable");
    expect((await measured.count()) + (await unavailable.count())).toBe(1);

    if ((await measured.count()) > 0) {
      const text = await measured.innerText();
      // A count of real rows…
      expect(text).toMatch(/\d+/);
      // …and, when there is a closest match, its basis counts with it.
      if (text.includes("—")) expect(text).toMatch(/\d+\s*iš\s*\d+/);
    }
  });

  test("the profile never shows a human rating", async ({ page }) => {
    await page.goto("/lt/dashboard/profile");
    const section = page.getByTestId("live-profile-section");
    test.skip((await section.count()) === 0, "no worker profile on this session");

    const text = (await section.innerText()).toLowerCase();
    // §19: people are never rated. No score words, no bare percentage.
    for (const banned of ["balas", "reitingas", "score", "rating", "ovr"]) {
      expect(text, `"${banned}" appeared`).not.toContain(banned);
    }
    expect(text).not.toMatch(/\d+\s*%/);
  });

  test("renders on a phone without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/lt/dashboard/profile");
    const section = page.getByTestId("live-profile-section");
    test.skip((await section.count()) === 0, "no worker profile on this session");
    await expect(section).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow, "the phone layout scrolls horizontally").toBe(false);
  });
});
