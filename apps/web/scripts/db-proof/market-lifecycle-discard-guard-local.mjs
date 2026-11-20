#!/usr/bin/env node
/**
 * Discarded-draft guards (20261024100000) next to the holder's account-deletion
 * cancel (20261109120000) — local proof on a THROWAWAY PostgreSQL 16 cluster,
 * in BOTH apply orders.
 *
 *   node apps/web/scripts/db-proof/market-lifecycle-discard-guard-local.mjs
 *
 * No dependencies, no Docker, no Supabase, no network: initdb + pg_ctl + psql
 * from a local PostgreSQL 16 install (PG16_BIN, default
 * "C:\Program Files\PostgreSQL\16\bin"), data dir under <repo>/.tmp/pgdiscard-<pid>
 * (short path: psql breaks past MAX_PATH). The cluster is STOPPED at the end.
 *
 * Schema: the privacy-cancel proof's mirror (imported, not copied) + the REAL
 * repo migrations it applies, a marketplace_listings stand-in with the REAL
 * set_marketplace_listing_status_v2 and publish guard extracted from
 * 20261003150300, then:
 *   database order_a: 20261024100000 -> 20261109120000
 *   database order_b: 20261109120000 -> 20261024100000
 *
 * Cases per order: (d) demand discarded draft, (p) privacy cancel, (l) listing
 * discarded draft + outcome; then (f) both orders end in the same schema,
 * (r) each rollback removes only its own objects, (i) re-apply is a no-op.
 *
 * Prints ids of SYNTHETIC fixtures only; no personal data exists here.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CUSTOMER_REQUESTS, EXTRACTS, MIRROR } from "./privacy-cancel-account-deletion-local.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../..");
const mig = (n) => join(repo, "supabase/migrations", n);
const DISCARD = mig("20261024100000_market_lifecycle_listing_outcome_and_discard_guard_v1.sql");
const DISCARD_DOWN = join(repo, "supabase/rollbacks/20261024100000_market_lifecycle_listing_outcome_and_discard_guard_v1.down.sql");
const PRIVACY = mig("20261109120000_privacy_cancel_account_deletion.sql");
const PRIVACY_DOWN = join(repo, "supabase/rollbacks/20261109120000_privacy_cancel_account_deletion.down.sql");
const pgBin = process.env.PG16_BIN || "C:\\Program Files\\PostgreSQL\\16\\bin";
const port = Number(process.env.PG_PROOF_PORT || 5518);
const tmp = join(repo, ".tmp", `pgdiscard-${process.pid}`);
const dataDir = join(tmp, "d");
const logFile = join(tmp, "pg.log");

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
function psql(db, sql, { allowFail = false } = {}) {
  const r = spawnSync(bin("psql"), [...psqlArgs(db), "-c", sql], { encoding: "utf8" });
  if (r.status !== 0 && !allowFail) throw new Error(`psql failed:\n${r.stderr}\n--- sql ---\n${sql.slice(0, 600)}`);
  return { out: (r.stdout || "").trim(), err: (r.stderr || "").trim(), status: r.status };
}
function applyFile(db, file, label) {
  const r = spawnSync(bin("psql"), [...psqlArgs(db), "-f", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${label} failed: ${(r.stderr || "").trim()}`);
  return (r.stderr || "").trim();
}

// role switches as PostgREST does them: SET ROLE + the JWT claims GUC auth.uid() reads
const asUser = (uid, sql) => `set role authenticated; set "request.jwt.claims" to '{"sub":"${uid}","role":"authenticated"}'; ${sql}`;
const refused = (r, re) => r.status !== 0 && re.test(r.err);

// the REAL v2 door and publish guard, on a stand-in table of the production shape
const index = readFileSync(mig("20261003150300_marketplace_index_v1.sql"), "utf8");
const take = (re, what) => {
  const m = index.match(re);
  if (!m) throw new Error(`could not extract ${what} from 20261003150300`);
  return m[0];
};
const LISTINGS = String.raw`
create table public.market_subject_types (subject text primary key, domain text not null, active boolean not null default true);
insert into public.market_subject_types values ('tools', 'equipment', true), ('vehicle', 'equipment', false);
create function public.market_publish_policy_v1(uuid, uuid, text, text, text)
returns table(allowed boolean, reason_key text) language sql stable as $$ select true, null::text $$;
create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id), listing_kind text not null default 'sale',
  category text not null default 'tools', title text not null default 'synthetic',
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'closed')),
  expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.marketplace_listings enable row level security;
create policy marketplace_listings_select on public.marketplace_listings for select
  using ((status = 'active' and (expires_at is null or expires_at > now())) or owner_id = auth.uid() or public.is_admin());
grant select on public.marketplace_listings to authenticated;
${take(/create or replace function public\.set_marketplace_listing_status_v2[\s\S]*?end; \$\$;/, "v2")}
grant execute on function public.set_marketplace_listing_status_v2(uuid, text) to authenticated;
${take(/create or replace function public\.marketplace_listings_publish_guard\(\)[\s\S]*?end; \$\$;/, "publish guard")}
${take(/create trigger marketplace_listings_publish_guard_trg[\s\S]*?;/, "publish guard trigger")}
`;

const H = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const OWNER = H(1);
const ADMIN = H(2);
const OTHER = H(3);
const HOLDER = H(4);

const SURFACE = [
  "customer_requests_status_transition_guard", "customer_requests_discarded_draft_guard", "customer_requests_privacy_row_guard",
  "marketplace_listings_discarded_guard", "marketplace_listings_publish_guard", "set_marketplace_listing_status_v2",
  "set_marketplace_listing_status_v3", "privacy_cancel_account_deletion_v1", "privacy_account_deletion_status_v1",
  "privacy_account_deletion_grace", "privacy_erasure_due_v1", "privacy_erasure_mark_v1", "erase_user_account_v3",
];
/** the schema both migrations touch: function bodies (md5), triggers, the listing column */
const fingerprint = (db) => psql(db, `select jsonb_build_object(
  'fn', (select jsonb_object_agg(p.proname, md5(pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = any (array['${SURFACE.join("','")}'])),
  'trg', (select jsonb_agg(t.tgrelid::regclass::text || '.' || t.tgname || '->' || t.tgfoid::regproc::text order by t.tgrelid::regclass::text, t.tgname)
          from pg_trigger t where not t.tgisinternal and t.tgrelid in ('public.customer_requests'::regclass, 'public.marketplace_listings'::regclass)),
  'col', (select string_agg(column_name, ',') from information_schema.columns where table_schema = 'public' and table_name = 'marketplace_listings' and column_name = 'closed_outcome'),
  'chk', (select string_agg(conname, ',') from pg_constraint where conname = 'marketplace_listings_closed_outcome_check'))::text`).out;
