/**
 * W0 — Invite-Ready Closure Train v1: REAL-DATABASE concurrency + atomicity
 * proof for `journal_entry_supersede_v2` (migration 20260720100000).
 *
 * Runs against the LOCAL supabase stack only (supabase start && supabase db
 * reset). Never against production. Uses direct Postgres connections with
 * transaction-local `request.jwt.claims` to act as the fixture worker, which
 * is exactly how PostgREST invokes the RPC.
 *
 * Proof matrix (train Wagon 0 "Required concurrency proof"):
 *   1. Two SIMULTANEOUS saves of the same live entry — one wins, one gets
 *      `entry_superseded`, exactly ONE live descendant, no forked chain.
 *   2. Same race on a CONFIRMED entry — one correction wins, second refused.
 *   3. Selected taxonomy skill absent from text — worker_skills verified=false
 *      + journal_entry_skills link exist after commit (atomic evidence).
 *   4. Transient failure injected into the worker_skills write — RPC fails,
 *      NO new live entry, old entry stays current, retry succeeds.
 *   5. Same injection on the journal_entry_skills link write.
 *   6. Stale save (already superseded) → structured `entry_superseded`.
 *   7. Unknown taxonomy slug → `skill_slug_unknown`, nothing persisted.
 *
 * Usage:  npx tsx scripts/db-proof-journal-atomic-supersede.mts
 * Env:    DB_URL (default local supabase: postgresql://postgres:postgres@127.0.0.1:54322/postgres)
 */

import { Client } from "pg";

const DB_URL =
  process.env.DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// HARD local-only guard (security review P2): this harness creates fixture
// auth users and installs failure-injection triggers on real tables — it must
// be impossible to point at production by accident. Localhost only, ever.
{
  const host = new URL(DB_URL.replace(/^postgres(ql)?:/, "http:")).hostname;
  const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (!LOCAL_HOSTS.has(host)) {
    console.error(
      `refusing to run: DB_URL host "${host}" is not local. ` +
        "This proof harness only ever runs against a scratch/local database.",
    );
    process.exit(1);
  }
}

const results: { name: string; pass: boolean; detail: string }[] = [];

function record(name: string, pass: boolean, detail: string): void {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function admin(): Promise<Client> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  return c;
}

/** Open a connection acting as `profileId` (authenticated role claims). */
async function asUser(profileId: string): Promise<Client> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  // Session-local claims: every statement on this connection sees auth.uid().
  await c.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: profileId, role: "authenticated" }),
  ]);
  return c;
}

type Fixture = {
  profileId: string;
  workerId: string;
  engagementId: string;
};

