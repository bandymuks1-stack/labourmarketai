#!/usr/bin/env node
/**
 * README — web-push-subscriptions-local.mjs
 * =========================================
 *
 * Behavioural proof for the RED migration (COM-3 push channel)
 *   supabase/migrations/20261023170000_web_push_subscriptions_v1.sql
 *   supabase/rollbacks/20261023170000_web_push_subscriptions_v1.down.sql
 * on a THROWAWAY local PostgreSQL 16 cluster (same setup as
 * work-plan-shift-patterns-local.mjs: port 54399, trust auth). Never touches a
 * remote database. Applies 20260823160000_notification_preferences_v1.sql
 * VERBATIM first, with a stub erasure registry table, then this migration
 * VERBATIM, and checks:
 *   T1 the push opt-in row is accepted; an unknown channel still is not
 *   T2 register stores the caller's subscription; direct inserts are revoked
 *   T3 a second account subscribing the same browser endpoint takes it over
 *   T4 own rows only: another account reads 0 and deletes 0; anon reads nothing
 *   T5 table CHECKs refuse a non-https endpoint and a malformed key
 *   T6 service_role can read and delete (delivery + gone endpoints)
 *   T7 the erasure registry row exists (allow_cascade)
 *   T8 rollback refuses while rows exist; once empty it restores the CHECK
 *      and removes the table/command/registry row; the migration re-applies
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..", "..", "..");
const PREFS = join(ROOT, "supabase/migrations/20260823160000_notification_preferences_v1.sql");
const UP = join(ROOT, "supabase/migrations/20261023170000_web_push_subscriptions_v1.sql");
const DOWN = join(ROOT, "supabase/rollbacks/20261023170000_web_push_subscriptions_v1.down.sql");
const LAST_RUN = join(__dirname, "web-push-subscriptions-local.last-run.txt");
const host = process.env.LM_PROOF_PGHOST ?? "127.0.0.1";
const port = Number(process.env.LM_PROOF_PGPORT ?? 54399);
const dbname = process.env.LM_PROOF_DBNAME ?? "lm_web_push_proof";
if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
  console.error("refusing a non-loopback host");
  process.exit(2);
}

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const EP = "https://fcm.googleapis.com/fcm/send/proof-endpoint-1";
const P256 = "B" + "A".repeat(86);
const AUTH = "A".repeat(22);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

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
insert into public.profiles values ('${A}'), ('${B}');
create table public.privacy_erasure_registry_v3 (
  schema_name text, table_name text, column_name text, parent text, fk_rule_expected text,
  treatment text, decided_by text, legal_review boolean, legal_basis text, note text,
  primary key (schema_name, table_name, column_name)
);
`;

async function as(c, role, sub, sql, params = []) {
  await c.query("begin");
  try {
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub })]);
    const r = await c.query(sql, params);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}
async function refuses(label, fn, rx) {
  try {
    await fn();
    check(label, false, "accepted");
  } catch (e) {
    check(label, rx.test(e.message), e.message);
  }
}

const admin = new Client({ host, port, user: "postgres", database: "postgres" });
await admin.connect();
await admin.query(`drop database if exists ${dbname}`);
await admin.query(`create database ${dbname}`);
const c = new Client({ host, port, user: "postgres", database: dbname });
await c.connect();
try {
  await c.query(SETUP);
  await c.query(readFileSync(PREFS, "utf8"));
  await c.query(readFileSync(UP, "utf8"));
  check("migration applies on the applied notification_preferences shape", true);

  await as(c, "authenticated", A, "insert into public.notification_preferences (profile_id, notification_type, channel, enabled) values ($1, '*', 'push', true)", [A]);
  check("T1a push opt-in row accepted", true);
  await refuses("T1b unknown channel still refused", () =>
    as(c, "authenticated", A, "insert into public.notification_preferences (profile_id, notification_type, channel, enabled) values ($1, 'x', 'sms', true)", [A]), /notification_preferences_channel_check/);

  await as(c, "authenticated", A, "select public.register_web_push_subscription_v1($1, $2, $3)", [EP, P256, AUTH]);
  const ownA = await as(c, "authenticated", A, "select count(*)::int n from public.web_push_subscriptions");
  check("T2a register stores the caller's subscription", ownA.rows[0].n === 1);
  await refuses("T2b direct insert revoked", () =>
    as(c, "authenticated", A, "insert into public.web_push_subscriptions (profile_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/x2xxxxxxxxxxxx', $2, $3)", [A, P256, AUTH]), /permission denied/);

  await as(c, "authenticated", B, "select public.register_web_push_subscription_v1($1, $2, $3)", [EP, P256, AUTH]);
  const afterA = await as(c, "authenticated", A, "select count(*)::int n from public.web_push_subscriptions");
  const afterB = await as(c, "authenticated", B, "select count(*)::int n from public.web_push_subscriptions");
  check("T3 the browser endpoint moves to whoever subscribed last", afterA.rows[0].n === 0 && afterB.rows[0].n === 1);

  const del = await as(c, "authenticated", A, "delete from public.web_push_subscriptions where endpoint = $1", [EP]);
  check("T4a another account deletes 0 rows", del.rowCount === 0);
  await refuses("T4b anon reads nothing", () => as(c, "anon", null, "select count(*) from public.web_push_subscriptions"), /permission denied/);

  await refuses("T5a non-https endpoint refused", () =>
    as(c, "authenticated", A, "select public.register_web_push_subscription_v1('http://fcm.googleapis.com/fcm/send/x', $1, $2)", [P256, AUTH]), /check constraint/);
  await refuses("T5b malformed key refused", () =>
    as(c, "authenticated", A, "select public.register_web_push_subscription_v1('https://fcm.googleapis.com/fcm/send/y', 'short', $1)", [AUTH]), /check constraint/);

  const sr = await as(c, "service_role", null, "select count(*)::int n from public.web_push_subscriptions");
  check("T6a service_role reads subscriptions", sr.rows[0].n === 1);

  const reg = await c.query("select treatment from public.privacy_erasure_registry_v3 where table_name = 'web_push_subscriptions'");
  check("T7 erasure registry row present (allow_cascade)", reg.rows[0]?.treatment === "allow_cascade");

  await refuses("T8a rollback refuses while rows exist", () => c.query(readFileSync(DOWN, "utf8")), /rollback refused/);
  const srDel = await as(c, "service_role", null, "delete from public.web_push_subscriptions");
  check("T6b service_role deletes a gone subscription", srDel.rowCount === 1);
  await c.query("delete from public.notification_preferences where channel = 'push'"); // throwaway DB only
  await c.query(readFileSync(DOWN, "utf8"));
  const gone = await c.query("select to_regclass('public.web_push_subscriptions') t, (select count(*)::int from public.privacy_erasure_registry_v3 where table_name = 'web_push_subscriptions') r");
  check("T8b rollback removes the table and registry row", gone.rows[0].t === null && gone.rows[0].r === 0);
  await refuses("T8c rollback restores the two-channel CHECK", () =>
    c.query("insert into public.notification_preferences values ($1, '*', 'push', true, now())", [A]), /notification_preferences_channel_check/);
  await c.query(readFileSync(UP, "utf8"));
  check("T8d migration re-applies after rollback", true);
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
    `web-push-subscriptions-local — ${new Date().toISOString()}`,
    "PostgreSQL 16, local throwaway cluster (synthetic ids only)",
    ...results.map((r) => `${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.ok ? `  — ${r.detail}` : ""}`),
    `${results.length - failed}/${results.length} passed`,
    "",
  ].join("\n"),
);
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed > 0 ? 1 : 0);