const guardMd5 = (db) => psql(db, "select md5(pg_get_functiondef('public.customer_requests_status_transition_guard()'::regprocedure))").out;
const triggerCount = (db, name) => Number(psql(db, `select count(*) from pg_trigger where tgname = '${name}'`).out);

function createUser(db, id) {
  psql(db, `insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at) values ('${id}', 'u${id.slice(-2)}@example.test', '{"role":"worker"}', now())`);
}
const newDemand = (db, status, outcome = null) => psql(db, `insert into public.customer_requests (profile_id, kind, title, status, closed_outcome)
  values ('${OWNER}', 'company_request', 'synthetic need', '${status}', ${outcome ? `'${outcome}'` : "null"}) returning id`).out;
const demandRow = (db, id) => psql(db, `select status || '/' || coalesce(closed_outcome, '-') from public.customer_requests where id = '${id}'`).out;
const ownerSet = (db, id, set) => psql(db, asUser(OWNER, `update public.customer_requests set ${set} where id = '${id}'`), { allowFail: true });
// fixtures are INSERTed with their outcome (the guards watch UPDATE only)
const newListing = (db, status, outcome = null, category = "tools") =>
  psql(db, `insert into public.marketplace_listings (owner_id, status, category${outcome ? ", closed_outcome" : ""})
    values ('${OWNER}', '${status}', '${category}'${outcome ? `, '${outcome}'` : ""}) returning id`).out;
const listingRow = (db, id) => psql(db, `select status || '/' || coalesce(closed_outcome, '-') from public.marketplace_listings where id = '${id}'`).out;
const v3 = (db, id, status, outcome) =>
  psql(db, asUser(OWNER, `select public.set_marketplace_listing_status_v3('${id}', '${status}'${outcome ? `, '${outcome}'` : ""})`), { allowFail: true });
const v2 = (db, id, status) => psql(db, asUser(OWNER, `select public.set_marketplace_listing_status_v2('${id}', '${status}')`), { allowFail: true });

