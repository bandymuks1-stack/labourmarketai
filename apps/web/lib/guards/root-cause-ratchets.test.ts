import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ROOT-CAUSE RATCHETS (system audit 2026-11-03).
 *
 * The audit traced repeated defects to a few causes that no single-surface
 * guard sees. Each ratchet below stops a cause from GROWING; fixing an old
 * instance lowers the count, and the baseline is then lowered in the same PR.
 *
 *   1. Authority by profile only. `select … into … from companies where
 *      profile_id = auth.uid()` (and the same on `agencies`) ignores active
 *      owner/admin members and picks an arbitrary company for a multi-company
 *      owner — the defect #3011 fixed in the agency client commands. New
 *      migrations resolve the caller's company through `owns_company()` /
 *      `caller_agency_company_id()`. (`agencies.profile_id` is the Model A
 *      owner column itself; a legacy agency branch falls under rule 2.)
 *   2. Model A leftovers. `agency_workers` has 0 rows in production; every
 *      real agency is a company (Model B) with its people on
 *      `company_workers`. A reader of `agency_workers` alone counts 0 for every
 *      real agency (#3007). New migrations may keep the legacy branch only
 *      beside the live roster.
 *   3. Walks that sleep. Walk repairs were dominated by fixed sleeps and
 *      waits on transient text instead of a stable state marker (#2972,
 *      #2897, #2767, #3015 …). `waitForTimeout` in production walks may only
 *      go down.
 *   4. Pre-apply fallbacks that outlive the apply. "needs-migration" /
 *      missing-RPC fallbacks keep superseded RPCs callable long after the
 *      migration landed (e.g. save_company_setup v1/v2 behind v3). New code
 *      does not add one; the count may only go down.
 */
const WEB = join(__dirname, "..", "..");
const MIGRATIONS = join(WEB, "..", "..", "supabase", "migrations");

/** Migrations authored after this version are held to rules 1 and 2. */
const RATCHET_FROM = "20261103100000";

const PROFILE_ONLY_RESOLUTION =
  /\binto\s+\w+\s+from\s+(public\.)?companies(\s+\w+)?\s+where\s+(\w+\.)?profile_id\s*=\s*(auth\.uid\(\)|v_uid|uid|v_caller)\s*(;|limit|order)/i;

const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, "");

function newMigrations(): { file: string; sql: string }[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql") && f.slice(0, 14) >= RATCHET_FROM)
    .map((file) => ({ file, sql: stripComments(readFileSync(join(MIGRATIONS, file), "utf8")) }));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("root-cause ratchets — new migrations", () => {
  it("the ratchet sees the migrations it governs", () => {
    expect(readdirSync(MIGRATIONS).length).toBeGreaterThan(400);
  });

  for (const { file, sql } of newMigrations()) {
    it(`${file}: resolves the caller's company by authority, not by profile_id alone`, () => {
      expect(sql, file).not.toMatch(PROFILE_ONLY_RESOLUTION);
    });

    it(`${file}: reads agency_workers only beside the live company_workers roster`, () => {
      if (/\bagency_workers\b/i.test(sql)) expect(sql, file).toMatch(/\bcompany_workers\b/i);
    });
  }

  it("the profile-only pattern is the one #3011 removed", () => {
    expect(
      "select c.id into v_company_id from companies c where c.profile_id = auth.uid();",
    ).toMatch(PROFILE_ONLY_RESOLUTION);
    expect(
      "select c.id into v_company_id from public.companies c where (c.profile_id = v_uid or exists (select 1)) and public.owns_company(c.id) limit 1;",
    ).not.toMatch(PROFILE_ONLY_RESOLUTION);
  });
});

describe("root-cause ratchets — counts that may only go down", () => {
  it("production walks: fixed sleeps never grow (wait for a state marker instead)", () => {
    const dir = join(WEB, "tests", "e2e");
    const total = readdirSync(dir)
      .filter((f) => /^prod-.*\.spec\.ts$/.test(f))
      .reduce((n, f) => n + (readFileSync(join(dir, f), "utf8").match(/waitForTimeout\(/g) ?? []).length, 0);
    // Baseline 2026-11-03: 22 in 15 specs. Lower it when you remove one.
    expect(total).toBeLessThanOrEqual(22);
  });

  it("pre-apply fallbacks never grow (retire them once the migration is applied)", () => {
    const files = [...walk(join(WEB, "lib")), ...walk(join(WEB, "app"))].filter((p) =>
      readFileSync(p, "utf8").includes('"needs-migration"'),
    );
    // Baseline 2026-11-03: 213 files. Lower it when you retire one.
    expect(files.length).toBeLessThanOrEqual(213);
  });
});
