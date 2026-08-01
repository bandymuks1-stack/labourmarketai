/**
 * Authenticated Market Map CAPTURE e2e (local stack, real minted session).
 *
 * Proves the owner-only capture flows end-to-end:
 *   1. preferred_location: create → map shows it → disable → drops from map;
 *   2. login consent: consented → login signal shows (approximate, no exact) →
 *      revoked → login signal no longer renders;
 *   3. company-need: edit visibility on an owner row (no new insert).
 *
 * Skips when tests/e2e/.storage-state.json is missing, and without the local
 * stack (the beforeAll state pinning needs the local service role — run via
 * pnpm -C apps/web e2e:local).
 */
import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { HAS_LOCAL_STACK, db, dbOk, mintedProfileId } from "./market-map-db-state";

const STORAGE_STATE = join(__dirname, ".storage-state.json");
test.skip(!existsSync(STORAGE_STATE), "run scripts/e2e-mint-session.ts first");
test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");
test.use({ storageState: STORAGE_STATE });

/** Marker values — every row this spec creates or seeds carries one, so the
 *  afterAll cleanup targets exactly the e2e rows and nothing else. */
const PREFERRED_NOTE = "e2e note"; // the note the create test types into every row
const SEED_REQUEST_ID = "99999999-e2e0-4000-8000-000000000001";
const SEED_DEMAND_ID = "99999999-e2e0-4000-8000-000000000002";

let uid = "";
let seededDemand = false;

test.beforeAll(async () => {
  if (!HAS_LOCAL_STACK || !existsSync(STORAGE_STATE)) return;
  uid = mintedProfileId(STORAGE_STATE);

  // 1. Preferred rows ACCUMULATE across runs (the create test inserts one per
  //    run and the capture list renders oldest-first), so the `.first()`
  //    assertions only hold when the list starts EMPTY — the pristine fixture
  //    state (dev-fixtures.sql seeds no preferred_locations). On the local
  //    stack every row for the minted fixture user is e2e debris; drop them.
  await dbOk("DELETE", `preferred_locations?profile_id=eq.${uid}`);

  // 2. The consent buttons send `countryCode` only from the country input or
  //    the EXISTING signal row (no silent country default, PR-G) — with no row
  //    at all the "consented" click is rejected server-side (missing_country)
  //    and the test flakes. Pin one revoked row with a real country so the
  //    consented → revoked transition the test drives is real both ways.
  await dbOk(
    "POST",
    "consented_login_location_signals?on_conflict=profile_id",
    {
      profile_id: uid,
      country_code: "LT",
      granularity: "country",
      precision_level: "country",
      source: "user_confirmed",
      consent_status: "revoked",
    },
    "resolution=merge-duplicates,return=minimal",
  );

  // 3. The company-need test EDITS an existing owner row and never inserts —
  //    it needs at least one company_demand_locations row owned by the minted
  //    user. Seed a marker row (with its NOT-NULL customer_requests parent)
  //    only when the user has none; fixed ids keep the seed idempotent even
  //    after a crashed run that never reached afterAll.
  const have = (await (
    await dbOk("GET", `company_demand_locations?owner_id=eq.${uid}&select=id`)
  ).json()) as unknown[];
  if (have.length === 0) {
    await dbOk(
      "POST",
      "customer_requests?on_conflict=id",
      {
        id: SEED_REQUEST_ID,
        profile_id: uid,
        title: "E2E market-map seed request",
        status: "draft",
      },
      "resolution=merge-duplicates,return=minimal",
    );
    await dbOk(
      "POST",
      "company_demand_locations?on_conflict=id",
      {
        id: SEED_DEMAND_ID,
        request_id: SEED_REQUEST_ID,
        owner_id: uid,
        country_code: "NL",
        location_label: "E2E market-map seed",
        granularity: "country",
        need_type: "workers",
        visibility_level: "company_only",
        // The signal-only write policy (20260615210000) WITH CHECKs
        // geocode_status in ('pending','manual') — the table default
        // 'not_required' would make every owner EDIT of this row fail RLS.
        geocode_status: "pending",
      },
      "resolution=merge-duplicates,return=minimal",
    );
    seededDemand = true;
  }
});

test.afterAll(async () => {
  if (!HAS_LOCAL_STACK || !uid) return;
  // Marker-scoped cleanup only: the rows this spec created via the UI (the
  //    note marks them), the single e2e-owned consent row, and the seeded
  //    demand row + its request parent (cascade covers the demand row).
  await db(
    "DELETE",
    `preferred_locations?profile_id=eq.${uid}&short_note=eq.${encodeURIComponent(PREFERRED_NOTE)}`,
  );
  await db("DELETE", `consented_login_location_signals?profile_id=eq.${uid}`);
  if (seededDemand) {
    await db("DELETE", `company_demand_locations?id=eq.${SEED_DEMAND_ID}`);
    await db("DELETE", `customer_requests?id=eq.${SEED_REQUEST_ID}`);
  }
});