function buildBase(db) {
  psql("postgres", `create database ${db}`);
  const schemaFile = join(tmp, `${db}.sql`);
  writeFileSync(schemaFile, MIRROR + CUSTOMER_REQUESTS + EXTRACTS + LISTINGS);
  applyFile(db, schemaFile, `${db} mirror schema`);
  applyFile(db, mig("20260705150000_customer_requests_status_transition_guard.sql"), "20260705150000");
  applyFile(db, mig("20260706150000_privacy_request_intake.sql"), "20260706150000");
  psql(db, "alter function public.customer_requests_status_transition_guard() set search_path = public"); // 20260727120000 L-08
  applyFile(db, mig("20261024090000_market_lifecycle_closed_outcome_v1.sql"), "20261024090000");
  applyFile(db, mig("20261019140000_privacy_erasure_executor_v3.sql"), "20261019140000");
  applyFile(db, mig("20261019150000_privacy_erasure_registry_not_null_authors_v1.sql"), "20261019150000");
  applyFile(db, mig("20261019190000_erasure_sentinel_finite_ban_v1.sql"), "20261019190000");
  for (const u of [OWNER, ADMIN, OTHER, HOLDER]) createUser(db, u);
  psql(db, `update public.profiles set active_role = 'admin' where id = '${ADMIN}'`);
}

/** (d) demand: a discarded draft never re-enters the market; every other transition is unchanged */
function demandCases(db, tag) {
  console.log(`\n[${tag} d] demand`);
  const draft = newDemand(db, "draft");
  ok(ownerSet(db, draft, "status = 'closed', closed_outcome = 'discarded'").status === 0 && demandRow(db, draft) === "closed/discarded",
    `${tag} d1 the owner discards a draft (draft -> closed, outcome discarded), as lib/demand does`);
  ok(refused(ownerSet(db, draft, "status = 'submitted'"), /a discarded draft cannot be reopened/), `${tag} d2 owner reopen of the discarded draft -> refused`);
  ok(refused(ownerSet(db, draft, "closed_outcome = null"), /a discarded draft cannot be reopened/), `${tag} d3 owner clearing the outcome first -> refused`);
  ok(refused(ownerSet(db, draft, "closed_outcome = 'withdrawn'"), /a discarded draft cannot be reopened/), `${tag} d4 owner rewriting the outcome -> refused`);
  ok(refused(ownerSet(db, draft, "status = 'submitted', closed_outcome = null"), /a discarded draft cannot be reopened/), `${tag} d5 both in one statement -> refused`);
  ok(demandRow(db, draft) === "closed/discarded", `${tag} d6 the discarded row is unchanged after every attempt`);
  ok(ownerSet(db, draft, "title = 'renamed synthetic'").status === 0, `${tag} d7 other columns of a discarded row stay editable (guard fires on status / outcome only)`);
  const legacy = newDemand(db, "closed");
  ok(ownerSet(db, legacy, "status = 'submitted'").status === 0, `${tag} d8 a legacy closed row (outcome NULL) still reopens (nothing inferred about history)`);
  const withdrawn = newDemand(db, "closed", "withdrawn");
  ok(ownerSet(db, withdrawn, "status = 'submitted'").status === 0 && demandRow(db, withdrawn) === "submitted/-",
    `${tag} d9 a withdrawn need still reopens, and its outcome is cleared`);
  const live = newDemand(db, "draft");
  ok(ownerSet(db, live, "status = 'submitted'").status === 0 && ownerSet(db, live, "status = 'closed', closed_outcome = 'completed'").status === 0,
    `${tag} d10 draft -> submitted -> closed (completed) still works`);
  ok(refused(ownerSet(db, live, "status = 'approved'"), /invalid demand status transition/), `${tag} d11 the transition guard still refuses closed -> approved`);
  ok(psql(db, asUser(OTHER, `with u as (update public.customer_requests set status = 'submitted' where id = '${draft}' returning 1) select count(*) from u`)).out === "0",
    `${tag} d12 another user's update reaches 0 rows (RLS)`);
  const forAdmin = newDemand(db, "closed", "discarded");
  ok(psql(db, asUser(ADMIN, `update public.customer_requests set status = 'submitted' where id = '${forAdmin}'`), { allowFail: true }).status === 0
    && demandRow(db, forAdmin) === "submitted/-", `${tag} d13 admin passes, as with the transition guard, and no stale outcome is left`);
  const forSystem = newDemand(db, "closed", "discarded");
  ok(psql(db, `update public.customer_requests set status = 'submitted' where id = '${forSystem}'`, { allowFail: true }).status === 0,
    `${tag} d14 a call without a signed-in user (runner / service role) passes, as with the transition guard`);
  const unlabelled = newDemand(db, "draft");
  ok(ownerSet(db, unlabelled, "status = 'closed'").status === 0 && demandRow(db, unlabelled) === "closed/discarded",
    `${tag} d15 a draft closed WITHOUT an outcome (raw PATCH, no-column fallback) is recorded as discarded`);
  ok(refused(ownerSet(db, unlabelled, "status = 'submitted'"), /a discarded draft cannot be reopened/), `${tag} d16 ... and cannot be reopened`);
  const misnamed = newDemand(db, "draft");
  ok(ownerSet(db, misnamed, "status = 'closed', closed_outcome = 'completed'").status === 0 && demandRow(db, misnamed) === "closed/discarded",
    `${tag} d17 a draft closed as 'completed' is still recorded as discarded (a draft was never in the market)`);
  const open = newDemand(db, "submitted");
  ok(refused(ownerSet(db, open, "closed_outcome = 'discarded'"), /only a draft can be discarded/)
    && refused(ownerSet(db, open, "status = 'closed', closed_outcome = 'discarded'"), /only a draft can be discarded/),
    `${tag} d18 a submitted need cannot be labelled discarded (it would lock the owner's own row)`);
  const done = newDemand(db, "closed", "completed");
  ok(refused(ownerSet(db, done, "closed_outcome = 'discarded'"), /only a draft can be discarded/) && demandRow(db, done) === "closed/completed",
    `${tag} d19 a completed need cannot be relabelled discarded`);
  const stale = newDemand(db, "submitted", "discarded"); // a reopen before this migration left the label
  ok(ownerSet(db, stale, "status = 'closed'").status === 0 && demandRow(db, stale) === "closed/-"
    && ownerSet(db, stale, "closed_outcome = 'completed'").status === 0 && demandRow(db, stale) === "closed/completed",
    `${tag} d20 closing an open need with a stale 'discarded' does not lock it; the app's outcome write then lands`);
}

