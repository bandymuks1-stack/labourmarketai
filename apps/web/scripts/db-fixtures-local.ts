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
 * A SECOND STATEMENT BATCH — THE CANONICAL DEMAND SEED (2026-09-05). The market
 * drilldown no longer reads `job_demands → projects`; it reads the ONE canonical
 * demand source (`customer_requests`, status 'submitted') through the same
 * authorized paths the marker uses. The acceptance run therefore needs canonical
 * rows or every marker opens onto an empty list. That seed is applied here,
 * immediately after `dev-fixtures.sql` and through the same psql path, so it
 * travels with the assertions that prove it landed — a seed whose counts are
 * asserted somewhere else is exactly how a silently-absent case survives a green
 * run. `dev-fixtures.sql` keeps the frozen `job_demands` vocabulary untouched.
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
  // ── CANONICAL DEMAND — what the drilldown actually reads (prefix 3c…) ───
  // Same rule as the Goal 3 block above: every CASE is asserted on its own,
  // because an aggregate count of six passes while the one German row that
  // makes the approximate-country aggregate reachable is silently absent.
  "public.customer_requests where id::text like '3c%' and status = 'submitted'": 6,
  // Owned by the acceptance identity itself — that ownership IS the authorized
  // read path (`customer_requests_select`: profile_id = auth.uid()). A row
  // seeded under any other profile is invisible to the acceptance session and
  // would prove nothing.
  "public.customer_requests where id::text like '3c%' and profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'":
    6,
  "public.customer_requests where id::text like '3c%' and country = 'NL' and location = 'Rotterdam'":
    3,
  // Three DISTINCT roles in the one city: three rows carrying one role text
  // would let a drilldown that collapsed needs into a single unit pass.
  "(select distinct role_or_work_type from public.customer_requests where id::text like '3c%' and location = 'Rotterdam') r":
    3,
  "(select distinct team_size from public.customer_requests where id::text like '3c%' and location = 'Rotterdam') s":
    3,
  "public.customer_requests where id::text like '3c%' and country = 'NL' and location = 'Eindhoven'":
    1,
  // Duisburg is NOT in the canonical city table → the approximate DE aggregate.
  "public.customer_requests where id::text like '3c%' and country = 'DE' and location = 'Duisburg'":
    1,
  // Hamburg IS in it → it must stay OUT of that aggregate. The negative control
  // only exists if the row exists.
  "public.customer_requests where id::text like '3c%' and country = 'DE' and location = 'Hamburg'":
    1,
  // ── base identities ────────────────────────────────────────────────────
  "auth.users": 3,
  "public.profiles": 3,
  "public.workers": 3,
  "public.companies": 1,
};

/**
 * THE CANONICAL DEMAND SEED — the rows the market drilldown actually reads.
 *
 * `dev-fixtures.sql` seeds `job_demands → projects`. That shape is FROZEN
 * vocabulary (0 rows in production for its whole life, nothing a customer
 * touches writes it) and it is left exactly as it is — other fixtures assert
 * it. This block ADDS the canonical set beside it: `customer_requests` rows,
 * status 'submitted', which is the ONE demand source both the market marker
 * and the drilldown behind it now read.
 *
 * OWNERSHIP IS THE AUTHORIZATION. The rows belong to the acceptance identity
 * (`dev.worker@local.test`, profile aaaaaaaa…0001), because the canonical read
 * reaches them through that person's OWN-ROWS policy
 * (`customer_requests_select`: profile_id = auth.uid()). No RLS is loosened, no
 * service-role read is introduced and no definer bypass is added: the fixture
 * is only demand this session is already entitled to see.
 *
 * WHY `kind = 'customer_request'` AND NOT 'company_request'. The canonical read
 * fails CLOSED on employer demand for a caller with no resolved employer
 * workspace — it keeps only the non-employer kinds (null / buyer_request /
 * customer_request) for such a caller, and the worker-gated RPC leg additionally
 * requires the row's owner to have a VERIFIED company. The acceptance identity is
 * a worker in a personal space, so a `company_request` seeded under it would be
 * read by neither leg and would land as an empty list — the exact defect this
 * seed exists to make visible. The kind is chosen to match the authorized path,
 * not to widen it.
 *
 * THE CASES, each of which one scenario depends on:
 *   * THREE NEEDS IN ONE CITY (Rotterdam, NL) with DISTINCT role texts and
 *     DISTINCT team sizes — one canonical need is ONE row, so the drilldown
 *     must show three. One row per city would let a collapsing bug pass.
 *   * A SECOND CITY (Eindhoven, NL) — the result has to change with the place.
 *   * AN UNRESOLVED CITY (Duisburg, DE) — not in the canonical city table, so
 *     it folds into the approximate country aggregate the dashed marker shows.
 *   * A RESOLVED CITY IN THE SAME COUNTRY (Hamburg, DE) — the negative control:
 *     it must NOT appear under that country aggregate.
 *   * NO LT ROWS — Vilnius stays the honest-empty case.
 *
 * NOTHING HERE IS A GAP FILLED IN. Start/end dates, skills and an organisation
 * name are absent from the canonical contract for a need, so they are absent
 * here too and the drilldown states them as gaps rather than printing a zero.
 *
 * Prefix 3c… , RFC-4122 v4-shaped ids (version nibble 4, variant nibble 8) —
 * a non-RFC uuid fails `z.uuid()` elsewhere in this repo. Idempotent by upsert
 * on those stable ids: `do nothing` would silently keep an older run's text
 * while this file declared new text, which is how a fixture starts lying.
 * LOCAL DETERMINISTIC ACCEPTANCE ROWS IN A REAL DOMAIN TABLE. Not production
 * data.
 */
