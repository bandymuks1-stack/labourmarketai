import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { db, dbOk, HAS_LOCAL_STACK } from "./market-map-db-state";

/**
 * W6 slice 3C — the POSITIVE admin proof: the moderator queue actually
 * renders in its new home.
 *
 * `w6-experience-domain.spec.ts` proves the NEGATIVE side (a worker and an
 * employer never reach the queue) with the ordinary fixture sessions. That
 * was the whole of slice 3B's admin coverage, and it leaves the interesting
 * half unproven: that moving the queue off its own route and onto BAND 2d of
 * the existing `/dashboard/admin` control room did not simply lose it.
 *
 * HOW THE ADMIN IS PROVISIONED, and why it is out-of-band. The platform's P0
 * `trg_profiles_admin_grant_guard` strips a self-assigned `profiles.active_role
 * = 'admin'` — nobody self-promotes, which is the correct rule and the same
 * one the SQL domain proof ran into. A real admin exists through
 * `profile_roles`, so that is what this spec writes, with the service role,
 * on the LOCAL stack only — and it removes the grant again in `afterAll`
 * whether the test passed or failed. The session itself is NOT re-minted:
 * the cookie carries no role, `is_admin()` reads the database per request, so
 * the existing employer storage state becomes an admin session the moment the
 * row exists. That is worth stating because it is also the security property
 * — authorization is never the cookie.
 *
 * Gated behind W6_ADMIN_PROOF=1 so an ordinary suite run does not mutate
 * roles in a shared local database as a side effect.
 */
const COMPANY_STATE = join(__dirname, ".storage-state.company.json");
const HAS_SESSION = existsSync(COMPANY_STATE);
/** The fixture profile temporarily granted the moderator role. */
const ACTOR = "aaaaaaaa-0000-0000-0000-000000000002";

test.skip(
  !HAS_SESSION || !HAS_LOCAL_STACK || process.env.W6_ADMIN_PROOF !== "1",
  "admin proof only: set W6_ADMIN_PROOF=1 with the local stack up",
);

test.use({ storageState: HAS_SESSION ? COMPANY_STATE : undefined });
test.setTimeout(120_000);

test.beforeAll(async () => {
  await dbOk("POST", "profile_roles", [{ profile_id: ACTOR, role: "admin" }]);
});

test.afterAll(async () => {
  // Always give the role back, including after a failure — a test that leaves
  // an admin behind in the local database is a trap for the next run.
  await db("DELETE", `profile_roles?profile_id=eq.${ACTOR}&role=eq.admin`);
});

test("the moderator queue renders as a band on the EXISTING control room", async ({
  page,
}) => {
  await page.goto("/lt/dashboard/admin");

  // It is ON the control room, not on a route of its own — the control room's
  // own surface must be present in the same document.
  await expect(page.getByTestId("admin-overview-kpis")).toBeVisible({ timeout: 60_000 });
  const panel = page.getByTestId("admin-experience-moderation");
  await expect(panel).toBeVisible();

  // Two queues, because moderation and dispute are two dimensions. Both must
  // exist as distinct lists even when one of them is empty.
  await expect(page.getByTestId("experience-moderation-queue")).toBeVisible();
  await expect(page.getByTestId("experience-dispute-queue")).toBeVisible();

  // The band sits with the other action queues, not off in the navigation
  // area — the follow-up queue is its declared neighbour.
  await expect(page.getByTestId("admin-control-areas")).toBeVisible();

  // And the deleted route is still deleted: the queue rendering here must not
  // mean it quietly came back.
  const gone = await page.goto("/lt/dashboard/admin/experience-moderation");
  expect(gone?.status()).toBe(404);
});

test("no score, no stars anywhere on the moderator surface", async ({ page }) => {
  await page.goto("/lt/dashboard/admin");
  await expect(page.getByTestId("admin-experience-moderation")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator("text=/★|⭐|☆/")).toHaveCount(0);
  // Structural, not lexical — the product's honest "this is NOT a rating"
  // copy would flag itself under a word search.
  const ratingSurfaces = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("[data-testid]"));
    return els
      .map((e) => e.getAttribute("data-testid") ?? "")
      .filter((id) => /score|rating|ovr|stars/i.test(id)).length;
  });
  expect(ratingSurfaces).toBe(0);
});