/** (p) privacy: the holder cancels their own account deletion exactly as 20261109120000 intends */
function privacyCases(db, tag) {
  console.log(`\n[${tag} p] privacy cancel`);
  const req = psql(db, asUser(HOLDER, "select public.submit_privacy_request_v1('account_deletion')")).out;
  const conf = JSON.parse(psql(db, asUser(HOLDER, "select public.privacy_confirm_account_deletion_v1()")).out);
  ok(/^[0-9a-f-]{36}$/.test(req) && conf?.ok === true, `${tag} p1 the holder submits and confirms an account-deletion request`);
  const c1 = JSON.parse(psql(db, asUser(HOLDER, "select public.privacy_cancel_account_deletion_v1()")).out);
  ok(c1?.status === "ok" && c1.request_id === req, `${tag} p2 cancel -> {status:ok}`);
  ok(demandRow(db, req) === "closed/withdrawn", `${tag} p3 the request is closed as withdrawn`);
  const log = () => psql(db, `select jsonb_array_length(payload->'privacy_review_log') from public.customer_requests where id = '${req}'`).out;
  const logAfter = log();
  const c2 = JSON.parse(psql(db, asUser(HOLDER, "select public.privacy_cancel_account_deletion_v1()")).out);
  ok(c2?.status === "ok_already" && log() === logAfter, `${tag} p4 a second cancel -> ok_already and writes nothing (no duplicate log entry)`);
  const req2 = psql(db, asUser(HOLDER, "select public.submit_privacy_request_v1('account_deletion')")).out;
  ok(refused(psql(db, asUser(HOLDER, `update public.customer_requests set status = 'closed', closed_outcome = 'withdrawn' where id = '${req2}'`), { allowFail: true }), /privacy_request_rpc_only/),
    `${tag} p5 a raw owner PATCH of a privacy row is still refused`);
  ok(JSON.parse(psql(db, asUser(HOLDER, "select public.privacy_cancel_account_deletion_v1()")).out)?.status === "ok", `${tag} p6 the RPC withdraws the new request`);
}

