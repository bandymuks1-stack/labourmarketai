#!/usr/bin/env node
/**
 * README — journal-evidence-integrity-local.mjs
 * =============================================
 *
 * ADVERSARIAL behavioural proof for the RED migration
 *   supabase/migrations/20261023132610_journal_evidence_integrity_v1.sql
 *   supabase/rollbacks/20261023132610_journal_evidence_integrity_v1.down.sql
 * on a THROWAWAY local PostgreSQL 16 cluster. It never touches a remote
 * database, never needs Supabase credentials, never uses Docker.
 *
 * What it does
 *   1. Creates a fresh database on the cluster you point it at.
 *   2. Builds a MINIMAL schema that mirrors the production shapes the
 *      migration touches: roles anon / authenticated / service_role (NOLOGIN,
 *      service_role BYPASSRLS) + a login role `authenticator` that SET ROLEs
 *      like PostgREST; schema `extensions` with pgcrypto; a stub `auth.uid()`
 *      that reads `request.jwt.claims` like Supabase; `profiles`, `workers`,
 *      `engagement_contexts`, `journal_entries` (every column the migration
 *      reads or pins, the 0013 select policy, the 20260530130000 insert
 *      policy, grants select+insert to authenticated), `journal_entry_photos`
 *      (20260612091000), a `storage.objects` + `storage.foldername()` stub
 *      with the 20260612091000 owner policies, `audit_logs` (0001), and a stub
 *      `journal_entries_attribution_guard_v1` trigger (20261003151300) that
 *      records which hash_self it saw so trigger ORDER can be proven, and
 *      `privacy_erasure_authorizations_v3` (20261019140000) with a SECURITY
 *      DEFINER stub of erase_user_account_v3's writes to the guarded tables.
 *   3. Inserts a LEGACY row (pre-migration shape) for a second worker.
 *   4. Applies the migration VERBATIM (the file is read and executed as-is).
 *   5. Runs tests T1..T11 (see the task list in the header of each test)
 *      plus the function-attribute assertions (SECURITY INVOKER verifier,
 *      `search_path=public, pg_temp` on every new function).
 *   6. Applies the rollback, asserts the objects are gone and the rows
 *      survived, re-applies the migration (idempotency).
 *   7. Drops the database. Exit code 1 if any test FAILs.
 *
 * How to run (Windows, PostgreSQL 16 binaries in C:\Program Files\PostgreSQL\16\bin)
 *   # from the repository root, once:
 *   pnpm install --frozen-lockfile --filter=!mobile      # `pg` is a root devDependency
 *   # start a throwaway cluster (any free port; the proof creates+drops its own DB):
 *   "C:\Program Files\PostgreSQL\16\bin\initdb.exe" -D .tmp\pg -U postgres --auth=trust -E UTF8 --no-locale
 *   "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"  -D .tmp\pg -o "-p 54399 -c listen_addresses=127.0.0.1 -c fsync=off" -l .tmp\pg.log -w start
 *   # run the proof:
 *   node apps/web/scripts/db-proof/journal-evidence-integrity-local.mjs
 *   # stop + delete the cluster:
 *   "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe" -D .tmp\pg -w stop
 *   rmdir /s /q .tmp\pg
 *
 * Environment (all optional)
 *   LM_PROOF_PGHOST      default 127.0.0.1
 *   LM_PROOF_PGPORT      default 54399
 *   LM_PROOF_PGUSER      default postgres   (must be a superuser on the throwaway cluster)
 *   LM_PROOF_PGPASSWORD  default ''         (trust auth)
 *   LM_PROOF_DBNAME      default lm_journal_integrity_proof
 *   LM_PROOF_KEEP_DB=1   keep the database after the run (for inspection)
 *   LM_PROOF_PROPOSED_FIXES=1
 *                        after applying the migration VERBATIM, also apply the
 *                        PROPOSED_FIXES_SQL overlay below (the fixes this proof
 *                        found necessary; see "Findings" in last-run.txt). The
 *                        migration file itself is never modified by this script.
 *
 * The last real run is recorded next to this file:
 *   journal-evidence-integrity-local.last-run.txt   (synthetic uuids only)
 *
 * Safety: refuses to run against anything that is not a loopback host unless
 * LM_PROOF_ALLOW_REMOTE=1 is set explicitly. Never point it at production.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..", "..");
const UP_PATH = join(ROOT, "supabase/migrations/20261023132610_journal_evidence_integrity_v1.sql");
const DOWN_PATH = join(ROOT, "supabase/rollbacks/20261023132610_journal_evidence_integrity_v1.down.sql");

const HOST = process.env.LM_PROOF_PGHOST ?? "127.0.0.1";
const PORT = Number(process.env.LM_PROOF_PGPORT ?? "54399");
const USER = process.env.LM_PROOF_PGUSER ?? "postgres";
const PASSWORD = process.env.LM_PROOF_PGPASSWORD ?? "";
const DBNAME = process.env.LM_PROOF_DBNAME ?? "lm_journal_integrity_proof";
const PROPOSED_FIXES = process.env.LM_PROOF_PROPOSED_FIXES === "1";

/**
 * Overlay applied only with LM_PROOF_PROPOSED_FIXES=1 — the fixes this proof
 * found necessary when run against the migration verbatim. They are proposals
 * for the migration author, NOT part of the migration:
 *
 *  F1 (T6/T9) service_role cannot execute journal_evidence_guard_bypassed_v1():
 *     the migration revokes EXECUTE from public and never grants it to
 *     service_role, while the SECURITY INVOKER guard triggers call it as the
 *     invoking role. Every service_role UPDATE/DELETE on journal_entries and
 *     audit_logs therefore fails with 42501 "permission denied for function"
 *     — including the one sanctioned erasure bypass.
 *  F2 (T7b) chain order ≠ verifier order: the trigger links rows in advisory-
 *     lock order but both the head lookup and the verifier order by created_at
 *     (= transaction start). Two concurrent saves whose BEGINs and INSERTs
 *     interleave produce a chain the verifier reports as prev_mismatch, and a
 *     client-supplied created_at (direct PostgREST insert) can backdate a row.
 *     Fix: under the lock, make created_at server-authoritative and strictly
 *     monotonic per worker (no live insert path supplies created_at).
 *  F3 (T4b) project_id is hashed on INSERT but the evidence guard allows it to
 *     change — a design contradiction (the live RPCs re-attribute projects).
 *     Owner/author decision: drop project_id from the hash input, or make it
 *     immutable for version-2 rows. Not overlaid here.
 */
