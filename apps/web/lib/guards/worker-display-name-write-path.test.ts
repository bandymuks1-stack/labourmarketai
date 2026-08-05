import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * WORKER DISPLAY-NAME WRITE-PATH GUARDS.
 *
 * The defect (docs/audits/worker-display-name-canonical-write-path-broken.md):
 * 0009's `on_profile_created_ensure_worker` trigger makes the `public.workers`
 * row always pre-exist, which inverted 0008's
 * `insert … on conflict (profile_id) do nothing` in `complete_onboarding`'s
 * worker branch from "unreachable" to "always taken" — silently discarding the
 * display name the person typed. `complete_onboarding` is the ONLY writer of
 * `workers.display_name` in the entire system, so the column stays NULL
 * forever and employer rosters fall back to a raw UUID fragment.
 *
 * These guards pin the repair so it cannot silently regress:
 *   1. the repair migration exists and its worker branch uses
 *      ON CONFLICT (profile_id) DO UPDATE with the preserve-on-blank coalesce;
 *   2. the LAST migration (by filename order) that redefines
 *      `complete_onboarding` is the repair (or a successor that keeps
 *      DO UPDATE) — a later refactor cannot quietly restore DO NOTHING;
 *   3. the repair migration carries NO `@human-gate-approved` marker unless an
 *      owner decision is recorded (it ships RED on purpose — see the
 *      human-gate package);
 *   4. the backfill refuses to run before the write-path fix (function-source
 *      guard present) and is ledger-first (BEFORE values captured pre-update);
 *   5. both migrations have paired rollback files.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");
const ROLLBACKS_DIR = join(REPO_ROOT, "supabase", "rollbacks");

const WRITE_PATH_MIGRATION =
  "20260805090000_worker_display_name_write_path_v1.sql";
const BACKFILL_MIGRATION =
  "20260805090100_worker_display_name_backfill_v1.sql";

const readMigration = (name: string) =>
  readFileSync(join(MIGRATIONS_DIR, name), "utf8");

/** SQL with `-- …` comment lines stripped so header prose cannot satisfy or
 *  trip a structural assertion. */
const stripComments = (sql: string) =>
  sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

/** The worker-branch insert…on conflict clause of complete_onboarding, if the
 *  file (re)defines that function. */
const workerConflictClause = (executableSql: string): string | null => {
  if (!/function\s+public\.complete_onboarding/i.test(executableSql)) {
    return null;
  }
  const match = executableSql.match(
    /insert\s+into\s+public\.workers[\s\S]*?on\s+conflict\s*\(profile_id\)\s*do\s+(nothing|update)/i,
  );
  return match ? match[1].toLowerCase() : null;
};

describe("worker display-name write path", () => {
  it("repair migration exists with DO UPDATE + preserve-on-blank coalesce", () => {
    const sql = stripComments(readMigration(WRITE_PATH_MIGRATION));
    expect(workerConflictClause(sql)).toBe("update");
    expect(sql).toMatch(
      /display_name\s*=\s*coalesce\(\s*excluded\.display_name,\s*workers\.display_name\)/i,
    );
    expect(sql).toMatch(
      /current_location_country\s*=\s*coalesce\(/i,
    );
    // workers has no set_updated_at trigger — the upsert must set it by hand.
    expect(sql).toMatch(/updated_at\s*=\s*now\(\)/i);
  });

  it("the LAST redefinition of complete_onboarding keeps DO UPDATE", () => {
    const redefiners = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => ({
        file: f,
        clause: workerConflictClause(stripComments(readMigration(f))),
      }))
      .filter((entry) => entry.clause !== null);

    expect(redefiners.length).toBeGreaterThanOrEqual(2); // 0008 + the repair
    const last = redefiners[redefiners.length - 1];
    expect(
      last.clause,
      `${last.file} is the last migration defining complete_onboarding and ` +
        "its worker branch must not regress to ON CONFLICT DO NOTHING",
    ).toBe("update");
  });

  it("repair and backfill ship RED — no unapproved human-gate marker", () => {
    // The marker asserts a RECORDED owner decision. Adding it without one is
    // forbidden (see docs/human-gates/worker-display-name-write-path-gate.md —
    // when the owner approves, the approval is recorded THERE first and the
    // marker added in the same commit; then this assertion is updated).
    // Same line-anchored detection as .github/scripts/migration-safety.mjs —
    // prose MENTIONS of the marker in header comments do not count.
    const ANNOTATION = /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i;
    for (const name of [WRITE_PATH_MIGRATION, BACKFILL_MIGRATION]) {
      expect(
        ANNOTATION.test(readMigration(name)),
        `${name} must not carry @human-gate-approved before an owner decision`,
      ).toBe(false);
    }
  });

  it("backfill refuses to run before the write-path fix and is ledger-first", () => {
    const raw = readMigration(BACKFILL_MIGRATION);
    const sql = stripComments(raw);
    // Function-source guard.
    expect(sql).toMatch(/pg_get_functiondef/i);
    expect(sql).toMatch(/do\s+update/i);
    // Ledger-first ordering: the reversal-ledger INSERT must appear BEFORE the
    // workers UPDATE in the executable SQL.
    const ledgerInsert = sql.search(
      /insert\s+into\s+public\.worker_display_name_backfill_20260805/i,
    );
    const workersUpdate = sql.search(/update\s+public\.workers/i);
    expect(ledgerInsert).toBeGreaterThan(-1);
    expect(workersUpdate).toBeGreaterThan(-1);
    expect(ledgerInsert).toBeLessThan(workersUpdate);
    // Hole-filling only: the ledger AFTER value keeps a stored name first.
    expect(sql).toMatch(/coalesce\(w\.display_name,/i);
    // Reversal ledger is default-deny.
    expect(sql).toMatch(
      /alter\s+table\s+public\.worker_display_name_backfill_20260805\s+enable\s+row\s+level\s+security/i,
    );
  });

  it("both migrations have paired rollbacks", () => {
    const rollbacks = readdirSync(ROLLBACKS_DIR);
    expect(rollbacks).toContain(
      "20260805090000_worker_display_name_write_path_v1.down.sql",
    );
    expect(rollbacks).toContain(
      "20260805090100_worker_display_name_backfill_v1.down.sql",
    );
  });
});