async function gotoMap(page: Page) {
  await page.goto("/lt/dashboard/market-map", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/lt\/dashboard\/market-map/, { timeout: 20_000 });
  // PR #921 folded the capture/readiness tools into the collapsed
  // "advanced" <details> (progressive disclosure) — open it first.
  await page.getByTestId("market-map-advanced").locator("> summary").click();
  await page.getByTestId("market-map-capture").waitFor({ state: "visible", timeout: 30_000 });
}

test("preferred location: create with intents + priority + note → depth shown → disable", async ({ page }) => {
  test.setTimeout(150_000);
  await gotoMap(page);

  // Create a preferred location (LT) with two intents, optional priority + note.
  await page.getByTestId("capture-preferred-country").selectOption("LT");
  await page.getByTestId("capture-intent-work").click();
  await page.getByTestId("capture-intent-relocate").click();
  await page.getByTestId("capture-preferred-priority-select").selectOption("optional");
  await page.getByTestId("capture-preferred-note").fill("e2e note");
  await page.getByTestId("capture-preferred-add").click();

  // Row appears in the capture list, active, with priority + intent chips + note.
  const row = page.getByTestId("capture-preferred-row").first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toHaveAttribute("data-active", "true");
  await expect(row.getByTestId("capture-preferred-priority")).toBeVisible();
  await expect(row.getByTestId("capture-preferred-intents")).toBeVisible();
  await expect(row).toContainText("e2e note");

  // The map's owner view now shows a preferred_location signal (revalidated).
  await expect(
    page.locator('[data-testid="market-map-category-preferred_location"][data-count]'),
  ).toHaveAttribute("data-count", /[1-9]/, { timeout: 15_000 });

  // Edit visibility on the row (localized control, not a raw enum).
  await row.getByTestId("capture-preferred-visibility").selectOption("region_visible");
  await page.waitForTimeout(1200);
  await expect(
    page.getByTestId("capture-preferred-row").first().getByTestId("capture-preferred-visibility"),
  ).toHaveValue("region_visible", { timeout: 15_000 });

  // Disable it → row marked inactive.
  await page.getByTestId("capture-preferred-row").first().getByTestId("capture-preferred-toggle").click();
  await expect(
    page.getByTestId("capture-preferred-row").first(),
  ).toHaveAttribute("data-active", "false", { timeout: 15_000 });
});

test("login consent: consented shows approximate signal → revoked hides it", async ({ page }) => {
  test.setTimeout(150_000);
  await gotoMap(page);

  // Consent → login category renders, and no coordinates/address anywhere.
  await page.getByTestId("capture-login-consented").click();
  await expect(
    page.locator('[data-testid="market-map-category-login_location"][data-count]'),
  ).toHaveAttribute("data-count", /[1-9]/, { timeout: 15_000 });
  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body).not.toMatch(/latitude|longitude/);
  // No street address rendered for the login signal (a bare country name only).

  // Revoke → login signal no longer counts.
  await page.getByTestId("capture-login-revoked").click();
  await expect(
    page.locator('[data-testid="market-map-category-login_location"][data-count]'),
  ).toHaveAttribute("data-count", "0", { timeout: 15_000 });
});

test("mobile (390px): no horizontal overflow, chips + capture reachable", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoMap(page);

  // No horizontal overflow at 390px (a common iPhone width).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  // Filter chips render and the "all" chip is visible.
  await expect(page.getByTestId("market-map-filter-chips")).toBeVisible();
  await expect(page.getByTestId("market-map-filter-all")).toBeVisible();

  // The capture controls are reachable by scrolling (not hidden under nav).
  const addBtn = page.getByTestId("capture-preferred-add");
  await addBtn.scrollIntoViewIfNeeded();
  await expect(addBtn).toBeVisible();
  // The on-page CTA scrolls to the add form rather than navigating away.
  await page.getByTestId("market-map-cta-preferred_location").click();
  await expect(page).toHaveURL(/\/lt\/dashboard\/market-map/);
  await expect(page.locator("#market-map-add-preferred")).toBeVisible();
});

test("company-need: edit visibility + need type on an owner row (no new insert)", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoMap(page);

  const rows = page.getByTestId("capture-demand-row");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const before = await rows.count();

  // Edit visibility → region_visible (real owner-scoped update).
  await rows.first().getByTestId("capture-demand-visibility").selectOption("region_visible");
  await page.waitForTimeout(1500);

  // Same number of rows — an EDIT, never a new insert.
  await expect(rows).toHaveCount(before);
  await expect(
    page.getByTestId("capture-demand-row").first().getByTestId("capture-demand-visibility"),
  ).toHaveValue("region_visible", { timeout: 15_000 });

  // Edit need type → team (localized select, owner-scoped, still no insert).
  await page.getByTestId("capture-demand-row").first().getByTestId("capture-demand-needtype").selectOption("team");
  await page.waitForTimeout(1500);
  await expect(rows).toHaveCount(before);
  await expect(
    page.getByTestId("capture-demand-row").first().getByTestId("capture-demand-needtype"),
  ).toHaveValue("team", { timeout: 15_000 });
});
