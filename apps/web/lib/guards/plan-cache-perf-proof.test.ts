import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PLAN-CACHE PERFORMANCE PROOF (system audit 2026-11-03, root cause: "tests
 * and first measurements did not reproduce the PostgreSQL plan change on a
 * reused connection").
 *
 * #3020's trigram index was measured on the first call per backend and looked
 * good. After about 5 calls plpgsql switched the search function to a generic
 * plan, which picked the index for 1–2 character terms: 16–26 s against the
 * 3 s anon timeout. It was rolled back the same day.
 *
 * Rule: a new migration that adds an index or an extension, which is a
 * performance claim, carries a `-- @plan-cache-proof:` line. The line either
 * cites `scripts/db-proof/plan-cache-probe.sql` (≥ 10 calls per term on one
 * connection, under `auto` AND `force_generic_plan`, worst call cited), or
 * says `n/a` with the reason (e.g. a uniqueness constraint no RPC filters by).
 */
const REPO = join(__dirname, "..", "..", "..", "..");
const MIGRATIONS = join(REPO, "supabase", "migrations");
const PROBE = join(REPO, "scripts", "db-proof", "plan-cache-probe.sql");

/** Migrations authored after this version are held to the rule. */
const RULE_FROM = "20261103200000";

const PERF_CLAIM = /\bcreate\s+(unique\s+)?index\b|\bcreate\s+extension\b/i;
const PROOF_LINE = /^--\s*@plan-cache-proof:(.*)$/im;

function planCacheProofProblem(sql: string): string | null {
  const body = sql.replace(/--[^\n]*/g, "");
  if (!PERF_CLAIM.test(body)) return null;
  const line = sql.match(PROOF_LINE)?.[1]?.trim() ?? null;
  if (line === null) return "adds an index/extension without a `-- @plan-cache-proof:` line";
  if (/^n\/a\b.{8,}/i.test(line)) return null;
  if (/plan-cache-probe/.test(line) && /force_generic_plan/.test(line)) return null;
  return "`@plan-cache-proof:` must cite plan-cache-probe + force_generic_plan, or say `n/a <reason>`";
}

describe("plan-cache performance proof", () => {
  it("the probe runs ≥ 10 calls per term under both plan cache modes, read-only", () => {
    const probe = readFileSync(PROBE, "utf8");
    const calls = probe.match(/^\\set calls (\d+)$/m);
    expect(calls).not.toBeNull();
    expect(Number(calls?.[1])).toBeGreaterThanOrEqual(10);
    expect(probe).toMatch(/array\['auto', 'force_generic_plan'\]/);
    expect(probe).toMatch(/if v_n < 10 then/);
    expect(probe).toMatch(/^begin read only;$/m);
    expect(probe).toMatch(/^rollback;$/m);
  });

  it("the rule reads the three cases", () => {
    const idx = "begin;\ncreate index concurrently x on t (c);\ncommit;";
    expect(planCacheProofProblem(idx)).toMatch(/without/);
    expect(
      planCacheProofProblem(
        `-- @plan-cache-proof: scripts/db-proof/plan-cache-probe.sql, auto + force_generic_plan, worst 140 ms\n${idx}`,
      ),
    ).toBeNull();
    expect(planCacheProofProblem(`-- @plan-cache-proof: n/a — uniqueness only, no RPC filters by it\n${idx}`)).toBeNull();
    expect(planCacheProofProblem(`-- @plan-cache-proof: fast\n${idx}`)).toMatch(/must cite/);
    expect(planCacheProofProblem("-- create index in a comment only\nselect 1;")).toBeNull();
  });

  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && f.slice(0, 14) >= RULE_FROM)) {
    it(`${file}: an index/extension carries its plan-cache proof`, () => {
      expect(planCacheProofProblem(readFileSync(join(MIGRATIONS, file), "utf8")), file).toBeNull();
    });
  }
});
