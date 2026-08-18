/**
 * LIVE PARITY GATE — every production migration must have a repository file.
 *
 *   DB_URL=postgresql://... pnpm check:migration-parity
 *
 * Doctrine §16 (REQ-GOV-016 / REQ-GOV-014): the repository IS the audit trail.
 * If a migration was applied to production and its file is not here, the schema
 * cannot be rebuilt from the repo and the repo is quietly lying about what
 * production is.
 *
 * WHY A LIVE CHECK IS REQUIRED. Static analysis of `supabase/migrations`
 * cannot see this class of defect at all: the orphan is defined by its ABSENCE
 * from the repo. Only production's own `supabase_migrations.schema_migrations`
 * knows what was applied. The 2026-08-18 audit found exactly one genuine
 * orphan (`20260705240000_agency_legacy_retype`) that had been invisible for
 * six weeks — applied via MCP, the next migration renumbered around it, and
 * the file never committed.
 *
 * FAILS ON:
 *   1. a production ledger row with no repo file and no REVIEWED apply shape;
 *   2. a reviewed apply shape naming a repo file that no longer exists (a
 *      stale excuse is how a gate rots into a rubber stamp).
 *
 * REPORTS WITHOUT FAILING:
 *   - repo files not yet applied. That is the NORMAL state of a feature branch
 *     and of any gated migration awaiting a lead apply; failing on it would
 *     make the gate unusable exactly when it matters.
 *
 * STRICTLY READ-ONLY. It opens a read-only transaction and reads one system
 * table, so it is safe to point at production — which is the intended use.
 */

import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import {
  checkMigrationParity,
  type ProductionMigration,
} from "../apps/web/lib/migrations/parity-model.ts";

/**
 * NO SILENT DEFAULT — the `check-anon-secdef-allowlist` precedent. A gate that
 * passes because it checked an empty local database is worse than no gate.
 */
const DB_URL = process.env.DB_URL;
if (!DB_URL) {
  console.error(
    [
      "check-migration-parity: DB_URL is not set.",
      "This guard asserts something about a REAL database and refuses to guess which one.",
      "  local:      DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm check:migration-parity",
      "  production: DB_URL=<production connection string> pnpm check:migration-parity",
    ].join("\n"),
  );
  process.exit(2);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = resolve(ROOT, "supabase/migrations");

const repoStems = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.slice(0, -4))
  .sort((a, b) => a.localeCompare(b));

const client = new Client({ connectionString: DB_URL });
let failed = false;

try {
  await client.connect();
  await client.query("begin read only");
  const { rows } = await client.query<ProductionMigration>(
    "select version, name from supabase_migrations.schema_migrations order by version",
  );
  await client.query("rollback");

  const result = checkMigrationParity(rows, repoStems);

  console.log(
    `check-migration-parity: ${rows.length} applied in production, ` +
      `${repoStems.length} files in repo.`,
  );
  console.log(
    `  matched by name: ${result.matchedDirectly.length}` +
      `   reviewed split/union/follow-up: ${result.reviewed.length}` +
      `   not yet applied: ${result.unapplied.length}`,
  );

  if (result.unapplied.length > 0) {
    console.log("\nRepo files with no production ledger row (informational):");
    for (const stem of result.unapplied) console.log(`  - ${stem}`);
  }

  if (result.orphans.length > 0) {
    failed = true;
    console.error(
      `\nFAIL — ${result.orphans.length} migration(s) applied to production with no repo file:`,
    );
    for (const o of result.orphans) {
      console.error(`  - name=${o.name}  (ledger version ${o.version})`);
    }
    console.error(
      [
        "",
        "Recover the applied SQL and commit it, do NOT add a reviewed apply shape to silence this:",
        "  select array_to_string(statements, E'\\n') from supabase_migrations.schema_migrations where name = '<name>';",
        "Restore it as supabase/migrations/<timestamp>_<name>.sql marked ALREADY APPLIED,",
        "with a paired rollback, and record it in docs/migrations/production-parity-register.md.",
      ].join("\n"),
    );
  } else {
    console.log("\nPASS — every production migration has a repository file.");
  }
} catch (error) {
  failed = true;
  console.error("check-migration-parity: FAILED to complete the check.");
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  await client.end().catch(() => {});
}

process.exit(failed ? 1 : 0);
