#!/usr/bin/env node
/**
 * GDPR erasure executor v3 — local proof on a THROWAWAY PostgreSQL 16 cluster.
 *
 *   node apps/web/scripts/db-proof/privacy-erasure-v3-local.mjs
 *
 * No dependencies, no Docker, no Supabase, no network: initdb + pg_ctl + psql
 * from a local PostgreSQL 16 install (PG16_BIN, default
 * "C:\Program Files\PostgreSQL\16\bin"), data dir under <worktree>/.tmp/,
 * deleted at the end (also on failure). The schema MIRRORS the production
 * shapes the migration touches (same table names, FK rules, NOT NULLs and
 * guard triggers) so the executor is exercised against real constraints.
 *
 * Cases (the PR body records the output):
 *   T1  account with AI usage + journal history + Stripe mapping: the dry run
 *       names every action; billing refuses until external.stripe is passed;
 *       execute severs the person, keeps journal rows under the sentinel,
 *       keeps usage_cost_events, pseudonymises the consent ledger.
 *   T2  forged / expired / reused / cross-request tokens are refused.
 *   T3  an FK added after seeding is refused BY NAME (rows or no rows) until
 *       the registry gets a row.
 *   T4  the receipt holds no identifier of the person.
 *   RB  the rollback file on a clean database removes everything; on a
 *       database with a receipt it refuses and changes nothing.
 *
 * NEVER prints personal values: only table names, treatments, counts and
 * pass/fail lines.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const migration = join(repo, "supabase/migrations/20261016150000_privacy_erasure_executor_v3.sql");
const rollback = join(repo, "supabase/rollbacks/20261016150000_privacy_erasure_executor_v3.down.sql");
const pgBin = process.env.PG16_BIN || "C:\\Program Files\\PostgreSQL\\16\\bin";
const port = Number(process.env.PG_PROOF_PORT || 5499);
const tmp = join(repo, ".tmp", `pg-erasure-v3-${process.pid}`);
const dataDir = join(tmp, "data");
const logFile = join(tmp, "pg.log");

const SUBJECT = "a1a1a1a1-0000-4000-8000-000000000001";
const OTHER = "b2b2b2b2-0000-4000-8000-000000000002";
const THIRD = "c3c3c3c3-0000-4000-8000-000000000003";
const FOURTH = "d4d4d4d4-0000-4000-8000-000000000004";
const REQ_A = "11111111-0000-4000-8000-00000000000a";
const REQ_C = "11111111-0000-4000-8000-00000000000c";
const REQ_D = "11111111-0000-4000-8000-00000000000d";
const EMAIL_A = "subject-a@example.test"; // synthetic; never printed
const NAME_A = "Subject Alpha Example"; // synthetic; never printed
const PHONE_A = "+370 600 00001"; // synthetic; never printed

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures += 1;
};

function bin(name) {
  const p = join(pgBin, process.platform === "win32" ? `${name}.exe` : name);
  if (!existsSync(p)) throw new Error(`PostgreSQL 16 binary not found: ${p} (set PG16_BIN)`);
  return p;
}
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`${cmd} ${args.join(" ")} failed (${r.status}):\n${r.stderr || r.stdout}`);
  }
  return r;
}
function psql(db, sql, { allowFail = false } = {}) {
  const r = spawnSync(bin("psql"), ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", db, "-At", "-c", sql], { encoding: "utf8" });
  if (r.status !== 0 && !allowFail) throw new Error(`psql failed:\n${r.stderr}\n--- sql ---\n${sql.slice(0, 400)}`);
  return { out: (r.stdout || "").trim(), err: (r.stderr || "").trim(), status: r.status };
}
function psqlFile(db, file) {
  const r = spawnSync(bin("psql"), ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", db, "-f", file], { encoding: "utf8" });
  return { status: r.status, err: (r.stderr || "").trim() };
}
const one = (db, sql) => psql(db, sql).out;
const json = (db, sql) => JSON.parse(one(db, sql) || "null");

const MIRROR = String.raw`
create schema auth; create schema storage;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
  email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(), banned_until timestamptz,
  is_sso_user boolean not null default false, confirmation_token text, recovery_token text, email_change text,
  email_change_token_new text, email_change_token_current text, phone_change text, phone_change_token text,
  reauthentication_token text
);
create table auth.audit_log_entries (id uuid primary key default gen_random_uuid(), payload jsonb, created_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null, owner_id text);

create table public.organizations (id uuid primary key default gen_random_uuid(), display_name text);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text check (role in ('worker','company','agency','admin')), locale text not null default 'lt',
  full_name text, email text, phone text, country text, onboarded boolean not null default false,
  avatar_url text, profile_text text, active_organization_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin insert into public.profiles (id, email, role, locale) values (new.id, new.email, nullif(new.raw_user_meta_data->>'role',''), 'lt') on conflict (id) do nothing; return new; end $$;
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
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(), worker_id uuid not null references public.workers(id) on delete cascade,
  engagement_context_id uuid not null references public.engagement_contexts(id) on delete restrict,
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
create table public.customer_requests (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id), title text not null default 'request', need_summary text, notes text, manual_review_note text,
  status text not null default 'draft', payload jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function public.customer_requests_status_transition_guard() returns trigger language plpgsql as $$
begin if new.status is distinct from old.status and auth.uid() is not null then raise exception 'invalid transition'; end if; return new; end $$;
create trigger customer_requests_status_transition_guard before update on public.customer_requests for each row execute function public.customer_requests_status_transition_guard();
create table public.invitations (
  id uuid primary key default gen_random_uuid(), token_hash text not null unique, invitation_type text not null default 'join_platform',
  organization_id uuid references public.organizations(id) on delete cascade,
  invited_email text not null check (invited_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(invited_email) <= 254),
  invited_name text, personal_message text, inviter_profile_id uuid references public.profiles(id) on delete cascade, status text not null default 'pending'
);
create table public.waitlist (id uuid primary key default gen_random_uuid(), email text not null unique, source text not null default 'landing', created_at timestamptz not null default now());
create table public.audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null, action text, entity text, entity_id uuid, payload jsonb, occurred_at timestamptz not null default now());
`;

function seed(db) {
  psql(db, String.raw`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${SUBJECT}', '${EMAIL_A}', '{"role":"worker"}'), ('${OTHER}', 'other-b@example.test', '{"role":"company"}'),
      ('${THIRD}', 'third-c@example.test', '{"role":"worker"}'), ('${FOURTH}', 'fourth-d@example.test', '{"role":"worker"}');
    update public.profiles set full_name = '${NAME_A}', phone = '${PHONE_A}' where id = '${SUBJECT}';
    update public.profiles set full_name = 'Other Beta' where id = '${OTHER}';
    insert into public.organizations (id, display_name) values ('99999999-0000-4000-8000-000000000001', 'Org One');
    insert into public.workers (id, profile_id, display_name) values
      ('aaaa0000-0000-4000-8000-000000000001', '${SUBJECT}', 'Subject A'), ('bbbb0000-0000-4000-8000-000000000002', '${OTHER}', 'Other B'),
      ('cccc0000-0000-4000-8000-000000000003', '${THIRD}', 'Third C'), ('dddd0000-0000-4000-8000-000000000004', '${FOURTH}', 'Fourth D');
    insert into public.engagement_contexts (id, profile_id, organization_id, title, description) values
      ('ec000000-0000-4000-8000-000000000001', '${SUBJECT}', '99999999-0000-4000-8000-000000000001', 'my job', 'private note'),
      ('ec000000-0000-4000-8000-000000000002', '${OTHER}', '99999999-0000-4000-8000-000000000001', 'manager', null),
      ('ec000000-0000-4000-8000-000000000003', '${THIRD}', null, null, null),
      ('ec000000-0000-4000-8000-000000000004', '${FOURTH}', null, null, null);
    insert into public.journal_entries (id, worker_id, engagement_context_id, original_text) values
      ('e0000000-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001', 'ec000000-0000-4000-8000-000000000001', 'laid 40 m2 of tiles'),
      ('e0000000-0000-4000-8000-000000000002', 'aaaa0000-0000-4000-8000-000000000001', 'ec000000-0000-4000-8000-000000000001', 'grouting, 8 h'),
      ('e0000000-0000-4000-8000-000000000003', 'bbbb0000-0000-4000-8000-000000000002', 'ec000000-0000-4000-8000-000000000002', 'site inspection'),
      ('e0000000-0000-4000-8000-000000000004', 'cccc0000-0000-4000-8000-000000000003', 'ec000000-0000-4000-8000-000000000003', 'c entry');
    -- B confirms A's entry; A confirms B's entry
    insert into public.journal_entry_confirmations (entry_id, confirmer_id, confirmer_engagement_context_id) values
      ('e0000000-0000-4000-8000-000000000001', '${OTHER}', 'ec000000-0000-4000-8000-000000000002'),
      ('e0000000-0000-4000-8000-000000000003', '${SUBJECT}', 'ec000000-0000-4000-8000-000000000001');
    insert into public.usage_cost_events (profile_id, measures) values ('${SUBJECT}', '{"tokens":100}'), ('${SUBJECT}', '{"tokens":200}'), ('${OTHER}', '{"tokens":5}');
    insert into public.ai_runs (profile_id, output_excerpt) values ('${SUBJECT}', 'excerpt about the subject'), ('${OTHER}', 'other excerpt');
    insert into public.privacy_consent_events (id, user_id, purpose, action) values
      ('ce000000-0000-4000-8000-000000000001', '${SUBJECT}', 'profile_discoverability', 'granted'),
      ('ce000000-0000-4000-8000-000000000002', '${SUBJECT}', 'profile_discoverability', 'withdrawn'),
      ('ce000000-0000-4000-8000-000000000003', '${OTHER}', 'profile_discoverability', 'granted');
    insert into public.personal_data_disclosures (worker_user_id, recipient_organization_id, consent_event_id, disclosed_by) values
      ('${SUBJECT}', '99999999-0000-4000-8000-000000000001', 'ce000000-0000-4000-8000-000000000001', '${OTHER}');
    insert into public.billing_customers (owner_id, provider_customer_id) values ('${SUBJECT}', 'cus_subjectA'), ('${OTHER}', 'cus_otherB');
    insert into public.billing_subscriptions (owner_id, provider_customer_id, provider_subscription_id) values ('${SUBJECT}', 'cus_subjectA', 'sub_1');
    insert into public.payment_webhook_events (event_id, event_type, payload) values ('evt_1', 'customer.created', jsonb_build_object('customer', 'cus_subjectA', 'email', '${EMAIL_A}'));
    insert into public.customer_requests (id, profile_id, title, need_summary, status, payload) values
      ('${REQ_A}', '${SUBJECT}', 'Account deletion', 'please delete me, ${NAME_A}', 'approved', '{"source":"privacy_self_service","privacy_request_type":"account_deletion","privacy_review_log":[{"status":"approved"}]}'),
      ('${REQ_C}', '${THIRD}', 'Account deletion', null, 'approved', '{"source":"privacy_self_service","privacy_request_type":"account_deletion"}'),
      ('${REQ_D}', '${FOURTH}', 'Account deletion', null, 'approved', '{"source":"privacy_self_service","privacy_request_type":"account_deletion"}'),
      ('22222222-0000-4000-8000-000000000001', '${OTHER}', 'Need tilers', 'we need 3 tilers', 'submitted', '{}');
    insert into public.invitations (token_hash, invited_email, invited_name, personal_message, inviter_profile_id, organization_id) values
      (repeat('a', 64), '${EMAIL_A}', '${NAME_A}', 'join us', '${OTHER}', '99999999-0000-4000-8000-000000000001'),
      (repeat('b', 64), 'someone-else@example.test', 'Someone Else', null, '${OTHER}', '99999999-0000-4000-8000-000000000001');
    insert into public.waitlist (email) values ('${EMAIL_A}'), ('keep-me@example.test');
    insert into public.audit_logs (actor_id, action, payload) values
      ('${SUBJECT}', 'login', jsonb_build_object('user_id', '${SUBJECT}', 'email', '${EMAIL_A}')),
      ('${OTHER}', 'review', jsonb_build_object('subject', '${SUBJECT}', 'note', 'reviewed ${EMAIL_A}')),
      ('${OTHER}', 'other', jsonb_build_object('x', 1));
    insert into auth.audit_log_entries (payload) values (jsonb_build_object('actor_id', '${SUBJECT}', 'action', 'login'));
    insert into storage.objects (bucket_id, name, owner_id) values
      ('profile-avatars', '${SUBJECT}/avatar-1.jpg', null),
      ('journal-entry-photos', '${SUBJECT}/e0000000-0000-4000-8000-000000000001/p1/photo.jpg', '${SUBJECT}'),
      ('evidence-media', 'org/99999999-0000-4000-8000-000000000001/${"0".repeat(64)}.jpg', null),
      ('profile-avatars', '${OTHER}/avatar-9.jpg', '${OTHER}');
  `);
}

const reasons = (plan) => (plan.refusals || []).map((r) => `${r.table || "-"}${r.column ? "." + r.column : ""}: ${String(r.reason).replace(/\(.*$/, "").trim()}`);
const actions = (plan) => (plan.actions || []).map((a) => `${a.table}.${a.column} ${a.treatment} rows=${a.rows}`);
const containsIdentifier = (text) => [SUBJECT, EMAIL_A, NAME_A, PHONE_A.replace(/\D/g, "")].some((v) => text.toLowerCase().includes(v.toLowerCase()));

function main() {
  mkdirSync(tmp, { recursive: true });
  console.log(`cluster: ${tmp} (port ${port})`);
  run(bin("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C", "--no-sync"]);
  // stdio "ignore": the postmaster inherits pg_ctl's pipes on Windows and spawnSync would never return
  run(bin("pg_ctl"), ["-D", dataDir, "-l", logFile, "-w", "-o", `-p ${port} -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off`, "start"], { stdio: "ignore" });
  try {
    psql("postgres", "create role anon nologin; create role authenticated nologin; create role service_role nologin");
    for (const db of ["proof", "rb"]) {
      psql("postgres", `create database ${db}`);
      const mirror = join(tmp, "mirror.sql");
      writeFileSync(mirror, MIRROR);
      const m = psqlFile(db, mirror);
      if (m.status !== 0) throw new Error(`mirror schema failed: ${m.err}`);
      const a = psqlFile(db, migration);
      if (a.status !== 0) throw new Error(`migration failed on ${db}: ${a.err}`);
    }
    ok(one("proof", "select count(*) from public.privacy_erasure_registry_v3") > 250, `migration applied on the mirror: ${one("proof", "select count(*) from public.privacy_erasure_registry_v3")} registry rows, ${one("proof", "select count(*) from public.privacy_erasure_value_rules_v3")} value rules`);
    ok(one("proof", "select count(*) from auth.users u join public.profiles p on p.id = u.id join public.workers w on w.profile_id = p.id where u.id = public.privacy_erasure_sentinel_profile_id() and u.banned_until = 'infinity'") === "1", "sentinel auth user + profile + worker exist, banned forever");

    seed("proof");
    const before = json("proof", `select jsonb_build_object('je', (select count(*) from public.journal_entries), 'uce', (select count(*) from public.usage_cost_events), 'pce', (select count(*) from public.privacy_consent_events), 'users', (select count(*) from auth.users))`);

    // ── T1 ───────────────────────────────────────────────────────────────
    console.log("\n[T1] dry run: AI usage + journal history + Stripe mapping");
    const p0 = json("proof", `select public.privacy_erasure_plan_v3('${REQ_A}', '{}')`);
    ok(p0.executable === false, "T1a refuses while files remain and no Stripe decision is passed");
    for (const r of reasons(p0)) console.log(`      refusal  ${r}`);
    ok(p0.refusals.some((r) => r.table === "storage.objects" && r.rows === 2), "T1a storage scan finds the owner-less avatar by path prefix AND the owned photo (2), not the org evidence");
    ok(p0.refusals.some((r) => r.table === "public.billing_customers" && /external\.stripe/.test(r.reason)), "T1a billing_customers refuses without external.stripe");
    ok(p0.refusals.some((r) => r.table === "public.billing_subscriptions" && /external\.stripe/.test(r.reason)), "T1a billing_subscriptions refuses without external.stripe");

    psql("proof", `delete from storage.objects where bucket_id in ('profile-avatars','journal-entry-photos') and name like '${SUBJECT}/%'`); // the app's Storage API step
    const p1 = json("proof", `select public.privacy_erasure_plan_v3('${REQ_A}', '{"stripe":"customer_deleted"}')`);
    ok(p1.executable === true, `T1b executable with files gone + external.stripe (${(p1.actions || []).length} actions, ${(p1.retained || []).length} retained classes)`);
    for (const a of actions(p1)) console.log(`      action   ${a}`);
    for (const r of p1.retained || []) console.log(`      retained ${r.table}.${r.column} rows=${r.rows}`);
    const want = [
      ["public.journal_entries", "worker_id", "sever_sentinel", 2],
      ["public.engagement_contexts", "profile_id", "sever_sentinel", 1],
      ["public.journal_entry_confirmations", "confirmer_id", "sever_sentinel", 1],
      ["public.usage_cost_events", "profile_id", "set_null", 2],
      ["public.ai_runs", "profile_id", "set_null", 1],
      ["public.privacy_consent_events", "user_id", "pseudonymise_ledger", 2],
      ["public.personal_data_disclosures", "worker_user_id", "pseudonymise_ledger", 1],
      ["public.billing_customers", "owner_id", "delete_rows", 1],
      ["public.billing_subscriptions", "owner_id", "sever_sentinel", 1],
      ["public.customer_requests", "profile_id", "sever_sentinel", 1],
      ["public.workers", "profile_id", "allow_cascade", 1],
      ["public.invitations", "invited_email", "pseudonymise_value", 1],
      ["public.waitlist", "email", "delete_rows", 1],
      ["public.audit_logs", "payload", "pseudonymise_mentions", 2],
      ["public.payment_webhook_events", "payload", "pseudonymise_mentions", 1],
    ];
    for (const [t, c, tr, n] of want) {
      ok((p1.actions || []).some((a) => a.table === t && a.column === c && a.treatment === tr && Number(a.rows) === n), `T1b plan names ${t}.${c} -> ${tr} (${n})`);
    }
    ok((p1.retained || []).some((r) => r.table === "auth.audit_log_entries" && r.rows === 1), "T1b auth.audit_log_entries counted as retained");
    const after = json("proof", `select jsonb_build_object('je', (select count(*) from public.journal_entries), 'uce', (select count(*) from public.usage_cost_events), 'pce', (select count(*) from public.privacy_consent_events), 'users', (select count(*) from auth.users))`);
    ok(JSON.stringify(before) === JSON.stringify(after), "T1b the dry run changed nothing");
    ok(one("proof", "select provolatile from pg_proc where proname = 'privacy_erasure_plan_v3'") === "s", "T1b plan function is STABLE (cannot write, cannot run DDL, takes no exclusive lock)");

    const a0 = json("proof", `select public.privacy_erasure_authorize_v3('${REQ_A}', '${OTHER}', '{"stripe":"customer_deleted"}')`);
    ok(a0.authorized === false && /notice/.test(JSON.stringify(a0.refusals)), "T1c authorization refused until the completion notice is recorded as sent");
    const a1 = json("proof", `select public.privacy_erasure_authorize_v3('${REQ_A}', '${OTHER}', '{"stripe":"customer_deleted","notice":"sent"}')`);
    ok(a1.authorized === true && /^[0-9a-f]{64}$/.test(a1.token || ""), "T1c token issued (64 hex, shown once)");
    ok(one("proof", `select count(*) from public.privacy_erasure_authorizations_v3 where token_digest = encode(sha256(convert_to('${a1.token}', 'UTF8')), 'hex') and consumed_at is null`) === "1", "T1c only sha256(token) is stored, unconsumed, bound to the request");

    const x1 = json("proof", `select public.erase_user_account_v3('${REQ_A}', '${a1.token}', '${OTHER}')`);
    ok(x1.erased === true, `T1d execute: erased=${x1.erased}${x1.erased ? "" : " " + JSON.stringify(reasons(x1))}`);
    const S = "public.privacy_erasure_sentinel_profile_id()";
    const SW = "public.privacy_erasure_sentinel_worker_id()";
    ok(one("proof", `select count(*) from auth.users where id = '${SUBJECT}'`) === "0" && one("proof", `select count(*) from public.profiles where id = '${SUBJECT}'`) === "0", "T1d auth user and profile are gone");
    ok(one("proof", `select count(*) from public.journal_entries where worker_id = ${SW}`) === "2" && one("proof", "select count(*) from public.journal_entries") === "4", "T1d journal rows retained (2 under the sentinel worker, 4 in total)");
    ok(one("proof", `select count(*) from public.engagement_contexts where profile_id = ${S} and title is null and description is null`) === "1", "T1d engagement context retained under the sentinel, labels scrubbed");
    ok(one("proof", `select count(*) from public.journal_entry_confirmations c join public.journal_entries e on e.id = c.entry_id where e.worker_id = ${SW} and c.confirmer_id = '${OTHER}'`) === "1", "T1d the manager's confirmation of the subject's entry survives");
    ok(one("proof", `select count(*) from public.journal_entry_confirmations where confirmer_id = ${S}`) === "1", "T1d the subject's confirmation of the other worker's entry survives, confirmer severed");
    ok(one("proof", "select count(*) from public.usage_cost_events") === "3" && one("proof", `select count(*) from public.usage_cost_events where profile_id is null`) === "2", "T1d usage_cost_events retained (3), subject rows severed (2) despite the append-only trigger");
    ok(one("proof", "select count(*) from public.usage_cost_events where false") === "0" && psql("proof", "update public.usage_cost_events set measures = '{}' where profile_id is null", { allowFail: true }).status !== 0, "T1d usage_cost_events guard trigger is back in force after execution");
    ok(one("proof", `select count(*) from public.ai_runs where profile_id is null and output_excerpt is null`) === "1" && one("proof", "select count(*) from public.ai_runs") === "2", "T1d ai_runs delinked via the existing RPC, rows retained");
    ok(one("proof", `select count(distinct erased_subject_id) || '/' || count(*) from public.privacy_consent_events where user_id is null and erased_subject_id is not null and erased_at is not null`) === "1/2", "T1d consent ledger pseudonymised: 2 rows, one tombstone, rows kept");
    ok(psql("proof", "update public.privacy_consent_events set action = 'granted' where user_id is null", { allowFail: true }).status !== 0, "T1d consent ledger guard trigger is back in force");
    ok(one("proof", `select count(*) from public.personal_data_disclosures where worker_user_id is null and erased_subject_id is not null and disclosed_by = '${OTHER}'`) === "1", "T1d disclosure ledger pseudonymised, discloser untouched");
    ok(one("proof", `select count(*) from public.billing_customers where provider_customer_id = 'cus_subjectA'`) === "0" && one("proof", `select count(*) from public.billing_customers`) === "1", "T1d Stripe mapping row deleted only after external.stripe; the other customer stays");
    ok(one("proof", `select count(*) from public.billing_subscriptions where owner_id = ${S} and provider_subscription_id = 'sub_1'`) === "1", "T1d subscription history retained under the sentinel (accounting)");
    ok(one("proof", `select count(*) from public.invitations where invited_email like 'erased-%@erased.invalid' and invited_name is null and personal_message is null`) === "1" && one("proof", "select count(*) from public.invitations") === "2", "T1d invitation addressed to the person pseudonymised; the other invitation untouched");
    ok(one("proof", "select count(*) from public.waitlist") === "1", "T1d waitlist signup deleted, other signup kept");
    ok(one("proof", `select count(*) from public.audit_logs where payload::text ilike '%${SUBJECT}%' or payload::text ilike '%${EMAIL_A}%'`) === "0" && one("proof", `select count(*) from public.audit_logs where payload::text like '%erased-%'`) === "2" && one("proof", "select count(*) from public.audit_logs") === "3", "T1d audit payload mentions replaced by tombstone / sentinel address; rows kept");
    ok(one("proof", `select count(*) from public.payment_webhook_events where payload::text ilike '%${EMAIL_A}%'`) === "0", "T1d Stripe webhook payload no longer names the person");
    ok(one("proof", `select status || '|' || coalesce(need_summary, '<null>') || '|' || (profile_id = ${S})::text from public.customer_requests where id = '${REQ_A}'`) === "closed|<null>|true", "T1d the privacy request row survives: closed, severed, free text scrubbed");
    ok(one("proof", `select count(*) from public.journal_entries where worker_id = 'bbbb0000-0000-4000-8000-000000000002'`) === "1" && one("proof", `select count(*) from public.profiles where id = '${OTHER}' and full_name = 'Other Beta'`) === "1", "T1d the other person is untouched");
    ok(one("proof", `select outcome from public.privacy_erasure_authorizations_v3 where request_id = '${REQ_A}'`) === "erased", "T1d authorization marked consumed with outcome=erased");

    // ── T2 ───────────────────────────────────────────────────────────────
    console.log("\n[T2] forged / expired / reused / cross-request tokens");
    const forged = "f".repeat(64);
    const f1 = json("proof", `select public.erase_user_account_v3('${REQ_C}', '${forged}', '${OTHER}')`);
    ok(f1.erased === false && /invalid, expired or already used/.test(JSON.stringify(f1.refusals)), "T2 forged token refused");
    const r1 = json("proof", `select public.erase_user_account_v3('${REQ_C}', '${a1.token}', '${OTHER}')`);
    ok(r1.erased === false, "T2 the already-consumed T1 token is refused again (single use)");
    const exp = json("proof", `select public.privacy_erasure_authorize_v3('${REQ_C}', '${OTHER}', '{"notice":"sent"}', interval '-1 minute')`);
    ok(exp.authorized === true, "T2 token issued for subject C with an already-passed expiry (test only)");
    const e1 = json("proof", `select public.erase_user_account_v3('${REQ_C}', '${exp.token}', '${OTHER}')`);
    ok(e1.erased === false && one("proof", `select count(*) from auth.users where id = '${THIRD}'`) === "1", "T2 expired token refused, subject C untouched");
    const ac = json("proof", `select public.privacy_erasure_authorize_v3('${REQ_C}', '${OTHER}', '{"notice":"sent"}')`);
    const cross = json("proof", `select public.erase_user_account_v3('${REQ_D}', '${ac.token}', '${OTHER}')`);
    ok(cross.erased === false && one("proof", `select count(*) from auth.users where id in ('${THIRD}','${FOURTH}')`) === "2", "T2 token for request C refused on request D (bound to the request id)");
    psql("proof", `update public.customer_requests set payload = payload || '{"privacy_review_log":[{"status":"note added after authorization"}]}' where id = '${REQ_C}'`);
    const drift = json("proof", `select public.erase_user_account_v3('${REQ_C}', '${ac.token}', '${OTHER}')`);
    ok(drift.erased === false && /state changed/.test(JSON.stringify(drift.refusals)), "T2 request state changed after issue -> refused, token consumed");
    const ac2 = json("proof", `select public.privacy_erasure_authorize_v3('${REQ_C}', '${OTHER}', '{"notice":"sent"}')`);
    const okc = json("proof", `select public.erase_user_account_v3('${REQ_C}', '${ac2.token}', '${OTHER}')`);
    ok(okc.erased === true, "T2 a fresh token for the current state executes");
    const again = json("proof", `select public.erase_user_account_v3('${REQ_C}', '${ac2.token}', '${OTHER}')`);
    ok(again.erased === false, "T2 the same token a second time is refused");

    // ── T3 ───────────────────────────────────────────────────────────────
    console.log("\n[T3] an FK added after seeding");
    psql("proof", "create table public.new_feature_notes (id uuid primary key default gen_random_uuid(), author_id uuid references public.profiles(id) on delete cascade, body text)");
    const t3 = json("proof", `select public.privacy_erasure_plan_v3('${REQ_D}', '{"notice":"sent"}')`);
    ok(t3.executable === false && t3.refusals.some((r) => r.table === "public.new_feature_notes" && r.column === "author_id" && /undecided/.test(r.reason)), "T3 undecided FK refused BY NAME with zero rows");
    const t3x = json("proof", `select public.privacy_erasure_authorize_v3('${REQ_D}', '${OTHER}', '{"notice":"sent"}')`);
    ok(t3x.authorized === false, "T3 no token can be issued while a reference is undecided");
    psql("proof", "insert into public.privacy_erasure_registry_v3 (table_name, column_name, parent, fk_rule_expected, treatment, decided_by, note) values ('new_feature_notes', 'author_id', 'profiles', 'cascade', 'allow_cascade', 'engineering', 'test decision')");
    const t3b = json("proof", `select public.privacy_erasure_plan_v3('${REQ_D}', '{"notice":"sent"}')`);
    ok(t3b.executable === true, "T3 executable once the registry carries the decision");
    psql("proof", "alter table public.new_feature_notes drop constraint new_feature_notes_author_id_fkey, add constraint new_feature_notes_author_id_fkey foreign key (author_id) references public.profiles(id) on delete no action");
    const t3c = json("proof", `select public.privacy_erasure_plan_v3('${REQ_D}', '{"notice":"sent"}')`);
    ok(t3c.executable === false && t3c.refusals.some((r) => /schema drift/.test(r.reason)), "T3 registry says allow_cascade but the live rule changed -> refused (drift)");

    // ── T4 ───────────────────────────────────────────────────────────────
    console.log("\n[T4] receipt without identifiers");
    const receipts = one("proof", "select string_agg(row_to_json(r)::text, E'\\n') from public.privacy_erasure_receipts_v3 r");
    ok(one("proof", "select count(*) from public.privacy_erasure_receipts_v3") === "2", "T4 two receipts (subjects A and C)");
    ok(!containsIdentifier(receipts), "T4 no receipt contains the subject's id, e-mail, name or phone");
    const auths = one("proof", "select string_agg(row_to_json(a)::text, E'\\n') from public.privacy_erasure_authorizations_v3 a");
    ok(!containsIdentifier(auths) && !auths.includes(a1.token), "T4 authorization rows hold neither identifiers nor the raw token");
    ok(psql("proof", "delete from public.privacy_erasure_receipts_v3", { allowFail: true }).status !== 0 && psql("proof", "update public.privacy_erasure_receipts_v3 set actions = '[]'", { allowFail: true }).status !== 0, "T4 receipts are append-only");
    ok(/sever_sentinel/.test(receipts) && /usage_cost_events/.test(receipts) && /legal_basis/.test(receipts), "T4 receipt lists treatments, tables and the legal basis per retained class");

    // ── RB ───────────────────────────────────────────────────────────────
    console.log("\n[RB] rollback");
    const rbDirty = psqlFile("proof", rollback);
    ok(rbDirty.status !== 0 && /rollback refused/.test(rbDirty.err) && one("proof", "select count(*) from public.privacy_erasure_receipts_v3") === "2" && one("proof", "select count(*) from pg_proc where proname = 'erase_user_account_v3'") === "1", "RB with receipts: refused, nothing changed (evidence kept)");
    const rbClean = psqlFile("rb", rollback);
    ok(rbClean.status === 0, `RB on a clean database: applied${rbClean.status === 0 ? "" : " " + rbClean.err}`);
    ok(one("rb", "select count(*) from pg_proc where proname like 'privacy_erasure_%' or proname = 'erase_user_account_v3'") === "0" && one("rb", "select count(*) from pg_class where relname like 'privacy_erasure_%'") === "0" && one("rb", "select count(*) from auth.users") === "0", "RB clean: functions, tables and the sentinel removed");
    ok(one("rb", "select attnotnull from pg_attribute where attrelid = 'public.privacy_consent_events'::regclass and attname = 'user_id'") === "t", "RB clean: consent ledger NOT NULL restored");
    const reapply = psqlFile("rb", migration);
    ok(reapply.status === 0, "RB clean: migration re-applies after rollback (idempotent cycle)");
  } finally {
    run(bin("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"], { allowFail: true, stdio: "ignore" });
    rmSync(tmp, { recursive: true, force: true });
    console.log(`\ncluster removed: ${!existsSync(tmp)}`);
  }
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
