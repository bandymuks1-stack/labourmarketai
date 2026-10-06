/**
 * WORKER ACTIVATION - REAL-DATABASE read-back proof.
 *
 * Claim under proof: a worker who arrives from the Nonstop campaign link and
 * registers is NOT in the supply feed. They enter `first_party_supply_feed_v1()`
 * (the canonical reader) with matchAuthority GRANTED ONLY after they themselves
 * (1) grant the partner-supply representation consent AND (2) save a live supply
 * declaration - and leave it again the moment either is withdrawn. Nothing is
 * prefilled from preferred_countries, and recording the referral registration
 * accepts nothing and grants nothing.
 *
 * The rows the SQL function returns are passed through the REAL emitter
 * validator (apps/web/lib/supply-bridge/first-party-supply-emitter.ts
 * validateEmittedRow), exactly as the production emitter does.
 *
 * SAFETY. LOCAL database only (loopback host, hard-refused otherwise). One
 * transaction, ROLLED BACK at the end - no residue. The new migration
 * (20261006100000) is applied INSIDE that transaction, so the local database is
 * never changed and nothing is applied anywhere.
 *
 * Usage (from the repo root):
 *   node node_modules/tsx/dist/cli.mjs --conditions=react-server \
 *     --tsconfig apps/web/tsconfig.json scripts/db-proof-worker-activation-feed.mts
 * Env: DB_URL (default local supabase postgresql://postgres:postgres@127.0.0.1:54322/postgres)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import {
  PARTNER_SUPPLY_REPRESENTATION_V1,
  PROFILE_DISCOVERABILITY_V1,
  consentTextHash,
} from "../apps/web/lib/privacy/consent-definitions.ts";
import { validateEmittedRow } from "../apps/web/lib/supply-bridge/first-party-supply-emitter.ts";

const DB_URL =
  process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
{
  const host = new URL(DB_URL.replace(/^postgres(ql)?:/, "http:")).hostname;
  if (!new Set(["127.0.0.1", "localhost", "::1", "[::1]"]).has(host)) {
    console.error(`refusing to run: DB_URL host "${host}" is not local.`);
    process.exit(1);
  }
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = readFileSync(
  join(ROOT, "supabase/migrations/20261006100000_external_referral_signup_observation_v1.sql"),
  "utf8",
)
  // Stay inside the outer transaction (so the final ROLLBACK removes it).
  .replace(/^begin;\s*$/gim, "")
  .replace(/^commit;\s*$/gim, "");

const REFERENCE = "0123456789ab"; // the 12 hex carried by utm_content=ns-inbound-<12 hex>
const results: { name: string; pass: boolean; detail: string }[] = [];
function record(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name} - ${detail}`);
}

const c = new Client({ connectionString: DB_URL });

async function asUser<T>(profileId: string, fn: () => Promise<T>): Promise<T> {
  await c.query("set local role authenticated");
  await c.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: profileId, role: "authenticated" }),
  ]);
  try {
    return await fn();
  } finally {
    await c.query("reset role");
  }
}

async function asService<T>(fn: () => Promise<T>): Promise<T> {
  await c.query("set local role service_role");
  try {
    return await fn();
  } finally {
    await c.query("reset role");
  }
}

async function feedRows(): Promise<unknown[]> {
  return asService(async () => {
    const { rows } = await c.query("select * from public.first_party_supply_feed_v1() as r");
    return rows.map((r) => (r as { r: unknown }).r);
  });
}

function rowFor(rows: unknown[], needle: string): unknown | undefined {
  return rows.find((r) => JSON.stringify(r).includes(needle));
}

async function main(): Promise<void> {
  await c.connect();
  console.log(`- worker activation DB proof (${DB_URL.replace(/:[^:@/]+@/, ":[redacted]@")}) -`);
  await c.query("begin");
  let residue = -1;
  try {
    await c.query(MIGRATION);
    const baseline = (await feedRows()).length; // other local fixtures may exist

    // ── the signup the form performs: auth user + utm_* in raw_user_meta_data ──
    const meta = {
      locale: "lt",
      utm_source: "nonstop",
      utm_medium: "email",
      utm_campaign: "worker-inbound-2026-09",
      utm_content: `ns-inbound-${REFERENCE}`,
    };
    const { rows: u } = await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', 'activation-proof-a@fixture.local', 'x', now(),
         '{"provider":"email"}', $1::jsonb, now(), now()) returning id`,
      [JSON.stringify(meta)],
    );
    const worker = u[0].id as string;
    const { rows: u2 } = await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
         'authenticated', 'activation-proof-b@fixture.local', 'x', now(),
         '{"provider":"email"}', '{}'::jsonb, now(), now()) returning id`,
    );
    const consentOnly = u2[0].id as string;

    // What onboarding creates: profile + worker + a declared profession.
    const { rows: prof } = await c.query(
      "select id, slug from public.professions where is_active order by slug limit 1",
    );
    for (const [id, name] of [[worker, "A"], [consentOnly, "B"]] as const) {
      await c.query(
        `insert into public.profiles (id, active_role, full_name) values ($1, 'worker', $2)
         on conflict (id) do update set active_role = 'worker'`,
        [id, `Activation Proof ${name}`],
      );
      await c.query(
        `insert into public.workers (profile_id) values ($1)
         on conflict (profile_id) do nothing`,
        [id],
      );
    }
    const { rows: w } = await c.query("select id from public.workers where profile_id = $1", [worker]);
    await c.query(
      "insert into public.worker_professions (worker_id, profession_id) values ($1, $2) on conflict do nothing",
      [w[0].id, prof[0].id],
    );
    // A preference the worker once set - it must NEVER become a legal work country.
    await c.query("update public.workers set preferred_countries = array['SE','FI'] where profile_id = $1", [worker]);

    // The referral row the Nonstop door would have created for this reference.
    const door = await asService(async () =>
      c.query(
        `select public.receive_external_referral_v1($1,$2,$3,null,null,'lt','{}'::jsonb,
           jsonb_build_object('given', true, 'text', 'proof', 'version', 'worker-broader-search-v1'),
           'worker-broader-search-v1', 30) as r`,
        ["nonstop", REFERENCE, "0".repeat(64)],
      ),
    );
    record("fixture referral row created by the real door RPC", door.rows[0].r.outcome === "created", JSON.stringify(door.rows[0].r.outcome));

    // ── STEP 0: registration alone ─────────────────────────────────────────
    let rows = await feedRows();
    record("registration alone: worker NOT in the feed", rows.length === baseline, `feed rows=${rows.length} (baseline ${baseline})`);
    const mine0 = await asUser(worker, async () => (await c.query("select public.my_first_party_supply_declaration() as d")).rows[0].d);
    record("registration alone: no declaration exists, nothing prefilled from preferred_countries", !mine0 || !mine0.intentState, JSON.stringify(mine0));
    const cons0 = await asUser(worker, async () => (await c.query("select public.current_partner_supply_representation_consent() as d")).rows[0].d);
    record("registration alone: partner-supply consent is not_set", cons0?.status === "not_set", JSON.stringify(cons0));

    // ── the referral observation ("external_reference X registered") ───────
    const rec1 = await asUser(worker, async () => (await c.query("select public.record_external_referral_signup_v1('nonstop',$1) as r", [REFERENCE])).rows[0].r);
    const rec2 = await asUser(worker, async () => (await c.query("select public.record_external_referral_signup_v1('nonstop',$1) as r", [REFERENCE])).rows[0].r);
    record("observation recorded once, then idempotent", rec1.outcome === "recorded" && rec2.outcome === "already_recorded", `${rec1.outcome} / ${rec2.outcome}`);
    record("observation reply reveals no invitation existence", !JSON.stringify(rec1).match(/invitation|matched/), JSON.stringify(rec1));
    const seen = await asService(async () => (await c.query("select * from public.external_referral_observed_signups_v1('nonstop', array[$1])", [REFERENCE])).rows);
    record("authorised reader sees reference X registered (1 account), no account id", seen.length === 1 && seen[0].accounts === 1 && !("actor_id" in seen[0]) && !("profile_id" in seen[0]), JSON.stringify(seen));
    let deniedForUser = false;
    let deniedDetail = "NOT DENIED - the call succeeded";
    await c.query("savepoint s");
    try {
      await c.query("set local role authenticated");
      await c.query("select * from public.external_referral_observed_signups_v1('nonstop', null)");
    } catch (e) {
      deniedForUser = /permission denied/i.test(String((e as Error).message));
      deniedDetail = String((e as Error).message);
    }
    await c.query("rollback to savepoint s");
    record("the reader is NOT executable by an authenticated account", deniedForUser, deniedDetail);
    const inv = (await c.query("select id, status, use_count from public.invitations where external_source_slug='nonstop' and external_reference=$1", [REFERENCE])).rows[0];
    const accs = (await c.query("select count(*)::int n from public.invitation_acceptances where invitation_id=$1", [inv.id])).rows[0].n;
    const audit = (await c.query("select entity_id from public.audit_logs where action='external_referral_signup_observed' and actor_id=$1", [worker])).rows;
    record("observation accepts NOTHING: invitation still pending, use_count 0, no acceptance row", inv.status === "pending" && inv.use_count === 0 && accs === 0, JSON.stringify({ ...inv, accs }));
    record("observation is linked to the referral invitation row (entity_id)", audit.length === 1 && audit[0].entity_id === inv.id, `rows=${audit.length}`);
    const consentEvents = (await c.query("select count(*)::int n from public.privacy_consent_events where user_id=$1", [worker])).rows[0].n;
    record("observation granted NO consent of any kind", consentEvents === 0, `privacy_consent_events=${consentEvents}`);

    // ── STEP 1: declaration WITHOUT consent ────────────────────────────────
    const decl = await asUser(worker, async () =>
      (await c.query(
        `select public.upsert_my_first_party_supply_declaration(
           'AVAILABLE_NOW', null, array['NO'], array['NO'], '{}'::text[], false, false, false, 60) as r`,
      )).rows[0].r,
    );
    record("worker saves the declaration themselves", decl.ok === true, JSON.stringify(decl));
    rows = await feedRows();
    const myDecl = (await c.query("select id from public.first_party_supply_declarations where profile_id=$1", [worker])).rows[0].id as string;
    record("declaration WITHOUT consent: still NOT in the feed", rows.length === baseline && !rowFor(rows, `lm-sig-${myDecl}`), `feed rows=${rows.length} (baseline ${baseline})`);

    // ── STEP 2: consent WITHOUT declaration (other fixture) ────────────────
    const grantB = await asUser(consentOnly, async () =>
      (await c.query(
        "select public.grant_partner_supply_representation_consent($1,$2,'lt','dashboard_privacy_screen') as r",
        [PARTNER_SUPPLY_REPRESENTATION_V1.version, consentTextHash(PARTNER_SUPPLY_REPRESENTATION_V1)],
      )).rows[0].r,
    );
    rows = await feedRows();
    record("consent WITHOUT declaration: NOT in the feed", grantB.ok === true && rows.length === baseline, `grant=${grantB.ok} feed rows=${rows.length} (baseline ${baseline})`);

    // ── STEP 3: the worker grants both consents themselves ─────────────────
    const grantDisc = await asUser(worker, async () =>
      (await c.query(
        "select public.grant_profile_discoverability_consent($1,$2,'lt','dashboard_privacy_screen') as r",
        [PROFILE_DISCOVERABILITY_V1.version, consentTextHash(PROFILE_DISCOVERABILITY_V1)],
      )).rows[0].r,
    );
    record("worker grants employer-visibility consent (separate act)", grantDisc.ok === true, JSON.stringify(grantDisc));
    rows = await feedRows();
    record("visibility consent alone does not put the worker in the partner feed", rows.length === baseline, `feed rows=${rows.length} (baseline ${baseline})`);

    const grantA = await asUser(worker, async () =>
      (await c.query(
        "select public.grant_partner_supply_representation_consent($1,$2,'lt','dashboard_privacy_screen') as r",
        [PARTNER_SUPPLY_REPRESENTATION_V1.version, consentTextHash(PARTNER_SUPPLY_REPRESENTATION_V1)],
      )).rows[0].r,
    );
    record("worker grants partner-supply representation consent (separate act)", grantA.ok === true, JSON.stringify(grantA));
    rows = await feedRows();
    const emitted = rows
      .map((r) => validateEmittedRow(r))
      .filter((r) => r.ok) as Array<{ ok: true; signal: Record<string, unknown> & { geography: string[]; trades: string[]; authorities: Record<string, string> } }>;
    const emittedMine = emitted.find((e) => e.signal.signalId === `lm-sig-${myDecl}`);
    record("consent + declaration: worker IS in the feed and passes the real validator", Boolean(emittedMine) && rows.length === baseline + 1, `emitted=${emitted.length} feed rows=${rows.length} (baseline ${baseline})`);
    if (emittedMine) {
      const s = emittedMine.signal;
      record("matchAuthority GRANTED; contact/publication/identity stay DENIED (never defaulted)", s.authorities.matchAuthority === "GRANTED" && s.authorities.contactAuthority === "DENIED" && s.authorities.publicationAuthority === "DENIED" && s.authorities.identityDisclosureAuthority === "DENIED", JSON.stringify(s.authorities));
      record("geography is EXACTLY what the worker typed (NO); preferred_countries SE/FI not used", JSON.stringify(s.geography) === JSON.stringify(["NO"]), JSON.stringify(s.geography));
      record("trade comes from the profession chosen in onboarding", s.trades.includes(String(prof[0].slug).replace(/_/g, " ")), JSON.stringify(s.trades));
      record("no identity field in the emitted row", !/email|full_name|phone|profile_id/i.test(JSON.stringify(s)), "ok");
    }

    // ── STEP 4: withdrawal removes them again ──────────────────────────────
    await asUser(worker, async () => c.query("select public.withdraw_partner_supply_representation_consent('dashboard_privacy_screen')"));
    rows = await feedRows();
    record("withdrawing the consent removes the worker from the feed", rows.length === baseline && !rowFor(rows, `lm-sig-${myDecl}`), `feed rows=${rows.length} (baseline ${baseline})`);
  } finally {
    await c.query("rollback");
    const { rows } = await c.query(
      "select (select count(*) from auth.users where email like 'activation-proof-%@fixture.local')::int as users, (select count(*) from public.audit_logs where action='external_referral_signup_observed')::int as obs, (select count(*) from pg_proc where proname='record_external_referral_signup_v1')::int as fn",
    );
    residue = rows[0].users + rows[0].obs;
    record("ROLLED BACK: no fixture users, no observation rows left", residue === 0, JSON.stringify(rows[0]));
    record("ROLLED BACK: the new migration is not left in the local database", rows[0].fn === 0, `fn=${rows[0].fn}`);
    await c.end();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
