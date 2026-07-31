/**
 * pnpm db:fixtures:local — apply supabase/dev-fixtures.sql to a LOCAL
 * Supabase instance only.
 *
 * HARD GUARD (brief §10.2): refuses to run unless the target is demonstrably
 * the local stack. See `lib/testing/local-supabase-guard.ts`.
 *
 * WHY THIS WAS REWRITTEN (2026-07-25). The previous version spawned
 * `psql <url> -v ON_ERROR_STOP=1 -f <path>`. The `psql` on Windows' PATH treats
 * the trailing arguments as positional, prints
 * `extra command-line argument "..." ignored`, applies NOTHING — and exits 0.
 * The script checked the exit status, saw 0, and printed
 * "Dev fixtures applied to the local instance." while `auth.users` was still 0.
 * A green run therefore proved nothing, and the e2e suite ran against an empty
 * database.
 *
 * Two changes make that impossible now:
 *   1. the SQL is fed through STDIN (`-f -`), which no psql build can silently
 *      mis-parse, and the container client is preferred because it is
 *      deterministic;
 *   2. the script ASSERTS the resulting row counts and exits 1 on any mismatch.
 *      Success is printed only after those assertions pass — process exit
 *      status is never treated as proof of work done.
 *
 * Run with cwd = apps/web (pnpm -C apps/web db:fixtures:local).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  NonLocalTargetError,
  assertLocalSupabaseTarget,
} from "../lib/testing/local-supabase-guard";
import {
  describeLocalTarget,
  resolveLocalSupabaseEnv,
} from "../lib/testing/local-supabase-env";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const DB_CONTAINER = "supabase_db_labourmarketai";

/**
 * Row counts `supabase/dev-fixtures.sql` must produce. Asserted after apply —
 * these are the contract the e2e suite depends on. `workers` is the worker
 * profile table (there is no `worker_profiles` relation in this schema).
 */
export const EXPECTED_FIXTURE_COUNTS: Record<string, number> = {
  // ── ACCEPTANCE SCENARIO (unified premium product v1) ───────────────────
  // Asserted so an under-seeded database FAILS here rather than surfacing
  // later as an empty premium-looking panel in a screenshot. Every §14
  // scenario reads one of these.
  //
  // Scoped to the acceptance rows' DETERMINISTIC id prefixes rather than
  // counting the whole table. A bare table count is not a fixture assertion:
  // it also counts rows left behind by earlier e2e runs, so it passes when the
  // acceptance seed did nothing and fails when the database is merely dirty.
  // These keys are interpolated into `select count(*) from <relation>`.
  "public.journal_entries where id::text like '1e111111%'": 14,
  "public.journal_entry_skills where id::text like '1f111111%'": 14,
  "public.worker_documents where id::text like 'cdcdcdcd%'": 2,
  "public.worker_absences where id::text like 'abababab%'": 1,
  "public.projects where id::text like '2b%'": 9,
  "public.job_demands where id::text like '2b1%' and status = 'open'": 10,
  // Goal 3 needs the CASES, not just the rows: three projects in one city
  // (Rotterdam), one with complete timing, one with none, and one carrying
  // real `required_skills` uuids. Each is asserted separately because an
  // aggregate count passes while any individual case is silently absent —
  // and an absent case is exactly what makes a green acceptance run a lie.
  "public.projects where city = 'Rotterdam' and status = 'live'": 3,
  "public.projects where id::text like '2b%' and start_date is not null and end_date is not null":
    1,
  "public.projects where id::text like '2b%' and start_date is null and end_date is null":
    8,
  "public.job_demands where id::text like '2b1%' and array_length(required_skills, 1) >= 2":
    2,
  // ── base identities ────────────────────────────────────────────────────
  "auth.users": 3,
  "public.profiles": 3,
  "public.workers": 3,
  "public.companies": 1,
};

/** Result of one psql attempt, normalised. */
type PsqlRun = { ok: boolean; status: number | null; stderr: string };

function runPsqlViaContainer(sql: Buffer): PsqlRun {
  const res = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-",
    ],
    { input: sql, encoding: "buffer" },
  );
  const stderr = res.stderr?.toString() ?? "";
  return { ok: !res.error && res.status === 0, status: res.status, stderr };
}

