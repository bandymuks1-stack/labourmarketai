#!/usr/bin/env node
/**
 * README — work-plan-shift-patterns-local.mjs
 * ===========================================
 *
 * Behavioural proof for the RED migration (CAL-8, shifts / rotas)
 *   supabase/migrations/20261023160000_work_plan_shift_patterns_v1.sql
 *   supabase/rollbacks/20261023160000_work_plan_shift_patterns_v1.down.sql
 * on a THROWAWAY local PostgreSQL 16 cluster. Never touches a remote database,
 * needs no Supabase credentials and no Docker.
 *
 * What it does
 *   1. Creates a fresh database; builds the minimal shapes the migration
 *      touches: roles anon / authenticated / service_role, a stub auth.uid()
 *      reading request.jwt.claims, profiles, organizations, workers, projects,
 *      work_objects, the calendar source tables the validator reads, and a
 *      stub manages_organization() + work_plan_worker_in_scope_v1().
 *   2. Applies 20261003150200_work_plan_entries_v2.sql VERBATIM (the applied
 *      table this migration extends), then the CAL-8 migration VERBATIM.
 *   3. T1  CHECK parity: every pattern the TypeScript parser accepts/refuses
 *          (lib/planning/shift-pattern.ts) gets the same answer from
 *          work_plan_recurrence_valid_v1.
 *      T2  Shift-day parity: work_plan_is_shift_day_v1 agrees with the
 *          TypeScript isShiftDay on 120 days for several patterns.
 *      T3  create_work_plan_entry_v2 as a manager stores the pattern; refuses
 *          a malformed pattern and a pattern with no working day; refuses a
 *          non-manager; a NULL pattern behaves like v1.
 *      T4  The CHECK refuses a malformed pattern even on a direct write.
 *      T5  The override validator accepts exactly the run intersections the
 *          app's reserveCapacity produces for a patterned plan, refuses an
 *          overlap that spans a rest day or stops inside a run, and keeps the
 *          old predicate for a plan without a pattern.
 *      T6  The rollback refuses while a patterned row exists; once none does
 *          it removes the column/functions and restores the validator body
 *          byte-for-byte; the migration re-applies cleanly afterwards.
 *   4. Drops the database. Exit code 1 if any test FAILs.
 *
 * How to run (Windows, PostgreSQL 16 in C:\Program Files\PostgreSQL\16\bin)
 *   "C:\Program Files\PostgreSQL\16\bin\initdb.exe" -D .tmp\pg -U postgres --auth=trust -E UTF8 --no-locale
 *   "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"  -D .tmp\pg -o "-p 54399 -c listen_addresses=127.0.0.1 -c fsync=off" -l .tmp\pg.log -w start
 *   node apps/web/scripts/db-proof/work-plan-shift-patterns-local.mjs
 *   "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe" -D .tmp\pg -w stop
 * Node >= 22.18 (type stripping) is needed: the script imports the
 * TypeScript model itself so parity is checked against the real code.
 *
 * Environment: LM_PROOF_PGHOST (127.0.0.1) · LM_PROOF_PGPORT (54399) ·
 * LM_PROOF_PGUSER (postgres) · LM_PROOF_DBNAME (lm_shift_pattern_proof).
 * Refuses a non-loopback host. Never point it at production.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..", "..");
const BASE_PATH = join(ROOT, "supabase/migrations/20261003150200_work_plan_entries_v2.sql");
const VALIDATOR_V1_PATH = join(ROOT, "supabase/migrations/20261003150950_commitment_override_collision_validation_v1.sql");
const UP_PATH = join(ROOT, "supabase/migrations/20261023160000_work_plan_shift_patterns_v1.sql");
const DOWN_PATH = join(ROOT, "supabase/rollbacks/20261023160000_work_plan_shift_patterns_v1.down.sql");
const LAST_RUN = join(__dirname, "work-plan-shift-patterns-local.last-run.txt");

const host = process.env.LM_PROOF_PGHOST ?? "127.0.0.1";
const port = Number(process.env.LM_PROOF_PGPORT ?? 54399);
const user = process.env.LM_PROOF_PGUSER ?? "postgres";
const dbname = process.env.LM_PROOF_DBNAME ?? "lm_shift_pattern_proof";
if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
  console.error("refusing a non-loopback host");
  process.exit(2);
}

// Resolve the app's "@/…" alias so the REAL TypeScript model is imported
// (parity against the code that ships, not a re-implementation).
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const file = join(ROOT, "apps/web", `${specifier.slice(2)}.ts`);
      if (existsSync(file)) return nextResolve(pathToFileURL(file).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const model = await import(pathToFileURL(join(ROOT, "apps/web/lib/planning/shift-pattern.ts")).href);
const reservation = await import(
  pathToFileURL(join(ROOT, "apps/web/lib/workforce/commitment-reservation.ts")).href
);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

const ORG = "00000000-0000-4000-8000-0000000000a1";
const OTHER_ORG = "00000000-0000-4000-8000-0000000000a2";
const MANAGER = "00000000-0000-4000-8000-0000000000b1";
const STRANGER = "00000000-0000-4000-8000-0000000000b2";
const WORKER_PROFILE = "00000000-0000-4000-8000-0000000000b3";
const WORKER = "00000000-0000-4000-8000-0000000000c1";
const PROJECT = "00000000-0000-4000-8000-0000000000d1";

const SETUP = `
do $r$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $r$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create table public.profiles (id uuid primary key);
create table public.organizations (id uuid primary key, legacy_company_id uuid, legacy_agency_id uuid);
create table public.workers (id uuid primary key, profile_id uuid references public.profiles(id));
create table public.projects (id uuid primary key, organization_id uuid, start_date date, end_date date);
create table public.work_objects (id uuid primary key, organization_id uuid, name text);
create table public.project_worker_assignments (project_id uuid, worker_id uuid, status text);
create table public.booking_requests (id uuid primary key, worker_id uuid, status text, start_date date, expected_end_date date);
create table public.business_trips (id uuid primary key, profile_id uuid, status text, date_from date, date_to date);
create table public.worker_absences (id uuid primary key, worker_id uuid, status text, start_date date, end_date date);
create table public.company_worker_engagements (company_id uuid, worker_id uuid, status text);
create table public.company_memberships (organization_id uuid, profile_id uuid, status text);
create table public.agency_workers (agency_id uuid, worker_id uuid, status text);
create function public.manages_organization(p uuid) returns boolean language sql stable as $$
  select auth.uid() = '${MANAGER}'::uuid and p = '${ORG}'::uuid
$$;
insert into public.profiles values ('${MANAGER}'), ('${STRANGER}'), ('${WORKER_PROFILE}');
insert into public.organizations (id) values ('${ORG}'), ('${OTHER_ORG}');
insert into public.workers values ('${WORKER}', '${WORKER_PROFILE}');
insert into public.projects values ('${PROJECT}', '${ORG}', '2026-11-02', '2026-11-30');
insert into public.company_memberships values ('${ORG}', '${WORKER_PROFILE}', 'active');
`;

async function asRole(c, role, sub, fn) {
  await c.query("begin");
  try {
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub })]);
    const r = await fn();
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

function validatorBody(sql) {
  const s = sql.replace(/\r\n/g, "\n");
  const i = s.indexOf("create or replace function public.commitment_override_validate_collisions_v1(");
  const a = s.indexOf("$$", i) + 2;
  return s.slice(a, s.indexOf("$$", a));
}

const admin = new Client({ host, port, user, database: "postgres" });
await admin.connect();
await admin.query(`drop database if exists ${dbname}`);
await admin.query(`create database ${dbname}`);
const c = new Client({ host, port, user, database: dbname });
await c.connect();
let exitCode = 0;
try {
  await c.query(SETUP);
  await c.query(readFileSync(BASE_PATH, "utf8"));
  await c.query(readFileSync(UP_PATH, "utf8"));
  check("migration applies on the applied work_plan_entries shape", true);

  // T1 — CHECK parity with the TypeScript parser.
  const cases = [
    { kind: "weekly", days: [1, 3, 5] },
    { kind: "weekly", days: [7] },
    { kind: "weekly", days: [1, 2, 3, 4, 5, 6, 7] },
    { kind: "weekly", days: [] },
    { kind: "weekly", days: [0] },
    { kind: "weekly", days: [8] },
    { kind: "weekly", days: [1, 1] },
    { kind: "weekly", days: ["1"] },
    { kind: "weekly", days: [1.5] },
    { kind: "weekly", days: [1], extra: true },
    { kind: "weekly" },
    { kind: "cycle", on: 4, off: 2 },
    { kind: "cycle", on: 4, off: 2, offset: 5 },
    { kind: "cycle", on: 28, off: 28, offset: 55 },
    { kind: "cycle", on: 0, off: 2 },
    { kind: "cycle", on: 4, off: 0 },
    { kind: "cycle", on: 29, off: 2 },
    { kind: "cycle", on: 4, off: 2, offset: 6 },
    { kind: "cycle", on: 4, off: 2, offset: -1 },
    { kind: "cycle", on: "4", off: 2 },
    { kind: "cycle", on: 4.5, off: 2 },
    { kind: "cycle", on: 4, off: 2, colour: "red" },
    { kind: "daily" },
    [],
    "weekly",
  ];
  let parity = 0;
  const mismatches = [];
  for (const p of cases) {
    const { rows } = await c.query("select public.work_plan_recurrence_valid_v1($1::jsonb) as ok", [JSON.stringify(p)]);
    const ts = model.parseShiftPattern(p) !== null;
    if (rows[0].ok === ts) parity++;
    else mismatches.push(JSON.stringify(p));
  }
  check(`T1 CHECK agrees with parseShiftPattern on ${cases.length} shapes`, parity === cases.length, mismatches.join(" "));

  // T2 — shift-day parity over 120 days.
  const patterns = [
    { kind: "weekly", days: [1, 2, 3, 4, 5] },
    { kind: "weekly", days: [6, 7] },
    { kind: "cycle", on: 4, off: 2, offset: 0 },
    { kind: "cycle", on: 4, off: 2, offset: 3 },
    { kind: "cycle", on: 14, off: 14, offset: 0 },
    { kind: "cycle", on: 1, off: 1, offset: 1 },
  ];
  const anchor = "2026-10-29"; // a Thursday
  let agree = 0;
  let total = 0;
  for (const p of patterns) {
    const { rows } = await c.query(
      `select to_char(d, 'YYYY-MM-DD') as day, public.work_plan_is_shift_day_v1($1::date, d::date, $2::jsonb) as on
         from generate_series($1::date - 2, $1::date + 117, interval '1 day') d`,
      [anchor, JSON.stringify(p)],
    );
    for (const r of rows) {
      total++;
      if (r.on === model.isShiftDay(p, anchor, r.day)) agree++;
    }
  }
  check(`T2 isShiftDay parity on ${total} pattern-days`, agree === total, `${agree}/${total}`);

  // T3 — the v2 command.
  const v2 = (recurrence, start = "2026-11-02", end = "2026-11-29") =>
    c.query(
      "select public.create_work_plan_entry_v2($1, $2, $3::date, $4::date, $5, null, '07:00', '19:00', null, $6::jsonb) as id",
      [ORG, WORKER, start, end, PROJECT, recurrence === null ? null : JSON.stringify(recurrence)],
    );
  const cycle = { kind: "cycle", on: 4, off: 2, offset: 0 };
  const created = await asRole(c, "authenticated", MANAGER, () => v2(cycle));
  const planId = created.rows[0].id;
  const stored = await c.query("select recurrence from public.work_plan_entries where id = $1", [planId]);
  check("T3a manager stores a rota through v2", JSON.stringify(model.parseShiftPattern(stored.rows[0].recurrence)) === JSON.stringify(cycle));
  const refuse = async (label, role, sub, rec, start, end, rx) => {
    try {
      await asRole(c, role, sub, () => v2(rec, start, end));
      check(label, false, "accepted");
    } catch (e) {
      check(label, rx.test(e.message), e.message);
    }
  };
  await refuse("T3b malformed pattern refused", "authenticated", MANAGER, { kind: "cycle", on: 0, off: 2 }, undefined, undefined, /invalid_recurrence/);
  await refuse("T3c pattern with no working day refused", "authenticated", MANAGER, { kind: "weekly", days: [6, 7] }, "2026-11-02", "2026-11-06", /recurrence_without_shift/);
  await refuse("T3d non-manager refused (authority unchanged)", "authenticated", STRANGER, cycle, undefined, undefined, /not_allowed/);
  const oneOff = await asRole(c, "authenticated", MANAGER, () => v2(null));
  const oneOffRow = await c.query("select recurrence from public.work_plan_entries where id = $1", [oneOff.rows[0].id]);
  check("T3e NULL pattern stores a one-off window", oneOffRow.rows[0].recurrence === null);
  try {
    await asRole(c, "authenticated", MANAGER, () =>
      c.query("insert into public.work_plan_entries (organization_id, worker_id, start_date, end_date, created_by) values ($1,$2,'2026-11-02','2026-11-03',$3)", [ORG, WORKER, MANAGER]),
    );
    check("T3f direct insert stays revoked", false, "accepted");
  } catch (e) {
    check("T3f direct insert stays revoked", /permission denied/.test(e.message), e.message);
  }

  // T4 — CHECK on a direct (owner) write.
  try {
    await c.query("update public.work_plan_entries set recurrence = '{\"kind\":\"weekly\",\"days\":[9]}' where id = $1", [planId]);
    check("T4 CHECK refuses a malformed pattern on a direct write", false, "accepted");
  } catch (e) {
    check("T4 CHECK refuses a malformed pattern on a direct write", /work_plan_entries_recurrence_valid/.test(e.message), e.message);
  }

  // T5 — the override validator against the app's own reserveCapacity runs.
  const validate = (collisions, ws = "2026-11-01", we = "2026-11-20") =>
    c.query("select public.commitment_override_validate_collisions_v1($1, $2, $3, $4::date, $5::date, $6::jsonb)", [
      "00000000-0000-4000-8000-0000000000d9",
      WORKER,
      WORKER_PROFILE,
      ws,
      we,
      JSON.stringify(collisions),
    ]);
  // The app side: the plan as runs, intersected with the project window.
  const runs = model.expandShiftRuns(cycle, "2026-11-02", "2026-11-29");
  let appCollisions = [];
  {
    const verdict = reservation.reserveCapacity({
      window: { startDate: "2026-11-01", endDate: "2026-11-20" },
      held: runs.map((r) => ({ source: "plan", sourceId: planId, label: null, startDate: r.startDate, endDate: r.endDate })),
    });
    appCollisions = verdict.collisions.map((col) => ({
      kind: "plan",
      sourceId: col.sourceId,
      overlapStart: col.overlapStart,
      overlapEnd: col.overlapEnd,
    }));
  }
  try {
    await validate(appCollisions);
    check(`T5a validator accepts the ${appCollisions.length} run collisions reserveCapacity produced`, appCollisions.length > 0);
  } catch (e) {
    check("T5a validator accepts the run collisions reserveCapacity produced", false, e.message);
  }
  const mustRefuse = async (label, collision) => {
    try {
      await validate([collision]);
      check(label, false, "accepted");
    } catch (e) {
      check(label, /collision not verified/.test(e.message), e.message);
    }
  };
  // Runs: 11-02..05, 11-08..11, 11-14..17, ...
  await mustRefuse("T5b overlap spanning a rest day refused", { kind: "plan", sourceId: planId, overlapStart: "2026-11-04", overlapEnd: "2026-11-09" });
  await mustRefuse("T5c overlap stopping inside a run refused", { kind: "plan", sourceId: planId, overlapStart: "2026-11-08", overlapEnd: "2026-11-10" });
  await mustRefuse("T5d whole-window overlap of a rota refused", { kind: "plan", sourceId: planId, overlapStart: "2026-11-02", overlapEnd: "2026-11-20" });
  try {
    await validate([{ kind: "plan", sourceId: planId, overlapStart: "2026-11-14", overlapEnd: "2026-11-15" }], "2026-11-01", "2026-11-15");
    check("T5e a run clipped by the window edge is accepted", true);
  } catch (e) {
    check("T5e a run clipped by the window edge is accepted", false, e.message);
  }
  try {
    await validate([{ kind: "plan", sourceId: oneOff.rows[0].id, overlapStart: "2026-11-02", overlapEnd: "2026-11-20" }]);
    check("T5f a one-off plan keeps the previous predicate", true);
  } catch (e) {
    check("T5f a one-off plan keeps the previous predicate", false, e.message);
  }

  // T6 — rollback.
  try {
    await c.query(readFileSync(DOWN_PATH, "utf8"));
    check("T6a rollback refuses while a patterned row exists", false, "rolled back");
  } catch (e) {
    check("T6a rollback refuses while a patterned row exists", /rollback refused/.test(e.message), e.message);
  }
  await c.query("delete from public.work_plan_entries where recurrence is not null"); // throwaway DB only
  await c.query(readFileSync(DOWN_PATH, "utf8"));
  const col = await c.query(
    "select count(*)::int as n from information_schema.columns where table_name = 'work_plan_entries' and column_name = 'recurrence'",
  );
  const fns = await c.query(
    "select count(*)::int as n from pg_proc where proname in ('create_work_plan_entry_v2','work_plan_is_shift_day_v1','work_plan_recurrence_valid_v1')",
  );
  check("T6b rollback removes the column and the three new functions", col.rows[0].n === 0 && fns.rows[0].n === 0);
  const body = await c.query("select prosrc from pg_proc where proname = 'commitment_override_validate_collisions_v1'");
  const restored = createHash("md5").update(body.rows[0].prosrc).digest("hex");
  const original = createHash("md5").update(validatorBody(readFileSync(VALIDATOR_V1_PATH, "utf8"))).digest("hex");
  check("T6c rollback restores the validator byte-for-byte", restored === original, `${restored} vs ${original}`);
  await c.query(readFileSync(UP_PATH, "utf8"));
  check("T6d migration re-applies after rollback", true);
} catch (e) {
  check("unexpected error", false, e.message);
} finally {
  await c.end();
  await admin.query(`drop database if exists ${dbname}`);
  await admin.end();
}

const failed = results.filter((r) => !r.ok).length;
writeFileSync(
  LAST_RUN,
  [
    `work-plan-shift-patterns-local — ${new Date().toISOString()}`,
    "PostgreSQL 16, local throwaway cluster (synthetic ids only)",
    ...results.map((r) => `${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.ok ? `  — ${r.detail}` : ""}`),
    `${results.length - failed}/${results.length} passed`,
    "",
  ].join("\n"),
);
console.log(`${results.length - failed}/${results.length} passed`);
if (failed > 0) exitCode = 1;
process.exit(exitCode);
