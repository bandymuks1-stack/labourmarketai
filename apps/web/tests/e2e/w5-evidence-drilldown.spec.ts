import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { dbOk, HAS_LOCAL_STACK } from "./market-map-db-state";

/**
 * W5 slice 3 — evidence drill-down: a player-card skill-evidence bar with at
 * least one linked record links to the worker's OWN journal filtered to that
 * skill, where the filter strip names the skill and the REAL count, and the
 * one clear control restores the full diary.
 *
 * DB state pinned via the service-role local helper (the #958 method): the
 * fixture worker's journal links exist (dev-fixtures 1f111111…), but the
 * fixtures seed no worker_skills rows — the chart draws bars only for
 * declared skills, so beforeAll declares the one skill the links point at.
 * afterAll removes the row only if this spec created it.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const HAS_SESSION = existsSync(STORAGE_STATE);

test.skip(
  !HAS_SESSION || !HAS_LOCAL_STACK,
  "needs the local stack + a minted session (scripts/e2e-mint-session.ts)",
);

test.use({ storageState: HAS_SESSION ? STORAGE_STATE : undefined });
test.setTimeout(120_000);

let workerId = "";
let skillId = "";
let createdWorkerSkill = false;

test.beforeAll(async () => {
  const w = (await (
    await dbOk(
      "GET",
      "workers?profile_id=eq.aaaaaaaa-0000-0000-0000-000000000001&select=id",
    )
  ).json()) as { id: string }[];
  if (!w[0]) throw new Error("fixture worker missing — run pnpm db:fixtures:local");
  workerId = w[0].id;

  const link = (await (
    await dbOk(
      "GET",
      `journal_entry_skills?worker_id=eq.${workerId}&select=skill_id&limit=1`,
    )
  ).json()) as { skill_id: string }[];
  if (!link[0]) throw new Error("fixture journal skill links missing");
  skillId = link[0].skill_id;

  const existing = (await (
    await dbOk(
      "GET",
      `worker_skills?worker_id=eq.${workerId}&skill_id=eq.${skillId}&select=skill_id`,
    )
  ).json()) as unknown[];
  if (existing.length === 0) {
    await dbOk("POST", "worker_skills", {
      worker_id: workerId,
      skill_id: skillId,
      source: "self_declared",
      verified: false,
    });
    createdWorkerSkill = true;
  }
});

test.afterAll(async () => {
  if (createdWorkerSkill && workerId && skillId) {
    await dbOk(
      "DELETE",
      `worker_skills?worker_id=eq.${workerId}&skill_id=eq.${skillId}`,
    );
  }
});

test("desktop: an evidence bar drills into the skill-filtered journal, and clear restores it", async ({ page }) => {
  await page.goto("/lt/dashboard?result=player-card");
  const drill = page.getByTestId("player-card-skill-drilldown").first();
  await expect(drill).toBeVisible({ timeout: 60_000 });
  await drill.click();
  await expect(page).toHaveURL(/\/dashboard\/journal\?skill=/, { timeout: 60_000 });

  const strip = page.getByTestId("journal-skill-filter");
  await expect(strip).toBeVisible({ timeout: 60_000 });
  // The count in the strip is a real number, and at least one diary entry
  // renders under the filter (the fixture links guarantee a non-empty set).
  await expect(strip).toContainText(/\(\d+\)/);
  await expect(strip).not.toContainText("(0)");

  await page.getByTestId("journal-skill-filter-clear").click();
  await expect(page).not.toHaveURL(/skill=/, { timeout: 60_000 });
  await expect(page.getByTestId("journal-skill-filter")).toHaveCount(0);
});

test("mobile 375px: the filter strip renders and nothing overflows", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const slug = (await (
    await dbOk("GET", `skills?id=eq.${skillId}&select=slug`)
  ).json()) as { slug: string }[];
  await page.goto(`/lt/dashboard/journal?skill=${slug[0]?.slug ?? ""}`);
  await expect(page.getByTestId("journal-skill-filter")).toBeVisible({
    timeout: 60_000,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("an unknown ?skill= slug is ignored — the full diary renders, no invented filter", async ({ page }) => {
  await page.goto("/lt/dashboard/journal?skill=no-such-skill-slug");
  await expect(page.getByTestId("journal-entries")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("journal-skill-filter")).toHaveCount(0);
});