function runPsqlViaHost(sql: Buffer, dbUrl: string): PsqlRun {
  // STDIN (`-f -`) rather than a path: a client that mis-parses positional
  // arguments cannot silently skip the file.
  const res = spawnSync(
    "psql",
    [dbUrl, "-v", "ON_ERROR_STOP=1", "-f", "-"],
    { input: sql, encoding: "buffer" },
  );
  const stderr = res.stderr?.toString() ?? "";
  return { ok: !res.error && res.status === 0, status: res.status, stderr };
}

/** Query one count via the container's psql. Returns null when unreadable. */
function countRows(relation: string): number | null {
  const res = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-qtA",
      "-c",
      `select count(*) from ${relation};`,
    ],
    { encoding: "utf8" },
  );
  if (res.error || res.status !== 0) return null;
  const n = Number.parseInt((res.stdout ?? "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Verify the fixtures actually landed. Exits 1 on ANY mismatch — this, not the
 * psql exit status, is what makes a green run meaningful.
 */
export function assertFixtureCounts(
  read: (relation: string) => number | null = countRows,
  expected: Record<string, number> = EXPECTED_FIXTURE_COUNTS,
): { ok: boolean; failures: string[]; observed: Record<string, number | null> } {
  const failures: string[] = [];
  const observed: Record<string, number | null> = {};
  for (const [relation, want] of Object.entries(expected)) {
    const got = read(relation);
    observed[relation] = got;
    if (got === null) {
      failures.push(`${relation}: could not be read`);
    } else if (got !== want) {
      failures.push(`${relation}: expected ${want}, got ${got}`);
    }
  }
  return { ok: failures.length === 0, failures, observed };
}

function main(): void {
  // Prove the stack is local BEFORE touching anything. Never reads .env.local.
  let local;
  try {
    local = resolveLocalSupabaseEnv(REPO_ROOT);
  } catch (err) {
    if (err instanceof NonLocalTargetError) {
      console.error(`Refusing to apply dev fixtures: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
  // Re-assert explicitly so the intent is visible at the call site too.
  assertLocalSupabaseTarget({
    url: local.url,
    anonKey: local.anonKey,
    serviceKey: local.serviceKey,
  });
  console.log(`[fixtures] ${describeLocalTarget(local)}`);

  const sqlPath = join(REPO_ROOT, "supabase", "dev-fixtures.sql");
  if (!existsSync(sqlPath)) {
    console.error(`dev-fixtures.sql not found at ${sqlPath}`);
    process.exit(1);
  }
  const sql = readFileSync(sqlPath);

  const dbUrl =
    process.env.SUPABASE_DB_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

  console.log("[fixtures] applying dev-fixtures.sql…");
  // Container first: deterministic, and it is running whenever the local stack
  // is up. The host client is only a fallback.
  let run = runPsqlViaContainer(sql);
  let via = "container";
  if (!run.ok) {
    console.log(
      `[fixtures] container psql unavailable or failed (status=${run.status}); ` +
        "trying host psql via stdin…",
    );
    run = runPsqlViaHost(sql, dbUrl);
    via = "host";
  }

  if (run.stderr.trim()) {
    console.error(`[fixtures] psql stderr (${via}):\n${run.stderr.trim()}`);
  }
  // A client that ignored its arguments is a failure even at status 0.
  if (/extra command-line argument/i.test(run.stderr)) {
    console.error(
      "[fixtures] FAILED: the psql client ignored its arguments — the SQL was " +
        "NOT applied. This is the defect that previously produced a false " +
        "success. Install a compatible PostgreSQL client or start the local " +
        "stack so the container client can be used.",
    );
    process.exit(1);
  }
  if (!run.ok) {
    console.error(
      `[fixtures] FAILED: psql (${via}) exited with status ${run.status}.`,
    );
    process.exit(1);
  }

  const { ok, failures, observed } = assertFixtureCounts();
  console.log(
    "[fixtures] observed row counts: " +
      Object.entries(observed)
        .map(([r, n]) => `${r}=${n ?? "?"}`)
        .join(" "),
  );
  if (!ok) {
    console.error(
      "[fixtures] FAILED: post-apply assertions did not hold:\n  " +
        failures.join("\n  ") +
        "\nThe fixtures were NOT applied correctly. Refusing to report success.",
    );
    process.exit(1);
  }

  // Only now — after the data is proven present — may we claim success.
  console.log(`Dev fixtures applied to the local instance (via ${via}).`);
}

// Guard the import used by unit tests: only run when invoked as a script.
if (require.main === module) main();
