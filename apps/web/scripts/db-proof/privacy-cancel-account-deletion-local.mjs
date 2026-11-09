#!/usr/bin/env node
/**
 * Holder-cancellable account deletion (20261109120000) — local proof on a
 * THROWAWAY PostgreSQL 16 cluster.
 *
 *   node apps/web/scripts/db-proof/privacy-cancel-account-deletion-local.mjs
 *
 * No dependencies, no Docker, no Supabase, no network: initdb + pg_ctl + psql
 * from a local PostgreSQL 16 install (PG16_BIN, default
 * "C:\Program Files\PostgreSQL\16\bin"), data dir under <repo>/.tmp/pgcancel-<pid>
 * (short path: psql breaks past MAX_PATH). The cluster is STOPPED at the end and
 * left on disk for inspection (.tmp/ is git-excluded).
 *
 * Schema: the mirror of 20261019140000's own proof
 * (privacy-erasure-v3-local.mjs) with customer_requests widened to its real
 * shape, then the REAL repo migrations in order:
 *   20260705150000 transition guard, 20260706150000 privacy intake,
 *   20260727120000 (search_path line), 20261024090000 closed_outcome,
 *   20261019140000 executor v3, 20261019150000, 20261019190000,
 *   20261109120000 (this change) — plus 0024 is_admin and the 0028 RLS
 *   policies / grant as faithful extracts.
 *
 * Cases: (a) cancel ok (b) double cancel (c) races in both orders, with a
 * proven lock wait (d) cancel after execute / approved / operator-closed
 * (e) signed out (f) another user (g) raw owner PATCH refused
 * (h) grace (i) rollback + re-apply.
 *
 * Prints ids of SYNTHETIC fixtures only; no personal data exists here.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const mig = (n) => join(repo, "supabase/migrations", n);
const MIGRATION = mig("20261109120000_privacy_cancel_account_deletion.sql");
const ROLLBACK = join(repo, "supabase/rollbacks/20261109120000_privacy_cancel_account_deletion.down.sql");
const pgBin = process.env.PG16_BIN || "C:\\Program Files\\PostgreSQL\\16\\bin";
const port = Number(process.env.PG_PROOF_PORT || 5517);
const tmp = join(repo, ".tmp", `pgcancel-${process.pid}`);
const dataDir = join(tmp, "d");
const logFile = join(tmp, "pg.log");
const DB = "proof";

let pass = 0;
let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (cond) pass += 1;
  else failures += 1;
};

function bin(name) {
  const p = join(pgBin, process.platform === "win32" ? `${name}.exe` : name);
  if (!existsSync(p)) throw new Error(`PostgreSQL 16 binary not found: ${p} (set PG16_BIN)`);
  return p;
}
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (r.status !== 0 && !opts.allowFail) throw new Error(`${cmd} ${args.join(" ")} failed (${r.status}):\n${r.stderr || r.stdout}`);
  return r;
}
const psqlArgs = (db) => ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", db, "-At"];
function psql(sql, { allowFail = false, db = DB } = {}) {
  const r = spawnSync(bin("psql"), [...psqlArgs(db), "-c", sql], { encoding: "utf8" });
  if (r.status !== 0 && !allowFail) throw new Error(`psql failed:\n${r.stderr}\n--- sql ---\n${sql.slice(0, 600)}`);
  return { out: (r.stdout || "").trim(), err: (r.stderr || "").trim(), status: r.status };
}
function psqlFile(file, db = DB) {
  const r = spawnSync(bin("psql"), [...psqlArgs(db), "-f", file], { encoding: "utf8" });
  return { status: r.status, err: (r.stderr || "").trim() };
}
function applyFile(file, label) {
  const r = psqlFile(file);
  if (r.status !== 0) throw new Error(`${label} failed: ${r.err}`);
}
/** async session (one connection, one -c per statement): resolves with stdout/stderr/status/elapsed ms */
function psqlAsync(statements) {
  return new Promise((res) => {
    const t0 = Date.now();
    const child = spawn(bin("psql"), [...psqlArgs(DB), ...statements.flatMap((s) => ["-c", s])]);
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (status) => res({ out: out.trim(), err: err.trim(), status, ms: Date.now() - t0 }));
  });
}
const one = (sql) => psql(sql).out;
const json = (sql) => JSON.parse(one(sql) || "null");
const lastJson = (out) => JSON.parse(out.split(/\r?\n/).filter(Boolean).pop() || "null");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// role switches as PostgREST does them: SET ROLE + the JWT claims GUC auth.uid() reads
const asUser = (uid, sql) => `set role authenticated; set "request.jwt.claims" to '{"sub":"${uid}","role":"authenticated"}'; ${sql}`;
const asNoClaims = (sql) => `set role authenticated; ${sql}`;
const asAnon = (sql) => `set role anon; ${sql}`;
const asService = (sql) => `set role service_role; ${sql}`;

async function waitFor(sql, label, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (one(sql) === "t") return true;
    await sleep(100);
  }
  throw new Error(`timed out waiting for: ${label}`);
}
const someoneSleeping = `select exists (select 1 from pg_stat_activity where datname = '${DB}' and state = 'active' and query like '%pg_sleep(%' and pid <> pg_backend_pid())`;
const someoneLockWaiting = `select exists (select 1 from pg_stat_activity where datname = '${DB}' and wait_event_type = 'Lock' and pid <> pg_backend_pid())`;