const PROPOSED_FIXES_SQL = `
-- F1
grant execute on function public.journal_evidence_guard_bypassed_v1() to service_role;

-- F2: same body as the migration, plus a server-authoritative monotonic created_at
create or replace function public.journal_entries_chain_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_head    text;
  v_head_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('journal_chain:' || new.worker_id::text));

  select je.hash_self, je.created_at
    into v_head, v_head_at
    from public.journal_entries je
   where je.worker_id = new.worker_id
   order by je.created_at desc, je.id desc
   limit 1;

  -- Server-authoritative and strictly monotonic per worker: the chain order,
  -- the head lookup and the verifier now agree, and a client cannot backdate.
  new.created_at := greatest(now(), coalesce(v_head_at + interval '1 microsecond', now()));

  new.hash_prev    := v_head;
  new.hash_version := 2;
  new.hash_self    := encode(extensions.digest(
      'v2' || '|' ||
      new.id::text || '|' ||
      new.worker_id::text || '|' ||
      new.engagement_context_id::text || '|' ||
      new.entry_type_slug || '|' ||
      coalesce(new.profession_id::text, '') || '|' ||
      new.original_text || '|' ||
      new.original_language || '|' ||
      to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
      coalesce(v_head, ''),
      'sha256'), 'hex');
  return new;
end;
$$;
`;

if (!["127.0.0.1", "localhost", "::1"].includes(HOST) && process.env.LM_PROOF_ALLOW_REMOTE !== "1") {
  console.error(`refusing to run against non-loopback host ${HOST} (set LM_PROOF_ALLOW_REMOTE=1 only for a throwaway cluster)`);
  process.exit(2);
}

// ── synthetic identities (never real people) ─────────────────────────────
const P1 = "11111111-1111-4111-8111-111111111111"; // profile of worker W1
const P2 = "22222222-2222-4222-8222-222222222222"; // profile of worker W2 (legacy chain)
const P3 = "33333333-3333-4333-8333-333333333333"; // profile of worker W3 (backdating probe)
const W1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const W2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const W3 = "99999999-9999-4999-8999-999999999999";
const EC1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // W1's own engagement context
const EC2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"; // W2's own engagement context
const EC3 = "88888888-8888-4888-8888-888888888888"; // W3's own engagement context
const PROJ1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PROF1 = "ffffffff-ffff-4fff-8fff-ffffffffffff";

// ── tiny test harness ────────────────────────────────────────────────────
const results = [];
/** long-lived clients that every test must leave outside a transaction */
const longLived = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? `  — ${detail}` : ""}`);
}
async function test(id, fn) {
  try {
    const detail = await fn();
    record(id, true, detail);
  } catch (e) {
    record(id, false, `${e?.message ?? e}${e?.code ? ` [SQLSTATE ${e.code}]` : ""}`);
  } finally {
    // never let one test's aborted transaction poison the next (pg only warns when there is none)
    for (const c of longLived) await c.query("rollback").catch(() => {});
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
/** Run a statement and return the SQLSTATE it fails with ('' = no error). */
async function sqlstate(client, sql, params) {
  try {
    await client.query(sql, params);
    return { code: "", message: "" };
  } catch (e) {
    return { code: e.code ?? "?", message: e.message ?? String(e) };
  }
}
async function expectSqlstate(client, sql, params, label, expected = "42501") {
  const r = await sqlstate(client, sql, params);
  assert(r.code === expected, `${label}: expected SQLSTATE ${expected}, got ${r.code || "no error"} ${r.message}`);
  return `${label}: ${r.code} ${r.message.split("\n")[0]}`;
}

// ── connection helpers ───────────────────────────────────────────────────
async function connect(database, user = USER) {
  const c = new Client({ host: HOST, port: PORT, user, password: PASSWORD, database });
  c.on("error", () => {}); // a leaked session killed by `drop database ... with (force)` must not crash the run
  await c.connect();
  await c.query("set timezone = 'UTC'");
  return c;
}
/** A PostgREST-like session: login as `authenticator`, SET ROLE, set jwt claims. */
async function session(role, sub) {
  const c = await connect(DBNAME, "authenticator");
  await c.query(`set role ${role}`);
  if (sub) {
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, role })]);
  } else {
    await c.query("select set_config('request.jwt.claims', '', false)");
  }
  return c;
}

// ── the hash formula, recomputed independently in node ───────────────────
/** `to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` from a `created_at::text` in a UTC session. */
function pgTextToUsIso(txt) {
  // txt like '2026-10-16 19:00:00.123456+00' or '2026-10-16 19:00:00+00' (fractional part trimmed by pg)
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?\+00$/.exec(txt);
  if (!m) throw new Error(`unexpected timestamptz text ${txt}`);
  const us = (m[3] ?? "").padEnd(6, "0");
  return `${m[1]}T${m[2]}.${us}Z`;
}
function expectedHashSelf(row) {
  const s = [
    "v2",
    row.id,
    row.worker_id,
    row.engagement_context_id,
    row.entry_type_slug,
    row.profession_id ?? "",
    row.original_text,
    row.original_language,
    // project attribution is a lifecycle fact, not hashed evidence (F3 resolved 2026-10-16)
    pgTextToUsIso(row.created_at_text),
    row.hash_prev ?? "",
  ].join("|");
  return createHash("sha256").update(s, "utf8").digest("hex");
}
async function fetchEntry(client, id) {
  const { rows } = await client.query(
    `select id, worker_id, engagement_context_id, entry_type_slug, profession_id, original_text,
            original_language::text as original_language, project_id, hash_prev, hash_self,
            created_at::text as created_at_text,
            to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at_pg,
            deleted_at, superseded_by, visibility_scope
            ${await hasHashVersion(client) ? ", hash_version" : ""}
       from public.journal_entries where id = $1`,
    [id],
  );
  assert(rows.length === 1, `entry ${id} not found`);
  return rows[0];
}
async function hasHashVersion(client) {
  const { rows } = await client.query(
    "select 1 from information_schema.columns where table_schema='public' and table_name='journal_entries' and column_name='hash_version'",
  );
  return rows.length === 1;
}
async function verify(client, workerId) {
  const { rows } = await client.query("select position, status, entry_id from public.verify_journal_chain_v1($1) order by position", [workerId]);
  return rows;
}

// ── schema ───────────────────────────────────────────────────────────────
const SCHEMA_SQL = `
-- roles (idempotent on a throwaway cluster)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password 'authenticator';
  end if;
