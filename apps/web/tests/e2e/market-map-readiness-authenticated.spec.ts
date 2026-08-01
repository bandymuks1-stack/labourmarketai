/**
 * Authenticated Market Map READINESS e2e (local stack, real minted session).
 *
 * Proves the owner-only availability + capability blocks render the caller's OWN
 * real data:
 *   1. availability state + mobility (current / preferred countries);
 *   2. capability signals tagged confirmed / suggested / self-declared;
 *   3. mobile 390px: no horizontal overflow.
 *
 * Skips when tests/e2e/.storage-state.json is missing, and without the local
 * stack (the beforeAll state pinning needs the local service role — run via
 * pnpm -C apps/web e2e:local). The worker row + verified skill the assertions
 * assume are re-pinned in beforeAll rather than trusted to a one-off recipe.
 */
import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { HAS_LOCAL_STACK, db, dbOk, mintedProfileId } from "./market-map-db-state";

const STORAGE_STATE = join(__dirname, ".storage-state.json");
test.skip(!existsSync(STORAGE_STATE), "run scripts/e2e-mint-session.ts first");
test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");
test.use({ storageState: STORAGE_STATE });

let workerId = "";
/** Set only when beforeAll INSERTED a verified skill row — the afterAll
 *  cleanup removes exactly that row and nothing else. */
let seededSkillId = "";

test.beforeAll(async () => {
  if (!HAS_LOCAL_STACK || !existsSync(STORAGE_STATE)) return;
  const uid = mintedProfileId(STORAGE_STATE);

  // 1. The availability assertions assume the fixture worker's pristine shape
  //    (dev-fixtures.sql): availability_status 'available' — data-state flips
  //    to 'from_date' if available_from is in the future — and the mobility
  //    block needs a current/preferred country. Re-pin all four fields; other
  //    specs and manual runs on the long-lived stack toggle them.
  const wRows = (await (
    await dbOk("GET", `workers?profile_id=eq.${uid}&select=id`)
  ).json()) as Array<{ id: string }>;
  const pin = {
    availability_status: "available",
    available_from: null,
    current_location_country: "LT",
    preferred_countries: ["NL", "DK", "DE"],
  };
  if (wRows[0]) {
    workerId = wRows[0].id;
    await dbOk("PATCH", `workers?id=eq.${workerId}`, pin);
  } else {
    // A drifted stack lost the fixture worker row entirely — recreate it the
    // way dev-fixtures.sql does (generated id; always resolved via profile_id).
    const ins = (await (
      await dbOk("POST", "workers", {
        profile_id: uid,
        display_name: "Dev Worker",
        headline: "Steel fixer • 8y exp",
        experience_years: 8,
        trust_score: 70,
        profile_completeness: 80,
        ...pin,
      })
    ).json()) as Array<{ id: string }>;
    workerId = ins[0]?.id ?? "";
    if (!workerId) throw new Error("failed to recreate the fixture worker row");
  }

  // 2. The confirmed-capability assertions assume at least one worker_skills
  //    row with verified=true. That row came from a one-off recipe (the seed
  //    SQL inserts skills UNVERIFIED), so a fixture reset silently removes it.
  //    When none survives, insert one verified row for a catalogue skill the
  //    worker does not already list (unique worker_id+skill_id), and remember
  //    it for the marker-scoped cleanup.
  const verified = (await (
    await dbOk("GET", `worker_skills?worker_id=eq.${workerId}&verified=eq.true&select=skill_id`)
  ).json()) as unknown[];
  if (verified.length === 0) {
    const listed = (await (
      await dbOk("GET", `worker_skills?worker_id=eq.${workerId}&select=skill_id`)
    ).json()) as Array<{ skill_id: string }>;
    const taken = new Set(listed.map((r) => r.skill_id));
    const catalogue = (await (
      await dbOk("GET", "skills?select=id&order=slug.asc&limit=100")
    ).json()) as Array<{ id: string }>;
    const free = catalogue.find((s) => !taken.has(s.id));
    if (free) {
      await dbOk(
        "POST",
        "worker_skills",
        {
          worker_id: workerId,
          skill_id: free.id,
          source: "self_declared",
          self_rated_level: 4,
          verified: true,
        },
        "return=minimal",
      );
      seededSkillId = free.id;
    } else {
      // Every catalogue skill is already listed — flip the first one to
      // verified (pinning, not seeding: there is no new row to clean up).
      await dbOk(
        "PATCH",
        `worker_skills?worker_id=eq.${workerId}&skill_id=eq.${listed[0].skill_id}`,
        { verified: true },
      );
    }
  }
});

test.afterAll(async () => {
  if (!HAS_LOCAL_STACK || !workerId || !seededSkillId) return;
  await db(
    "DELETE",
    `worker_skills?worker_id=eq.${workerId}&skill_id=eq.${seededSkillId}`,
  );
});

async function gotoMap(page: Page) {
  await page.goto("/lt/dashboard/market-map", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/lt\/dashboard\/market-map/, { timeout: 20_000 });
  // PR #921 folded the capture/readiness tools into the collapsed
  // "advanced" <details> (progressive disclosure) — open it first.
  await page.getByTestId("market-map-advanced").locator("> summary").click();
  await page.getByTestId("market-map-readiness").waitFor({ state: "visible", timeout: 30_000 });
}

test("availability + mobility render from the owner's worker row", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoMap(page);

  // Availability state badge is present (seeded available now).
  await expect(page.getByTestId("readiness-state")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("readiness-state")).toHaveAttribute("data-state", "available");

  // Mobility shows current / preferred countries (seeded).
  await expect(page.getByTestId("readiness-mobility")).toBeVisible();
});

test("capability signals are tagged confirmed / suggested / self-declared", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoMap(page);

  await expect(page.getByTestId("readiness-capabilities")).toBeVisible({ timeout: 15_000 });
  // Confirmed count reflects a real verified skill (seeded verified = true).
  await expect(
    page.locator('[data-testid="capabilities-count-confirmed"][data-count]'),
  ).toHaveAttribute("data-count", /[1-9]/, { timeout: 15_000 });
  // At least one confirmed chip is rendered.
  await expect(page.getByTestId("capability-chip-confirmed").first()).toBeVisible();
});

test("mobile (390px): readiness blocks have no horizontal overflow", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoMap(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByTestId("readiness-capabilities").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("readiness-capabilities")).toBeVisible();
});