// mirror of privacy-erasure-v3-local.mjs (the executor v3 proof), customer_requests excepted
const MIRROR = String.raw`
create schema auth; create schema storage;
create function auth.uid() returns uuid language sql stable as $$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub', '')::uuid $$;
create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
  email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(), banned_until timestamptz,
  is_sso_user boolean not null default false, confirmation_token text, recovery_token text, email_change text,
  email_change_token_new text, email_change_token_current text, phone_change text, phone_change_token text,
  reauthentication_token text, last_sign_in_at timestamptz
);
create table auth.audit_log_entries (id uuid primary key default gen_random_uuid(), payload jsonb, created_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null, owner_id text);

create table public.organizations (id uuid primary key default gen_random_uuid(), display_name text);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  active_role text check (active_role in ('worker','company','agency','admin')), locale text not null default 'lt',
  full_name text, email text, phone text, country text, onboarded boolean not null default false,
  avatar_url text, profile_text text, active_organization_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin insert into public.profiles (id, email, active_role, locale) values (new.id, new.email, nullif(new.raw_user_meta_data->>'role',''), 'lt') on conflict (id) do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create table public.workers (
  id uuid primary key default gen_random_uuid(), profile_id uuid unique references public.profiles(id) on delete cascade,
  display_name text, headline text, bio text, availability_status text check (availability_status in ('available','busy','unavailable')),
  created_at timestamptz not null default now()
);
create table public.engagement_contexts (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null, relationship_slug text not null default 'worker',
  status text not null default 'active', title text, description text, hash_self text not null default 'h', created_at timestamptz not null default now()
);
-- production signup chain (2026-10-19): a profile gets a worker, a worker gets a personal "employee" engagement
create function public.ensure_worker_profile() returns trigger language plpgsql security definer as $$
begin insert into public.workers (profile_id) values (new.id) on conflict (profile_id) do nothing; return new; end $$;
create trigger on_profile_created_ensure_worker after insert on public.profiles for each row execute function public.ensure_worker_profile();
create function public.ensure_worker_personal_engagement() returns trigger language plpgsql security definer as $$
begin
  if new.profile_id is null then return new; end if;
  insert into public.engagement_contexts (profile_id, relationship_slug, status)
  select new.profile_id, 'employee', 'active'
   where not exists (select 1 from public.engagement_contexts ec where ec.profile_id = new.profile_id and ec.relationship_slug = 'employee');
  return new;
end $$;
create trigger on_worker_personal_engagement after insert on public.workers for each row execute function public.ensure_worker_personal_engagement();
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(), worker_id uuid not null references public.workers(id) on delete cascade,
  engagement_context_id uuid not null references public.engagement_contexts(id) on delete restrict, project_id uuid,
  entry_type_slug text not null default 'freeform', original_text text not null, original_language text not null default 'lt',
  hash_prev text, hash_self text not null default 'h', visibility_scope text not null default 'closed', created_at timestamptz not null default now()
);
create table public.journal_entry_confirmations (
  id uuid primary key default gen_random_uuid(), entry_id uuid not null references public.journal_entries(id) on delete cascade,
  confirmer_id uuid not null references public.profiles(id), confirmer_engagement_context_id uuid not null references public.engagement_contexts(id),
  confirmer_role text not null default 'manager', confirmation_scope jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.usage_cost_events (
  event_id uuid primary key default gen_random_uuid(), occurred_at timestamptz not null default now(), recorded_at timestamptz not null default now(),
  event_type text not null default 'usage', status text not null default 'success', provider text not null default 'gemini', service text not null default 'llm',
  profile_id uuid references public.profiles(id) on delete set null, organization_id uuid references public.organizations(id) on delete set null,
  measures jsonb not null default '{}'::jsonb, cost jsonb not null default '{}'::jsonb, metadata jsonb not null default '{}'::jsonb
);
create function public.usage_cost_events_forbid_mutation() returns trigger language plpgsql as $$
begin raise exception 'usage_cost_events is append-only: % is not permitted', tg_op using errcode = '42501'; end $$;
create trigger usage_cost_events_no_mutation before update or delete on public.usage_cost_events for each row execute function public.usage_cost_events_forbid_mutation();
create table public.ai_runs (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), task_type text not null default 'extract',
  provider text not null default 'gemini', model_alias text not null default 'flash', output_excerpt text,
  profile_id uuid references public.profiles(id) on delete set null
);
create function public.ai_runs_enforce_retention_classes() returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - 'output_excerpt' - 'profile_id') is distinct from (to_jsonb(old) - 'output_excerpt' - 'profile_id') then
    raise exception 'ai_runs is append-only outside retention columns';
  end if; return new; end $$;
create trigger ai_runs_enforce_retention_classes before update on public.ai_runs for each row execute function public.ai_runs_enforce_retention_classes();
create function public.ai_runs_delink_subject(p_profile_id uuid) returns integer language plpgsql security definer as $$
declare v integer; begin update public.ai_runs set profile_id = null, output_excerpt = null where profile_id = p_profile_id; get diagnostics v = row_count; return v; end $$;
create table public.privacy_consent_purposes (purpose text primary key);
insert into public.privacy_consent_purposes values ('profile_discoverability'), ('employer_data_disclosure');
create table public.privacy_consent_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null references public.privacy_consent_purposes(purpose), action text not null check (action in ('granted','withdrawn')),
  consent_text_version text not null default 'v2', consent_text_hash text not null default 'x', locale text not null default 'lt', source text not null default 'ui',
  recipient_organization_id uuid, context_type text, context_id uuid, selected_fields jsonb, created_at timestamptz not null default now()
);
create function public.privacy_ledger_block_mutation() returns trigger language plpgsql as $$
begin raise exception 'privacy ledger is append-only: % on % is not allowed', tg_op, tg_table_name; end $$;
create trigger privacy_consent_events_append_only before update or delete on public.privacy_consent_events for each row execute function public.privacy_ledger_block_mutation();
create table public.personal_data_disclosures (
  id uuid primary key default gen_random_uuid(), worker_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_organization_id uuid not null references public.organizations(id), context_type text not null default 'booking', context_id uuid not null default gen_random_uuid(),
  consent_event_id uuid not null references public.privacy_consent_events(id), data_categories text[] not null default '{cv}',
  disclosed_at timestamptz not null default now(), disclosed_by uuid not null references public.profiles(id), delivery_method text not null default 'in_app'
);
create function public.personal_data_disclosures_guard() returns trigger language plpgsql as $$
begin raise exception 'disclosure ledger is append-only'; end $$;
create trigger personal_data_disclosures_append_only before update or delete on public.personal_data_disclosures for each row execute function public.personal_data_disclosures_guard();
create table public.billing_customers (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'stripe', provider_customer_id text not null, unique (provider, provider_customer_id), unique (owner_id, provider)
);
create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  plan_key text not null default 'pro', provider text not null default 'stripe', provider_customer_id text, provider_subscription_id text, status text not null default 'active'
);
create table public.payment_webhook_events (id uuid primary key default gen_random_uuid(), provider text not null default 'stripe', event_id text not null unique, event_type text not null, payload jsonb not null default '{}'::jsonb);
-- customer_requests: real shape below (CUSTOMER_REQUESTS); its guard is the REAL 20260705150000
create table public.invitations (
  id uuid primary key default gen_random_uuid(), token_hash text not null unique, invitation_type text not null default 'join_platform',
  organization_id uuid references public.organizations(id) on delete cascade,
  invited_email text not null check (invited_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(invited_email) <= 254),
  invited_name text, personal_message text, inviter_profile_id uuid references public.profiles(id) on delete cascade, status text not null default 'pending'
);
create table public.waitlist (id uuid primary key default gen_random_uuid(), email text not null unique, source text not null default 'landing', created_at timestamptz not null default now());
create table public.audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null, action text, entity text, entity_id uuid, payload jsonb, occurred_at timestamptz not null default now());
`;

