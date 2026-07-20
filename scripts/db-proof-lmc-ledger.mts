/**
 * LMC Commercial System Train v1 — Wagon 1: REAL-DATABASE proof for the
 * immutable LMC ledger foundation (20260720190000_lmc_ledger_foundation_v1).
 *
 * LOCAL scratch database ONLY (hard localhost guard below) — never production.
 * Contract: docs/product/lmc-commercial-system-train-v1.md
 *
 * Proof matrix (train task, 23 required proofs):
 *   P00  flags default FALSE + disabled RPCs refuse, incl. spend (fail-closed)
 *   P01  1 LMC represented exactly (bigint LMC-cents, no float)
 *   P02  duplicate signup grant refused idempotently
 *   P03  duplicate activity grant refused idempotently
 *   P04  no daily-repeat grant is possible (once-per-account, structurally)
 *   P05  promotional value expires correctly
 *   P06  purchased value does NOT expire with promotional value
 *   P07  promotional value is consumed before purchased value
 *   P08  insufficient balance fails atomically
 *   P09  reversal references the original entry
 *   P10  duplicate reversal is refused
 *   P11  refund reversal is idempotent
 *   P12  chargeback reversal is idempotent
 *   P13  direct authenticated insert is refused
 *   P14  direct update is refused (client roles AND table-owner path)
 *   P15  direct delete is refused (client roles AND table-owner path)
 *   P16  foreign user cannot read another account
 *   P17  authorized admin can perform a bounded grant (and cap holds)
 *   P18  unauthorized user cannot perform an admin grant
 *   P19  referral reward cannot be created while disabled
 *   P20  concurrent spends cannot overspend
 *   P21  concurrent grants with the same idempotency key produce ONE result
 *   P22  rollback removes only Wagon 1 objects, unrelated data preserved
 *        (P22a: a POPULATED ledger refuses to roll back without the
 *        scratch-only override — zero-row-before-DROP rule;
 *        P22b: a second rollback run on absent tables succeeds cleanly)
 *   P23  re-apply after rollback succeeds cleanly (flags false again)
 *   P24  expiry batch is never wedged by already-completed old lots
 *   P25  idempotency-key reuse with a DIFFERENT payload is rejected
 *   P26  reserved expiry-key namespace refused externally; admin-grant
 *        replay with a different expiry conflicts (same expiry replays)
 *   P27  admin-grant replay survives email reassignment (no duplicate grant
 *        to the address's new owner; different recipient conflicts)
 *   P28  committed replays resolve across kill-switch flips (flags off →
 *        replays return already_processed; NEW operations stay blocked)
 *   P29  a kill-switch flip SERIALIZES with in-flight writers (FOR SHARE on
 *        the flag row: the flip blocks until the writer commits, then new
 *        writes are refused)
 *   P30  spend provenance: the initiating actor is required, validated and
 *        recorded on the transaction and in audit_logs
 *   P31  rollback SERIALIZES with in-flight writers via the LMC maintenance
 *        advisory lock (blocks, never deadlocks)
 *
 * NEGATIVE CONTROLS (scratch-only; each weakens the guard, proves the failure
 * actually appears, restores the guard by re-applying the migration file, and
 * proves the proof passes again):
 *   NC-A  spend without the account FOR UPDATE lock → overspend appears
 *   NC-B  same-key concurrency without lock+unique constraint → duplicate txs
 *   NC-C  admin grant without the is_admin() gate → non-admin grant succeeds
 *   NC-D  insert policy + grant added → direct authenticated insert succeeds
 *   NC-E  permissive read policy added → foreign read succeeds
 *   NC-F  lmc_referrals_enabled=true → referral insert passes the trigger
 *   NC-G  flag gate without FOR SHARE → flip no longer blocks on an
 *         in-flight writer (race window visible), restored gate blocks
 *
 * Usage: npx tsx scripts/db-proof-lmc-ledger.mts
 * Env:   DB_URL (default postgresql://postgres:postgres@127.0.0.1:54322/postgres)
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const DB_URL =
  process.env.DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

{
  const host = new URL(DB_URL.replace(/^postgres(ql)?:/, "http:")).hostname;
  const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (!LOCAL_HOSTS.has(host)) {
    console.error(`refusing to run: DB_URL host "${host}" is not local.`);
    process.exit(1);
  }
}

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION_PATH = resolve(
  REPO,
  "supabase/migrations/20260720190000_lmc_ledger_foundation_v1.sql",
);
const ROLLBACK_PATH = resolve(
  REPO,
  "supabase/rollbacks/20260720190000_lmc_ledger_foundation_v1.down.sql",
);

const results: { name: string; pass: boolean; detail: string }[] = [];
const record = (name: string, pass: boolean, detail: string) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};

/**
 * Scratch-database IDENTITY assertion — a localhost hostname is not enough
 * (an SSH tunnel or proxy to production would also present as 127.0.0.1).
 * The Supabase LOCAL dev cluster always carries the well-known development
 * JWT secret as a cluster GUC; no production cluster ever runs with it.
 * This harness performs irreversible scratch cleanup (force-rollback), so it
 * refuses to run against anything that is not provably the local dev DB.
 */
const LOCAL_DEV_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";
async function assertScratchDatabase(c: Client): Promise<void> {
  const { rows } = await c.query(
    `select current_database() as db,
            current_setting('app.settings.jwt_secret', true) as jwt`,
  );
  if (rows[0].db !== "postgres" || rows[0].jwt !== LOCAL_DEV_JWT_SECRET) {
    console.error(
      `refusing to run: DB at ${DB_URL.replace(/\/\/.*@/, "//[redacted]@")} does not present the Supabase LOCAL dev identity marker (db=${rows[0].db}, marker=${rows[0].jwt ? "present-but-different" : "absent"}). A tunnel to a remote database is not a scratch database.`,
    );
    await c.end();
    process.exit(1);
  }
}

async function admin(): Promise<Client> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  return c;
}

/** Authenticated-role connection with RLS enforced for the given profile. */
async function asUser(profileId: string): Promise<Client> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  await c.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: profileId, role: "authenticated" }),
  ]);
  await c.query(`set role authenticated`);
  return c;
}

const RUN = `lmc-${Date.now()}`;

