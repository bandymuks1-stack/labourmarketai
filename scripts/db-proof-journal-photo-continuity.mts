/**
 * W1 — Invite-Ready Closure Train v1: REAL-DATABASE proof for journal photo
 * attachment continuity (migration 20260720150000_journal_photo_continuity_v1).
 *
 * LOCAL scratch database ONLY (hard localhost guard below) — never production.
 *
 * Proof matrix (train Wagon 1 "Required proof"):
 *   1. entry with photo → compact-edit supersede → photo metadata follows the
 *      NEW live entry; storage_path unchanged (one immutable object).
 *   2. second save → still exactly ONE logical attachment, same object,
 *      no duplicate metadata rows.
 *   3. transient failure injected into the photo move → WHOLE save rolls
 *      back (no new live entry, photo stays on old entry); retry succeeds.
 *   4. confirmed original keeps its photo through a correction (old row stays
 *      visible with its evidence; correction has none).
 *   5. cross-worker: another worker cannot supersede the entry (ownership
 *      raise) — photo never moves across workers.
 *   6. removed/failed photo rows do NOT ride the supersede (history stays).
 *
 * Usage: npx tsx scripts/db-proof-journal-photo-continuity.mts
 * Env:   DB_URL (default postgresql://postgres:postgres@127.0.0.1:54322/postgres)
 */

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

const results: { name: string; pass: boolean; detail: string }[] = [];
const record = (name: string, pass: boolean, detail: string) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};

async function admin(): Promise<Client> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  return c;
}
async function asUser(profileId: string): Promise<Client> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  await c.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: profileId, role: "authenticated" }),
  ]);
  return c;
}

type Fixture = { profileId: string; workerId: string; engagementId: string };