// customer_requests in its real shape (0028 + 20260530150000 + 20260806200000;
// closed_outcome comes from the REAL 20261024090000 below)
const CUSTOMER_REQUESTS = String.raw`
create table public.customer_requests (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id), title text not null check (char_length(title) between 1 and 200),
  need_summary text, notes text, manual_review_note text,
  status text not null default 'draft' check (status in ('draft','submitted','in_review','needs_followup','approved','closed')),
  kind text check (kind in ('company_request','agency_offer','buyer_request','customer_request')),
  payload jsonb not null default '{}'::jsonb, original_language text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
`;

// faithful extracts: 0024 is_admin (+ the profile_roles it reads), 0028 RLS + grant,
// a service_offerings stub for 20261024090000, Supabase's schema usage grants
const EXTRACTS = String.raw`
create table public.profile_roles (profile_id uuid references public.profiles(id) on delete cascade, role text not null);
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active_role = 'admin')
      or exists (select 1 from public.profile_roles where profile_id = auth.uid() and role = 'admin')
$$;
revoke execute on function public.is_admin() from public;
revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

alter table public.customer_requests enable row level security;
create policy customer_requests_select on public.customer_requests for select using (profile_id = auth.uid() or public.is_admin());
create policy customer_requests_insert on public.customer_requests for insert with check (public.is_admin());
create policy customer_requests_update on public.customer_requests for update
  using (profile_id = auth.uid() or public.is_admin()) with check (profile_id = auth.uid() or public.is_admin());
create policy customer_requests_delete on public.customer_requests for delete using (public.is_admin());
grant select, update on public.customer_requests to authenticated;

create table public.service_offerings (id uuid primary key default gen_random_uuid(),
  status text not null default 'draft' constraint service_offerings_status_check check (status in ('draft','active','paused')));

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
`;

const H = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const HOLDER = H(1);      // (a)(b)(g)
const RACE_CANCEL = H(2); // (c) cancel first
const RACE_EXEC = H(3);   // (c) execute first, (d)
const RACE_MARK = H(4);   // (c) runner mark first, (d) approved
const STALE = H(5);       // executor re-check: closed / unconfirmed after the token
const GRACE = H(6);       // (h)
const OPCLOSED = H(7);    // (d) operator-closed
const OTHER = H(8);       // (f)
const ADMIN = H(9);       // (g) admin review queue unchanged
const RB = H(10);         // (i) after re-apply
const PRE = H(11);        // confirmed before the migration
const AGAIN = H(12);      // a new request after a withdrawal
const TWO = H(13);        // two open requests
const EDGE = H(14);       // (h) boundary

/** sets confirmed_at = now() - <iv> and reads due_v1 in the SAME transaction (same now()) — the exact `<=` boundary */
const dueAtSameNow = (req, iv) => one(`update public.privacy_erasure_confirmations_v1 set confirmed_at = now() - (${iv}) where request_id = '${req}';
  set role service_role; select coalesce(string_agg(request_id::text, ','), '') from public.privacy_erasure_due_v1(50)`).split(",").includes(req);

function createUser(id) {
  psql(`insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at) values ('${id}', 'u${id.slice(-2)}@example.test', '{"role":"worker"}', now())`);
}
function submitDeletion(uid) {
  const id = one(asUser(uid, "select public.submit_privacy_request_v1('account_deletion')"));
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error(`submit failed for ${uid}: ${id}`);
  return id;
}
function confirmDeletion(uid) {
  const r = json(asUser(uid, "select public.privacy_confirm_account_deletion_v1()"));
  if (!r?.ok) throw new Error(`confirm failed for ${uid}: ${JSON.stringify(r)}`);
  return r.request_id;
}
const backdate = (req, iv) => psql(`update public.privacy_erasure_confirmations_v1 set confirmed_at = now() - interval '${iv}' where request_id = '${req}'`);
const cancel = (uid) => json(asUser(uid, "select public.privacy_cancel_account_deletion_v1()"));
const status = (uid) => json(asUser(uid, "select public.privacy_account_deletion_status_v1()"));
const dueIds = () => one(asService("select coalesce(string_agg(request_id::text, ','), '') from public.privacy_erasure_due_v1(50)")).split(",").filter(Boolean);
const authExists = (uid) => one(`select exists (select 1 from auth.users where id = '${uid}')`) === "t";
const reqRow = (req) => json(`select to_jsonb(r) from (select status, closed_outcome, profile_id, payload from public.customer_requests where id = '${req}') r`);
const confirmations = (req) => Number(one(`select count(*) from public.privacy_erasure_confirmations_v1 where request_id = '${req}'`));
const notices = (req) => Number(one(`select count(*) from public.privacy_erasure_notices_v1 where request_id = '${req}'`));
const defs = () => json(`select jsonb_object_agg(p.proname, md5(pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('customer_requests_status_transition_guard', 'privacy_erasure_due_v1', 'privacy_erasure_mark_v1', 'erase_user_account_v3')`);
const newObjects = () => Number(one(`select (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  and p.proname in ('privacy_cancel_account_deletion_v1','privacy_account_deletion_status_v1','privacy_account_deletion_grace','customer_requests_privacy_row_guard'))
  + (select count(*) from pg_trigger where tgname = 'customer_requests_privacy_row_guard')`));