async function makeFixture(a: Client, tag: string): Promise<Fixture> {
  const { rows: u } = await a.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
             'w0-proof-' || $1 || '@fixture.local', 'x', now(), '{"provider":"email"}', '{}', now(), now())
     returning id`,
    [tag],
  );
  const profileId = u[0].id as string;
  await a.query(
    `insert into public.profiles (id, active_role, full_name) values ($1, 'worker', 'W0 Proof ' || $2)
     on conflict (id) do update set active_role = 'worker'`,
    [profileId, tag],
  );
  // A role trigger may have auto-created the worker row — upsert either way.
  const { rows: w } = await a.query(
    `insert into public.workers (profile_id) values ($1)
     on conflict (profile_id) do update set profile_id = excluded.profile_id
     returning id`,
    [profileId],
  );
  const workerId = w[0].id as string;
  const { rows: e } = await a.query(
    `insert into public.engagement_contexts (profile_id, relationship_slug, title, hash_self)
     values ($1::uuid, 'freelancer', 'W0 proof context', md5($1 || clock_timestamp()::text))
     returning id`,
    [profileId],
  );
  return { profileId, workerId, engagementId: e[0].id as string };
}

async function makeEntry(
  a: Client,
  f: Fixture,
  text: string,
): Promise<string> {
  const { rows } = await a.query(
    `insert into public.journal_entries
       (worker_id, engagement_context_id, entry_type_slug, original_text, original_language, hash_self, visibility_scope)
     values ($1, $2, 'freeform', $3, 'lt', md5($3 || clock_timestamp()::text), 'closed')
     returning id`,
    [f.workerId, f.engagementId, text],
  );
  return rows[0].id as string;
}

function supersedeSql(oldId: string, f: Fixture, text: string, opts?: {
  selected?: string[];
  rejected?: string[];
}): { sql: string; params: unknown[] } {
  return {
    sql: `select public.journal_entry_supersede_v2(
      $1::uuid, $2::uuid, 'freeform', null, $3, 'lt', md5($3 || clock_timestamp()::text), 'closed',
      '[]'::jsonb, $4::text[], $5::text[]) as id`,
    params: [oldId, f.engagementId, text, opts?.selected ?? [], opts?.rejected ?? []],
  };
}

async function liveDescendants(a: Client, workerId: string): Promise<string[]> {
  const { rows } = await a.query(
    `select id from public.journal_entries
      where worker_id = $1 and deleted_at is null and superseded_by is null
      order by created_at`,
    [workerId],
  );
  return rows.map((r) => r.id as string);
}

async function main(): Promise<void> {
  const a = await admin();
  const fixtureTag = `run-${Date.now()}`;
  console.log(`— W0 DB proof (${DB_URL.replace(/:[^:@/]+@/, ":[redacted]@")}) —`);

  // ── Proof 1: two SIMULTANEOUS saves of the same live entry ────────────────
  {
    const f = await makeFixture(a, `${fixtureTag}-p1`);
    const entryA = await makeEntry(a, f, "pirmas įrašas");
    const c1 = await asUser(f.profileId);
    const c2 = await asUser(f.profileId);
    const s1 = supersedeSql(entryA, f, "pakeitimas iš pirmo lango");
    const s2 = supersedeSql(entryA, f, "pakeitimas iš antro lango");
    // Fire both at the same moment; the row lock serialises them.
    const [r1, r2] = await Promise.allSettled([
      c1.query(s1.sql, s1.params),
      c2.query(s2.sql, s2.params),
    ]);
    const ok = [r1, r2].filter((r) => r.status === "fulfilled");
    const failed = [r1, r2].filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    const live = await liveDescendants(a, f.workerId);
    const superseded = failed.every((r) =>
      String(r.reason?.message ?? "").includes("entry_superseded"),
    );
    record(
      "P1 concurrent supersede of live entry",
      ok.length === 1 && failed.length === 1 && superseded && live.length === 1,
      `winners=${ok.length} losers=${failed.length} loserErr=${failed.map((r) => String(r.reason?.message).slice(0, 40)).join(",")} live=${live.length}`,
    );
    // No orphan pointer fork: old entry points at exactly the winner.
    const { rows: oldRow } = await a.query(
      `select superseded_by from public.journal_entries where id = $1`,
      [entryA],
    );
    const winnerId =
      ok.length === 1 && ok[0].status === "fulfilled"
        ? (ok[0].value.rows[0].id as string)
        : null;
    record(
      "P1 chain pointer intact",
      oldRow[0].superseded_by === winnerId,
      `superseded_by matches winner: ${oldRow[0].superseded_by === winnerId}`,
    );
    await c1.end();
    await c2.end();
  }

  // ── Proof 2: same race on a CONFIRMED entry (correction lane) ─────────────
  {
    const f = await makeFixture(a, `${fixtureTag}-p2`);
    const entryA = await makeEntry(a, f, "patvirtintas įrašas");
    // Manager-shaped confirmation row (admin insert — fixture only).
    const { rows: conf } = await a.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               'w0-proof-conf-' || $1 || '@fixture.local', 'x', now(), '{"provider":"email"}', '{}', now(), now())
       returning id`,
      [fixtureTag],
    );
    await a.query(
      `insert into public.profiles (id, active_role, full_name) values ($1, 'company', 'W0 Confirmer')
       on conflict (id) do update set active_role = 'company'`,
      [conf[0].id],
    );
    const { rows: confCtx } = await a.query(
      `insert into public.engagement_contexts (profile_id, relationship_slug, title, hash_self)
       values ($1::uuid, 'manager', 'W0 confirmer context', md5($1 || clock_timestamp()::text))
       returning id`,
      [conf[0].id],
    );
    await a.query(
      `insert into public.journal_entry_confirmations
         (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope)
       values ($1, $2, $3, 'manager', '{"scope":"w0-proof"}'::jsonb)`,
      [entryA, conf[0].id, confCtx[0].id],
    );
    const c1 = await asUser(f.profileId);
    const c2 = await asUser(f.profileId);
    const s1 = supersedeSql(entryA, f, "pataisymas 1");
    const s2 = supersedeSql(entryA, f, "pataisymas 2");
    const [r1, r2] = await Promise.allSettled([
      c1.query(s1.sql, s1.params),
      c2.query(s2.sql, s2.params),
    ]);
    const okCount = [r1, r2].filter((r) => r.status === "fulfilled").length;
    const loser = [r1, r2].find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    const { rows: liveCorr } = await a.query(
      `select count(*)::int as n from public.journal_entries
        where correction_of = $1 and deleted_at is null and superseded_by is null`,
      [entryA],
    );
    record(
      "P2 concurrent correction of confirmed entry",
      okCount === 1 &&
        liveCorr[0].n === 1 &&
        String(loser?.reason?.message ?? "").includes("entry_superseded"),
      `winners=${okCount} liveCorrections=${liveCorr[0].n}`,
    );
    await c1.end();
    await c2.end();
  }

  // ── Proof 3: selected taxonomy skill absent from text → durable evidence ──
  {
    const f = await makeFixture(a, `${fixtureTag}-p3`);
    const entryA = await makeEntry(a, f, "tekstas be įgūdžio pavadinimo");
    const { rows: skill } = await a.query(
      `select id, slug from public.skills where is_active is not false limit 1`,
    );
    const slug = skill[0].slug as string;
    const c1 = await asUser(f.profileId);
    const s = supersedeSql(entryA, f, "tekstas be įgūdžio pavadinimo v2", {
      selected: [slug],
    });
    const { rows: newRows } = await c1.query(s.sql, s.params);
    const newId = newRows[0].id as string;
    const { rows: ws } = await a.query(
      `select verified, source from public.worker_skills where worker_id = $1 and skill_id = $2`,
      [f.workerId, skill[0].id],
    );
    const { rows: link } = await a.query(
      `select count(*)::int as n from public.journal_entry_skills
        where journal_entry_id = $1 and skill_id = $2`,
      [newId, skill[0].id],
    );
    record(
      "P3 selected skill evidence atomic + honest",
      ws.length === 1 &&
        ws[0].verified === false &&
        ws[0].source === "self_declared" &&
        link[0].n === 1,
      `worker_skills verified=${ws[0]?.verified} source=${ws[0]?.source} links=${link[0].n} slug=${slug}`,
    );
    await c1.end();
  }

  // ── Proofs 4+5: injected failures roll back EVERYTHING ────────────────────
  for (const [proof, table] of [
    ["P4", "worker_skills"],
    ["P5", "journal_entry_skills"],
  ] as const) {
    const f = await makeFixture(a, `${fixtureTag}-${proof.toLowerCase()}`);
    const entryA = await makeEntry(a, f, "įrašas prieš gedimą");
    const { rows: skill } = await a.query(
      `select id, slug from public.skills where is_active is not false limit 1`,
    );
    const slug = skill[0].slug as string;
    const trigName = `w0_proof_fail_${proof.toLowerCase()}`;
    await a.query(`
      create or replace function public.${trigName}_fn() returns trigger
      language plpgsql as $$ begin raise exception 'w0_injected_transient_failure'; end; $$;
    `);
    await a.query(
      `create trigger ${trigName} before insert on public.${table}
        for each row execute function public.${trigName}_fn()`,
    );
    const c1 = await asUser(f.profileId);
    const s = supersedeSql(entryA, f, "keitimas su gedimu", { selected: [slug] });
    let failedAsExpected = false;
    try {
      await c1.query(s.sql, s.params);
    } catch (e) {
      failedAsExpected = String((e as Error).message).includes(
        "w0_injected_transient_failure",
      );
    }
    const live = await liveDescendants(a, f.workerId);
    const { rows: oldRow } = await a.query(
      `select superseded_by from public.journal_entries where id = $1`,
      [entryA],
    );
    const { rows: orphanMetrics } = await a.query(
      `select count(*)::int as n from public.journal_entry_metrics m
        join public.journal_entries je on je.id = m.entry_id
        where je.worker_id = $1 and m.entry_id <> $2`,
      [f.workerId, entryA],
    );
    // Drop the injection and retry — must succeed idempotently.
    await a.query(`drop trigger if exists ${trigName} on public.${table}`);
    await a.query(`drop function if exists public.${trigName}_fn()`);
    let retriedOk = false;
    let retryId: string | null = null;
    try {
      const { rows } = await c1.query(s.sql, s.params);
      retryId = rows[0].id as string;
      retriedOk = true;
    } catch {
      retriedOk = false;
    }
    const liveAfter = await liveDescendants(a, f.workerId);
    record(
      `${proof} injected failure on ${table} rolls back + retry succeeds`,
      failedAsExpected &&
        live.length === 1 &&
        live[0] === entryA &&
        oldRow[0].superseded_by === null &&
        orphanMetrics[0].n === 0 &&
        retriedOk &&
        liveAfter.length === 1 &&
        liveAfter[0] === retryId,
      `failed=${failedAsExpected} liveDuring=${live.length} oldCurrent=${oldRow[0].superseded_by === null} orphans=${orphanMetrics[0].n} retry=${retriedOk}`,
    );
    await c1.end();
  }

  // ── Proof 6: stale save (already superseded) → structured error ───────────
  {
    const f = await makeFixture(a, `${fixtureTag}-p6`);
    const entryA = await makeEntry(a, f, "senas įrašas");
    const c1 = await asUser(f.profileId);
    const s1 = supersedeSql(entryA, f, "pirmas keitimas");
    await c1.query(s1.sql, s1.params);
    let staleErr = "";
    try {
      const s2 = supersedeSql(entryA, f, "pavėlavęs keitimas");
      await c1.query(s2.sql, s2.params);
    } catch (e) {
      staleErr = String((e as Error).message);
    }
    record(
      "P6 stale save refused with entry_superseded",
      staleErr.includes("entry_superseded"),
      `error=${staleErr.slice(0, 60)}`,
    );
    await c1.end();
  }

  // ── Proof 7: unknown slug → skill_slug_unknown, nothing persisted ─────────
  {
    const f = await makeFixture(a, `${fixtureTag}-p7`);
    const entryA = await makeEntry(a, f, "įrašas su blogu įgūdžiu");
    const c1 = await asUser(f.profileId);
    let err = "";
    try {
      const s = supersedeSql(entryA, f, "keitimas", {
        selected: ["definitely_not_a_real_skill_slug"],
      });
      await c1.query(s.sql, s.params);
    } catch (e) {
      err = String((e as Error).message);
    }
    const live = await liveDescendants(a, f.workerId);
    record(
      "P7 unknown slug fails whole save",
      err.includes("skill_slug_unknown") && live.length === 1 && live[0] === entryA,
      `error=${err.slice(0, 50)} live=${live.length}`,
    );
    await c1.end();
  }

  await a.end();

  const failed = results.filter((r) => !r.pass);
  console.log(
    `\n— RESULT: ${results.length - failed.length}/${results.length} proofs passed —`,
  );
  if (failed.length > 0) {
    console.error("FAILED:", failed.map((f) => f.name).join("; "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("proof harness error:", e);
  process.exit(1);
});