async function makePerson(
  a: Client,
  tag: string,
  role: "worker" | "admin" = "worker",
): Promise<string> {
  const { rows } = await a.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
             $1 || '@fixture.local', 'x', now(), '{"provider":"email"}', '{}', now(), now())
     returning id`,
    [`${RUN}-${tag}`],
  );
  const profileId = rows[0].id as string;
  await a.query(
    `insert into public.profiles (id, active_role, full_name)
     values ($1, $2, 'LMC Proof ' || $3)
     on conflict (id) do update set active_role = excluded.active_role`,
    [profileId, role, tag],
  );
  return profileId;
}

/** Actor recorded on every harness flag flip (settings trigger requires it). */
let FLAG_ACTOR = "";
async function setFlag(a: Client, key: string, enabled: boolean) {
  await a.query(
    `update public.lmc_settings set enabled = $2, updated_by = $3 where key = $1`,
    [key, enabled, FLAG_ACTOR],
  );
}

async function accountOf(a: Client, profileId: string): Promise<string> {
  const { rows } = await a.query(
    `select id from public.lmc_accounts where profile_id = $1`,
    [profileId],
  );
  return rows[0]?.id as string;
}

async function balance(a: Client, accountId: string) {
  const { rows } = await a.query(
    `select * from public.lmc_account_balances where account_id = $1`,
    [accountId],
  );
  return rows[0] ?? null;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function expectError(
  fn: () => Promise<unknown>,
  needle: string,
): Promise<{ ok: boolean; msg: string }> {
  try {
    await fn();
    return { ok: false, msg: "NO ERROR RAISED" };
  } catch (e) {
    const msg = errMsg(e);
    return { ok: msg.includes(needle), msg };
  }
}

/** Restore every weakened object by re-applying the real migration file. */
async function restoreMigration(a: Client) {
  await a.query(readFileSync(MIGRATION_PATH, "utf8"));
}

/**
 * NEGATIVE-CONTROL CLEANUP (scratch-only): remove ledger rows created while a
 * guard was deliberately weakened, so the restored invariants hold again.
 * Requires superuser + temporarily disabled append-only triggers; this is the
 * test harness acting on a scratch database, never a production code path.
 */
async function purgeLedgerRows(a: Client, txIds: string[]) {
  if (txIds.length === 0) return;
  await a.query(`alter table public.lmc_lot_consumptions disable trigger lmc_lot_consumptions_append_only`);
  await a.query(`alter table public.lmc_lots disable trigger lmc_lots_append_only`);
  await a.query(`alter table public.lmc_transactions disable trigger lmc_transactions_append_only`);
  await a.query(`delete from public.lmc_lot_consumptions where transaction_id = any($1::uuid[])`, [txIds]);
  await a.query(`delete from public.lmc_lots where transaction_id = any($1::uuid[])`, [txIds]);
  await a.query(`delete from public.lmc_transactions where id = any($1::uuid[])`, [txIds]);
  await a.query(`alter table public.lmc_transactions enable trigger lmc_transactions_append_only`);
  await a.query(`alter table public.lmc_lots enable trigger lmc_lots_append_only`);
  await a.query(`alter table public.lmc_lot_consumptions enable trigger lmc_lot_consumptions_append_only`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const a = await admin();
  await assertScratchDatabase(a);

  // Clean current schema each run: roll back any prior Wagon 1 objects (the
  // rollback is fully `if exists`-guarded), then apply the real migration.
  // This also guarantees constraint/seed changes in the migration take effect
  // instead of silently keeping a stale `create table if not exists` shape.
  // The rollback's zero-row guard requires the SCRATCH-ONLY override here
  // (this harness is hard-guarded to localhost above).
  await a.query(
    `select set_config('lmc.force_rollback', 'lmc-ledger-removal-approved', false)`,
  );
  await a.query(readFileSync(ROLLBACK_PATH, "utf8"));
  await restoreMigration(a);

  FLAG_ACTOR = await makePerson(a, "flagadmin", "admin");

  // ── P00: fail-closed baseline ─────────────────────────────────────────────
  {
    const { rows } = await a.query(
      `select key, enabled from public.lmc_settings order by key`,
    );
    const allFalse = rows.length === 6 && rows.every((r) => r.enabled === false);
    record("P00a-flags-default-false", allFalse, JSON.stringify(rows));

    const uVerified = await makePerson(a, "p00");
    const g = await expectError(
      () =>
        a.query(
          `select public.lmc_grant_promotional_v1('promotional_signup', $1, 'proof', 'p00-signup-${RUN}')`,
          [uVerified],
        ),
      "lmc_promotional_grants_disabled",
    );
    const p = await expectError(
      () =>
        a.query(
          `select public.lmc_record_purchase_v1(10000, 'ref-p00', 'p00-buy-${RUN}', $1, null)`,
          [uVerified],
        ),
      "lmc_purchases_disabled",
    );
    const s = await expectError(
      () =>
        a.query(
          `select public.lmc_spend_v1(100, 'frozen spend', 'p00-spend-${RUN}', $1, null, $1)`,
          [uVerified],
        ),
      "lmc_spending_disabled",
    );
    record(
      "P00b-disabled-rpcs-refuse",
      g.ok && p.ok && s.ok,
      `grant: ${g.msg.slice(0, 50)} | purchase: ${p.msg.slice(0, 50)} | spend: ${s.msg.slice(0, 50)}`,
    );
  }

  // ── P32: flag flips are accountable (actor required, audit row written) ───
  {
    const noActorFlip = await expectError(
      () =>
        a.query(
          `update public.lmc_settings set enabled = true where key = 'lmc_purchases_enabled'`,
        ),
      "lmc_flag_actor_required",
    );
    await setFlag(a, "lmc_purchases_enabled", true);
    const { rows: flipAudit } = await a.query(
      `select count(*)::int as n from public.audit_logs
        where action = 'lmc_flag_changed'
          and actor_id = $1
          and payload ->> 'updated_by' = $1::text
          and payload ->> 'key' = 'lmc_purchases_enabled'
          and (payload ->> 'to')::boolean = true`,
      [FLAG_ACTOR],
    );
    await setFlag(a, "lmc_purchases_enabled", false); // back to default for P28 etc.
    record(
      "P32-flag-flips-audited",
      noActorFlip.ok && flipAudit[0].n === 1,
      `actor-less flip refused (${noActorFlip.msg.slice(0, 40)}); audited flip rows=${flipAudit[0].n}`,
    );
  }

  // Enable grant+purchase+spend mechanics for the remaining proofs (scratch-
  // only; referrals stay disabled throughout — P19 proves that path stays shut).
  await setFlag(a, "lmc_promotional_grants_enabled", true);
  await setFlag(a, "lmc_purchases_enabled", true);
  await setFlag(a, "lmc_spending_enabled", true);

  const u1 = await makePerson(a, "u1");
  const u2 = await makePerson(a, "u2");
  const adm = await makePerson(a, "adm", "admin");

  // ── P01: 1 LMC represented exactly ────────────────────────────────────────
  {
    const { rows } = await a.query(
      `select public.lmc_record_purchase_v1(100, 'one-lmc', 'p01-${RUN}', $1, null) as r`,
      [u1],
    );
    const acc = await accountOf(a, u1);
    const bal = await balance(a, acc);
    const { rows: t } = await a.query(
      `select amount_cents, pg_typeof(amount_cents)::text as ty
         from public.lmc_transactions where id = $1`,
      [rows[0].r.transaction_id],
    );
    record(
      "P01-one-lmc-exact",
      t[0].amount_cents === "100" &&
        t[0].ty === "bigint" &&
        bal.available_cents === "100" &&
        bal.purchased_available_cents === "100",
      `amount=${t[0].amount_cents} type=${t[0].ty} available=${bal.available_cents}`,
    );
  }

  // ── P02/P03: duplicate signup + activity grants refused idempotently ──────
  for (const [proof, kind] of [
    ["P02-signup-idempotent", "promotional_signup"],
    ["P03-activity-idempotent", "promotional_activity"],
  ] as const) {
    const key = `${proof}-${RUN}`;
    const { rows: first } = await a.query(
      `select public.lmc_grant_promotional_v1($1, $2, 'registration', $3) as r`,
      [kind, u1, key],
    );
    const { rows: replay } = await a.query(
      `select public.lmc_grant_promotional_v1($1, $2, 'registration', $3) as r`,
      [kind, u1, key],
    );
    const freshKey = await expectError(
      () =>
        a.query(
          `select public.lmc_grant_promotional_v1($1, $2, 'registration', $3)`,
          [kind, u1, `${key}-different`],
        ),
      "lmc_duplicate_grant",
    );
    const { rows: count } = await a.query(
      `select count(*)::int as n from public.lmc_transactions
        where account_id = $1 and kind = $2`,
      [await accountOf(a, u1), kind],
    );
    record(
      proof,
      first[0].r.already_processed === false &&
        replay[0].r.already_processed === true &&
        replay[0].r.transaction_id === first[0].r.transaction_id &&
        freshKey.ok &&
        count[0].n === 1,
      `replay=same-tx, fresh-key: ${freshKey.msg.slice(0, 60)}, rows=${count[0].n}`,
    );
  }

  // ── P04: no daily-repeat grant possible ───────────────────────────────────
  {
    const dayLater = await expectError(
      () =>
        a.query(
          `select public.lmc_grant_promotional_v1('promotional_signup', $1, 'registration', $2)`,
          [u1, `p04-next-day-${RUN}`],
        ),
      "lmc_duplicate_grant",
    );
    const { rows } = await a.query(
      `select count(*)::int as n from public.lmc_transactions
        where account_id = $1 and kind like 'promotional_%'`,
      [await accountOf(a, u1)],
    );
    record(
      "P04-no-daily-repeat",
      dayLater.ok && rows[0].n === 2,
      `simulated next-day grant refused (${rows[0].n} promo txs total): ${dayLater.msg.slice(0, 60)}`,
    );
  }

  // ── P05/P06/P07: expiry + ordering (fresh user u2) ────────────────────────
  {
    const admConn = await asUser(adm);
    // Short-lived promotional lot via admin grant (expiry ~6s in the future).
    await admConn.query(
      `select public.lmc_admin_grant_v1($1, 2000, 'expiry proof', 'proof-campaign', now() + interval '6 seconds', 'p05-grant-${RUN}') as r`,
      [`${RUN}-u2@fixture.local`],
    );
    await admConn.end();
    const acc2 = await accountOf(a, u2);
    await a.query(
      `select public.lmc_record_purchase_v1(10000, 'p06-buy', 'p06-${RUN}', $1, null)`,
      [u2],
    );

    // P07 first (while the promo lot is alive): spend consumes promo first.
    await a.query(
      `select public.lmc_spend_v1(500, 'p07 spend', 'p07-${RUN}', $1, null, $1)`,
      [u2],
    );
    const { rows: alloc } = await a.query(
      `select l.source_kind, c.amount_cents
         from public.lmc_lot_consumptions c
         join public.lmc_lots l on l.id = c.lot_id
        where c.account_id = $1 and c.consumption_kind = 'spend'`,
      [acc2],
    );
    record(
      "P07-promo-before-purchased",
      alloc.length === 1 &&
        alloc[0].source_kind === "admin_grant" &&
        alloc[0].amount_cents === "500",
      JSON.stringify(alloc),
    );

    // While the promo lot is still alive: 1500 promo + 10000 purchased.
    const balBefore = await balance(a, acc2);
    await sleep(6500); // let the promotional lot pass its expires_at
    const { rows: exp } = await a.query(
      `select public.lmc_expire_lots_v1(100) as r`,
    );
    const rerun = await a.query(`select public.lmc_expire_lots_v1(100) as r`);
    const { rows: expTx } = await a.query(
      `select count(*)::int as n from public.lmc_transactions
        where account_id = $1 and kind = 'expiry'`,
      [acc2],
    );
    const balAfter = await balance(a, acc2);
    record(
      "P05-promo-expires",
      balBefore.available_cents === "11500" &&
        balBefore.promotional_available_cents === "1500" &&
        expTx[0].n === 1 &&
        balAfter.promotional_available_cents === "0" &&
        rerun.rows[0].r.expired_lots === 0,
      `before=${balBefore.available_cents}/promo=${balBefore.promotional_available_cents} run1=${JSON.stringify(exp[0].r)} run2=${JSON.stringify(rerun.rows[0].r)} after-promo=${balAfter.promotional_available_cents}`,
    );
    record(
      "P06-purchased-never-expires",
      balAfter.purchased_available_cents === "10000" &&
        balAfter.available_cents === "10000",
      `purchased=${balAfter.purchased_available_cents} available=${balAfter.available_cents}`,
    );
  }

  // ── P08: insufficient balance fails atomically ────────────────────────────
  {
    const acc2 = await accountOf(a, u2);
    const { rows: before } = await a.query(
      `select count(*)::int as n from public.lmc_transactions where account_id = $1`,
      [acc2],
    );
    const res = await expectError(
      () =>
        a.query(
          `select public.lmc_spend_v1(999999, 'too much', 'p08-${RUN}', $1, null, $1)`,
          [u2],
        ),
      "lmc_insufficient_balance",
    );
    const { rows: after } = await a.query(
      `select count(*)::int as n from public.lmc_transactions where account_id = $1`,
      [acc2],
    );
    record(
      "P08-insufficient-atomic",
      res.ok && before[0].n === after[0].n,
      `refused, tx count unchanged (${before[0].n}): ${res.msg.slice(0, 60)}`,
    );
  }

  // ── P24: expiry batch never wedged by completed old lots ──────────────────
  {
    const w1 = await makePerson(a, "w1");
    const w2 = await makePerson(a, "w2");
    const admConn = await asUser(adm);
    // Older lot: fully consumed BEFORE it expires (remaining 0 at expiry).
    await admConn.query(
      `select public.lmc_admin_grant_v1($1, 1000, 'wedge older lot', 'proof-campaign', now() + interval '3 seconds', 'p24-w1-${RUN}')`,
      [`${RUN}-w1@fixture.local`],
    );
    await a.query(
      `select public.lmc_spend_v1(1000, 'consume fully', 'p24-spend-${RUN}', $1, null, $1)`,
      [w1],
    );
    // Newer lot: expires later than w1's, still has remainder.
    await admConn.query(
      `select public.lmc_admin_grant_v1($1, 800, 'wedge newer lot', 'proof-campaign', now() + interval '4 seconds', 'p24-w2-${RUN}')`,
      [`${RUN}-w2@fixture.local`],
    );
    await admConn.end();
    await sleep(4500); // both lots are now past expires_at
    // Batch limit 1: without the completed-lot filter, w1's older consumed lot
    // would occupy the window forever and w2's value would never expire.
    const { rows: run1 } = await a.query(
      `select public.lmc_expire_lots_v1(1) as r`,
    );
    const { rows: w2exp } = await a.query(
      `select count(*)::int as n from public.lmc_transactions t
        join public.lmc_accounts acc on acc.id = t.account_id
       where acc.profile_id = $1 and t.kind = 'expiry'`,
      [w2],
    );
    record(
      "P24-expiry-batch-not-wedged",
      run1[0].r.expired_lots === 1 && w2exp[0].n === 1,
      `limit-1 run expired ${run1[0].r.expired_lots} lot(s); newer lot recorded=${w2exp[0].n} despite older consumed lot`,
    );
  }

  // ── P09–P12: reversal doctrine (fresh users to keep lots clean) ───────────
  {
    const u3 = await makePerson(a, "u3");
    const admConn = await asUser(adm);
    const { rows: g } = await admConn.query(
      `select public.lmc_admin_grant_v1($1, 3000, 'reversal proof', 'proof-campaign', now() + interval '30 days', 'p09-grant-${RUN}') as r`,
      [`${RUN}-u3@fixture.local`],
    );
    await admConn.end();
    const grantTx = g[0].r.transaction_id as string;

    // Reversal provenance: actor required and authority-bound.
    const revNoActor = await expectError(
      () =>
        a.query(
          `select public.lmc_reverse_v1($1, 'reversal', 'no actor', 'p09-noactor-${RUN}')`,
          [grantTx],
        ),
      "lmc_actor_required",
    );
    const revForeign = await expectError(
      () =>
        a.query(
          `select public.lmc_reverse_v1($1, 'reversal', 'foreign', 'p09-foreign-${RUN}', $2)`,
          [grantTx, u1],
        ),
      "lmc_actor_not_authorized",
    );
    const { rows: rev } = await a.query(
      `select public.lmc_reverse_v1($1, 'reversal', 'admin error', 'p09-rev-${RUN}', $2) as r`,
      [grantTx, u3],
    );
    const { rows: link } = await a.query(
      `select original_transaction_id, actor_profile_id
         from public.lmc_transactions where id = $1`,
      [rev[0].r.transaction_id],
    );
    record(
      "P09-reversal-links-original",
      revNoActor.ok &&
        revForeign.ok &&
        link[0].original_transaction_id === grantTx &&
        link[0].actor_profile_id === u3,
      `actor-less + foreign-actor refused; original linked; actor recorded`,
    );

    const dup = await expectError(
      () =>
        a.query(
          `select public.lmc_reverse_v1($1, 'reversal', 'again', 'p10-rev-${RUN}', $2)`,
          [grantTx, u3],
        ),
      "lmc_already_reversed",
    );
    record("P10-duplicate-reversal-refused", dup.ok, dup.msg.slice(0, 80));

    // P11: refund reversal idempotent (purchased original).
    const { rows: buy } = await a.query(
      `select public.lmc_record_purchase_v1(4000, 'p11-buy', 'p11-buy-${RUN}', $1, null) as r`,
      [u3],
    );
    const { rows: r1 } = await a.query(
      `select public.lmc_reverse_v1($1, 'refund_reversal', 'refund', 'p11-rev-${RUN}', $2) as r`,
      [buy[0].r.transaction_id, u3],
    );
    const { rows: r2 } = await a.query(
      `select public.lmc_reverse_v1($1, 'refund_reversal', 'refund', 'p11-rev-${RUN}', $2) as r`,
      [buy[0].r.transaction_id, u3],
    );
    record(
      "P11-refund-reversal-idempotent",
      r1[0].r.already_processed === false &&
        r2[0].r.already_processed === true &&
        r1[0].r.transaction_id === r2[0].r.transaction_id,
      `replay returned same tx ${r1[0].r.transaction_id}`,
    );

    // P12: chargeback reversal idempotent (fresh purchase).
    const { rows: buy2 } = await a.query(
      `select public.lmc_record_purchase_v1(2500, 'p12-buy', 'p12-buy-${RUN}', $1, null) as r`,
      [u3],
    );
    const { rows: c1 } = await a.query(
      `select public.lmc_reverse_v1($1, 'chargeback_reversal', 'chargeback', 'p12-rev-${RUN}', $2) as r`,
      [buy2[0].r.transaction_id, u3],
    );
    const { rows: c2 } = await a.query(
      `select public.lmc_reverse_v1($1, 'chargeback_reversal', 'chargeback', 'p12-rev-${RUN}', $2) as r`,
      [buy2[0].r.transaction_id, u3],
    );
    record(
      "P12-chargeback-reversal-idempotent",
      c1[0].r.already_processed === false &&
        c2[0].r.already_processed === true &&
        c1[0].r.transaction_id === c2[0].r.transaction_id,
      `replay returned same tx ${c1[0].r.transaction_id}`,
    );
  }

  // ── P30: spend provenance — initiating actor required and recorded ────────
  {
    const acc2 = await accountOf(a, u2);
    const noActor = await expectError(
      () =>
        a.query(
          `select public.lmc_spend_v1(100, 'p30 no actor', 'p30-noactor-${RUN}', $1, null)`,
          [u2],
        ),
      "lmc_actor_required",
    );
    const ghostActor = await expectError(
      () =>
        a.query(
          `select public.lmc_spend_v1(100, 'p30 ghost', 'p30-ghost-${RUN}', $1, null, gen_random_uuid())`,
          [u2],
        ),
      "lmc_unknown_actor",
    );
    // An unrelated EXISTING profile must not be recordable as the initiator
    // of someone else's debit.
    const foreignActor = await expectError(
      () =>
        a.query(
          `select public.lmc_spend_v1(100, 'p30 foreign', 'p30-foreign-${RUN}', $1, null, $2)`,
          [u2, u1],
        ),
      "lmc_actor_not_authorized",
    );
    // An admin actor IS authorized (dual-signal admin role).
    const { rows: admSpend } = await a.query(
      `select public.lmc_spend_v1(50, 'p30 admin spend', 'p30-admin-${RUN}', $1, null, $2) as r`,
      [u2, adm],
    );
    const { rows: ok } = await a.query(
      `select public.lmc_spend_v1(100, 'p30 spend', 'p30-${RUN}', $1, null, $1) as r`,
      [u2],
    );
    // A committed spend's replay result is NOT readable by a foreign actor:
    // same key + same amount but a different initiator conflicts.
    const foreignReplay = await expectError(
      () =>
        a.query(
          `select public.lmc_spend_v1(100, 'p30 spend', 'p30-${RUN}', $1, null, $2)`,
          [u2, u1],
        ),
      "lmc_idempotency_conflict",
    );
    const { rows: tx } = await a.query(
      `select actor_profile_id from public.lmc_transactions where id = $1`,
      [ok[0].r.transaction_id],
    );
    const { rows: audit } = await a.query(
      `select count(*)::int as n from public.audit_logs
        where action = 'lmc_spend' and entity_id = $1 and actor_id = $2`,
      [ok[0].r.transaction_id, u2],
    );
    // Account creation itself is audited (exactly once, despite many
    // idempotent ensure-account calls across the proofs).
    const { rows: accAudit } = await a.query(
      `select count(*)::int as n from public.audit_logs
        where action = 'lmc_account_created' and entity_id = $1`,
      [acc2],
    );
    record(
      "P30-spend-provenance-recorded",
      noActor.ok &&
        ghostActor.ok &&
        foreignActor.ok &&
        foreignReplay.ok &&
        admSpend[0].r.kind === "spend" &&
        tx[0].actor_profile_id === u2 &&
        audit[0].n === 1 &&
        accAudit[0].n === 1,
      `missing/unknown/foreign actor refused; foreign REPLAY refused; admin actor allowed; tx.actor recorded; spend audit=${audit[0].n}; account-created audit=${accAudit[0].n}`,
    );
  }

  // ── P25: idempotency-key reuse with a different payload is rejected ───────
  {
    const u8 = await makePerson(a, "u8");
    // Same key, different amount → conflict (not a silent replay).
    await a.query(
      `select public.lmc_record_purchase_v1(1000, 'p25-ref', 'p25-buy-${RUN}', $1, null)`,
      [u8],
    );
    const amountConflict = await expectError(
      () =>
        a.query(
          `select public.lmc_record_purchase_v1(2000, 'p25-ref', 'p25-buy-${RUN}', $1, null)`,
          [u8],
        ),
      "lmc_idempotency_conflict",
    );
    // The critical reversal case: reverse purchase A with key R, then try to
    // reverse purchase B with the SAME key R → must conflict, and B must
    // still be reversible with a fresh key.
    const { rows: buyA } = await a.query(
      `select public.lmc_record_purchase_v1(500, 'p25-a', 'p25-buy-a-${RUN}', $1, null) as r`,
      [u8],
    );
    const { rows: buyB } = await a.query(
      `select public.lmc_record_purchase_v1(600, 'p25-b', 'p25-buy-b-${RUN}', $1, null) as r`,
      [u8],
    );
    await a.query(
      `select public.lmc_reverse_v1($1, 'refund_reversal', 'refund A', 'p25-rev-${RUN}', $2)`,
      [buyA[0].r.transaction_id, u8],
    );
    const linkageConflict = await expectError(
      () =>
        a.query(
          `select public.lmc_reverse_v1($1, 'refund_reversal', 'refund B', 'p25-rev-${RUN}', $2)`,
          [buyB[0].r.transaction_id, u8],
        ),
      "lmc_idempotency_conflict",
    );
    const { rows: freshB } = await a.query(
      `select public.lmc_reverse_v1($1, 'refund_reversal', 'refund B', 'p25-rev-b-${RUN}', $2) as r`,
      [buyB[0].r.transaction_id, u8],
    );
    record(
      "P25-idempotency-payload-fingerprint",
      amountConflict.ok &&
        linkageConflict.ok &&
        freshB[0].r.kind === "refund_reversal" &&
        freshB[0].r.already_processed === false,
      `amount reuse: ${amountConflict.msg.slice(0, 50)} | linkage reuse: ${linkageConflict.msg.slice(0, 50)} | B reversed with fresh key`,
    );
  }

  // ── P26: reserved key namespace + expiry in the replay fingerprint ────────
  {
    const u9 = await makePerson(a, "u9");
    const reservedBuy = await expectError(
      () =>
        a.query(
          `select public.lmc_record_purchase_v1(1000, 'p26', 'lmc-expiry:${RUN}-fake', $1, null)`,
          [u9],
        ),
      "lmc_reserved_idempotency_key",
    );
    const reservedSpend = await expectError(
      () =>
        a.query(
          `select public.lmc_spend_v1(100, 'p26 spend', 'lmc-expiry:${RUN}-fake2', $1, null, $1)`,
          [u9],
        ),
      "lmc_reserved_idempotency_key",
    );
    // Admin-grant expiry rides the replay fingerprint: identical expiry
    // replays; a changed expiry conflicts instead of silently keeping the
    // original lot validity.
    const { rows: ts } = await a.query(
      `select (now() + interval '30 days') as t, (now() + interval '3 seconds') as short`,
    );
    const expiry = ts[0].t as Date;
    const shortExpiry = ts[0].short as Date;
    const admConn = await asUser(adm);
    // Short-lived grant whose expiry will have ELAPSED by the time we replay
    // it below — the identical replay must stay idempotent (no window check
    // before the idempotency lookup).
    const { rows: s1 } = await admConn.query(
      `select public.lmc_admin_grant_v1($1, 400, 'elapsed replay', 'proof-campaign', $2, 'p26-short-${RUN}') as r`,
      [`${RUN}-u9@fixture.local`, shortExpiry],
    );
    const { rows: g1 } = await admConn.query(
      `select public.lmc_admin_grant_v1($1, 900, 'expiry fp', 'proof-campaign', $2, 'p26-grant-${RUN}') as r`,
      [`${RUN}-u9@fixture.local`, expiry],
    );
    const { rows: g2 } = await admConn.query(
      `select public.lmc_admin_grant_v1($1, 900, 'expiry fp', 'proof-campaign', $2, 'p26-grant-${RUN}') as r`,
      [`${RUN}-u9@fixture.local`, expiry],
    );
    const expiryConflict = await expectError(
      () =>
        admConn.query(
          `select public.lmc_admin_grant_v1($1, 900, 'expiry fp', 'proof-campaign', now() + interval '5 days', 'p26-grant-${RUN}')`,
          [`${RUN}-u9@fixture.local`],
        ),
      "lmc_idempotency_conflict",
    );
    // Identical replay AFTER the granted expiry has elapsed: still idempotent.
    await sleep(3500);
    const { rows: s2 } = await admConn.query(
      `select public.lmc_admin_grant_v1($1, 400, 'elapsed replay', 'proof-campaign', $2, 'p26-short-${RUN}') as r`,
      [`${RUN}-u9@fixture.local`, shortExpiry],
    );
    // A genuinely NEW grant with an elapsed expiry is still refused.
    const elapsedNew = await expectError(
      () =>
        admConn.query(
          `select public.lmc_admin_grant_v1($1, 400, 'elapsed new', 'proof-campaign', $2, 'p26-elapsed-new-${RUN}')`,
          [`${RUN}-u9@fixture.local`, shortExpiry],
        ),
      "lmc_invalid_expiry",
    );
    await admConn.end();
    record(
      "P26-reserved-namespace-and-expiry-fingerprint",
      reservedBuy.ok &&
        reservedSpend.ok &&
        g2[0].r.already_processed === true &&
        g2[0].r.transaction_id === g1[0].r.transaction_id &&
        expiryConflict.ok &&
        s2[0].r.already_processed === true &&
        s2[0].r.transaction_id === s1[0].r.transaction_id &&
        elapsedNew.ok,
      `reserved buy/spend refused; same-expiry replay=same tx; changed expiry: ${expiryConflict.msg.slice(0, 40)}; elapsed-expiry replay idempotent; elapsed NEW grant refused`,
    );
  }

  // ── P27: admin-grant replay is immune to email reassignment ───────────────
  {
    const c = await makePerson(a, "c");
    const d = await makePerson(a, "d");
    const emailC = `${RUN}-c@fixture.local`;
    const { rows: ts27 } = await a.query(
      `select (now() + interval '20 days') as t`,
    );
    const exp27 = ts27[0].t as Date;
    const admConn = await asUser(adm);
    const { rows: g1 } = await admConn.query(
      `select public.lmc_admin_grant_v1($1, 1100, 'reassign proof', 'proof-campaign', $2, 'p27-${RUN}') as r`,
      [emailC, exp27],
    );
    // Simulate the address moving to a DIFFERENT verified profile: c gets a
    // new address, d takes over c's original address.
    await a.query(`update auth.users set email = $2 where id = $1`, [
      c,
      `${RUN}-c-old@fixture.local`,
    ]);
    await a.query(`update auth.users set email = $2 where id = $1`, [
      d,
      emailC,
    ]);
    // Identical retry: must return the ORIGINAL transaction, not grant the
    // new owner of the address.
    const { rows: g2 } = await admConn.query(
      `select public.lmc_admin_grant_v1($1, 1100, 'reassign proof', 'proof-campaign', $2, 'p27-${RUN}') as r`,
      [emailC, exp27],
    );
    const { rows: dTx } = await a.query(
      `select count(*)::int as n from public.lmc_transactions t
        join public.lmc_accounts acc on acc.id = t.account_id
       where acc.profile_id = $1`,
      [d],
    );
    // Same key with a DIFFERENT recipient email → conflict, never a new grant.
    const otherRecipient = await expectError(
      () =>
        admConn.query(
          `select public.lmc_admin_grant_v1($1, 1100, 'reassign proof', 'proof-campaign', $2, 'p27-${RUN}')`,
          [`${RUN}-d@fixture.local`, exp27],
        ),
      "lmc_idempotency_conflict",
    );
    await admConn.end();
    record(
      "P27-replay-immune-to-email-reassignment",
      g2[0].r.already_processed === true &&
        g2[0].r.transaction_id === g1[0].r.transaction_id &&
        dTx[0].n === 0 &&
        otherRecipient.ok,
      `retry returned original tx; new address owner has ${dTx[0].n} txs; different recipient: ${otherRecipient.msg.slice(0, 45)}`,
    );
  }

  // ── P13–P15: direct writes refused ────────────────────────────────────────
  {
    const acc1 = await accountOf(a, u1);
    const userConn = await asUser(u1);
    const ins = await expectError(
      () =>
        userConn.query(
          `insert into public.lmc_transactions (account_id, kind, amount_cents, idempotency_key, reason)
           values ($1, 'purchased', 100, 'p13-direct-${RUN}', 'direct insert')`,
          [acc1],
        ),
      "permission denied",
    );
    record("P13-direct-insert-refused", ins.ok, ins.msg.slice(0, 80));

    const updUser = await expectError(
      () => userConn.query(`update public.lmc_transactions set reason = 'x'`),
      "permission denied",
    );
    const updOwner = await expectError(
      () =>
        a.query(
          `update public.lmc_transactions set reason = 'x' where account_id = $1`,
          [acc1],
        ),
      "lmc_append_only",
    );
    record(
      "P14-direct-update-refused",
      updUser.ok && updOwner.ok,
      `authenticated: ${updUser.msg.slice(0, 40)} | owner-path trigger: ${updOwner.msg.slice(0, 60)}`,
    );

    const delUser = await expectError(
      () => userConn.query(`delete from public.lmc_transactions`),
      "permission denied",
    );
    const delOwner = await expectError(
      () =>
        a.query(`delete from public.lmc_transactions where account_id = $1`, [
          acc1,
        ]),
      "lmc_append_only",
    );
    record(
      "P15-direct-delete-refused",
      delUser.ok && delOwner.ok,
      `authenticated: ${delUser.msg.slice(0, 40)} | owner-path trigger: ${delOwner.msg.slice(0, 60)}`,
    );
    await userConn.end();
  }

  // ── P16: foreign user cannot read another account ─────────────────────────
  {
    const acc1 = await accountOf(a, u1);
    const own = await asUser(u1);
    const foreign = await asUser(u2);
    const { rows: mine } = await own.query(
      `select count(*)::int as n from public.lmc_transactions where account_id = $1`,
      [acc1],
    );
    const { rows: theirs } = await foreign.query(
      `select count(*)::int as n from public.lmc_transactions where account_id = $1`,
      [acc1],
    );
    const { rows: theirBal } = await foreign.query(
      `select count(*)::int as n from public.lmc_account_balances where account_id = $1`,
      [acc1],
    );
    record(
      "P16-foreign-read-refused",
      mine[0].n > 0 && theirs[0].n === 0 && theirBal[0].n === 0,
      `owner sees ${mine[0].n} rows, foreign sees ${theirs[0].n} tx / ${theirBal[0].n} balance rows`,
    );
    await own.end();
    await foreign.end();
  }

  // ── P17/P18: admin grant authorization + bound ────────────────────────────
  {
    const admConn = await asUser(adm);
    const { rows: ok } = await admConn.query(
      `select public.lmc_admin_grant_v1($1, 1500, 'welcome credit', 'proof-campaign', now() + interval '60 days', 'p17-${RUN}') as r`,
      [`${RUN}-u1@fixture.local`],
    );
    const overCap = await expectError(
      () =>
        admConn.query(
          `select public.lmc_admin_grant_v1($1, 999999999, 'too big', 'proof-campaign', now() + interval '60 days', 'p17-big-${RUN}')`,
          [`${RUN}-u1@fixture.local`],
        ),
      "lmc_invalid_amount",
    );
    const unverified = await expectError(
      () =>
        admConn.query(
          `select public.lmc_admin_grant_v1('nobody-${RUN}@fixture.local', 100, 'ghost', 'proof-campaign', now() + interval '60 days', 'p17-ghost-${RUN}')`,
        ),
      "lmc_recipient_not_found_or_unverified",
    );
    await admConn.end();
    record(
      "P17-admin-bounded-grant",
      ok[0].r.kind === "admin_grant" && overCap.ok && unverified.ok,
      `grant ok, over-cap refused (${overCap.msg.slice(0, 40)}), unknown recipient refused`,
    );

    const nonAdmin = await asUser(u2);
    const denied = await expectError(
      () =>
        nonAdmin.query(
          `select public.lmc_admin_grant_v1($1, 100, 'sneaky', 'proof-campaign', now() + interval '60 days', 'p18-${RUN}')`,
          [`${RUN}-u1@fixture.local`],
        ),
      "Admin only",
    );
    await nonAdmin.end();
    record("P18-non-admin-grant-refused", denied.ok, denied.msg.slice(0, 80));
  }

  // ── P19: referral reward impossible while disabled ────────────────────────
  {
    const acc1 = await accountOf(a, u1);
    const res = await expectError(
      () =>
        a.query(
          `insert into public.lmc_transactions (account_id, kind, amount_cents, idempotency_key, reason)
           values ($1, 'referral_reward', 100, 'p19-${RUN}', 'should be impossible')`,
          [acc1],
        ),
      "lmc_referrals_disabled",
    );
    record("P19-referral-impossible-while-disabled", res.ok, res.msg.slice(0, 80));
  }

  // ── P20: concurrent spends cannot overspend ───────────────────────────────
  {
    const u4 = await makePerson(a, "u4");
    await a.query(
      `select public.lmc_record_purchase_v1(10000, 'p20-buy', 'p20-buy-${RUN}', $1, null)`,
      [u4],
    );
    const c1 = await admin();
    const c2 = await admin();
    const spend = (c: Client, key: string) =>
      c.query(
        `select public.lmc_spend_v1(7000, 'race spend', $1, $2, null, $2) as r`,
        [key, u4],
      );
    const settled = await Promise.allSettled([
      spend(c1, `p20-a-${RUN}`),
      spend(c2, `p20-b-${RUN}`),
    ]);
    await c1.end();
    await c2.end();
    const okCount = settled.filter((s) => s.status === "fulfilled").length;
    const failMsgs = settled
      .filter((s): s is PromiseRejectedResult => s.status === "rejected")
      .map((s) => errMsg(s.reason));
    const bal4 = await balance(a, await accountOf(a, u4));
    record(
      "P20-concurrent-no-overspend",
      okCount === 1 &&
        failMsgs.every((m) => m.includes("lmc_insufficient_balance")) &&
        bal4.available_cents === "3000",
      `ok=${okCount} fails=${failMsgs.length} final=${bal4.available_cents}`,
    );
  }

  // ── P21: concurrent same-key grants → one result ──────────────────────────
  {
    const admA = await asUser(adm);
    const admB = await asUser(adm);
    const key = `p21-${RUN}`;
    // Identical payload on both concurrent calls (a real client retry sends
    // the same expiry) — computed once so the replay fingerprint matches.
    const { rows: ts21 } = await a.query(
      `select (now() + interval '60 days') as t`,
    );
    const raceExpiry = ts21[0].t as Date;
    const call = (c: Client) =>
      c.query(
        `select public.lmc_admin_grant_v1($1, 700, 'race grant', 'proof-campaign', $3, $2) as r`,
        [`${RUN}-u2@fixture.local`, key, raceExpiry],
      );
    const settled = await Promise.allSettled([call(admA), call(admB)]);
    await admA.end();
    await admB.end();
    const fulfilled = settled.filter(
      (s): s is PromiseFulfilledResult<{ rows: { r: { transaction_id: string } }[] }> =>
        s.status === "fulfilled",
    );
    const { rows: n } = await a.query(
      `select count(*)::int as n from public.lmc_transactions
        where idempotency_key = $1`,
      [key],
    );
    const txIds = new Set(fulfilled.map((f) => f.value.rows[0].r.transaction_id));
    record(
      "P21-concurrent-same-key-single-result",
      n[0].n === 1 && fulfilled.length === 2 && txIds.size === 1,
      `rows=${n[0].n} fulfilled=${fulfilled.length} distinct-tx=${txIds.size}`,
    );
  }

  // ── P28: committed replays resolve across kill-switch flips ───────────────
  {
    const u10 = await makePerson(a, "u10");
    const { rows: ts28 } = await a.query(
      `select (now() + interval '15 days') as t`,
    );
    const exp28 = ts28[0].t as Date;
    const { rows: buy } = await a.query(
      `select public.lmc_record_purchase_v1(2000, 'p28-ref', 'p28-buy-${RUN}', $1, null) as r`,
      [u10],
    );
    const { rows: spend } = await a.query(
      `select public.lmc_spend_v1(500, 'p28 spend', 'p28-spend-${RUN}', $1, null, $1) as r`,
      [u10],
    );
    const { rows: promo } = await a.query(
      `select public.lmc_grant_promotional_v1('promotional_signup', $1, 'p28-campaign', 'p28-promo-${RUN}') as r`,
      [u10],
    );
    const admConn = await asUser(adm);
    const { rows: ag } = await admConn.query(
      `select public.lmc_admin_grant_v1($1, 300, 'p28 grant', 'p28-campaign', $2, 'p28-admin-${RUN}') as r`,
      [`${RUN}-u10@fixture.local`, exp28],
    );

    // Emergency rollback: every commerce flag off.
    await setFlag(a, "lmc_purchases_enabled", false);
    await setFlag(a, "lmc_promotional_grants_enabled", false);
    await setFlag(a, "lmc_spending_enabled", false);

    const { rows: buyR } = await a.query(
      `select public.lmc_record_purchase_v1(2000, 'p28-ref', 'p28-buy-${RUN}', $1, null) as r`,
      [u10],
    );
    const { rows: spendR } = await a.query(
      `select public.lmc_spend_v1(500, 'p28 spend', 'p28-spend-${RUN}', $1, null, $1) as r`,
      [u10],
    );
    const { rows: promoR } = await a.query(
      `select public.lmc_grant_promotional_v1('promotional_signup', $1, 'p28-campaign', 'p28-promo-${RUN}') as r`,
      [u10],
    );
    const { rows: agR } = await admConn.query(
      `select public.lmc_admin_grant_v1($1, 300, 'p28 grant', 'p28-campaign', $2, 'p28-admin-${RUN}') as r`,
      [`${RUN}-u10@fixture.local`, exp28],
    );
    const replaysOk =
      buyR[0].r.already_processed === true &&
      buyR[0].r.transaction_id === buy[0].r.transaction_id &&
      spendR[0].r.already_processed === true &&
      spendR[0].r.transaction_id === spend[0].r.transaction_id &&
      promoR[0].r.already_processed === true &&
      promoR[0].r.transaction_id === promo[0].r.transaction_id &&
      agR[0].r.already_processed === true &&
      agR[0].r.transaction_id === ag[0].r.transaction_id;

    const newBuy = await expectError(
      () =>
        a.query(
          `select public.lmc_record_purchase_v1(2000, 'p28-ref', 'p28-buy-new-${RUN}', $1, null)`,
          [u10],
        ),
      "lmc_purchases_disabled",
    );
    const newSpend = await expectError(
      () =>
        a.query(
          `select public.lmc_spend_v1(100, 'p28 new spend', 'p28-spend-new-${RUN}', $1, null, $1)`,
          [u10],
        ),
      "lmc_spending_disabled",
    );
    const newGrant = await expectError(
      () =>
        admConn.query(
          `select public.lmc_admin_grant_v1($1, 300, 'p28 new', 'p28-campaign', now() + interval '15 days', 'p28-admin-new-${RUN}')`,
          [`${RUN}-u10@fixture.local`],
        ),
      "lmc_promotional_grants_disabled",
    );
    await admConn.end();

    await setFlag(a, "lmc_purchases_enabled", true);
    await setFlag(a, "lmc_promotional_grants_enabled", true);
    await setFlag(a, "lmc_spending_enabled", true);

    record(
      "P28-replays-survive-flag-flips",
      replaysOk && newBuy.ok && newSpend.ok && newGrant.ok,
      `4/4 committed replays already_processed with flags OFF; new buy/spend/grant blocked`,
    );
  }

  // ── P29: kill-switch flips serialize with in-flight writers ───────────────
  {
    const u11 = await makePerson(a, "u11");
    const writer = await admin();
    const flipper = await admin();
    await writer.query("begin");
    await writer.query(
      `select public.lmc_record_purchase_v1(700, 'p29', 'p29-buy-${RUN}', $1, null)`,
      [u11],
    );
    // The uncommitted purchase holds FOR SHARE on the flag row: the
    // emergency flip must BLOCK until the writer commits.
    await flipper.query(`set statement_timeout = 1500`);
    const blocked = await expectError(
      () =>
        flipper.query(
          `update public.lmc_settings set enabled = false, updated_by = '${FLAG_ACTOR}' where key = 'lmc_purchases_enabled'`,
        ),
      "statement timeout",
    );
    await writer.query("commit");
    await flipper.query(`set statement_timeout = 0`);
    await flipper.query(
      `update public.lmc_settings set enabled = false, updated_by = '${FLAG_ACTOR}' where key = 'lmc_purchases_enabled'`,
    );
    const newBuy = await expectError(
      () =>
        a.query(
          `select public.lmc_record_purchase_v1(700, 'p29', 'p29-buy-2-${RUN}', $1, null)`,
          [u11],
        ),
      "lmc_purchases_disabled",
    );
    await setFlag(a, "lmc_purchases_enabled", true);
    await writer.end();
    await flipper.end();
    record(
      "P29-flag-flip-serializes-with-writers",
      blocked.ok && newBuy.ok,
      `flip blocked on in-flight writer (${blocked.msg.slice(0, 40)}); after flip committed, new purchase refused`,
    );
  }

  // ── P31: rollback serializes with in-flight writers (no deadlock) ─────────
  {
    const u12 = await makePerson(a, "u12");
    const writer = await admin();
    const roller = await admin();
    await writer.query("begin");
    await writer.query(
      `select public.lmc_record_purchase_v1(400, 'p31', 'p31-buy-${RUN}', $1, null)`,
      [u12],
    );
    // The uncommitted writer holds the SHARED maintenance advisory lock; the
    // rollback must WAIT at its exclusive advisory acquisition — a blocked
    // statement-timeout, never a deadlock abort.
    await roller.query(
      `select set_config('lmc.force_rollback', 'lmc-ledger-removal-approved', false)`,
    );
    await roller.query(`set statement_timeout = 1500`);
    const blocked = await expectError(
      () => roller.query(readFileSync(ROLLBACK_PATH, "utf8")),
      "statement timeout",
    );
    const deadlocked = blocked.msg.toLowerCase().includes("deadlock");
    await roller.query(`rollback`).catch(() => {});
    await roller.query(`set statement_timeout = 0`);
    await writer.query("commit");
    await writer.end();
    await roller.end();
    record(
      "P31-rollback-serializes-no-deadlock",
      blocked.ok && !deadlocked,
      `rollback waited on in-flight writer (${blocked.msg.slice(0, 40)}); deadlock=${deadlocked}`,
    );
  }

  // ── NEGATIVE CONTROLS ─────────────────────────────────────────────────────

  // NC-G: flag gate WITHOUT FOR SHARE → the flip no longer waits for an
  // in-flight writer (the race window Codex flagged becomes visible).
  {
    await a.query(WEAKENED_REQUIRE_FLAG_NO_LOCK);
    const u11b = await makePerson(a, "u11b");
    const writer = await admin();
    const flipper = await admin();
    await writer.query("begin");
    await writer.query(
      `select public.lmc_record_purchase_v1(300, 'ncg', 'ncg-buy-${RUN}', $1, null)`,
      [u11b],
    );
    await flipper.query(`set statement_timeout = 1500`);
    let flippedWithoutWaiting = false;
    try {
      await flipper.query(
        `update public.lmc_settings set enabled = false, updated_by = '${FLAG_ACTOR}' where key = 'lmc_purchases_enabled'`,
      );
      flippedWithoutWaiting = true;
    } catch {
      /* unexpectedly blocked */
    }
    await writer.query("commit"); // writer's credit lands AFTER the shutdown
    record(
      "NCG1-weakened-gate-lets-flip-race",
      flippedWithoutWaiting,
      flippedWithoutWaiting
        ? "flip committed while a writer was in flight (guard removed → race visible)"
        : "flip unexpectedly blocked",
    );
    await flipper.query(`set statement_timeout = 0`);
    await restoreMigration(a);
    await setFlag(a, "lmc_purchases_enabled", true);
    // Restored gate: the same sequence blocks again.
    await writer.query("begin");
    await writer.query(
      `select public.lmc_record_purchase_v1(300, 'ncg2', 'ncg2-buy-${RUN}', $1, null)`,
      [u11b],
    );
    await flipper.query(`set statement_timeout = 1500`);
    const blockedAgain = await expectError(
      () =>
        flipper.query(
          `update public.lmc_settings set enabled = false, updated_by = '${FLAG_ACTOR}' where key = 'lmc_purchases_enabled'`,
        ),
      "statement timeout",
    );
    await writer.query("commit");
    await flipper.query(`set statement_timeout = 0`);
    await setFlag(a, "lmc_purchases_enabled", true);
    await writer.end();
    await flipper.end();
    record(
      "NCG2-restored-gate-blocks-flip",
      blockedAgain.ok,
      blockedAgain.msg.slice(0, 60),
    );
  }

  // NC-A: remove the account FOR UPDATE lock from lmc_spend_v1 → overspend.
  {
    const u5 = await makePerson(a, "u5");
    await a.query(
      `select public.lmc_record_purchase_v1(10000, 'nca-buy', 'nca-buy-${RUN}', $1, null)`,
      [u5],
    );
    await a.query(WEAKENED_SPEND_NO_LOCK);
    const c1 = await admin();
    const c2 = await admin();
    const settled = await Promise.allSettled([
      c1.query(`select public.lmc_spend_v1(7000, 'weak race', 'nca-a-${RUN}', $1, null, $1)`, [u5]),
      c2.query(`select public.lmc_spend_v1(7000, 'weak race', 'nca-b-${RUN}', $1, null, $1)`, [u5]),
    ]);
    await c1.end();
    await c2.end();
    const weakOk = settled.filter((s) => s.status === "fulfilled").length;
    const { rows: consumed } = await a.query(
      `select coalesce(sum(c.amount_cents), 0)::bigint as spent
         from public.lmc_lot_consumptions c
         join public.lmc_accounts acc on acc.id = c.account_id
        where acc.profile_id = $1 and c.consumption_kind = 'spend'`,
      [u5],
    );
    const overspendAppeared = weakOk === 2 && Number(consumed[0].spent) > 10000;
    record(
      "NCA1-weakened-lock-overspends",
      overspendAppeared,
      `fulfilled=${weakOk} spent=${consumed[0].spent} of 10000 (guard removed → failure visible)`,
    );

    // Restore + cleanup, then prove correctness again on a fresh account.
    const { rows: badTx } = await a.query(
      `select t.id from public.lmc_transactions t
         join public.lmc_accounts acc on acc.id = t.account_id
        where acc.profile_id = $1 and t.kind = 'spend'`,
      [u5],
    );
    await restoreMigration(a);
    await purgeLedgerRows(a, badTx.map((r) => r.id as string));
    const c3 = await admin();
    const c4 = await admin();
    const settled2 = await Promise.allSettled([
      c3.query(`select public.lmc_spend_v1(7000, 'fixed race', 'nca-c-${RUN}', $1, null, $1)`, [u5]),
      c4.query(`select public.lmc_spend_v1(7000, 'fixed race', 'nca-d-${RUN}', $1, null, $1)`, [u5]),
    ]);
    await c3.end();
    await c4.end();
    const fixedOk = settled2.filter((s) => s.status === "fulfilled").length;
    record(
      "NCA2-restored-lock-holds",
      fixedOk === 1,
      `after restore exactly ${fixedOk} of 2 concurrent spends succeeded`,
    );
  }

  // NC-B: drop unique(account,key) + lock → concurrent same-key duplicates.
  {
    await a.query(WEAKENED_SPEND_NO_LOCK); // remove serialization again
    await a.query(
      `alter table public.lmc_transactions drop constraint lmc_tx_idempotency`,
    );
    const u6 = await makePerson(a, "u6");
    await a.query(
      `select public.lmc_record_purchase_v1(10000, 'ncb-buy', 'ncb-buy-${RUN}', $1, null)`,
      [u6],
    );
    const key = `ncb-race-${RUN}`;
    const c1 = await admin();
    const c2 = await admin();
    await Promise.allSettled([
      c1.query(`select public.lmc_spend_v1(1000, 'dup race', $1, $2, null, $2)`, [key, u6]),
      c2.query(`select public.lmc_spend_v1(1000, 'dup race', $1, $2, null, $2)`, [key, u6]),
    ]);
    await c1.end();
    await c2.end();
    const { rows: dup } = await a.query(
      `select count(*)::int as n from public.lmc_transactions where idempotency_key = $1`,
      [key],
    );
    record(
      "NCB1-weakened-idempotency-duplicates",
      dup[0].n === 2,
      `same key produced ${dup[0].n} transactions with constraint removed`,
    );

    const { rows: badTx } = await a.query(
      `select id from public.lmc_transactions where idempotency_key = $1`,
      [key],
    );
    await purgeLedgerRows(a, badTx.map((r) => r.id as string));
    await restoreMigration(a); // recreates constraint via table (already exists) …
    // The dropped table CONSTRAINT is not auto-recreated by `create table if
    // not exists` — restore it explicitly, then re-verify.
    await a.query(
      `alter table public.lmc_transactions
         add constraint lmc_tx_idempotency unique (account_id, idempotency_key)`,
    );
    const c3 = await admin();
    const c4 = await admin();
    const key2 = `ncb-fixed-${RUN}`;
    const settled2 = await Promise.allSettled([
      c3.query(`select public.lmc_spend_v1(1000, 'fixed dup race', $1, $2, null, $2)`, [key2, u6]),
      c4.query(`select public.lmc_spend_v1(1000, 'fixed dup race', $1, $2, null, $2)`, [key2, u6]),
    ]);
    await c3.end();
    await c4.end();
    const { rows: fixed } = await a.query(
      `select count(*)::int as n from public.lmc_transactions where idempotency_key = $1`,
      [key2],
    );
    record(
      "NCB2-restored-idempotency-holds",
      fixed[0].n === 1,
      `same key now produces ${fixed[0].n} transaction`,
    );
  }

  // NC-C: strip the is_admin() gate from lmc_admin_grant_v1 → non-admin grant.
  {
    await a.query(WEAKENED_ADMIN_GRANT_NO_GATE);
    const nonAdmin = await asUser(u2);
    let sneakyTx: string | null = null;
    try {
      const { rows } = await nonAdmin.query(
        `select public.lmc_admin_grant_v1($1, 100, 'sneaky', 'proof-campaign', now() + interval '10 days', 'ncc-${RUN}') as r`,
        [`${RUN}-u1@fixture.local`],
      );
      sneakyTx = rows[0].r.transaction_id as string;
    } catch {
      /* stays null */
    }
    await nonAdmin.end();
    record(
      "NCC1-weakened-admin-gate-permits",
      sneakyTx !== null,
      `non-admin grant ${sneakyTx ? "SUCCEEDED (gate removed → failure visible)" : "still refused (unexpected)"}`,
    );
    if (sneakyTx) await purgeLedgerRows(a, [sneakyTx]);
    await restoreMigration(a);
    const nonAdmin2 = await asUser(u2);
    const denied = await expectError(
      () =>
        nonAdmin2.query(
          `select public.lmc_admin_grant_v1($1, 100, 'sneaky', 'proof-campaign', now() + interval '10 days', 'ncc2-${RUN}')`,
          [`${RUN}-u1@fixture.local`],
        ),
      "Admin only",
    );
    await nonAdmin2.end();
    record("NCC2-restored-admin-gate-holds", denied.ok, denied.msg.slice(0, 60));
  }

  // NC-D: add insert grant + policy → direct authenticated insert succeeds.
  {
    await a.query(`grant insert on public.lmc_transactions to authenticated`);
    await a.query(
      `create policy lmc_nc_insert on public.lmc_transactions
         for insert to authenticated with check (true)`,
    );
    const acc1 = await accountOf(a, u1);
    const userConn = await asUser(u1);
    let inserted = false;
    let insertedId: string | null = null;
    try {
      const { rows } = await userConn.query(
        `insert into public.lmc_transactions (account_id, kind, amount_cents, idempotency_key, reason)
         values ($1, 'purchased', 100, 'ncd-${RUN}', 'weakened direct insert')
         returning id`,
        [acc1],
      );
      inserted = true;
      insertedId = rows[0].id as string;
    } catch {
      /* not inserted */
    }
    await userConn.end();
    record(
      "NCD1-weakened-rls-permits-insert",
      inserted,
      inserted ? "direct insert SUCCEEDED (guard removed → failure visible)" : "still refused (unexpected)",
    );
    await a.query(`drop policy if exists lmc_nc_insert on public.lmc_transactions`);
    await a.query(`revoke insert on public.lmc_transactions from authenticated`);
    if (insertedId) await purgeLedgerRows(a, [insertedId]);
    const userConn2 = await asUser(u1);
    const refused = await expectError(
      () =>
        userConn2.query(
          `insert into public.lmc_transactions (account_id, kind, amount_cents, idempotency_key, reason)
           values ($1, 'purchased', 100, 'ncd2-${RUN}', 'direct insert')`,
          [acc1],
        ),
      "permission denied",
    );
    await userConn2.end();
    record("NCD2-restored-rls-refuses-insert", refused.ok, refused.msg.slice(0, 60));
  }

  // NC-E: permissive read policy → foreign read succeeds; removed → refused.
  {
    await a.query(
      `create policy lmc_nc_read_all on public.lmc_transactions
         for select to authenticated using (account_id is not null)`,
    );
    const acc1 = await accountOf(a, u1);
    const foreign = await asUser(u2);
    const { rows: weak } = await foreign.query(
      `select count(*)::int as n from public.lmc_transactions where account_id = $1`,
      [acc1],
    );
    await foreign.end();
    record(
      "NCE1-weakened-policy-permits-foreign-read",
      weak[0].n > 0,
      `foreign user sees ${weak[0].n} rows with permissive policy (guard removed → failure visible)`,
    );
    await a.query(`drop policy if exists lmc_nc_read_all on public.lmc_transactions`);
    const foreign2 = await asUser(u2);
    const { rows: fixed } = await foreign2.query(
      `select count(*)::int as n from public.lmc_transactions where account_id = $1`,
      [acc1],
    );
    await foreign2.end();
    record(
      "NCE2-restored-policy-refuses-foreign-read",
      fixed[0].n === 0,
      `foreign user sees ${fixed[0].n} rows after restore`,
    );
  }

  // NC-F: flip lmc_referrals_enabled → referral insert passes; flip back → shut.
  {
    const acc1 = await accountOf(a, u1);
    await setFlag(a, "lmc_referrals_enabled", true);
    let refTx: string | null = null;
    try {
      const { rows } = await a.query(
        `insert into public.lmc_transactions (account_id, kind, amount_cents, idempotency_key, reason)
         values ($1, 'referral_reward', 100, 'ncf-${RUN}', 'flag flipped in scratch')
         returning id`,
        [acc1],
      );
      refTx = rows[0].id as string;
    } catch {
      /* stays null */
    }
    record(
      "NCF1-enabled-flag-permits-referral",
      refTx !== null,
      refTx ? "referral tx inserted with flag=true (control works)" : "unexpected refusal",
    );
    if (refTx) await purgeLedgerRows(a, [refTx]);
    await setFlag(a, "lmc_referrals_enabled", false);
    const shut = await expectError(
      () =>
        a.query(
          `insert into public.lmc_transactions (account_id, kind, amount_cents, idempotency_key, reason)
           values ($1, 'referral_reward', 100, 'ncf2-${RUN}', 'flag back off')`,
          [acc1],
        ),
      "lmc_referrals_disabled",
    );
    record("NCF2-disabled-flag-refuses-referral", shut.ok, shut.msg.slice(0, 60));
  }

  // ── P22/P23: rollback removes only Wagon 1 objects; re-apply clean ────────
  {
    const { rows: profBefore } = await a.query(
      `select count(*)::int as n from public.profiles`,
    );
    // Without the scratch override, a populated ledger REFUSES to roll back
    // (AGENTS.md zero-row rule — owner-only decision in production).
    await a.query(`select set_config('lmc.force_rollback', 'off', false)`);
    const refused = await expectError(
      () => a.query(readFileSync(ROLLBACK_PATH, "utf8")),
      "lmc_rollback_refused",
    );
    // The refused batch aborted inside its own `begin;` — clear the session.
    await a.query(`rollback`).catch(() => {});
    record(
      "P22a-populated-rollback-refused-without-override",
      refused.ok,
      refused.msg.slice(0, 80),
    );
    await a.query(
      `select set_config('lmc.force_rollback', 'lmc-ledger-removal-approved', false)`,
    );
    await a.query(readFileSync(ROLLBACK_PATH, "utf8"));
    const { rows: gone } = await a.query(
      `select
         to_regclass('public.lmc_transactions') as t,
         to_regclass('public.lmc_accounts') as acc,
         to_regclass('public.lmc_lots') as lots,
         to_regclass('public.lmc_lot_consumptions') as cons,
         to_regclass('public.lmc_settings') as st`,
    );
    const { rows: intact } = await a.query(
      `select
         to_regclass('public.journal_entries') as journal,
         to_regclass('public.audit_logs') as audit,
         to_regclass('public.plans') as plans,
         (select count(*)::int from public.profiles) as profiles`,
    );
    const allGone = Object.values(gone[0]).every((v) => v === null);
    record(
      "P22-rollback-only-wagon1",
      allGone &&
        intact[0].journal !== null &&
        intact[0].audit !== null &&
        intact[0].plans !== null &&
        intact[0].profiles === profBefore[0].n,
      `lmc objects gone=${allGone}, unrelated intact (profiles ${intact[0].profiles})`,
    );

    // P22b: a SECOND rollback run — with every LMC relation absent — must
    // succeed cleanly (idempotent partial-state cleanup).
    let secondRunOk = true;
    let secondRunMsg = "second rollback run succeeded on absent tables";
    try {
      await a.query(readFileSync(ROLLBACK_PATH, "utf8"));
    } catch (e) {
      secondRunOk = false;
      secondRunMsg = errMsg(e).slice(0, 80);
      await a.query(`rollback`).catch(() => {});
    }
    record("P22b-rollback-idempotent-on-absent-tables", secondRunOk, secondRunMsg);

    await restoreMigration(a);
    const { rows: back } = await a.query(
      `select to_regclass('public.lmc_transactions') as t,
              (select count(*)::int from public.lmc_settings where enabled = false) as off_flags`,
    );
    const u7 = await makePerson(a, "p23");
    await setFlag(a, "lmc_purchases_enabled", true);
    const { rows: smoke } = await a.query(
      `select public.lmc_record_purchase_v1(100, 'p23', 'p23-${RUN}', $1, null) as r`,
      [u7],
    );
    record(
      "P23-reapply-clean",
      back[0].t !== null && back[0].off_flags === 6 && smoke[0].r.kind === "purchased",
      `objects back, 6/6 flags re-seeded false, smoke purchase ok`,
    );
  }

  await a.end();

  const failed = results.filter((r) => !r.pass);
  console.log(
    `\n${results.length - failed.length}/${results.length} proofs passed`,
  );
  if (failed.length > 0) {
    console.error("FAILED:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
}

/** lmc_require_flag_v1 WITHOUT the FOR SHARE row lock — NEGATIVE CONTROL
 *  ONLY (scratch DB), restored via the real migration file right after. */
const WEAKENED_REQUIRE_FLAG_NO_LOCK = `
create or replace function public.lmc_require_flag_v1(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_enabled boolean;
begin
  -- WEAKENED: plain read, no FOR SHARE.
  select s.enabled into v_enabled
    from public.lmc_settings s
   where s.key = p_key;
  if not coalesce(v_enabled, false) then
    raise exception '%', replace(p_key, '_enabled', '_disabled')
      using errcode = '42501';
  end if;
end;
$fn$;
`;

/** lmc_spend_v1 with the account FOR UPDATE lock removed and a widened race
 *  window — NEGATIVE CONTROL ONLY (scratch DB), restored via the real
 *  migration file right after. */
const WEAKENED_SPEND_NO_LOCK = `
create or replace function public.lmc_spend_v1(
  p_amount_cents bigint,
  p_reason text,
  p_idempotency_key text,
  p_profile_id uuid default null,
  p_company_id uuid default null,
  p_actor_profile_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_account uuid;
  v_tx uuid;
  v_remaining bigint;
  v_take bigint;
  v_available bigint;
  r record;
begin
  select id into v_account from public.lmc_accounts
   where (p_profile_id is not null and profile_id = p_profile_id)
      or (p_company_id is not null and company_id = p_company_id);
  if v_account is null then
    raise exception 'lmc_insufficient_balance';
  end if;
  -- WEAKENED: no FOR UPDATE lock, artificial check→write gap.
  select coalesce(sum(
    case when l.expires_at is not null and l.expires_at <= now() then 0
         else l.amount_cents - coalesce(c.consumed, 0) end), 0)
    into v_available
    from public.lmc_lots l
    left join (
      select lot_id, sum(amount_cents) as consumed
      from public.lmc_lot_consumptions group by lot_id) c on c.lot_id = l.id
   where l.account_id = v_account;
  if v_available < p_amount_cents then
    raise exception 'lmc_insufficient_balance: available % < requested %',
      v_available, p_amount_cents;
  end if;
  perform pg_sleep(0.2);
  insert into public.lmc_transactions
    (account_id, kind, amount_cents, idempotency_key, reason)
  values (v_account, 'spend', p_amount_cents, p_idempotency_key, p_reason)
  returning id into v_tx;
  v_remaining := p_amount_cents;
  for r in
    select l.id as lot_id,
           l.amount_cents - coalesce(c.consumed, 0) as lot_remaining
      from public.lmc_lots l
      left join (
        select lot_id, sum(amount_cents) as consumed
        from public.lmc_lot_consumptions group by lot_id) c on c.lot_id = l.id
     where l.account_id = v_account
       and (l.expires_at is null or l.expires_at > now())
       and l.amount_cents - coalesce(c.consumed, 0) > 0
     order by (l.expires_at is null) asc, l.expires_at asc, l.created_at asc, l.id asc
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, r.lot_remaining);
    insert into public.lmc_lot_consumptions
      (account_id, lot_id, transaction_id, consumption_kind, amount_cents)
    values (v_account, r.lot_id, v_tx, 'spend', v_take);
    v_remaining := v_remaining - v_take;
  end loop;
  return jsonb_build_object('transaction_id', v_tx, 'account_id', v_account,
                            'kind', 'spend', 'amount_cents', p_amount_cents,
                            'already_processed', false);
end;
$fn$;
`;

/** lmc_admin_grant_v1 with the is_admin() gate stripped — NEGATIVE CONTROL
 *  ONLY (scratch DB), restored via the real migration file right after. */
const WEAKENED_ADMIN_GRANT_NO_GATE = `
create or replace function public.lmc_admin_grant_v1(
  p_recipient_email text,
  p_amount_cents bigint,
  p_reason text,
  p_campaign text,
  p_expires_at timestamptz,
  p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
  v_recipient uuid;
  v_email text;
  v_account uuid;
  v_tx uuid;
begin
  -- WEAKENED: is_admin() gate removed.
  select u.id, u.email into v_recipient, v_email
    from auth.users u
   where lower(u.email) = lower(trim(p_recipient_email))
     and u.email_confirmed_at is not null;
  if v_recipient is null then
    raise exception 'lmc_recipient_not_found_or_unverified';
  end if;
  v_account := public.lmc_ensure_account_v1(p_profile_id => v_recipient);
  perform 1 from public.lmc_accounts where id = v_account for update;
  insert into public.lmc_transactions
    (account_id, kind, amount_cents, idempotency_key, campaign, reason,
     actor_profile_id, recipient_email_at_grant)
  values (v_account, 'admin_grant', p_amount_cents, p_idempotency_key,
          p_campaign, p_reason, uid, v_email)
  returning id into v_tx;
  insert into public.lmc_lots
    (account_id, transaction_id, source_kind, amount_cents, expires_at)
  values (v_account, v_tx, 'admin_grant', p_amount_cents, p_expires_at);
  return jsonb_build_object('transaction_id', v_tx, 'account_id', v_account,
                            'kind', 'admin_grant',
                            'amount_cents', p_amount_cents,
                            'already_processed', false);
end;
$fn$;
`;

main().catch((e) => {
  console.error("proof harness crashed:", e);
  process.exit(1);
});
