import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * PRODUCTION-CODE COMPATIBILITY for the RED migration
 * 20261029190000_worker_board_need_skill_slugs_v1 (owner gate, 2026-10-29).
 *
 * The deploy order is migration → app, so the code production runs TODAY
 * (origin/main, built and started on 127.0.0.1:3002 by
 * .github/workflows/signup-isolated.yml) must keep working against the
 * WIDENED reader. This walk drives that build on the same throwaway stack,
 * after job-fit-evidence-isolated.spec.ts G-3 re-applied the migration:
 *
 *   C-1 the worker board renders from the migrated reader (no "data access
 *       pending" state); every visible need shows, hidden ones do not; the
 *       production code ignores the two new columns, so each need's band is
 *       exactly the band the pre-migration reader gave (G-2);
 *   C-2 production's express-interest path (it re-reads the reader and
 *       inserts under the recreated worker-insert policy) still stores the
 *       worker's interest.
 *
 * Runs only with JOBFIT_COMPAT=1 against the local stack. PASS_CI_ONLY.
 */

const BASE = process.env.E2E_BASE_URL ?? "";
const SB_URL = process.env.E2E_SUPABASE_URL ?? "";
const SB_SERVICE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? "";
const LOCAL = /^http:\/\/127\.0\.0\.1:\d+$/;
const STATE_FILE = join(process.env.RUNNER_TEMP ?? tmpdir(), "jobfit-compat-state.json");

test.skip(
  process.env.SIGNUP_ISOLATED !== "1" ||
    process.env.JOBFIT_COMPAT !== "1" ||
    !LOCAL.test(BASE) ||
    SB_URL !== "http://127.0.0.1:54321" ||
    !SB_SERVICE ||
    !existsSync(STATE_FILE),
  "production-code compatibility walk: local stack + JOBFIT_COMPAT=1 + the job-fit walk's state only",
);
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

type CompatState = Record<string, string> & { fitsBefore: Record<string, string | null> };
const s = (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {}) as CompatState;

async function db<T>(path: string): Promise<T> {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` },
  });
  if (!r.ok) throw new Error(`local db read ${path.split("?")[0]} → ${r.status}`);
  return (await r.json()) as T;
}

test("C-1. production code renders the board from the migrated reader; bands are the pre-migration bands", async ({ page }) => {
  await page.goto(`${BASE}/en/auth/login`);
  await page.locator('input[name="email"]').fill(s.WORKER);
  await page.locator('input[name="password"]').fill(s.PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  await page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
  const main = page.getByRole("main");
  await expect(main.locator(`li[id="opp-${s.oldNeed}"]`).first(), "the board rendered").toBeVisible({ timeout: 60_000 });
  await expect(main.getByTestId("opportunities-pending"), "the reader answered (no 'data access pending')").toHaveCount(0);

  const bands: Record<string, string | null> = {};
  for (const k of ["oldNeed", "confirmedNeed", "freeNeed", "licenceNeed"]) {
    const li = main.locator(`li[id="opp-${s[k]}"]`).first();
    await expect(li, `${k} is on production's board`).toBeAttached();
    bands[k] = await li.getAttribute("data-band");
    const before = s.fitsBefore[s[k]];
    // Production code ignores the new columns: the band is the one the
    // pre-migration reader produced (G-2, same title-only reading).
    expect(bands[k], `${k}: band unchanged under production code`).toBe(before ? JSON.parse(before).band : null);
  }
  test.info().annotations.push({ type: "production-code-bands", description: JSON.stringify(bands) });
  for (const k of ["fixtureNeed", "closedNeed"]) {
    await expect(main.locator(`li[id="opp-${s[k]}"]`), `${k} is not on the board`).toHaveCount(0);
  }
});

test("C-2. production's express-interest path still stores interest under the recreated policy", async ({ page }) => {
  await page.goto(`${BASE}/en/auth/login`);
  await page.locator('input[name="email"]').fill(s.WORKER);
  await page.locator('input[name="password"]').fill(s.PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
  await page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
  const card = page.locator(`li[id="opp-${s.oldNeed}"]`).first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  const box = card.getByTestId(`interest-${s.oldNeed}`);
  await expect(box, "production offers the interest action").toBeAttached();
  await expect(async () => {
    if (!(await box.getByTestId("interest-sent").isVisible().catch(() => false))) {
      await box.getByTestId("interest-express").click({ timeout: 5_000 });
    }
    await expect(box.getByTestId("interest-sent")).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  const rows = await db<Array<{ status: string }>>(
    `demand_interest_signals?worker_id=eq.${s.worker}&request_id=eq.${s.oldNeed}&select=status`,
  );
  expect(rows.map((r) => r.status), "the interest row is stored").toEqual(["interested"]);
});
