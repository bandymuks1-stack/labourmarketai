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

import { readdirSync, readFileSync } from "node:fs";
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
 *
 * TWO INPUT MODES, both explicit:
 *   live:     DB_URL=postgresql://...            (read-only catalog read)
 *   snapshot: LEDGER_SNAPSHOT=<path to .json>    (a committed MCP-read snapshot
 *             of `supabase_migrations.schema_migrations`, produced by a lead
 *             session that has Supabase MCP access but no DB credentials —
 *             docs/migrations/production-ledger-snapshot.json)
 *
 * Snapshot mode exists because the remote lead sessions that actually APPLY
 * migrations reach production only through MCP, never a connection string —
 * without it the parity gate is unrunnable exactly where applies happen.
 * A snapshot run is honest about being as-of its read time, never "live".
 */
const DB_URL = process.env.DB_URL;
const LEDGER_SNAPSHOT = process.env.LEDGER_SNAPSHOT;
if (!DB_URL && !LEDGER_SNAPSHOT) {
  console.error(
    [
      "check-migration-parity: neither DB_URL nor LEDGER_SNAPSHOT is set.",
      "This guard asserts something about a REAL database and refuses to guess which one.",
      "  local:      DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm check:migration-parity",
      "  production: DB_URL=<production connection string> pnpm check:migration-parity",
      "  snapshot:   LEDGER_SNAPSHOT=docs/migrations/production-ledger-snapshot.json pnpm check:migration-parity",
    ].join("\n"),
  );
  process.exit(2);
}
if (DB_URL && LEDGER_SNAPSHOT) {
  console.error(
    "check-migration-parity: set DB_URL or LEDGER_SNAPSHOT, not both — a run must have one unambiguous source.",
  );
  process.exit(2);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = resolve(ROOT, "supabase/migrations");

const repoStems = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.slice(0, -4))
  .sort((a, b) => a.localeCompare(b));

/** Shape of the committed snapshot file (see docs/migrations/). */
type LedgerSnapshot = {
  readonly read_at: string;
  readonly method: string;
  readonly project_ref: string;
  readonly row_count: number;
  readonly rows: readonly ProductionMigration[];
};

function readSnapshotRows(path: string): ProductionMigration[] {
  const raw = JSON.parse(
    readFileSync(resolve(ROOT, path), "utf8"),
  ) as LedgerSnapshot;
  if (!Array.isArray(raw.rows) || raw.rows.length === 0) {
    throw new Error(`snapshot at ${path} has no rows`);
  }
  if (raw.row_count !== raw.rows.length) {
    throw new Error(
      `snapshot at ${path} is internally inconsistent: row_count=${raw.row_count} but rows=${raw.rows.length}`,
    );
  }
  for (const r of raw.rows) {
    if (typeof r?.version !== "string" || typeof r?.name !== "string") {
      throw new Error(`snapshot at ${path} has a malformed row`);
    }
  }
  console.log(
    [
      "check-migration-parity: SNAPSHOT MODE — NOT a live read.",
      `  source: ${path} (project ${raw.project_ref}, read ${raw.read_at})`,
      "  The result is as-of that read time; migrations applied since are invisible here.",
      "  Refresh the snapshot from the production ledger before trusting a PASS for an apply decision.",
    ].join("\n"),
  );
  return [...raw.rows];
}

const client = DB_URL ? new Client({ connectionString: DB_URL }) : null;
let failed = false;

try {
  let rows: ProductionMigration[];
  if (client) {
    await client.connect();
    await client.query("begin read only");
    const res = await client.query<ProductionMigration>(
      "select version, name from supabase_migrations.schema_migrations order by version",
    );
    await client.query("rollback");
    rows = res.rows;
  } else {
    rows = readSnapshotRows(LEDGER_SNAPSHOT as string);
  }

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
  const message = error instanceof Error ? error.message : String(error);
  // One specific, owner-actionable case is a WARN-AND-SKIP rather than a
  // failure: the configured read-only role can reach the database (so the
  // sibling anon-SECDEF gate runs) but has no USAGE on the ledger schema.
  // Failing the whole quality gate for a grant only the owner can add would
  // turn a missing privilege into a permanent red; passing silently would be
  // worse. So: loud warning naming the exact grant, then skip — the same
  // posture as the unconfigured-secret case in quality.yml.
  if (client && /permission denied for schema supabase_migrations/i.test(message)) {
    console.log(
      "::warning title=Live migration-parity gate NOT active::the configured DB_URL role has no USAGE on schema supabase_migrations, so repo↔production parity was NOT verified. Owner action: run `grant usage on schema supabase_migrations to <ci_role>; grant select on supabase_migrations.schema_migrations to <ci_role>;` for the read-only CI role. Snapshot-mode runs remain available to lead sessions.",
    );
    console.log(
      "SKIPPED — DB reachable but supabase_migrations is not readable by this role. Nothing was verified.",
    );
  } else {
    failed = true;
    console.error("check-migration-parity: FAILED to complete the check.");
    console.error(message);
  }
} finally {
  if (client) await client.end().catch(() => {});
}

process.exit(failed ? 1 : 0);