/** (l) listings: the outcome is recorded and a discarded draft stays off the market on every door */
function listingCases(db, tag) {
  console.log(`\n[${tag} l] listings`);
  const d = newListing(db, "draft");
  ok(v3(db, d, "closed", "discarded").status === 0 && listingRow(db, d) === "closed/discarded", `${tag} l1 v3 discards a draft (closed, outcome discarded)`);
  for (const [label, r] of [
    ["v3 active", () => v3(db, d, "active")], ["v2 active", () => v2(db, d, "active")],
    ["v3 draft", () => v3(db, d, "draft")], ["v3 paused", () => v3(db, d, "paused")],
    ["v2 draft", () => v2(db, d, "draft")],
  ]) ok(refused(r(), /a discarded draft cannot be published/), `${tag} l2 ${label} on a discarded draft -> refused`);
  ok(v3(db, d, "closed").status === 0 && listingRow(db, d) === "closed/discarded", `${tag} l3 closing again without an outcome keeps 'discarded'`);
  ok(v3(db, d, "closed", "completed").status === 0 && listingRow(db, d) === "closed/discarded",
    `${tag} l3b closing again as 'completed' keeps 'discarded' (v3 never relabels a discarded draft)`);
  ok(refused(psql(db, asUser(OWNER, `update public.marketplace_listings set status = 'active' where id = '${d}'`), { allowFail: true }), /permission denied/),
    `${tag} l4 the raw table stays read-only for authenticated`);
  const a = newListing(db, "active");
  ok(v3(db, a, "closed", "withdrawn").status === 0 && listingRow(db, a) === "closed/withdrawn", `${tag} l5 an active listing closes as withdrawn`);
  ok(v3(db, a, "active").status === 0 && listingRow(db, a) === "active/-", `${tag} l6 a withdrawn listing republishes and its outcome is cleared`);
  ok(v3(db, a, "closed", "completed").status === 0 && v2(db, a, "active").status === 0 && listingRow(db, a) === "active/-",
    `${tag} l7 a completed listing republished through v2 directly also loses the stale outcome`);
  const legacy = newListing(db, "closed");
  ok(v3(db, legacy, "active").status === 0, `${tag} l8 a legacy closed listing (outcome NULL) republishes`);
  const inactive = newListing(db, "draft", null, "vehicle");
  ok(refused(v3(db, inactive, "active"), /invalid category/), `${tag} l9 the publish policy still applies (inactive category refused)`);
  ok(refused(v3(db, a, "paused", "completed"), /closed outcome only for closed/), `${tag} l10 an outcome is accepted only with closed`);
  const forSystem = newListing(db, "closed", "discarded");
  ok(psql(db, `update public.marketplace_listings set status = 'draft' where id = '${forSystem}'`, { allowFail: true }).status === 0
    && listingRow(db, forSystem) === "draft/-", `${tag} l11 a call without a signed-in user passes and the outcome is cleared`);
  const viaV2 = newListing(db, "draft");
  ok(v2(db, viaV2, "closed").status === 0 && listingRow(db, viaV2) === "closed/discarded",
    `${tag} l12 a draft closed through v2 directly (no outcome) is recorded as discarded`);
  ok(refused(v2(db, viaV2, "active"), /a discarded draft cannot be published/), `${tag} l13 ... and cannot be published`);
  const live = newListing(db, "active");
  ok(refused(v3(db, live, "closed", "discarded"), /only a draft can be discarded/) && listingRow(db, live) === "active/-",
    `${tag} l14 an active listing cannot be closed as discarded (the whole call rolls back)`);
  const leftover = newListing(db, "active", "discarded"); // only possible after a rollback + re-apply
  ok(v3(db, leftover, "paused").status === 0 && listingRow(db, leftover) === "paused/-",
    `${tag} l15 an open listing carrying a stale 'discarded' is not locked: it pauses and the outcome is cleared`);
  const staleClose = newListing(db, "active", "discarded");
  ok(v2(db, staleClose, "closed").status === 0 && listingRow(db, staleClose) === "closed/-" && v3(db, staleClose, "active").status === 0,
    `${tag} l16 closing an open listing with a stale 'discarded' does not lock it (closed, no outcome, republishes)`);
  const named = newListing(db, "draft");
  ok(v3(db, named, "closed", "withdrawn").status === 0 && listingRow(db, named) === "closed/discarded",
    `${tag} l17 a draft closed through v3 as 'withdrawn' is recorded discarded, without an error (as for demand)`);
}

