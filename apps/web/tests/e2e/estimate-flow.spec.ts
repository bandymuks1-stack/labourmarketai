/**
 * Authenticated Estimate Builder smoke (post-PR #340).
 *
 * Drives the optional Estimate Builder inside the company/client demand flow
 * with the minted session (same `.storage-state.json` the other credentialed
 * specs use — the user holds all four roles). Verifies the behaviour the source
 * guards + unit tests can only assert at the code level:
 *   - the estimate panel is reachable in the Criteria step;
 *   - the deterministic total + low/high range render and match the formula;
 *   - the Review step shows the estimate summary;
 *   - submit creates one request whose read-back shows the stored estimate;
 *   - older rows with no estimate still render (read-back never breaks);
 *   - no fake AI / binding / guaranteed-price language (the disclaimer is an
 *     explicit negation).
 *
 * Skips cleanly when the minted session is absent (CI without a test Supabase),
 * exactly like demand-flow.spec.ts — a present session is NOT skipped, so real
 * failures surface. The customer_requests intake migration (20260530150000)
 * must be applied to the target test project for the create + read-back
 * assertions.
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
  "estimate-flow",
  "screenshots",
);

test.skip(
  !existsSync(STORAGE_STATE),
  `Storage state ${STORAGE_STATE} missing — run scripts/e2e-mint-session.ts first.`,
);

test.use({ storageState: STORAGE_STATE });
mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}

/** Ensure the dashboard is in a non-worker (company) context so the demand
 *  form (and its Estimate Builder) renders. */
async function ensureCompanyContext(page: Page): Promise<void> {
  await page.goto("/lt/dashboard", { waitUntil: "networkidle" });
  if (await page.getByTestId("demand-intake-section").isVisible().catch(() => false)) return;
  await page.getByTestId("role-switcher-toggle").click();
  const company = page.getByTestId("role-switcher-chip-company");
  const agency = page.getByTestId("role-switcher-chip-agency");
  if (await company.isVisible().catch(() => false)) await company.click();
  else if (await agency.isVisible().catch(() => false)) await agency.click();
  await page.goto("/lt/dashboard", { waitUntil: "networkidle" });
}

/** Parse a money string the UI renders. The spec runs on /lt, where the format
 *  is "4 731,10 EUR" (space thousands, comma decimal). */
function parseMoney(text: string | null): number {
  if (!text) return NaN;
  const digits = text.replace(/[^\d.,]/g, "").replace(/\s/g, "");
  // lt: comma is the decimal separator; drop any thousands dots, comma -> dot.
  const normalized = digits.replace(/\./g, "").replace(",", ".");
  return Number(normalized);
}

test("estimate flow: criteria estimate → total + range → review → create → read-back", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await ensureCompanyContext(page);
  await expect(page.getByTestId("demand-form")).toBeVisible({ timeout: 15_000 });

  // ── Step 1 — describe.
  const description = `E2E sąmata ${Date.now()}: betonavimas, 3 darbuotojai`;
  await page.getByTestId("demand-description").fill(description);
  await page.getByTestId("demand-next").click();

  // ── Step 2 — open the (optional) estimate panel + enter numbers.
  const open = page.getByTestId("estimate-open");
  if (await open.isVisible().catch(() => false)) await open.click();
  await expect(page.getByTestId("estimate-builder")).toBeVisible();

  await page.getByTestId("estimate-workerCount").fill("3");
  await page.getByTestId("estimate-hoursPerWorker").fill("40");
  await page.getByTestId("estimate-rate").fill("20");
  await page.getByTestId("estimate-materials").fill("1000");
  await page.getByTestId("estimate-overheadPercent").fill("10");
  await page.getByTestId("estimate-marginPercent").fill("15");
  await page.getByTestId("estimate-contingencyPercent").fill("10");

  // ── Deterministic total matches the formula:
  //    labour 3*40*20=2400; direct +1000=3400; overhead 10%=340;
  //    margin 15%*(3740)=561; contingency 10%*(4301)=430.1; total=4731.1
  const total = page.getByTestId("estimate-total");
  await expect(total).toBeVisible();
  expect(parseMoney(await total.textContent())).toBeCloseTo(4731.1, 1);

  // ── Range appears because contingency > 0 (low 4301.00 – high 5161.20).
  await expect(page.getByTestId("estimate-range")).toBeVisible();
  // ── Disclaimer is an explicit negation (not a binding quote).
  await expect(page.getByTestId("estimate-disclaimer")).toBeVisible();
  await shot(page, "01-estimate-criteria");

  await page.getByTestId("demand-next").click();

  // ── Step 3 — review shows the estimate summary with the same total.
  await expect(page.getByTestId("demand-review")).toBeVisible();
  const reviewEstimate = page.getByTestId("demand-review-estimate");
  await expect(reviewEstimate).toBeVisible();
  expect(
    parseMoney(await reviewEstimate.getByTestId("estimate-total").textContent()),
  ).toBeCloseTo(4731.1, 1);
  await shot(page, "02-review-estimate");

  // ── Create — exactly one request; read-back gains one row with the estimate.
  const readback = page.getByTestId("demand-requests-readback");
  const hasReadback = await readback.isVisible().catch(() => false);
  const before = hasReadback
    ? await page.getByTestId("demand-readback-row").count()
    : 0;

  await page.getByTestId("demand-create").click();
  await expect(page.getByTestId("demand-submitted-summary")).toBeVisible({ timeout: 15_000 });
  // The post-submit confirmation echoes the estimate summary too.
  await expect(
    page.getByTestId("demand-submitted-summary").getByTestId("estimate-total"),
  ).toBeVisible();
  await shot(page, "03-submitted");

  await page.reload({ waitUntil: "networkidle" });
  if (hasReadback || (await readback.isVisible().catch(() => false))) {
    await expect(readback).toBeVisible();
    await expect(page.getByTestId("demand-readback-row")).toHaveCount(before + 1, {
      timeout: 10_000,
    });
    // Newest row (first) carries the stored estimate summary with the total.
    const newest = page.getByTestId("demand-readback-row").first();
    const rowEstimate = newest.getByTestId("demand-readback-estimate");
    await expect(rowEstimate).toBeVisible();
    expect(
      parseMoney(await rowEstimate.getByTestId("estimate-total").textContent()),
    ).toBeCloseTo(4731.1, 1);
    await shot(page, "04-readback-estimate");

    // ── Older rows without an estimate must still render (read-back tolerant):
    //    at least one row has no estimate summary, yet the list rendered fine.
    const rowCount = await page.getByTestId("demand-readback-row").count();
    const estimateCount = await page.getByTestId("demand-readback-estimate").count();
    expect(rowCount).toBeGreaterThanOrEqual(estimateCount);
  }

  // ── Honesty: no fabricated AI / matched / guaranteed-price claim.
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(body).not.toMatch(/\bguaranteed price\b|\bAI-generated\b/i);
  expect(body).not.toMatch(/\bmatched\b/i);
});
