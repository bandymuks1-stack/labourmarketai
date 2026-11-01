import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * PRODUCTION-CODE COMPATIBILITY for the RED migration
 * 20261029190000_worker_board_need_skill_slugs_v1 (owner gate, 2026-10-29).
 *
 * The deploy order is migration → app, so the app build from BEFORE the
 * job-fit code (#2887; pinned commit 88a60b567, built and started on
 * 127.0.0.1:3002 by .github/workflows/signup-isolated.yml) must keep working
 * against the WIDENED reader — that keeps an app rollback past #2887 safe
 * while the migration stays applied. ("production code" below = that build.) This walk drives that build on the same throwaway stack,
 * after job-fit-evidence-isolated.spec.ts G-3 re-applied the migration. It
 * finds that walk's worker and needs by their run-unique titles in the LOCAL
 * database (nothing is handed over through a file):
 *
 *   C-1 production code renders the board from the migrated reader (no "data
 *       access pending"); every visible need shows, hidden ones do not. The
 *       database is then rolled back to production's current reader and the
 *       SAME production code reads the board again: every band is identical —
 *       the two new columns are ignored. The migration is re-applied after.
 *   C-2 production's express-interest path (it re-reads the reader and inserts
 *       under the recreated worker-insert policy) still stores interest.
 *
 * Runs only with JOBFIT_COMPAT=1 against the local stack. PASS_CI_ONLY.
 */

const BASE = process.env.E2E_BASE_URL ?? "";
const SB_URL = process.env.E2E_SUPABASE_URL ?? "";
const LOCAL = /^http:\/\/127\.0\.0\.1:\d+$/;
const PASSWORD = "Synthetic-Pass-2026!";
const DB_CONTAINER = "supabase_db_labourmarketai";
const MIGRATION_FILE = "../../supabase/migrations/20261029190000_worker_board_need_skill_slugs_v1.sql";
const ROLLBACK_FILE = "../../supabase/rollbacks/20261029190000_worker_board_need_skill_slugs_v1.down.sql";

test.skip(
  process.env.SIGNUP_ISOLATED !== "1" ||
    process.env.JOBFIT_COMPAT !== "1" ||
    !LOCAL.test(BASE) ||
    SB_URL !== "http://127.0.0.1:54321",
  "production-code compatibility walk: local stack + JOBFIT_COMPAT=1 only",
);
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

function sqlRows<T>(query: string): T[] {
  const wrapped = `select coalesce(json_agg(t), '[]'::json) from (${query}) t`;
  const out = execFileSync("docker", ["exec", DB_CONTAINER, "psql", "-U", "postgres", "-tA", "-c", wrapped], { encoding: "utf8" });
  return JSON.parse(out.trim() || "[]") as T[];
}

function runFile(relPath: string): void {
  execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], {
    encoding: "utf8",
    input: readFileSync(join(process.cwd(), relPath), "utf8"),
  });
}

/** The job-fit walk's records, by their run-unique shapes (one run per stack). */
function walkRecords(): { worker: string; workerEmail: string; needs: Record<string, string> } {
  const [w] = sqlRows<{ id: string; email: string }>(
    `select w.id, u.email from auth.users u join public.workers w on w.profile_id = u.id
      where u.email like 'jobfit.worker.%@local.test' order by u.created_at desc limit 1`,
  );
  if (!w) throw new Error("the job-fit walk's worker is not in the local database");
  const pick = (pattern: string) => {
    const rows = sqlRows<{ id: string }>(
      `select id from public.customer_requests where title like '${pattern}' order by created_at desc limit 1`,
    );
    if (!rows[0]) throw new Error(`no need titled like ${pattern}`);
    return rows[0].id;
  };
  return {
    worker: w.id,
    workerEmail: w.email,
    needs: {
      oldNeed: pick("Tiler for bathrooms %"),
      confirmedNeed: pick("General site help %"),
      freeNeed: pick("Wet-room finishing specialist %"),
      licenceNeed: pick("Delivery crew member %"),
      fixtureNeed: pick("Tiling crew %"),
      closedNeed: pick("Closed tiling need %"),
    },
  };
}

const VISIBLE = ["oldNeed", "confirmedNeed", "freeNeed", "licenceNeed"] as const;
const HIDDEN = ["fixtureNeed", "closedNeed"] as const;

async function signIn(page: Page, address: string): Promise<void> {
  await page.goto(`${BASE}/en/auth/login`);
  await page.locator('input[name="email"]').fill(address);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60_000 });
}

async function bandsOnBoard(page: Page, needs: Record<string, string>): Promise<Record<string, string | null>> {
  await page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
  const main = page.getByRole("main");
  await expect(main.locator(`li[id="opp-${needs.oldNeed}"]`).first(), "the board rendered").toBeVisible({ timeout: 60_000 });
  await expect(main.getByTestId("opportunities-pending"), "the reader answered (no 'data access pending')").toHaveCount(0);
  const bands: Record<string, string | null> = {};
  for (const k of VISIBLE) {
    const li = main.locator(`li[id="opp-${needs[k]}"]`).first();
    await expect(li, `${k} is on production's board`).toBeAttached();
    bands[k] = await li.getAttribute("data-band");
  }
  for (const k of HIDDEN) await expect(main.locator(`li[id="opp-${needs[k]}"]`), `${k} is not on the board`).toHaveCount(0);
  return bands;
}

test("C-1. production code reads the migrated reader exactly as it reads production's current one", async ({ page }) => {
  const rec = walkRecords();
  await signIn(page, rec.workerEmail);
  const migrated = await bandsOnBoard(page, rec.needs);
  runFile(ROLLBACK_FILE); // production's current reader
  let current: Record<string, string | null>;
  try {
    current = await bandsOnBoard(page, rec.needs);
  } finally {
    runFile(MIGRATION_FILE); // back to the migrated state for C-2
  }
  test.info().annotations.push({ type: "production-code-bands", description: JSON.stringify({ migrated, current }) });
  expect(migrated, "the new columns change nothing for production code").toEqual(current);
});

test("C-2. production's express-interest path still stores interest under the recreated policy", async ({ page }) => {
  const rec = walkRecords();
  await signIn(page, rec.workerEmail);
  await page.goto(`${BASE}/en/dashboard/opportunities?view=all`);
  const card = page.locator(`li[id="opp-${rec.needs.oldNeed}"]`).first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  const box = card.getByTestId(`interest-${rec.needs.oldNeed}`);
  await expect(box, "production offers the interest action").toBeAttached();
  await expect(async () => {
    if (!(await box.getByTestId("interest-sent").isVisible().catch(() => false))) {
      await box.getByTestId("interest-express").click({ timeout: 5_000 });
    }
    await expect(box.getByTestId("interest-sent")).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  const rows = sqlRows<{ status: string }>(
    `select status from public.demand_interest_signals
      where worker_id = '${rec.worker}'::uuid and request_id = '${rec.needs.oldNeed}'::uuid`,
  );
  expect(rows.map((r) => r.status), "the interest row is stored").toEqual(["interested"]);
});