async function main() {
  mkdirSync(tmp, { recursive: true });
  console.log(`market-lifecycle-discard-guard-local — ${new Date().toISOString()}
cluster: <repo>/.tmp/pgdiscard-${process.pid} (port ${port}, throwaway, synthetic ids only)`);
  run(bin("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C", "--no-sync"]);
  run(bin("pg_ctl"), ["-D", dataDir, "-l", logFile, "-w", "-o", `-p ${port} -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off`, "start"], { stdio: "ignore" });
  try {
    console.log(`server: ${psql("postgres", "select version()").out.split(",")[0]}`);
    psql("postgres", "create role anon nologin; create role authenticated nologin; create role service_role nologin; grant anon, authenticated, service_role to postgres");

    buildBase("order_a");
    buildBase("order_b");
    const guardBase = guardMd5("order_a");
    ok(guardBase === guardMd5("order_b"), "base: both databases start from the same transition guard");

    console.log("\n[order A] 20261024100000, then 20261109120000");
    applyFile("order_a", DISCARD, "A 20261024100000");
    ok(guardMd5("order_a") === guardBase, "A1 20261024100000 leaves customer_requests_status_transition_guard untouched");
    applyFile("order_a", PRIVACY, "A 20261109120000");

    console.log("\n[order B] 20261109120000, then 20261024100000");
    applyFile("order_b", PRIVACY, "B 20261109120000");
    const guardPrivacy = guardMd5("order_b");
    ok(guardPrivacy !== guardBase, "B1 20261109120000 replaces the transition guard (its withdraw branch)");
    applyFile("order_b", DISCARD, "B 20261024100000");
    ok(guardMd5("order_b") === guardPrivacy, "B2 20261024100000 applied afterwards keeps 20261109120000's guard byte-identical");

    console.log("\n[f] same schema in both orders");
    const fpA = fingerprint("order_a");
    ok(fpA === fingerprint("order_b"), "f1 functions (md5), triggers and the listing column are identical in both orders");
    ok(guardMd5("order_a") === guardPrivacy, "f2 in both orders the transition guard is 20261109120000's");
    ok(triggerCount("order_a", "customer_requests_discarded_draft_guard_trg") === 1 && triggerCount("order_a", "marketplace_listings_discarded_guard_trg") === 1
      && triggerCount("order_a", "customer_requests_privacy_row_guard") === 1, "f3 each guard trigger exists exactly once");

    for (const [db, tag] of [["order_a", "A"], ["order_b", "B"]]) {
      demandCases(db, tag);
      privacyCases(db, tag);
      listingCases(db, tag);
    }

    console.log("\n[i] re-apply is a no-op");
    const fpBefore = fingerprint("order_a");
    applyFile("order_a", DISCARD, "re-apply 20261024100000");
    ok(fingerprint("order_a") === fpBefore && triggerCount("order_a", "customer_requests_discarded_draft_guard_trg") === 1,
      "i1 20261024100000 runs a second time without error and changes nothing (no duplicate trigger)");

    console.log("\n[r] each rollback removes only its own objects (database order_a)");
    applyFile("order_a", DISCARD_DOWN, "rollback 20261024100000");
    ok(guardMd5("order_a") === guardPrivacy, "r1 rolling back 20261024100000 keeps 20261109120000's guard");
    ok(triggerCount("order_a", "customer_requests_discarded_draft_guard_trg") === 0 && triggerCount("order_a", "marketplace_listings_discarded_guard_trg") === 0
      && psql("order_a", "select count(*) from pg_proc where proname in ('set_marketplace_listing_status_v3', 'customer_requests_discarded_draft_guard', 'marketplace_listings_discarded_guard')").out === "0",
      "r2 its triggers, trigger functions and v3 are gone");
    ok(psql("order_a", "select count(*) from information_schema.columns where table_name = 'marketplace_listings' and column_name = 'closed_outcome'").out === "1",
      "r3 the listing outcome column stays because outcomes are recorded (the rollback says so)");
    privacyCases("order_a", "r");
    const reopen = newDemand("order_a", "closed", "discarded");
    ok(ownerSet("order_a", reopen, "status = 'submitted'").status === 0, "r4 without the guard a discarded draft reopens again (pre-migration behaviour)");
    applyFile("order_a", DISCARD, "re-apply after rollback");
    ok(fingerprint("order_a") === fpBefore, "r5 20261024100000 re-applies to the same schema");

    applyFile("order_a", PRIVACY_DOWN, "rollback 20261109120000");
    ok(guardMd5("order_a") === guardBase, "r6 rolling back 20261109120000 restores the 20260705150000 guard");
    demandCases("order_a", "r");
    applyFile("order_a", PRIVACY, "re-apply 20261109120000");
    ok(fingerprint("order_a") === fpBefore, "r7 20261109120000 re-applies and both orders still end in the same schema");

    const deadlocks = readFileSync(logFile, "utf8").split(/\r?\n/).filter((l) => /deadlock/i.test(l));
    ok(deadlocks.length === 0, "no deadlock reported by the server");
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