const CANONICAL_DEMAND_SQL = `
insert into public.customer_requests
  (id, profile_id, kind, status, title, role_or_work_type,
   country, location, team_size, payload)
values
  ('3c000000-0000-4000-8000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','customer_request','submitted',
   'Rotterdam haven - suvirinimo darbai','Suvirintojas','NL','Rotterdam',9,
   '{"fixture":"goal3-canonical-demand"}'::jsonb),
  ('3c000000-0000-4000-8000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','customer_request','submitted',
   'Rotterdam Maasvlakte - montavimo darbai','Montuotojas','NL','Rotterdam',5,
   '{"fixture":"goal3-canonical-demand"}'::jsonb),
  ('3c000000-0000-4000-8000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','customer_request','submitted',
   'Rotterdam Kralingen - elektros instaliacija','Elektrikas','NL','Rotterdam',3,
   '{"fixture":"goal3-canonical-demand"}'::jsonb),
  ('3c000000-0000-4000-8000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','customer_request','submitted',
   'Eindhoven campus - automatikos darbai','Automatikos technikas','NL','Eindhoven',4,
   '{"fixture":"goal3-canonical-demand"}'::jsonb),
  ('3c000000-0000-4000-8000-000000000005','aaaaaaaa-0000-0000-0000-000000000001','customer_request','submitted',
   'Duisburg Logistikzentrum - Elektroinstallation','Elektriker','DE','Duisburg',6,
   '{"fixture":"goal3-canonical-demand"}'::jsonb),
  ('3c000000-0000-4000-8000-000000000006','aaaaaaaa-0000-0000-0000-000000000001','customer_request','submitted',
   'Hamburg Hafen - Schweissarbeiten','Schweisser','DE','Hamburg',2,
   '{"fixture":"goal3-canonical-demand"}'::jsonb)
on conflict (id) do update
  set profile_id        = excluded.profile_id,
      kind              = excluded.kind,
      status            = excluded.status,
      title             = excluded.title,
      role_or_work_type = excluded.role_or_work_type,
      country           = excluded.country,
      location          = excluded.location,
      team_size         = excluded.team_size,
      payload           = excluded.payload;
`;

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

/**
 * Apply one statement batch, container first and the host client as a fallback,
 * and EXIT rather than continue on any failure — including the status-0 failure
 * (a client that ignored its arguments) that once produced a false success.
 *
 * Shared by both batches on purpose: a second apply path would be a second set
 * of failure rules to drift out of step with this one.
 */
function applySqlOrExit(sql: Buffer, what: string, dbUrl: string): string {
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
    console.error(`[fixtures] psql stderr (${via}, ${what}):\n${run.stderr.trim()}`);
  }
  // A client that ignored its arguments is a failure even at status 0.
  if (/extra command-line argument/i.test(run.stderr)) {
    console.error(
      `[fixtures] FAILED: the psql client ignored its arguments — ${what} was ` +
        "NOT applied. This is the defect that previously produced a false " +
        "success. Install a compatible PostgreSQL client or start the local " +
        "stack so the container client can be used.",
    );
    process.exit(1);
  }
  if (!run.ok) {
    console.error(
      `[fixtures] FAILED: psql (${via}) exited with status ${run.status} applying ${what}.`,
    );
    process.exit(1);
  }
  return via;
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
  const via = applySqlOrExit(sql, "dev-fixtures.sql", dbUrl);

  // The canonical demand seed goes in SECOND and separately: it depends on the
  // profiles `dev-fixtures.sql` creates, and keeping it a batch of its own means
  // a failure names which set did not land instead of "the fixtures failed".
  console.log("[fixtures] applying the canonical demand seed…");
  applySqlOrExit(
    Buffer.from(CANONICAL_DEMAND_SQL, "utf8"),
    "the canonical demand seed",
    dbUrl,
  );

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