/** the runner's own sequence up to an authorization token (service_role) */
function runnerToToken(req) {
  const m = json(asService(`select public.privacy_erasure_mark_v1('${req}', 'approved')`));
  if (!m?.ok) throw new Error(`mark failed: ${JSON.stringify(m)}`);
  const plan = json(asService(`select public.privacy_erasure_plan_v3('${req}', '{"notice":"queued"}')`));
  if (!plan?.executable) throw new Error(`plan not executable: ${JSON.stringify(plan?.refusals)}`);
  const hold = json(asService(`select public.privacy_erasure_notice_hold_v1('${req}', 'erasure_completed')`));
  if (!hold?.ok) throw new Error(`notice hold failed: ${JSON.stringify(hold)}`);
  const a = json(asService(`select public.privacy_erasure_authorize_v3('${req}', null, '{"notice":"queued"}')`));
  if (!a?.authorized) throw new Error(`authorize failed: ${JSON.stringify(a)}`);
  return a.token;
}

async function main() {
  mkdirSync(tmp, { recursive: true });
  console.log(`privacy-cancel-account-deletion-local — ${new Date().toISOString()}
cluster: <repo>/.tmp/pgcancel-${process.pid} (port ${port}, throwaway, synthetic ids only)`);
  run(bin("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C", "--no-sync"]);
  run(bin("pg_ctl"), ["-D", dataDir, "-l", logFile, "-w", "-o", `-p ${port} -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off`, "start"], { stdio: "ignore" });
  try {
    console.log(`server: ${psql("select version()", { db: "postgres" }).out.split(",")[0]}`);
    psql("create role anon nologin; create role authenticated nologin; create role service_role nologin; grant anon, authenticated, service_role to postgres", { db: "postgres" });
    psql(`create database ${DB}`, { db: "postgres" });
    const schemaFile = join(tmp, "mirror.sql");
    writeFileSync(schemaFile, MIRROR + CUSTOMER_REQUESTS + EXTRACTS);
    applyFile(schemaFile, "mirror schema");
    applyFile(mig("20260705150000_customer_requests_status_transition_guard.sql"), "20260705150000");
    applyFile(mig("20260706150000_privacy_request_intake.sql"), "20260706150000");
    psql("alter function public.customer_requests_status_transition_guard() set search_path = public"); // 20260727120000 L-08
    applyFile(mig("20261024090000_market_lifecycle_closed_outcome_v1.sql"), "20261024090000");
    applyFile(mig("20261019140000_privacy_erasure_executor_v3.sql"), "20261019140000");
    applyFile(mig("20261019150000_privacy_erasure_registry_not_null_authors_v1.sql"), "20261019150000");
    applyFile(mig("20261019190000_erasure_sentinel_finite_ban_v1.sql"), "20261019190000");
    const before = defs();
    ok(Object.keys(before).length === 4, "baseline: guard, due_v1, mark_v1 and erase_user_account_v3 exist from the real migrations");

    // a request confirmed BEFORE the migration (as on production): its schedule must
    // follow its own confirmed_at, never be reset by applying the migration
    createUser(PRE);
    const reqPre = submitDeletion(PRE);
    confirmDeletion(PRE);
    backdate(reqPre, "10 days");
    const preConfirmedAt = one(`select confirmed_at::text from public.privacy_erasure_confirmations_v1 where request_id = '${reqPre}'`);
    ok(dueIds().includes(reqPre), "pre: before the migration the 10-day-old confirmed request is due (no grace yet)");

    applyFile(MIGRATION, "20261109120000");
    const after = defs();
    ok(one(`select confirmed_at::text from public.privacy_erasure_confirmations_v1 where request_id = '${reqPre}'`) === preConfirmedAt,
      "pre: applying the migration keeps the pre-existing confirmed_at unchanged");
    const sPre = status(PRE);
    ok(sPre?.status === "pending" && sPre.request_id === reqPre
      && Math.abs(new Date(sPre.scheduled_erasure_at) - new Date(sPre.deletion_confirmed_at) - 30 * 864e5) < 1000
      && Math.abs(new Date(sPre.scheduled_erasure_at) - Date.now() - 20 * 864e5) < 60000,
      "pre: it is scheduled at its OWN confirmed_at + 30 days (about 20 days from now), not reset to now + 30");
    ok(!dueIds().includes(reqPre), "pre: after the migration it is not due until its own confirmed_at + 30 days");
    backdate(reqPre, "30 days 1 second");
    ok(dueIds().includes(reqPre), "pre: once its confirmed_at is past 30 days it is due");
    ok(cancel(PRE)?.status === "ok" && confirmations(reqPre) === 0, "pre: the holder of a pre-migration confirmation can cancel it");
    ok(newObjects() === 5, "20261109120000 applied: 4 new functions + the privacy-row trigger");
    ok(psqlFile(MIGRATION).status === 0 && newObjects() === 5, "20261109120000 re-applies on the same database (idempotent)");
    ok(one("select pg_catalog.array_to_string(proacl, ' ') from pg_proc where proname = 'privacy_cancel_account_deletion_v1'").includes("authenticated=X")
      && !/(^| )=X|anon=X/.test(one("select pg_catalog.array_to_string(proacl, ' ') from pg_proc where proname = 'privacy_cancel_account_deletion_v1'")),
      "grants: cancel executable by authenticated, not by PUBLIC / anon");
    ok(!/(^| )=X|anon=X|authenticated=X/.test(one("select pg_catalog.array_to_string(proacl, ' ') from pg_proc where proname = 'privacy_account_deletion_grace'")),
      "grants: grace constant not executable by PUBLIC / anon / authenticated");
    ok(one("select prosecdef::text from pg_proc where proname = 'customer_requests_privacy_row_guard'") === "false", "privacy-row guard is an INVOKER trigger function (current_user = caller)");

    for (const u of [HOLDER, RACE_CANCEL, RACE_EXEC, RACE_MARK, STALE, GRACE, OPCLOSED, OTHER, ADMIN, RB, AGAIN, TWO, EDGE]) createUser(u);
    psql(`update public.profiles set active_role = 'admin' where id = '${ADMIN}'`);

    // ── (e) signed out ─────────────────────────────────────────────────
    console.log("\n[e] signed out");
    ok(json(asNoClaims("select public.privacy_cancel_account_deletion_v1()"))?.status === "not_signed_in", "e1 authenticated role without a JWT subject -> {status:not_signed_in}");
    ok(json(asNoClaims("select public.privacy_account_deletion_status_v1()"))?.status === "none", "e2 status without a JWT subject -> {status:none}");
    const anonCancel = psql(asAnon("select public.privacy_cancel_account_deletion_v1()"), { allowFail: true });
    ok(anonCancel.status !== 0 && /permission denied/.test(anonCancel.err), "e3 anon cannot execute the cancel RPC (permission denied)");
    const anonStatus = psql(asAnon("select public.privacy_account_deletion_status_v1()"), { allowFail: true });
    ok(anonStatus.status !== 0 && /permission denied/.test(anonStatus.err), "e4 anon cannot execute the status RPC (permission denied)");

    // ── (a)(b) cancel ok, cancel again ─────────────────────────────────
    console.log("\n[a][b] holder cancels, then cancels again");
    ok(cancel(HOLDER)?.status === "not_found" && status(HOLDER)?.status === "none", "a0 no request yet -> cancel {status:not_found}, status {status:none}");
    const reqH = submitDeletion(HOLDER);
    confirmDeletion(HOLDER);
    psql(`insert into public.privacy_erasure_notices_v1 (request_id, kind, recipient_email, status) values ('${reqH}', 'erasure_completed', 'u01@example.test', 'held'), ('${reqH}', 'erasure_review', 'u01@example.test', 'queued')`);
    const s0 = status(HOLDER);
    ok(s0?.status === "pending" && s0.cancellable === true && s0.request_id === reqH && s0.deletion_confirmed_at && !("confirmed_at" in s0) && s0.submitted_at
      && Math.abs(new Date(s0.scheduled_erasure_at) - new Date(s0.deletion_confirmed_at) - 30 * 864e5) < 1000,
      `a1 status before cancel: pending, cancellable, key deletion_confirmed_at (no bare confirmed_at), scheduled_erasure_at = deletion_confirmed_at + 30 days (${JSON.stringify(Object.keys(s0 || {}))})`);
    const c1 = cancel(HOLDER);
    ok(c1?.status === "ok" && c1.request_id === reqH && Object.keys(c1).length === 2, `a2 cancel -> ${JSON.stringify(c1 && { ...c1, request_id: c1.request_id === reqH ? "<req>" : c1.request_id })}`);
    const r1 = reqRow(reqH);
    const log = r1.payload.privacy_review_log || [];
    const last = log[log.length - 1] || {};
    ok(r1.status === "closed" && r1.closed_outcome === "withdrawn", "a3 row: status closed, closed_outcome withdrawn");
    ok(last.status === "closed" && last.outcome === "withdrawn" && last.by === "holder" && last.at && Object.keys(last).sort().join() === "at,by,outcome,status",
      "a4 log entry {status, outcome, at, by:'holder'} appended, no other field (no personal data)");
    ok(r1.payload.privacy_request_type === "account_deletion" && r1.profile_id === HOLDER, "a5 the request stays an account-deletion row of the holder (history kept)");
    ok(confirmations(reqH) === 0 && notices(reqH) === 0, "a6 confirmation row and held + queued notices deleted in the same transaction");
    const s1 = status(HOLDER);
    ok(s1?.status === "withdrawn" && s1.cancellable === false && s1.deletion_confirmed_at === null && s1.scheduled_erasure_at === null, "a7 status after cancel: withdrawn, not cancellable, no schedule");
    ok(!dueIds().includes(reqH), "a8 the runner no longer sees it (privacy_erasure_due_v1)");
    const c2 = cancel(HOLDER);
    ok(c2?.status === "ok_already" && c2.request_id === reqH, "b1 second cancel -> {status:ok_already, request_id}");
    ok(JSON.stringify(reqRow(reqH).payload.privacy_review_log) === JSON.stringify(log), "b2 second cancel wrote nothing (log unchanged)");
    const reconfirm = json(asUser(HOLDER, "select public.privacy_confirm_account_deletion_v1()"));
    ok(reconfirm?.ok === false && reconfirm.error === "no_open_deletion_request", "b3 a withdrawn request cannot be re-confirmed");

    // ── (f) another user ──────────────────────────────────────────────
    console.log("\n[f] another user");
    const reqH2 = submitDeletion(HOLDER); // the holder files again; OTHER must not reach it
    ok(cancel(OTHER)?.status === "not_found", "f1 another user's cancel -> {status:not_found} (only auth.uid()'s own rows)");
    ok(status(OTHER)?.status === "none", "f2 another user's status -> {status:none}");
    ok(reqRow(reqH2).status === "in_review", "f3 the holder's open request is untouched");
    ok(one(asUser(OTHER, `with u as (update public.customer_requests set status = 'closed' where id = '${reqH2}' returning 1) select count(*) from u`)) === "0",
      "f4 another user's raw PATCH of the holder's row updates 0 rows (RLS)");
    ok(one(asUser(OTHER, `select count(*) from public.customer_requests where id = '${reqH2}'`)) === "0", "f5 another user cannot read the holder's row (RLS)");

    // ── (g) raw owner PATCH of a privacy row ──────────────────────────
    console.log("\n[g] raw owner PATCH of a privacy row");
    const attempts = [
      ["payload: drop privacy_request_type", "payload = payload - 'privacy_request_type'"],
      ["payload: forge a log entry", `payload = jsonb_set(payload, '{privacy_review_log}', '[{"status":"approved","by":"system"}]')`],
      ["status: in_review -> closed", "status = 'closed'"],
      ["closed_outcome only", "closed_outcome = 'withdrawn'"],
      ["kind", "kind = 'company_request'"],
    ];
    for (const [label, set] of attempts) {
      const r = psql(asUser(HOLDER, `update public.customer_requests set ${set} where id = '${reqH2}'`), { allowFail: true });
      ok(r.status !== 0 && /privacy_request_rpc_only/.test(r.err), `g ${label} -> refused (42501 privacy_request_rpc_only)`);
    }
    const forgedMarker = psql(asUser(HOLDER, `set lm.privacy_withdraw_holder = '${HOLDER}'; update public.customer_requests set status = 'closed', closed_outcome = 'withdrawn' where id = '${reqH2}'`), { allowFail: true });
    ok(forgedMarker.status !== 0, "g the cancel RPC's marker set by hand on the raw surface does not open the withdraw branch");
    ok(reqRow(reqH2).status === "in_review" && reqRow(reqH2).payload.privacy_request_type === "account_deletion", "g the row is unchanged after every attempt");
    const demand = one(`insert into public.customer_requests (profile_id, kind, title, status, payload) values ('${HOLDER}', 'company_request', 'need tilers', 'submitted', '{}') returning id`);
    ok(psql(asUser(HOLDER, `update public.customer_requests set payload = '{"skills":["tiling"]}', updated_at = now() where id = '${demand}'`), { allowFail: true }).status === 0
      && psql(asUser(HOLDER, `update public.customer_requests set status = 'closed', closed_outcome = 'withdrawn' where id = '${demand}'`), { allowFail: true }).status === 0,
      "g regression: the owner still edits / closes an ordinary demand row (lifecycle flows untouched)");
    ok(psql(asUser(HOLDER, `update public.customer_requests set status = 'approved' where id = '${demand}'`), { allowFail: true }).status !== 0,
      "g regression: the transition guard still refuses an owner closed -> approved on a demand row");
    const opReq = submitDeletion(OPCLOSED);
    ok(psql(asUser(ADMIN, `update public.customer_requests set status = 'needs_followup', payload = jsonb_set(payload, '{privacy_review_log}', '[{"status_set":"needs_followup","decided_via":"human"}]') where id = '${opReq}'`), { allowFail: true }).status === 0,
      "g regression: the admin review queue still updates a privacy row (status + log)");
    ok(cancel(HOLDER)?.status === "ok" && reqRow(reqH2).closed_outcome === "withdrawn", "g the RPC path still withdraws (reqH2)");

    // ── (d) not cancellable ───────────────────────────────────────────
    console.log("\n[d] not cancellable");
    psql(asUser(ADMIN, `update public.customer_requests set status = 'closed' where id = '${opReq}'`));
    const dOp = cancel(OPCLOSED);
    ok(dOp?.status === "not_cancellable" && dOp.request_id === opReq, "d1 operator-closed (no withdrawn outcome) -> {status:not_cancellable, request_id}");
    ok(status(OPCLOSED)?.status === "done" && status(OPCLOSED).cancellable === false, "d2 its status -> done, not cancellable");

    // ── (h) grace ─────────────────────────────────────────────────────
    console.log("\n[h] grace period");
    const reqG = submitDeletion(GRACE);
    confirmDeletion(GRACE);
    ok(!dueIds().includes(reqG), "h1 confirmed just now -> not due");
    backdate(reqG, "1 hour");
    ok(!dueIds().includes(reqG), "h2 confirmed 1 hour ago -> not due");
    backdate(reqG, "29 days");
    ok(!dueIds().includes(reqG), "h3 confirmed 29 days ago -> not due");
    backdate(reqG, "31 days");
    ok(dueIds().includes(reqG), "h4 confirmed 31 days ago -> due");
    ok(one("set role service_role; select public.privacy_account_deletion_grace()::text") === "30 days", "h5 the grace is the one named constant (30 days, owner decision 2026-11-09)");
    ok(cancel(GRACE)?.status === "ok" && !dueIds().includes(reqG), "h6 a due request the runner has not picked yet is still cancellable and then not due");
    const reqEdge = submitDeletion(EDGE);
    confirmDeletion(EDGE);
    ok(dueAtSameNow(reqEdge, "interval '30 days' - interval '1 second'") === false, "h7 confirmed exactly 30 days MINUS 1 second before now() -> not due");
    ok(dueAtSameNow(reqEdge, "interval '30 days'") === true, "h8 confirmed EXACTLY 30 days before now() -> due (the boundary is <=)");
    ok(dueAtSameNow(reqEdge, "interval '30 days' + interval '1 second'") === true, "h9 confirmed 30 days PLUS 1 second before now() -> due");

    // ── a new request after a withdrawal ──────────────────────────────
    console.log("\n[n] a new request after a withdrawal");
    const reqOld = submitDeletion(AGAIN);
    confirmDeletion(AGAIN);
    backdate(reqOld, "20 days");
    ok(cancel(AGAIN)?.status === "ok" && confirmations(reqOld) === 0, "n1 first request withdrawn, its confirmation deleted");
    const reqNew = submitDeletion(AGAIN);
    const sNew0 = status(AGAIN);
    ok(sNew0?.status === "pending" && sNew0.request_id === reqNew && sNew0.deletion_confirmed_at === null && sNew0.scheduled_erasure_at === null && sNew0.cancellable === true,
      "n2 new submit -> status shows the NEW request, pending, not yet confirmed, no schedule");
    ok(confirmDeletion(AGAIN) === reqNew, "n3 confirmation binds to the new request");
    const sNew = status(AGAIN);
    ok(sNew?.request_id === reqNew && Math.abs(new Date(sNew.scheduled_erasure_at) - Date.now() - 30 * 864e5) < 60000,
      "n4 the new request has its OWN 30-day schedule from its own confirmation (not the old 20-day-old one)");
    ok(confirmations(reqOld) === 0 && reqRow(reqOld).closed_outcome === "withdrawn" && !dueIds().includes(reqOld) && !dueIds().includes(reqNew),
      "n5 the old confirmation stays gone, the old request stays withdrawn, neither is due");
    ok(cancel(AGAIN)?.request_id === reqNew && confirmations(reqNew) === 0, "n6 cancel now withdraws the new request");

    // ── two open requests from one holder ─────────────────────────────
    console.log("\n[t] two open deletion requests from one holder");
    const reqT1 = submitDeletion(TWO);
    const reqT2 = submitDeletion(TWO);
    ok(reqRow(reqT1).status === "in_review" && reqRow(reqT2).status === "in_review", "t1 two open requests exist");
    const sT = status(TWO);
    ok(sT?.request_id === reqT2 && sT.status === "pending", "t2 status shows the latest open one");
    ok(confirmDeletion(TWO) === reqT2, "t3 confirmation binds to the latest open one");
    psql(`insert into public.privacy_erasure_confirmations_v1 (request_id, profile_id, method) values ('${reqT1}', '${TWO}', 'owner_written_approval')`);
    const cT = cancel(TWO);
    ok(cT?.status === "ok" && cT.request_id === reqT2, "t4 cancel -> {status:ok, request_id: the latest}");
    ok(reqRow(reqT1).closed_outcome === "withdrawn" && reqRow(reqT2).closed_outcome === "withdrawn" && confirmations(reqT1) === 0 && confirmations(reqT2) === 0,
      "t5 BOTH open requests withdrawn and both confirmations deleted");
    const sT2 = status(TWO);
    ok(sT2?.status === "withdrawn" && sT2.request_id === reqT2 && sT2.cancellable === false, "t6 status after cancel: withdrawn, the latest request");
    ok(cancel(TWO)?.status === "ok_already", "t7 cancelling again -> ok_already");

    // ── (c1) race: cancel first, runner (mark_v1) waits ───────────────
    console.log("\n[c1] race: holder cancels first (holds the row), runner marks second");
    const reqC = submitDeletion(RACE_CANCEL);
    confirmDeletion(RACE_CANCEL);
    backdate(reqC, "31 days");
    ok(dueIds().includes(reqC), "c1.0 due before the race");
    const A1 = psqlAsync([
      "set role authenticated", `set "request.jwt.claims" to '{"sub":"${RACE_CANCEL}"}'`,
      "begin", "select public.privacy_cancel_account_deletion_v1()", "select pg_sleep(3)", "commit",
    ]);
    await waitFor(someoneSleeping, "cancel session holding the lock");
    const B1 = psqlAsync(["set role service_role", `select public.privacy_erasure_mark_v1('${reqC}', 'approved')`]);
    const waited1 = await waitFor(someoneLockWaiting, "runner waiting on the row lock").catch(() => false);
    const [a1, b1] = await Promise.all([A1, B1]);
    ok(waited1 === true && b1.ms > 1500, `c1.1 the runner's mark_v1 WAITED on the row lock (${b1.ms} ms)`);
    ok(lastJson(a1.out)?.status === "ok", "c1.2 the cancel committed: {status:ok}");
    const m1 = lastJson(b1.out);
    ok(m1?.ok === false && m1.error === "not_confirmed", `c1.3 then mark_v1 -> ${JSON.stringify(m1)} (runner stops: nothing approved)`);
    ok(reqRow(reqC).status === "closed" && reqRow(reqC).closed_outcome === "withdrawn" && authExists(RACE_CANCEL) && !dueIds().includes(reqC),
      "c1.4 request withdrawn, account still exists, nothing due");
    ok(one(`select count(*) from public.privacy_erasure_receipts_v3 where request_id = '${reqC}'`) === "0", "c1.5 no erasure receipt");

    // ── (c2) race: executor first, cancel waits ───────────────────────
    console.log("\n[c2] race: executor erases first (holds the row), holder cancels second");
    const reqE = submitDeletion(RACE_EXEC);
    confirmDeletion(RACE_EXEC);
    backdate(reqE, "31 days");
    const token = runnerToToken(reqE);
    ok(status(RACE_EXEC)?.status === "in_progress" && status(RACE_EXEC).cancellable === false, "c2.0 after the runner's mark: status in_progress, not cancellable");
    const A2 = psqlAsync(["set role service_role", "begin", `select public.erase_user_account_v3('${reqE}', '${token}', null)`, "select pg_sleep(3)", "commit"]);
    await waitFor(someoneSleeping, "executor holding the lock");
    const B2 = psqlAsync(["set role authenticated", `set "request.jwt.claims" to '{"sub":"${RACE_EXEC}"}'`, "select public.privacy_cancel_account_deletion_v1()"]);
    const waited2 = await waitFor(someoneLockWaiting, "cancel waiting on the row lock").catch(() => false);
    const [a2, b2] = await Promise.all([A2, B2]);
    const x2 = lastJson(a2.out);
    ok(x2?.erased === true, `c2.1 the executor erased (receipt written)${x2?.erased ? "" : " :: " + a2.out.slice(0, 300) + a2.err.slice(0, 300)}`);
    ok(waited2 === true && b2.ms > 1500, `c2.2 the cancel WAITED on the row lock (${b2.ms} ms)`);
    const cc2 = lastJson(b2.out);
    ok(cc2?.status === "not_cancellable" && cc2.request_id === reqE, `c2.3 then cancel -> {status:not_cancellable, request_id} (${JSON.stringify(cc2 && cc2.status)})`);
    ok(!authExists(RACE_EXEC) && reqRow(reqE).status === "closed" && reqRow(reqE).payload.privacy_erasure === "executed", "c2.4 the account is gone, the request is closed as executed (not withdrawn)");
    // (d) after execution
    const d3 = cancel(RACE_EXEC);
    ok(d3?.status === "not_found", "d3 a later cancel with the erased person's stale session -> {status:not_found} (the row is severed to the sentinel; nothing of theirs remains)");

    // ── (c3) race: runner mark_v1 first, cancel waits ─────────────────
    console.log("\n[c3] race: runner marks approved first (holds the row), holder cancels second");
    const reqM = submitDeletion(RACE_MARK);
    confirmDeletion(RACE_MARK);
    backdate(reqM, "31 days");
    const A3 = psqlAsync(["set role service_role", "begin", `select public.privacy_erasure_mark_v1('${reqM}', 'approved')`, "select pg_sleep(3)", "commit"]);
    await waitFor(someoneSleeping, "runner holding the lock");
    const B3 = psqlAsync(["set role authenticated", `set "request.jwt.claims" to '{"sub":"${RACE_MARK}"}'`, "select public.privacy_cancel_account_deletion_v1()"]);
    const waited3 = await waitFor(someoneLockWaiting, "cancel waiting on the row lock").catch(() => false);
    const [a3, b3] = await Promise.all([A3, B3]);
    ok(lastJson(a3.out)?.ok === true, "c3.1 the runner marked approved");
    ok(waited3 === true && b3.ms > 1500, `c3.2 the cancel WAITED on the row lock (${b3.ms} ms)`);
    ok(lastJson(b3.out)?.status === "not_cancellable", "c3.3 then cancel -> {status:not_cancellable} (d: approved)");
    ok(confirmations(reqM) === 1 && reqRow(reqM).status === "approved", "c3.4 the confirmation and the approval stand (cancel changed nothing)");

    // ── executor re-check: token issued, then the request closed / unconfirmed ─
    console.log("\n[x] executor re-check after authorization (the old fingerprint-without-lock gap)");
    const reqS = submitDeletion(STALE);
    confirmDeletion(STALE);
    backdate(reqS, "31 days");
    const tokS = runnerToToken(reqS);
    psql(`delete from public.privacy_erasure_confirmations_v1 where request_id = '${reqS}'`);
    const xs1 = json(asService(`select public.erase_user_account_v3('${reqS}', '${tokS}', null)`));
    ok(xs1?.erased === false && /no longer confirmed/.test(JSON.stringify(xs1.refusals)) && authExists(STALE), "x1 confirmation gone after the token -> {erased:false} (existing skip shape), account kept");
    ok(one(`select (consumed_at is null)::text from public.privacy_erasure_authorizations_v3 where request_id = '${reqS}'`) === "true", "x2 the token was not consumed");
    psql(`insert into public.privacy_erasure_confirmations_v1 (request_id, profile_id, method, confirmed_at) values ('${reqS}', '${STALE}', 'owner_written_approval', now() - interval '31 days')`);
    psql(asUser(ADMIN, `update public.customer_requests set status = 'closed' where id = '${reqS}'`));
    const xs2 = json(asService(`select public.erase_user_account_v3('${reqS}', '${tokS}', null)`));
    ok(xs2?.erased === false && authExists(STALE) && one(`select count(*) from public.privacy_erasure_receipts_v3 where request_id = '${reqS}'`) === "0",
      "x3 request closed after the token -> {erased:false}, account kept, no receipt");
    const mk = json(asService(`select public.privacy_erasure_mark_v1('${reqS}', 'approved')`));
    ok(mk?.ok === false && mk.error === "not_open", "x4 mark_v1 on a closed request -> {ok:false, error:not_open}");

    // ── (i) rollback + re-apply ───────────────────────────────────────
    console.log("\n[i] rollback, then re-apply");
    const rb = psqlFile(ROLLBACK);
    ok(rb.status === 0, `i1 rollback applies cleanly${rb.status === 0 ? "" : " :: " + rb.err}`);
    const restored = defs();
    ok(Object.keys(before).every((k) => restored[k] === before[k]), "i2 guard, due_v1, mark_v1, erase_user_account_v3 are byte-identical to the pre-migration definitions (md5 of pg_get_functiondef)");
    ok(newObjects() === 0, "i3 the 4 new functions and the trigger are gone");
    ok(reqRow(reqH).closed_outcome === "withdrawn" && reqRow(reqC).closed_outcome === "withdrawn", "i4 withdrawn rows stay as closed history (no data touched)");
    const reqG2 = submitDeletion(GRACE);
    confirmDeletion(GRACE);
    ok(dueIds().includes(reqG2), "i5 pre-migration behaviour restored: a request confirmed just now is due again (no grace)");
    ok(psqlFile(MIGRATION).status === 0, "i6 forward migration re-applies after the rollback");
    const again = defs();
    ok(Object.keys(after).every((k) => again[k] === after[k]) && newObjects() === 5, "i7 re-applied definitions are identical to the first apply");
    ok(!dueIds().includes(reqG2) && cancel(GRACE)?.status === "ok", "i8 after re-apply: grace in force again and the holder cancels");
    const reqR = submitDeletion(RB);
    ok(psql(asUser(RB, `update public.customer_requests set payload = '{}' where id = '${reqR}'`), { allowFail: true }).status !== 0, "i9 after re-apply: the raw payload PATCH is refused again");

    const logLines = readFileSync(logFile, "utf8").split(/\r?\n/).filter((l) => /deadlock/i.test(l));
    ok(logLines.length === 0, "no deadlock reported by the server during the races");
  } finally {
    run(bin("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"], { stdio: "ignore", allowFail: true });
  }
  console.log(`\nSUMMARY: ${pass} PASS, ${failures} FAIL  (finished ${new Date().toISOString()})`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(`ERROR: ${e.message}`);
  try { run(bin("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"], { stdio: "ignore", allowFail: true }); } catch { /* already down */ }
  console.log(`\nSUMMARY: ${pass} PASS, ${failures + 1} FAIL (aborted)`);
  process.exit(1);
});