end $$;
alter role service_role bypassrls;
grant anon, authenticated, service_role to authenticator;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase-like auth.uid()
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::json->>'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;

-- minimal reference tables
create table public.profiles (
  id uuid primary key,
  role text not null default 'worker',
  created_at timestamptz not null default now()
);
create table public.organizations (id uuid primary key);
create table public.projects (id uuid primary key);
create table public.professions (id uuid primary key);

create table public.workers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.engagement_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  relationship_slug text not null,
  status text not null default 'active',
  hash_prev text,
  hash_self text not null,
  created_at timestamptz not null default now()
);

-- helpers used by the policies (0001 / 0013)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
$$;
create or replace function public.owns_worker(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workers x where x.id = w and x.profile_id = auth.uid())
$$;
create or replace function public.manages_organization(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select false
$$;

-- journal_entries: 0013 + 0018 (deleted_at, correction_of) + 20260601091000 (project_id)
create table public.journal_entries (
  id                    uuid primary key default gen_random_uuid(),
  worker_id             uuid not null references public.workers(id) on delete cascade,
  engagement_context_id uuid not null references public.engagement_contexts(id) on delete restrict,
  entry_type_slug       text not null check (entry_type_slug in ('freeform','structured','hybrid')),
  profession_id         uuid references public.professions(id),
  original_text         text not null,
  original_language     char(2) not null,
  hash_prev             text,
  hash_self             text not null,
  visibility_scope      text not null default 'closed' check (visibility_scope in ('closed','team','org','client_report','public_proof_link')),
  superseded_by         uuid references public.journal_entries(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  correction_of         uuid references public.journal_entries(id),
  project_id            uuid references public.projects(id) on delete set null
);
create index idx_journal_entries_worker on public.journal_entries(worker_id, created_at desc);
alter table public.journal_entries enable row level security;
create policy journal_entries_select on public.journal_entries for select
  using (
    owns_worker(worker_id)
    or is_admin()
    or exists (
      select 1 from public.engagement_contexts ec
       where ec.id = journal_entries.engagement_context_id
         and manages_organization(ec.organization_id)
    )
  );
create policy journal_entries_insert on public.journal_entries for insert
  with check (owns_worker(worker_id) and visibility_scope = 'closed');
grant select, insert on public.journal_entries to authenticated;
grant all on public.journal_entries to service_role;
grant select on public.workers, public.engagement_contexts, public.profiles to authenticated, service_role;

-- 20261003151300 attribution guard — STUB that only records what it saw, so
-- the alphabetical trigger order (attribution_guard < chain) can be proven.
create or replace function public.journal_entries_attribution_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('lm.proof.attribution_saw_hash_self', coalesce(new.hash_self, '<null>'), true);
  perform set_config('lm.proof.trigger_calls',
    coalesce(current_setting('lm.proof.trigger_calls', true), '') || tg_op || ':attribution;', true);
  return new;
end;
$$;
create trigger journal_entries_attribution_guard_v1
  before insert or update of worker_id, engagement_context_id, project_id
  on public.journal_entries
  for each row execute function public.journal_entries_attribution_guard_v1();

-- 20260612091000 journal_entry_photos
create table public.journal_entry_photos (
  id              uuid primary key default gen_random_uuid(),
  entry_id        uuid not null references public.journal_entries(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  file_name       text not null,
  mime_type       text not null,
  file_size_bytes bigint not null,
  storage_path    text not null unique,
  upload_status   text not null default 'uploaded',
  created_at      timestamptz not null default now()
);
alter table public.journal_entry_photos enable row level security;
create policy journal_entry_photos_select on public.journal_entry_photos for select
  using (profile_id = auth.uid() or public.is_admin());
create policy journal_entry_photos_insert on public.journal_entry_photos for insert with check (false);
grant select, update, delete on public.journal_entry_photos to authenticated;
grant all on public.journal_entry_photos to service_role;

-- storage stub (enough for the policy expressions)
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);
create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, delete on storage.objects to authenticated;
grant all on storage.objects to service_role;
alter table storage.objects enable row level security;
insert into storage.buckets (id, name, public) values ('journal-entry-photos', 'journal-entry-photos', false);
create policy "journal-entry-photos owner select" on storage.objects for select
  using (bucket_id = 'journal-entry-photos' and auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text);
create policy "journal-entry-photos owner insert" on storage.objects for insert
  with check (bucket_id = 'journal-entry-photos' and auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text);
create policy "journal-entry-photos owner delete" on storage.objects for delete
  using (bucket_id = 'journal-entry-photos' and auth.uid() is not null and (storage.foldername(name))[1] = auth.uid()::text);

-- 0001 audit_logs
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text,
  entity      text,
  entity_id   uuid,
  payload     jsonb,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs for select using (public.is_admin());
create policy audit_logs_insert on public.audit_logs for insert with check (public.is_admin());
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

-- 20261019140000 privacy_erasure_authorizations_v3 (the columns the predicate
-- reads) + a STUB of erase_user_account_v3's writes to the guarded tables.
-- Like the real executor it is SECURITY DEFINER owned by the superuser, so
-- inside it current_user is the owner (never service_role) and it sets no GUC:
-- consume (9.1, consumed_at = now()) -> delete_rows journal_entries (L-1) ->
-- set_null audit_logs.actor_id -> pseudonymise_mentions audit_logs.payload ->
-- outcome. p_close_first records the outcome BEFORE the writes (window closed).
create table public.privacy_erasure_authorizations_v3 (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null default gen_random_uuid(),
  expires_at  timestamptz not null default now() + interval '15 minutes',
  consumed_at timestamptz,
  outcome     text,
  receipt_id  uuid
);
alter table public.privacy_erasure_authorizations_v3 enable row level security;
revoke all on public.privacy_erasure_authorizations_v3 from public, anon, authenticated;
create or replace function public.proof_erase_stub_v3(p_auth uuid, p_entry uuid, p_actor uuid, p_close_first boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_del int;
  v_actor int;
  v_payload int;
begin
  if p_auth is not null then
    update public.privacy_erasure_authorizations_v3 set consumed_at = now()
     where id = p_auth and consumed_at is null and expires_at > now()
    returning id into v_id;
    if p_close_first then
      update public.privacy_erasure_authorizations_v3 set outcome = 'refused: proof' where id = p_auth;
    end if;
  end if;
  delete from public.journal_entries where id = p_entry;
  get diagnostics v_del = row_count;
  update public.audit_logs set actor_id = null where actor_id = p_actor;
  get diagnostics v_actor = row_count;
  update public.audit_logs set payload = coalesce(payload, '{}'::jsonb) || '{"pseudonymised": true}'::jsonb
   where action = 'proof.seed';
  get diagnostics v_payload = row_count;
  if v_id is not null and not p_close_first then
    update public.privacy_erasure_authorizations_v3 set outcome = 'erased' where id = p_auth;
  end if;
  return jsonb_build_object('consumed', v_id is not null, 'deleted', v_del, 'actor_nulled', v_actor, 'payload_scrubbed', v_payload);
end;
$$;
revoke all on function public.proof_erase_stub_v3(uuid, uuid, uuid, boolean) from public;
grant execute on function public.proof_erase_stub_v3(uuid, uuid, uuid, boolean) to service_role;

-- fixtures
insert into public.profiles (id) values ('${P1}'), ('${P2}'), ('${P3}');
insert into public.projects (id) values ('${PROJ1}');
insert into public.professions (id) values ('${PROF1}');
insert into public.workers (id, profile_id) values ('${W1}', '${P1}'), ('${W2}', '${P2}'), ('${W3}', '${P3}');
insert into public.engagement_contexts (id, profile_id, relationship_slug, hash_self)
  values ('${EC1}', '${P1}', 'independent', 'ec1'), ('${EC2}', '${P2}', 'independent', 'ec2'), ('${EC3}', '${P3}', 'independent', 'ec3');
insert into public.audit_logs (actor_id, action, entity) values ('${P1}', 'proof.seed', 'journal_entries');
`;

const INSERT_FORGED = `
  insert into public.journal_entries
    (worker_id, engagement_context_id, entry_type_slug, profession_id, original_text, original_language, project_id, hash_prev, hash_self)
  values ($1, $2, 'freeform', $3, $4, 'lt', $5, 'forged', 'forged')
  returning id`;

// ── main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`journal-evidence-integrity-local proof — ${new Date().toISOString()}`);
  console.log(`cluster ${HOST}:${PORT} db ${DBNAME} (throwaway)`);
  const up = readFileSync(UP_PATH, "utf8");
  const down = readFileSync(DOWN_PATH, "utf8");

  const admin = await connect("postgres");
  const { rows: v } = await admin.query("select version()");
  console.log(v[0].version);
  await admin.query(`drop database if exists ${DBNAME} with (force)`);
  await admin.query(`create database ${DBNAME}`);

  const su = await connect(DBNAME); // superuser = table owner session
  await su.query(SCHEMA_SQL);

  // T5 precondition: a LEGACY row written BEFORE the migration exists (W2 chain).
  const { rows: legacyRows } = await su.query(
    `insert into public.journal_entries (worker_id, engagement_context_id, entry_type_slug, original_text, original_language, hash_prev, hash_self)
     values ($1, $2, 'freeform', 'legacy entry written before the migration', 'lt', null, 'legacy-app-computed-hash-not-recomputable')
     returning id, hash_self`,
    [W2, EC2],
  );
  const legacyId = legacyRows[0].id;
  console.log(`legacy row (pre-migration) ${legacyId} for W2`);

  // Apply the migration VERBATIM.
  await su.query(up);
  console.log("migration applied verbatim");
  if (PROPOSED_FIXES) {
    await su.query(PROPOSED_FIXES_SQL);
    console.log("PROPOSED FIXES overlay applied (LM_PROOF_PROPOSED_FIXES=1): F1 grant execute to service_role; F2 server-authoritative monotonic created_at");
  }

  const w1 = await session("authenticated", P1);
  longLived.push(su, w1);
  let firstId, secondId;

  await test("T1 forged hashes are overwritten server-side", async () => {
    const { rows } = await w1.query(INSERT_FORGED, [W1, EC1, PROF1, "first entry, client sent forged hashes", PROJ1]);
    firstId = rows[0].id;
    const row = await fetchEntry(su, firstId);
    assert(row.hash_version === 2, `hash_version=${row.hash_version}`);
    assert(row.hash_prev === null, `hash_prev=${row.hash_prev} (expected NULL for first entry)`);
    assert(row.hash_self !== "forged", "hash_self still 'forged'");
    const expected = expectedHashSelf(row);
    assert(row.created_at_pg === pgTextToUsIso(row.created_at_text), `node timestamp format ${pgTextToUsIso(row.created_at_text)} != pg ${row.created_at_pg}`);
    assert(row.hash_self === expected, `hash_self ${row.hash_self} != node sha256 ${expected}`);
    return `hash_version=2, hash_prev=NULL, hash_self=${row.hash_self.slice(0, 16)}… == node sha256 over stored columns`;
  });

  await test("T1b trigger order: attribution guard ran BEFORE the chain trigger (saw the client value)", async () => {
    // Same session, new transaction: the GUC is transaction-local, so read it within the insert's transaction.
    await w1.query("begin");
    const { rows } = await w1.query(INSERT_FORGED, [W1, EC1, null, "order probe (rolled back)", null]);
    const { rows: saw } = await w1.query("select current_setting('lm.proof.attribution_saw_hash_self', true) as v, current_setting('lm.proof.trigger_calls', true) as calls");
    await w1.query("rollback");
    assert(rows.length === 1, "probe insert failed");
    assert(saw[0].v === "forged", `attribution guard saw hash_self=${saw[0].v} (expected the client's 'forged' → it ran first)`);
    const { rows: order } = await su.query(
      `select tgname from pg_trigger where tgrelid = 'public.journal_entries'::regclass and not tgisinternal and (tgtype & 4) = 4 order by tgname`,
    );
    const names = order.map((r) => r.tgname);
    assert(names.indexOf("journal_entries_attribution_guard_v1") < names.indexOf("journal_entries_chain_v1"), `insert trigger order ${names.join(",")}`);
    return `saw '${saw[0].v}'; BEFORE INSERT order = ${names.join(" → ")}`;
  });

  await test("T2 chain: second insert links to the first; verifier ok,ok", async () => {
    const { rows } = await w1.query(INSERT_FORGED, [W1, EC1, PROF1, "second entry", PROJ1]);
    secondId = rows[0].id;
    const first = await fetchEntry(su, firstId);
    const second = await fetchEntry(su, secondId);
    assert(second.hash_prev === first.hash_self, `hash_prev ${second.hash_prev} != first.hash_self ${first.hash_self}`);
    assert(second.hash_self === expectedHashSelf(second), "second hash_self mismatch vs node");
    const ver = await verify(w1, W1);
    assert(ver.length === 2 && ver[0].status === "ok" && ver[1].status === "ok", `verifier ${JSON.stringify(ver)}`);
    return `pos1 ok, pos2 ok (as authenticated W1)`;
  });

  await test("T3 immutability: authenticated UPDATE/DELETE and owner UPDATE/TRUNCATE → 42501", async () => {
    const out = [];
    out.push(await expectSqlstate(w1, "update public.journal_entries set original_text = 'tampered' where id = $1", [firstId], "auth UPDATE original_text"));
    out.push(await expectSqlstate(w1, "update public.journal_entries set hash_self = 'x' where id = $1", [firstId], "auth UPDATE hash_self"));
    out.push(await expectSqlstate(w1, "update public.journal_entries set worker_id = $2 where id = $1", [firstId, W2], "auth UPDATE worker_id"));
    out.push(await expectSqlstate(w1, "delete from public.journal_entries where id = $1", [firstId], "auth DELETE"));
    // the table OWNER (superuser; RLS and grants do not apply) — the trigger alone must refuse
    out.push(await expectSqlstate(su, "update public.journal_entries set original_text = 'tampered' where id = $1", [firstId], "owner UPDATE original_text"));
    out.push(await expectSqlstate(su, "update public.journal_entries set hash_self = 'x' where id = $1", [firstId], "owner UPDATE hash_self"));
    out.push(await expectSqlstate(su, "update public.journal_entries set worker_id = $2 where id = $1", [firstId, W2], "owner UPDATE worker_id"));
    out.push(await expectSqlstate(su, "update public.journal_entries set created_at = now() where id = $1", [firstId], "owner UPDATE created_at"));
    out.push(await expectSqlstate(su, "update public.journal_entries set hash_version = 1 where id = $1", [firstId], "owner UPDATE hash_version"));
    out.push(await expectSqlstate(su, "delete from public.journal_entries where id = $1", [firstId], "owner DELETE"));
    out.push(await expectSqlstate(su, "truncate public.journal_entries cascade", [], "owner TRUNCATE CASCADE"));
    const { rows } = await su.query("select count(*)::int as n from public.journal_entries");
    assert(rows[0].n === 3, `row count ${rows[0].n} != 3`);
    return "\n        " + out.join("\n        ");
  });

  await test("T4 lifecycle columns may change; verifier still ok", async () => {
    await su.query("update public.journal_entries set deleted_at = now(), updated_at = now() where id = $1", [firstId]);
    await su.query("update public.journal_entries set superseded_by = $2 where id = $1", [firstId, secondId]);
    await su.query("update public.journal_entries set visibility_scope = 'team' where id = $1", [firstId]);
    await su.query("update public.journal_entries set project_id = null where id = $1", [firstId]);
    const row = await fetchEntry(su, firstId);
    assert(row.deleted_at && row.superseded_by === secondId && row.visibility_scope === "team" && row.project_id === null, JSON.stringify(row));
    const ver = await verify(w1, W1);
    return `deleted_at/superseded_by/visibility_scope/project_id changed; verifier ${ver.map((r) => r.status).join(",")}`;
  });

  await test("T4b verifier still ok after the lifecycle updates (project attribution is not hashed evidence)", async () => {
    try {
      const ver = await verify(w1, W1);
      assert(ver.every((r) => r.status === "ok"), `verifier ${ver.map((r) => `${r.position}:${r.status}`).join(",")} — project_id is hashed on INSERT but the evidence guard lets it change, so the recomputed hash no longer matches`);
      return "ok,ok";
    } finally {
      // restore project_id so later tests are not polluted by this finding
      await su.query("update public.journal_entries set project_id = $2 where id = $1", [firstId, PROJ1]);
    }
  });

  await test("T5 legacy row reports 'legacy'; later v2 row chained to it reports 'ok'", async () => {
    const w2 = await session("authenticated", P2);
    const { rows } = await w2.query(INSERT_FORGED, [W2, EC2, null, "first v2 entry after a legacy one", null]);
    const v2 = await fetchEntry(su, rows[0].id);
    const legacy = await fetchEntry(su, legacyId);
    assert(legacy.hash_version === 1, `legacy hash_version=${legacy.hash_version}`);
    assert(legacy.hash_self === "legacy-app-computed-hash-not-recomputable", "legacy hash rewritten");
    assert(v2.hash_prev === legacy.hash_self, `v2.hash_prev ${v2.hash_prev} != legacy hash`);
    const ver = await verify(w2, W2);
    await w2.end();
    assert(ver.length === 2 && ver[0].status === "legacy" && ver[1].status === "ok", `verifier ${JSON.stringify(ver)}`);
    return "pos1 legacy, pos2 ok";
  });

  await test("T6 bypass: only service_role + lm.evidence_guard_bypass='erasure' in one transaction", async () => {
    const out = [];
    await w1.query("begin");
    await w1.query("select set_config('lm.evidence_guard_bypass', 'erasure', true)");
    out.push(await expectSqlstate(w1, "delete from public.journal_entries where id = $1", [firstId], "authenticated + GUC DELETE"));
    await w1.query("rollback");

    const svc = await session("service_role", null);
    out.push(await expectSqlstate(svc, "delete from public.journal_entries where id = $1", [firstId], "service_role without GUC DELETE"));
    out.push(await expectSqlstate(svc, "update public.journal_entries set original_text = 'x' where id = $1", [firstId], "service_role without GUC UPDATE"));

    await svc.query("begin");
    await svc.query("select set_config('lm.evidence_guard_bypass', 'erasure', true)");
    // firstId is referenced by nothing at this point (it points AT secondId via superseded_by)
    const del = await svc.query("delete from public.journal_entries where id = $1", [firstId]);
    assert(del.rowCount === 1, `service_role + GUC delete rowCount ${del.rowCount}`);
    await svc.query("rollback");
    // GUC was transaction-local: gone after rollback
    out.push(await expectSqlstate(svc, "delete from public.journal_entries where id = $1", [firstId], "service_role after ROLLBACK (GUC gone) DELETE"));
    const { rows } = await su.query("select count(*)::int as n from public.journal_entries where id = $1", [firstId]);
    assert(rows[0].n === 1, "row vanished after rollback");
    await svc.end();
    return "\n        " + out.join("\n        ") + "\n        service_role + GUC DELETE: 1 row (rolled back, row kept)";
  });

  await test("T7 concurrency: two sessions insert for the same worker; no fork", async () => {
    const a = await session("authenticated", P1);
    const b = await session("authenticated", P1);
    const headBefore = (await su.query("select hash_self from public.journal_entries where worker_id = $1 order by created_at desc, id desc limit 1", [W1])).rows[0].hash_self;
    await a.query("begin");
    await b.query("begin");
    const ra = await a.query(INSERT_FORGED, [W1, EC1, null, "concurrent A", null]); // takes the advisory lock
    let bDone = false;
    const pb = b.query(INSERT_FORGED, [W1, EC1, null, "concurrent B", null]).then((r) => { bDone = true; return r; });
    await new Promise((r) => setTimeout(r, 400));
    assert(!bDone, "B's insert did not block on the per-worker advisory lock");
    await a.query("commit");
    const rb = await pb;
    await b.query("commit");
    const A = await fetchEntry(su, ra.rows[0].id);
    const B = await fetchEntry(su, rb.rows[0].id);
    assert(A.hash_prev === headBefore, `A.hash_prev != previous head`);
    assert(B.hash_prev === A.hash_self, `B.hash_prev ${B.hash_prev} != A.hash_self ${A.hash_self}`);
    const { rows: dup } = await su.query("select hash_prev, count(*)::int n from public.journal_entries where worker_id = $1 and hash_prev is not null group by hash_prev having count(*) > 1", [W1]);
    assert(dup.length === 0, `forked chain: ${JSON.stringify(dup)}`);
    const ver = await verify(w1, W1);
    await a.end(); await b.end();
    assert(ver.every((r) => r.status === "ok"), `verifier ${JSON.stringify(ver)}`);
    return `B blocked ~400 ms on the lock; A.prev=head, B.prev=A; verifier ${ver.map((r) => r.status).join(",")}`;
  });

  await test("T7b adversarial: B's transaction BEGINs before A's but A inserts first (created_at order ≠ lock order)", async () => {
    // Sibling worker chain so T7 state is untouched: use W2.
    const a = await session("authenticated", P2);
    const b = await session("authenticated", P2);
    await b.query("begin");               // B's now() is earlier …
    await new Promise((r) => setTimeout(r, 20));
    await a.query("begin");
    const ra = await a.query(INSERT_FORGED, [W2, EC2, null, "late-begin, first-insert A", null]); // … but A takes the lock first
    const pb = b.query(INSERT_FORGED, [W2, EC2, null, "early-begin, second-insert B", null]);
    await a.query("commit");
    const rb = await pb;
    await b.query("commit");
    const A = await fetchEntry(su, ra.rows[0].id);
    const B = await fetchEntry(su, rb.rows[0].id);
    const { rows: dup } = await su.query("select hash_prev, count(*)::int n from public.journal_entries where worker_id = $1 and hash_prev is not null group by hash_prev having count(*) > 1", [W2]);
    const w2 = await session("authenticated", P2);
    const ver = await verify(w2, W2);
    await w2.end(); await a.end(); await b.end();
    assert(B.hash_prev === A.hash_self, "lock did not serialize: B.prev != A.self");
    assert(dup.length === 0, `forked chain: ${JSON.stringify(dup)}`);
    const order = B.created_at_text < A.created_at_text ? "B.created_at < A.created_at (verifier order ≠ chain order)" : "A.created_at < B.created_at (verifier order = chain order)";
    // W2's chain starts with the pre-migration legacy row (T5): 'legacy' is the honest status there
    assert(ver.every((r) => r.status === "ok" || r.status === "legacy"), `verifier ${ver.map((r) => `${r.position}:${r.status}`).join(",")} — ${order}: rows are linked in lock order but ordered by created_at (= transaction start)`);
    return `${order}; verifier ${ver.map((r) => r.status).join(",")}`;
  });

  await test("T7c adversarial: client-supplied backdated created_at on a direct insert cannot reorder the chain", async () => {
    const w3 = await session("authenticated", P3);
    try {
      await w3.query(INSERT_FORGED, [W3, EC3, null, "W3 first", null]);
      const head = await w3.query(INSERT_FORGED, [W3, EC3, null, "W3 second (head)", null]);
      const headRow = await fetchEntry(su, head.rows[0].id);
      // the direct INSERT policy admits this; the client sets created_at years in the past
      const back = await w3.query(
        `insert into public.journal_entries
           (worker_id, engagement_context_id, entry_type_slug, original_text, original_language, hash_prev, hash_self, created_at)
         values ($1, $2, 'freeform', 'backdated by the client', 'lt', 'forged', 'forged', '2020-01-01T00:00:00Z') returning id`,
        [W3, EC3],
      );
      const backRow = await fetchEntry(su, back.rows[0].id);
      await w3.query(INSERT_FORGED, [W3, EC3, null, "W3 fourth, after the backdated one", null]);
      const { rows: dup } = await su.query("select hash_prev, count(*)::int n from public.journal_entries where worker_id = $1 and hash_prev is not null group by hash_prev having count(*) > 1", [W3]);
      const ver = await verify(w3, W3);
      assert(backRow.created_at_text > headRow.created_at_text, `stored created_at ${backRow.created_at_text} was backdated below the head ${headRow.created_at_text}`);
      assert(dup.length === 0, `forked chain (two rows share a hash_prev): ${JSON.stringify(dup)}`);
      assert(ver.every((r) => r.status === "ok"), `verifier ${ver.map((r) => `${r.position}:${r.status}`).join(",")}`);
      return `backdated created_at overwritten to ${backRow.created_at_text}; no fork; verifier ${ver.map((r) => r.status).join(",")}`;
    } finally {
      await w3.end();
    }
  });

  await test("T8 photos: referenced object survives owner DELETE (0 rows); orphan is deleted", async () => {
    const refPath = `${P1}/${firstId}/x.jpg`;
    const orphanPath = `${P1}/orphan.jpg`;
    await su.query("insert into storage.objects (bucket_id, name, owner) values ('journal-entry-photos', $1, $2), ('journal-entry-photos', $3, $2)", [refPath, P1, orphanPath]);
    await su.query(
      "insert into public.journal_entry_photos (entry_id, profile_id, file_name, mime_type, file_size_bytes, storage_path) values ($1, $2, 'x.jpg', 'image/jpeg', 1000, $3)",
      [firstId, P1, refPath],
    );
    const d1 = await w1.query("delete from storage.objects where bucket_id = 'journal-entry-photos' and name = $1", [refPath]);
    const d2 = await w1.query("delete from storage.objects where bucket_id = 'journal-entry-photos' and name = $1", [orphanPath]);
    assert(d1.rowCount === 0, `referenced object deleted (rowCount ${d1.rowCount})`);
    assert(d2.rowCount === 1, `orphan not deleted (rowCount ${d2.rowCount})`);
    const { rows } = await su.query("select count(*)::int n from storage.objects where name = $1", [refPath]);
    assert(rows[0].n === 1, "referenced object gone");
    return "referenced: 0 rows; orphan: 1 row deleted";
  });

  await test("T9 audit_logs immutable: owner UPDATE/DELETE/TRUNCATE → 42501; service_role + GUC allowed", async () => {
    const out = [];
    out.push(await expectSqlstate(su, "update public.audit_logs set action = 'rewritten'", [], "owner UPDATE"));
    out.push(await expectSqlstate(su, "delete from public.audit_logs", [], "owner DELETE"));
    out.push(await expectSqlstate(su, "truncate public.audit_logs", [], "owner TRUNCATE"));
    const svc = await session("service_role", null);
    out.push(await expectSqlstate(svc, "delete from public.audit_logs", [], "service_role without GUC DELETE"));
    await svc.query("begin");
    await svc.query("select set_config('lm.evidence_guard_bypass', 'erasure', true)");
    const d = await svc.query("delete from public.audit_logs");
    assert(d.rowCount === 1, `service_role + GUC delete rowCount ${d.rowCount}`);
    await svc.query("truncate public.audit_logs");
    await svc.query("rollback");
    await svc.end();
    const { rows } = await su.query("select count(*)::int n from public.audit_logs");
    assert(rows[0].n === 1, "audit row vanished after rollback");
    return "\n        " + out.join("\n        ") + "\n        service_role + GUC DELETE 1 row + TRUNCATE ok (rolled back, row kept)";
  });

  await test("function attributes: verifier is SECURITY INVOKER; every new function pins search_path=public, pg_temp", async () => {
    const { rows } = await su.query(
      `select p.proname, p.prosecdef, p.proconfig
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in (
          'journal_evidence_guard_bypassed_v1','journal_entries_chain_v1','journal_entries_evidence_guard_v1',
          'journal_entries_truncate_guard_v1','verify_journal_chain_v1','audit_logs_immutable_guard_v1',
          'journal_evidence_erasure_executing_v1')
        order by p.proname`,
    );
    assert(rows.length === 7, `found ${rows.length} functions`);
    const verifier = rows.find((r) => r.proname === "verify_journal_chain_v1");
    assert(verifier.prosecdef === false, "verify_journal_chain_v1 is SECURITY DEFINER");
    const executing = rows.find((r) => r.proname === "journal_evidence_erasure_executing_v1");
    assert(executing.prosecdef === true, "journal_evidence_erasure_executing_v1 must be SECURITY DEFINER (reads the closed authorization table)");
    for (const r of rows.filter((x) => x.proname !== "journal_evidence_erasure_executing_v1")) {
      assert(r.prosecdef === false, `${r.proname} is SECURITY DEFINER`);
    }
    for (const r of rows) {
      assert((r.proconfig ?? []).some((c) => c === "search_path=public, pg_temp"), `${r.proname} proconfig=${JSON.stringify(r.proconfig)}`);
    }
    // execute grants
    const { rows: g } = await su.query(
      `select has_function_privilege('authenticated', 'public.verify_journal_chain_v1(uuid)', 'execute') as auth_verify,
              has_function_privilege('anon', 'public.verify_journal_chain_v1(uuid)', 'execute') as anon_verify,
              has_function_privilege('authenticated', 'public.journal_evidence_guard_bypassed_v1()', 'execute') as auth_bypass,
              has_function_privilege('authenticated', 'public.journal_evidence_erasure_executing_v1()', 'execute') as auth_executing,
              has_function_privilege('anon', 'public.journal_evidence_erasure_executing_v1()', 'execute') as anon_executing,
              has_function_privilege('service_role', 'public.journal_evidence_erasure_executing_v1()', 'execute') as svc_executing`,
    );
    assert(
      g[0].auth_verify === true && g[0].anon_verify === false && g[0].auth_bypass === false &&
        g[0].auth_executing === false && g[0].anon_executing === false && g[0].svc_executing === true,
      JSON.stringify(g[0]),
    );
    return `7 functions; only journal_evidence_erasure_executing_v1 is SECURITY DEFINER; verifier invoker; search_path pinned on all; execute: verifier authenticated=yes anon=no; bypass + executing predicates not executable by authenticated/anon, executing by service_role`;
  });

  await test("T11 erasure executor v3: the bypass holds only inside the transaction that consumed an authorization", async () => {
    const out = [];
    const svc = await session("service_role", null);
    // (a) the definer executor WITHOUT a consumed authorization: refused
    out.push(await expectSqlstate(svc, "select public.proof_erase_stub_v3(null, $1, $2)", [firstId, P1], "definer executor, no authorization"));
    // (b) a COMMITTED consumption from an earlier transaction (outcome NULL, impossible in v3 but adversarial) does not open the window
    await su.query("insert into public.privacy_erasure_authorizations_v3 (consumed_at) values (now() - interval '1 hour')");
    out.push(await expectSqlstate(svc, "select public.proof_erase_stub_v3(null, $1, $2)", [firstId, P1], "definer executor, stale committed consumption"));
    // (c) consumed, but the outcome is recorded before the writes: window closed
    const { rows: a1 } = await su.query("insert into public.privacy_erasure_authorizations_v3 default values returning id");
    const auth1 = a1[0].id;
    out.push(await expectSqlstate(svc, "select public.proof_erase_stub_v3($1, $2, $3, true)", [auth1, firstId, P1], "definer executor, outcome already recorded"));
    // (d) the real shape: consume -> delete the entry -> null actor -> scrub payload -> outcome; then the window is shut
    await svc.query("begin");
    const { rows: e } = await svc.query(
      `insert into public.journal_entries (worker_id, engagement_context_id, entry_type_slug, original_text, original_language, hash_self)
       values ($1, $2, 'freeform', 'own entry to be erased (L-1)', 'lt', 'client') returning id`,
      [W3, EC3],
    );
    const { rows: res } = await svc.query("select public.proof_erase_stub_v3($1, $2, $3) as r", [auth1, e[0].id, P1]);
    const r = res[0].r;
    assert(r.consumed === true && r.deleted === 1 && r.actor_nulled === 1 && r.payload_scrubbed === 1, `executor result ${JSON.stringify(r)}`);
    await svc.query("savepoint after_executor");
    out.push(await expectSqlstate(svc, "update public.audit_logs set action = 'rewritten'", [], "same transaction AFTER the executor recorded its outcome"));
    await svc.query("rollback to savepoint after_executor");
    await svc.query("rollback");
    await svc.end();
    const { rows: chk } = await su.query(
      "select (select count(*)::int from public.audit_logs where actor_id = $1) as actor_rows, (select consumed_at is null from public.privacy_erasure_authorizations_v3 where id = $2) as unconsumed",
      [P1, auth1],
    );
    assert(chk[0].actor_rows === 1 && chk[0].unconsumed === true, `state after rollback ${JSON.stringify(chk[0])}`);
    return "\n        " + out.join("\n        ") + `\n        consumed in-transaction: ${JSON.stringify(r)} (rolled back, fixtures kept)`;
  });

  await test("T10 rollback then re-apply (idempotent)", async () => {
    const countBefore = (await su.query("select count(*)::int n, count(*) filter (where hash_version = 2)::int v2 from public.journal_entries")).rows[0];
    const hashesBefore = (await su.query("select id, hash_self, hash_prev from public.journal_entries order by id")).rows;
    await su.query(down);
    const { rows: trg } = await su.query(
      "select tgname from pg_trigger where not tgisinternal and tgname in ('journal_entries_chain_v1','journal_entries_evidence_guard_v1','journal_entries_truncate_guard_v1','audit_logs_immutable_guard_v1','audit_logs_truncate_guard_v1')",
    );
    assert(trg.length === 0, `triggers remain ${trg.map((r) => r.tgname)}`);
    const { rows: fns } = await su.query(
      "select proname from pg_proc where proname in ('journal_evidence_guard_bypassed_v1','journal_evidence_erasure_executing_v1','journal_entries_chain_v1','journal_entries_evidence_guard_v1','journal_entries_truncate_guard_v1','verify_journal_chain_v1','audit_logs_immutable_guard_v1')",
    );
    assert(fns.length === 0, `functions remain ${fns.map((r) => r.proname)}`);
    assert(!(await hasHashVersion(su)), "hash_version column remains");
    const { rows: pol } = await su.query(`select pg_get_expr(polqual, polrelid) q from pg_policy where polname = 'journal-entry-photos owner delete'`);
    assert(pol.length === 1 && !pol[0].q.includes("journal_entry_photos"), `photo policy after rollback: ${pol[0]?.q}`);
    const hashesAfter = (await su.query("select id, hash_self, hash_prev from public.journal_entries order by id")).rows;
    assert(JSON.stringify(hashesAfter) === JSON.stringify(hashesBefore), "hashes changed by rollback");
    assert(hashesAfter.length === countBefore.n, "rows lost by rollback");
    // mutation possible again after rollback (proves the guard was the only thing refusing)
    await su.query("begin");
    const r = await su.query("update public.journal_entries set original_text = original_text where id = $1", [firstId]);
    await su.query("rollback");
    assert(r.rowCount === 1, "owner update still refused after rollback");
    // re-apply
    await su.query(up);
    if (PROPOSED_FIXES) await su.query(PROPOSED_FIXES_SQL);
    assert(await hasHashVersion(su), "hash_version missing after re-apply");
    // after re-apply every pre-existing row is version 1 (column default); the chain continues as v2
    const { rows: ver } = await su.query("select hash_version, count(*)::int n from public.journal_entries group by 1 order by 1");
    const { rows: ins } = await w1.query(INSERT_FORGED, [W1, EC1, null, "after re-apply", null]);
    const row = await fetchEntry(su, ins[0].id);
    assert(row.hash_version === 2 && row.hash_self === expectedHashSelf(row), "chain not restored after re-apply");
    const verW1 = await verify(w1, W1);
    return `rollback: 0 triggers, 0 functions, column gone, old photo policy back, ${hashesAfter.length} rows (${countBefore.v2} were v2) kept their hashes; re-apply ok — rows now ${ver.map((r) => `v${r.hash_version}×${r.n}`).join(" ")}; new insert v2 ok; verifier W1 ${verW1.map((r) => r.status).join(",")}`;
  });

  await w1.end();
  await su.end();
  if (process.env.LM_PROOF_KEEP_DB !== "1") {
    await admin.query(`drop database if exists ${DBNAME} with (force)`);
    console.log(`database ${DBNAME} dropped`);
  }
  await admin.end();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? `; FAILED: ${failed.map((r) => r.id).join(", ")}` : ""}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("proof aborted:", e);
  process.exit(1);
});