async function makeFixture(a: Client, tag: string): Promise<Fixture> {
  const { rows: u } = await a.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
             'w1-proof-' || $1 || '@fixture.local', 'x', now(), '{"provider":"email"}', '{}', now(), now())
     returning id`,
    [tag],
  );
  const profileId = u[0].id as string;
  await a.query(
    `insert into public.profiles (id, active_role, full_name) values ($1, 'worker', 'W1 Proof ' || $2)
     on conflict (id) do update set active_role = 'worker'`,
    [profileId, tag],
  );
  const { rows: w } = await a.query(
    `insert into public.workers (profile_id) values ($1)
     on conflict (profile_id) do update set profile_id = excluded.profile_id
     returning id`,
    [profileId],
  );
  const { rows: e } = await a.query(
    `insert into public.engagement_contexts (profile_id, relationship_slug, title, hash_self)
     values ($1::uuid, 'freelancer', 'W1 proof context', md5($1 || clock_timestamp()::text))
     returning id`,
    [profileId],
  );
  return { profileId, workerId: w[0].id as string, engagementId: e[0].id as string };
}

async function makeEntry(a: Client, f: Fixture, text: string): Promise<string> {
  const { rows } = await a.query(
    `insert into public.journal_entries
       (worker_id, engagement_context_id, entry_type_slug, original_text, original_language, hash_self, visibility_scope)
     values ($1, $2, 'freeform', $3, 'lt', md5($3 || clock_timestamp()::text), 'closed')
     returning id`,
    [f.workerId, f.engagementId, text],
  );
  return rows[0].id as string;
}

/** Register a photo metadata row the way the production RPC does (same path
 *  contract), acting as the entry owner. */
async function addPhoto(
  userConn: Client,
  f: Fixture,
  entryId: string,
  status = "uploaded",
): Promise<{ photoId: string; path: string }> {
  const { rows } = await userConn.query(
    `select public.register_journal_entry_photo(
       gen_random_uuid(), $1::uuid, 'darbas.jpg', 'image/jpeg', 123456,
       $2 || '/' || $1 || '/' || gen_random_uuid() || '/darbas.jpg') as id`,
    [entryId, f.profileId],
  );
  const photoId = rows[0].id as string;
  if (status !== "uploaded") {
    await userConn.query(
      `update public.journal_entry_photos set upload_status = $2 where id = $1`,
      [photoId, status],
    );
  }
  const { rows: p } = await userConn.query(
    `select storage_path from public.journal_entry_photos where id = $1`,
    [photoId],
  );
  return { photoId, path: p[0].storage_path as string };
}

function supersedeSql(oldId: string, f: Fixture, text: string) {
  return {
    sql: `select public.journal_entry_supersede_v2(
      $1::uuid, $2::uuid, 'freeform', null, $3, 'lt', md5($3 || clock_timestamp()::text), 'closed',
      '[]'::jsonb, '{}'::text[], '{}'::text[]) as id`,
    params: [oldId, f.engagementId, text],
  };
}

async function main(): Promise<void> {
  const a = await admin();
  const tag = `run-${Date.now()}`;
  console.log(`— W1 photo-continuity DB proof —`);

  // ── P1+P2: photo follows the live entry across TWO saves ────────────────
  {
    const f = await makeFixture(a, `${tag}-p1`);
    const A = await makeEntry(a, f, "įrašas su nuotrauka");
    const c = await asUser(f.profileId);
    const { photoId, path } = await addPhoto(c, f, A);

    const s1 = supersedeSql(A, f, "pirmas keitimas");
    const B = (await c.query(s1.sql, s1.params)).rows[0].id as string;
    const { rows: afterFirst } = await a.query(
      `select entry_id, storage_path, upload_status from public.journal_entry_photos where id = $1`,
      [photoId],
    );
    record(
      "P1 photo metadata follows the new live entry",
      afterFirst[0].entry_id === B && afterFirst[0].storage_path === path,
      `entry=${afterFirst[0].entry_id === B ? "B" : "OLD"} pathUnchanged=${afterFirst[0].storage_path === path}`,
    );

    const s2 = supersedeSql(B, f, "antras keitimas");
    const C = (await c.query(s2.sql, s2.params)).rows[0].id as string;
    const { rows: allRows } = await a.query(
      `select count(*)::int as n from public.journal_entry_photos where profile_id = $1`,
      [f.profileId],
    );
    const { rows: onLive } = await a.query(
      `select count(*)::int as n from public.journal_entry_photos where entry_id = $1`,
      [C],
    );
    record(
      "P2 second save: ONE logical attachment, no duplicates",
      allRows[0].n === 1 && onLive[0].n === 1,
      `metadataRows=${allRows[0].n} onLiveEntry=${onLive[0].n}`,
    );
    await c.end();
  }

  // ── P3: injected failure on the photo move rolls back the WHOLE save ────
  {
    const f = await makeFixture(a, `${tag}-p3`);
    const A = await makeEntry(a, f, "įrašas prieš gedimą");
    const c = await asUser(f.profileId);
    const { photoId } = await addPhoto(c, f, A);
    await a.query(`
      create or replace function public.w1_fail_fn() returns trigger
      language plpgsql as $$ begin raise exception 'w1_injected_failure'; end; $$;`);
    await a.query(
      `create trigger w1_fail before update on public.journal_entry_photos
        for each row execute function public.w1_fail_fn()`,
    );
    let failed = false;
    const s = supersedeSql(A, f, "keitimas su gedimu");
    try {
      await c.query(s.sql, s.params);
    } catch (e) {
      failed = String((e as Error).message).includes("w1_injected_failure");
    }
    const { rows: live } = await a.query(
      `select count(*)::int as n from public.journal_entries
        where worker_id = $1 and deleted_at is null and superseded_by is null`,
      [f.workerId],
    );
    const { rows: photo } = await a.query(
      `select entry_id from public.journal_entry_photos where id = $1`,
      [photoId],
    );
    await a.query(`drop trigger if exists w1_fail on public.journal_entry_photos`);
    await a.query(`drop function if exists public.w1_fail_fn()`);
    let retryOk = false;
    let retryId = "";
    try {
      const { rows } = await c.query(s.sql, s.params);
      retryId = rows[0].id as string;
      retryOk = true;
    } catch { /* retryOk stays false */ }
    const { rows: photoAfter } = await a.query(
      `select entry_id from public.journal_entry_photos where id = $1`,
      [photoId],
    );
    record(
      "P3 photo-move failure rolls back whole save; retry succeeds",
      failed && live[0].n === 1 && photo[0].entry_id === A && retryOk && photoAfter[0].entry_id === retryId,
      `failed=${failed} liveDuring=${live[0].n} photoStayed=${photo[0].entry_id === A} retry=${retryOk}`,
    );
    await c.end();
  }

  // ── P4: confirmed original keeps its photo through a correction ─────────
  {
    const f = await makeFixture(a, `${tag}-p4`);
    const A = await makeEntry(a, f, "patvirtintas su nuotrauka");
    const c = await asUser(f.profileId);
    const { photoId } = await addPhoto(c, f, A);
    // Confirmation fixture (admin insert).
    const { rows: cu } = await a.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               'w1-proof-conf-' || $1 || '@fixture.local', 'x', now(), '{"provider":"email"}', '{}', now(), now())
       returning id`,
      [tag],
    );
    await a.query(
      `insert into public.profiles (id, active_role, full_name) values ($1, 'company', 'W1 Confirmer')
       on conflict (id) do update set active_role = 'company'`,
      [cu[0].id],
    );
    const { rows: cctx } = await a.query(
      `insert into public.engagement_contexts (profile_id, relationship_slug, title, hash_self)
       values ($1::uuid, 'manager', 'W1 conf ctx', md5($1 || clock_timestamp()::text)) returning id`,
      [cu[0].id],
    );
    await a.query(
      `insert into public.journal_entry_confirmations
         (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope)
       values ($1, $2, $3, 'manager', '{"scope":"w1-proof"}'::jsonb)`,
      [A, cu[0].id, cctx[0].id],
    );
    const s = supersedeSql(A, f, "pataisymas");
    await c.query(s.sql, s.params);
    const { rows: photo } = await a.query(
      `select entry_id from public.journal_entry_photos where id = $1`,
      [photoId],
    );
    record(
      "P4 confirmed original keeps its photo (correction lane)",
      photo[0].entry_id === A,
      `photoOn=${photo[0].entry_id === A ? "original" : "moved"}`,
    );
    await c.end();
  }

  // ── P5: cross-worker supersede refused — photo never moves ──────────────
  {
    const f1 = await makeFixture(a, `${tag}-p5a`);
    const f2 = await makeFixture(a, `${tag}-p5b`);
    const A = await makeEntry(a, f1, "svetimas įrašas su nuotrauka");
    const c1 = await asUser(f1.profileId);
    const { photoId } = await addPhoto(c1, f1, A);
    const c2 = await asUser(f2.profileId);
    let refused = "";
    const s = supersedeSql(A, f2, "bandymas perimti");
    try {
      await c2.query(s.sql, s.params);
    } catch (e) {
      refused = String((e as Error).message);
    }
    const { rows: photo } = await a.query(
      `select entry_id from public.journal_entry_photos where id = $1`,
      [photoId],
    );
    record(
      "P5 foreign worker refused; photo untouched",
      refused.includes("not_owner") && photo[0].entry_id === A,
      `err=${refused.slice(0, 25)} photoStayed=${photo[0].entry_id === A}`,
    );
    await c1.end();
    await c2.end();
  }

  // ── P6: removed/failed photo rows stay on the historical entry ──────────
  {
    const f = await makeFixture(a, `${tag}-p6`);
    const A = await makeEntry(a, f, "įrašas su pašalinta nuotrauka");
    const c = await asUser(f.profileId);
    const { photoId } = await addPhoto(c, f, A, "removed");
    const s = supersedeSql(A, f, "keitimas");
    await c.query(s.sql, s.params);
    const { rows: photo } = await a.query(
      `select entry_id, upload_status from public.journal_entry_photos where id = $1`,
      [photoId],
    );
    record(
      "P6 removed photo row stays on historical entry",
      photo[0].entry_id === A && photo[0].upload_status === "removed",
      `on=${photo[0].entry_id === A ? "old" : "new"} status=${photo[0].upload_status}`,
    );
    await c.end();
  }

  await a.end();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n— RESULT: ${results.length - failed.length}/${results.length} proofs passed —`);
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error("proof harness error:", e);
  process.exit(1);
});
