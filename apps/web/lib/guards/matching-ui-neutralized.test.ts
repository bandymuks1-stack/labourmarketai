/**
 * Guard: the job_demands / matches / match_actions "matching" surface is
 * NEUTRALIZED at the app layer (convergence: single demand path).
 *
 * Locked decision (docs/CONVERGENCE_CHANGELOG.md): `customer_requests` is the
 * ONE canonical live demand/intake path. The half-wired job_demands matching
 * flow (worker `discover` browse + company job-postings create/list) was a
 * parallel flow reachable from the app. This PR removes the reachable UI so it
 * cannot be used as a second demand model today, while KEEPING the DB schema
 * (job_demands / matches / match_actions + migration 0023 grants) dormant for
 * the future M4 matching engine.
 *
 * This guard replaces the old `worker-jobs-browse.test.ts` and
 * `job-postings.test.ts` reachability guards, which pinned the now-removed UI.
 * If a future edit re-introduces the parallel UI, this guard fails — reachable
 * matching UI must come back only as part of the real M4 matching engine, not
 * as drift.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}

describe("Guard: matching UI is removed from the app surface", () => {
  const removed = [
    "app/[locale]/dashboard/discover/page.tsx",
    "components/app/job-posting-form.tsx",
    "components/app/job-postings-list.tsx",
    "components/app/public-job-postings-list.tsx",
    "lib/job-postings/job-postings.ts",
    "lib/job-postings/job-postings-public.ts",
    "lib/job-postings/job-postings-actions.ts",
    "lib/job-postings/types.ts",
  ];
  for (const rel of removed) {
    it(`${rel} no longer exists`, () => {
      expect(existsSync(join(APP, rel))).toBe(false);
    });
  }

  it("the company dashboard renders no job-postings section and imports no job-postings module", () => {
    const src = read("app/[locale]/dashboard/company/page.tsx");
    expect(src).not.toMatch(/company-dashboard-job-postings/);
    expect(src).not.toMatch(/JobPostingForm|JobPostingsList/);
    expect(src).not.toMatch(/@\/lib\/job-postings\//);
    // The canonical demand intake stays (the full wizard since W3 7/8/25).
    expect(src).toMatch(/company-dashboard-first-action/);
    expect(src).toMatch(/DemandRequestButton/);
  });

  it("admin project-truth no longer advertises a /dashboard/discover route", () => {
    const src = read("app/[locale]/dashboard/admin/project-truth/page.tsx");
    expect(src).not.toMatch(/dashboard\/discover/);
  });
});

describe("Guard: matching DB schema stays dormant (not dropped, just unreachable)", () => {
  const migDir = join(REPO, "supabase", "migrations");

  it("migration 0023 (job_demands/matches grants) is still present", () => {
    expect(existsSync(join(migDir, "0023_job_postings_grants.sql"))).toBe(true);
  });

  it("no migration drops job_demands / matches / match_actions", () => {
    const files = readdirSync(migDir).filter((f) => f.endsWith(".sql"));
    for (const f of files) {
      const sql = readFileSync(join(migDir, f), "utf8").toLowerCase();
      expect(
        sql,
        `${f} must not drop a dormant matching table`,
      ).not.toMatch(/drop\s+table\s+(if\s+exists\s+)?(public\.)?(job_demands|matches|match_actions)\b/);
    }
  });
});
