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

  // ═══ Owner-hold D-matrix: authorization coherence + registration race ═══

  /** Run an RLS-enforced query as `profileId` (role authenticated + claims),
   *  restoring the admin role afterwards. */
  async function rlsQuery(
    profileId: string,
    sql: string,
    params: unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }> {
    const c = new Client({ connectionString: DB_URL });
    await c.connect();
    try {
      await c.query(`select set_config('request.jwt.claims', $1, false)`, [
        JSON.stringify({ sub: profileId, role: "authenticated" }),
      ]);
      await c.query(`set role authenticated`);
      return await c.query(sql, params);
    } finally {
      await c.end();
    }
  }

  async function makeOrgManager(
    aConn: Client,
    tag2: string,
  ): Promise<{ orgId: string; managerId: string }> {
    const { rows: org } = await aConn.query(
      `insert into public.organizations (organization_type, display_name)
       values ('company', 'W1 Org ' || $1) returning id`,
      [tag2],
    );
    const { rows: mu } = await aConn.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               'w1-proof-mgr-' || $1 || '@fixture.local', 'x', now(), '{"provider":"email"}', '{}', now(), now())
       returning id`,
      [tag2],
    );
    await aConn.query(
      `insert into public.profiles (id, active_role, full_name) values ($1, 'company', 'W1 Mgr ' || $2)
       on conflict (id) do update set active_role = 'company'`,
      [mu[0].id, tag2],
    );
    await aConn.query(
      `insert into public.engagement_contexts (profile_id, organization_id, relationship_slug, title, hash_self)
       values ($1::uuid, $2, 'manager', 'W1 mgr ctx ' || $3, md5($1 || clock_timestamp()::text))`,
      [mu[0].id, org[0].id, tag2],
    );
    return { orgId: org[0].id as string, managerId: mu[0].id as string };
  }

  // ── D2/D3/D4/D6: engagement-context change moves BOTH metadata and object
  //     authorization to the new org; old org loses both; stranger sees none.
  {
    const f = await makeFixture(a, `${tag}-d2`);
    const org1 = await makeOrgManager(a, `${tag}-o1`);
    const org2 = await makeOrgManager(a, `${tag}-o2`);
    const org3 = await makeOrgManager(a, `${tag}-o3`); // never involved
    // Worker's org-bound contexts.
    const { rows: ec1 } = await a.query(
      `insert into public.engagement_contexts (profile_id, organization_id, relationship_slug, title, hash_self)
       values ($1::uuid, $2, 'employee', 'W1 d2 ec1', md5($1 || '1' || clock_timestamp()::text)) returning id`,
      [f.profileId, org1.orgId],
    );
    const { rows: ec2 } = await a.query(
      `insert into public.engagement_contexts (profile_id, organization_id, relationship_slug, title, hash_self)
       values ($1::uuid, $2, 'employee', 'W1 d2 ec2', md5($1 || '2' || clock_timestamp()::text)) returning id`,
      [f.profileId, org2.orgId],
    );
    const { rows: entryRows } = await a.query(
      `insert into public.journal_entries (worker_id, engagement_context_id, entry_type_slug, original_text, original_language, hash_self, visibility_scope)
       values ($1, $2, 'freeform', 'd2 su nuotrauka', 'lt', md5('d2' || clock_timestamp()::text), 'closed') returning id`,
      [f.workerId, ec1[0].id],
    );
    const A = entryRows[0].id as string;
    const c = await asUser(f.profileId);
    const { path } = await addPhoto(c, f, A);
    // Mirror the storage object row (fixture; prod upload creates it).
    await a.query(
      `insert into storage.objects (bucket_id, name, owner) values ('journal-entry-photos', $1, $2::uuid)`,
      [path, f.profileId],
    );

    // BEFORE the cross-context edit: org1 manager sees metadata + object.
    const m1MetaBefore = await rlsQuery(org1.managerId,
      `select count(*)::int as n from public.journal_entry_photos where storage_path = $1`, [path]);
    const m1ObjBefore = await rlsQuery(org1.managerId,
      `select count(*)::int as n from storage.objects where bucket_id = 'journal-entry-photos' and name = $1`, [path]);

    // Cross-context edit: supersede A -> B with engagement context ec2 (org2).
    const { rows: bRows } = await c.query(
      `select public.journal_entry_supersede_v2(
        $1::uuid, $2::uuid, 'freeform', null, 'd2 perkelta i org2', 'lt',
        md5('d2b' || clock_timestamp()::text), 'closed', '[]'::jsonb, '{}'::text[], '{}'::text[]) as id`,
      [A, ec2[0].id],
    );
    const B = bRows[0].id as string;

    const m1Meta = await rlsQuery(org1.managerId,
      `select count(*)::int as n from public.journal_entry_photos where storage_path = $1`, [path]);
    const m1Obj = await rlsQuery(org1.managerId,
      `select count(*)::int as n from storage.objects where bucket_id = 'journal-entry-photos' and name = $1`, [path]);
    const m2Meta = await rlsQuery(org2.managerId,
      `select count(*)::int as n from public.journal_entry_photos where storage_path = $1`, [path]);
    const m2Obj = await rlsQuery(org2.managerId,
      `select count(*)::int as n from storage.objects where bucket_id = 'journal-entry-photos' and name = $1`, [path]);
    const m3Meta = await rlsQuery(org3.managerId,
      `select count(*)::int as n from public.journal_entry_photos where storage_path = $1`, [path]);
    const m3Obj = await rlsQuery(org3.managerId,
      `select count(*)::int as n from storage.objects where bucket_id = 'journal-entry-photos' and name = $1`, [path]);
    const ownerObj = await rlsQuery(f.profileId,
      `select count(*)::int as n from storage.objects where bucket_id = 'journal-entry-photos' and name = $1`, [path]);

    record(
      "D2 pre-edit: origin-org manager authorized for metadata AND object",
      m1MetaBefore.rows[0].n === 1 && m1ObjBefore.rows[0].n === 1,
      `meta=${m1MetaBefore.rows[0].n} obj=${m1ObjBefore.rows[0].n}`,
    );
    record(
      "D3 post-edit: OLD org manager loses metadata AND object access",
      m1Meta.rows[0].n === 0 && m1Obj.rows[0].n === 0,
      `meta=${m1Meta.rows[0].n} obj=${m1Obj.rows[0].n}`,
    );
    record(
      "D4 post-edit: NEW org manager gains metadata AND object access",
      m2Meta.rows[0].n === 1 && m2Obj.rows[0].n === 1,
      `meta=${m2Meta.rows[0].n} obj=${m2Obj.rows[0].n}`,
    );
    record(
      "D6 uninvolved org manager sees nothing; owner keeps object access",
      m3Meta.rows[0].n === 0 && m3Obj.rows[0].n === 0 && ownerObj.rows[0].n === 1,
      `strangerMeta=${m3Meta.rows[0].n} strangerObj=${m3Obj.rows[0].n} ownerObj=${ownerObj.rows[0].n}`,
    );

    // Metadata/object authorization IDENTITY after a SECOND edit back to ec1.
    await c.query(
      `select public.journal_entry_supersede_v2(
        $1::uuid, $2::uuid, 'freeform', null, 'd2 atgal i org1', 'lt',
        md5('d2c' || clock_timestamp()::text), 'closed', '[]'::jsonb, '{}'::text[], '{}'::text[])`,
      [B, ec1[0].id],
    );
    const m1Again = await rlsQuery(org1.managerId,
      `select (select count(*)::int from public.journal_entry_photos where storage_path = $1) as meta,
              (select count(*)::int from storage.objects where bucket_id = 'journal-entry-photos' and name = $1) as obj`,
      [path]);
    const m2Again = await rlsQuery(org2.managerId,
      `select (select count(*)::int from public.journal_entry_photos where storage_path = $1) as meta,
              (select count(*)::int from storage.objects where bucket_id = 'journal-entry-photos' and name = $1) as obj`,
      [path]);
    record(
      "D2b edits keep metadata and object authorization IDENTICAL",
      m1Again.rows[0].meta === m1Again.rows[0].obj && m2Again.rows[0].meta === m2Again.rows[0].obj &&
        m1Again.rows[0].meta === 1 && m2Again.rows[0].meta === 0,
      `org1(meta=obj)=${m1Again.rows[0].meta}/${m1Again.rows[0].obj} org2(meta=obj)=${m2Again.rows[0].meta}/${m2Again.rows[0].obj}`,
    );

    // D-policy: owner cannot repoint entry_id (column grant restricted).
    let repointErr = "";
    try {
      await rlsQuery(f.profileId,
        `update public.journal_entry_photos set entry_id = $1 where storage_path = $2`,
        [A, path]);
    } catch (e) {
      repointErr = String((e as Error).message);
    }
    record(
      "D-policy: owner cannot repoint photo entry_id (column grant)",
      repointErr.includes("permission denied"),
      `err=${repointErr.slice(0, 40)}`,
    );
    await c.end();
  }

  // ── D5: concurrent registration vs supersede — serialized, no stranding ──
  {
    const f = await makeFixture(a, `${tag}-d5`);
    const A = await makeEntry(a, f, "lenktynių įrašas");
    const c1 = await asUser(f.profileId);
    const c2 = await asUser(f.profileId);
    const regSql = `select public.register_journal_entry_photo(
      gen_random_uuid(), $1::uuid, 'race.jpg', 'image/jpeg', 111,
      $2 || '/' || $1 || '/' || gen_random_uuid() || '/race.jpg') as id`;
    const s = supersedeSql(A, f, "lenktynių keitimas");
    const [regRes, supRes] = await Promise.allSettled([
      c1.query(regSql, [A, f.profileId]),
      c2.query(s.sql, s.params),
    ]);
    const regOk = regRes.status === "fulfilled";
    const supOk = supRes.status === "fulfilled";
    const regErr = regRes.status === "rejected" ? String(regRes.reason?.message) : "";
    const liveId = supOk ? ((supRes as PromiseFulfilledResult<{ rows: Array<{ id: string }> }>).value.rows[0].id) : A;
    const { rows: strandedOnA } = await a.query(
      `select count(*)::int as n from public.journal_entry_photos
        where entry_id = $1 and upload_status in ('uploading','uploaded')`,
      [A],
    );
    const { rows: total } = await a.query(
      `select count(*)::int as n from public.journal_entry_photos where profile_id = $1`,
      [f.profileId],
    );
    const { rows: onLive } = await a.query(
      `select count(*)::int as n from public.journal_entry_photos
        where entry_id = $1 and upload_status in ('uploading','uploaded')`,
      [liveId],
    );
    // Legal outcomes: register-first (photo rides to live entry) or
    // supersede-first (register refused entry_superseded). Never stranded.
    const outcomeLegal = supOk && (
      (regOk && strandedOnA[0].n === 0 && onLive[0].n === 1 && total[0].n === 1) ||
      (!regOk && regErr.includes("entry_superseded") && strandedOnA[0].n === 0 && total[0].n === 0)
    );
    record(
      "D5 register/supersede race: serialized, one attachment location, no stranding",
      outcomeLegal,
      `register=${regOk ? "won" : "refused"} supersede=${supOk} strandedOnHidden=${strandedOnA[0].n} total=${total[0].n} onLive=${onLive[0].n}`,
    );
    // Explicit post-supersede registration attempt → structured refusal.
    let postErr = "";
    try {
      await c1.query(regSql, [A, f.profileId]);
    } catch (e) {
      postErr = String((e as Error).message);
    }
    record(
      "D5b registration on a superseded entry refused with entry_superseded",
      postErr.includes("entry_superseded"),
      `err=${postErr.slice(0, 40)}`,
    );
    await c1.end();
    await c2.end();
  }

  // ── D7-backfill: photos stranded BEFORE this migration are repaired ─────
  // Simulates the pre-migration world: chains superseded WITHOUT the photo
  // move (direct pointer updates), then re-applies the ACTUAL migration file
  // and asserts the one-time backfill repaired exactly the safe rows.
  {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const migrationSql = readFileSync(
      join(here, "..", "supabase", "migrations", "20260720150000_journal_photo_continuity_v1.sql"),
      "utf-8",
    );

    // Chain 1: A(photo, stranded) -> B -> C(live, no photo)  => photo moves to C.
    const f = await makeFixture(a, `${tag}-bf1`);
    const A = await makeEntry(a, f, "senas su nuotrauka");
    const B = await makeEntry(a, f, "vidurinis");
    const C = await makeEntry(a, f, "gyvas galas");
    const c = await asUser(f.profileId);
    const { photoId: ph1 } = await addPhoto(c, f, A);
    await a.query(`update public.journal_entries set superseded_by = $2 where id = $1`, [A, B]);
    await a.query(`update public.journal_entries set superseded_by = $2 where id = $1`, [B, C]);

    // Chain 2: D(photo, stranded) -> E(live, HAS its own photo) => stays on D.
    const D = await makeEntry(a, f, "senas su kolizija");
    const { photoId: ph2 } = await addPhoto(c, f, D);
    const E = await makeEntry(a, f, "gyvas su sava nuotrauka");
    const { photoId: ph3 } = await addPhoto(c, f, E);
    await a.query(`update public.journal_entries set superseded_by = $2 where id = $1`, [D, E]);

    // Chain 3: F(photo, stranded) -> G(deleted tip) => stays on F.
    const F = await makeEntry(a, f, "senas i istrinta");
    const { photoId: ph4 } = await addPhoto(c, f, F);
    const G = await makeEntry(a, f, "istrintas galas");
    await a.query(`update public.journal_entries set superseded_by = $2 where id = $1`, [F, G]);
    await a.query(`update public.journal_entries set deleted_at = now() where id = $1`, [G]);

    await a.query(migrationSql); // re-apply the REAL migration file (idempotent)

    const loc = async (id: string) =>
      (await a.query(`select entry_id from public.journal_entry_photos where id = $1`, [id]))
        .rows[0].entry_id as string;
    record(
      "D7a backfill moves a stranded photo to the LIVE chain tip",
      (await loc(ph1)) === C,
      `photoOn=${(await loc(ph1)) === C ? "liveTip" : "stranded"}`,
    );
    record(
      "D7b backfill never creates a second active attachment (collision stays)",
      (await loc(ph2)) === D && (await loc(ph3)) === E,
      `collisionStayed=${(await loc(ph2)) === D} tipKept=${(await loc(ph3)) === E}`,
    );
    record(
      "D7c backfill skips chains ending in a deleted tip",
      (await loc(ph4)) === F,
      `stayed=${(await loc(ph4)) === F}`,
    );
    // Idempotency: second apply changes nothing.
    await a.query(migrationSql);
    record(
      "D7d backfill idempotent on re-apply",
      (await loc(ph1)) === C && (await loc(ph2)) === D && (await loc(ph4)) === F,
      "second apply no-op",
    );

    // Chain 4: TWO stranded photos on one ancestor (pre-W0 race artifact)
    // converging on one tip — exactly ONE (the oldest) moves.
    const H = await makeEntry(a, f, "senas su dviem nuotraukom");
    const { photoId: ph5 } = await addPhoto(c, f, H);
    const ph6Path = `${f.profileId}/${H}/${crypto.randomUUID()}/antra.jpg`;
    const { rows: ph6r } = await a.query(
      `insert into public.journal_entry_photos (entry_id, profile_id, file_name, mime_type, file_size_bytes, storage_path)
       values ($1::uuid, $2::uuid, 'antra.jpg', 'image/jpeg', 222, $3)
       returning id`,
      [H, f.profileId, ph6Path],
    );
    const ph6 = ph6r[0].id as string;
    const I = await makeEntry(a, f, "gyvas galas 2");
    await a.query(`update public.journal_entries set superseded_by = $2 where id = $1`, [H, I]);
    await a.query(migrationSql);
    const on_I = (await a.query(
      `select count(*)::int as n from public.journal_entry_photos
        where entry_id = $1 and upload_status in ('uploading','uploaded')`, [I],
    )).rows[0].n as number;
    record(
      "D7e converging stranded photos: exactly ONE (oldest) lands on the tip",
      on_I === 1 && (await loc(ph5)) === I && (await loc(ph6)) === H,
      `onTip=${on_I} oldestMoved=${(await loc(ph5)) === I} newerStayed=${(await loc(ph6)) === H}`,
    );

    // Chain 5: adversarial superseded_by CYCLE (J <-> K) with an active photo
    // — the apply must TERMINATE (depth guard) and leave the photo in place.
    const J = await makeEntry(a, f, "ciklas J");
    const K = await makeEntry(a, f, "ciklas K");
    const { photoId: ph7 } = await addPhoto(c, f, J);
    await a.query(`update public.journal_entries set superseded_by = $2 where id = $1`, [J, K]);
    await a.query(`update public.journal_entries set superseded_by = $2 where id = $1`, [K, J]);
    let cycleOk = false;
    try {
      await a.query(migrationSql); // must not hang or error
      cycleOk = (await loc(ph7)) === J;
    } catch { /* cycleOk stays false */ }
    // Repair the fixture graph so cleanup queries stay sane.
    await a.query(`update public.journal_entries set superseded_by = null where id in ($1, $2)`, [J, K]);
    record(
      "D7f adversarial pointer cycle: apply terminates, photo stays put",
      cycleOk,
      `terminated=${cycleOk}`,
    );
    await c.end();
  }

  // ═══ Owner-hold #2 L-matrix: LEGACY journal_entry_supersede parity ═══
  const legacySql = (oldId: string, f: Fixture, text: string) => ({
    sql: `select public.journal_entry_supersede(
      $1::uuid, $2::uuid, 'freeform', null, $3, 'lt', md5($3 || clock_timestamp()::text), 'closed',
      '[]'::jsonb) as id`,
    params: [oldId, f.engagementId, text],
  });

  // ── L1+L2+L5: legacy supersede moves the photo — including AFTER the
  //    backfill already ran — and repeated legacy supersedes keep ONE
  //    attachment on the live tip.
  {
    const f = await makeFixture(a, `${tag}-l1`);
    const A = await makeEntry(a, f, "legacy su nuotrauka");
    const c = await asUser(f.profileId);
    const { photoId, path } = await addPhoto(c, f, A);
    // (The backfill from the migration apply has ALREADY completed by now —
    // any stranding created from here on is post-backfill by construction.)
    const l1 = legacySql(A, f, "legacy pirmas keitimas");
    const B = (await c.query(l1.sql, l1.params)).rows[0].id as string;
    const locOf = async (id: string) =>
      (await a.query(`select entry_id, storage_path from public.journal_entry_photos where id = $1`, [id])).rows[0];
    const afterB = await locOf(photoId);
    record(
      "L1 legacy RPC moves the active photo to the new live entry",
      afterB.entry_id === B && afterB.storage_path === path,
      `entry=${afterB.entry_id === B ? "live" : "stranded"} pathUnchanged=${afterB.storage_path === path}`,
    );
    const l2 = legacySql(B, f, "legacy antras keitimas");
    const C = (await c.query(l2.sql, l2.params)).rows[0].id as string;
    const l3 = legacySql(C, f, "legacy trecias keitimas");
    const D = (await c.query(l3.sql, l3.params)).rows[0].id as string;
    const afterD = await locOf(photoId);
    const { rows: strandedAny } = await a.query(
      `select count(*)::int as n from public.journal_entry_photos p
        join public.journal_entries je on je.id = p.entry_id
       where p.profile_id = $1 and p.upload_status in ('uploading','uploaded')
         and je.superseded_by is not null`,
      [f.profileId],
    );
    record(
      "L2+L5 repeated legacy supersedes (post-backfill): photo rides every hop, zero stranded",
      afterD.entry_id === D && strandedAny[0].n === 0,
      `onTip=${afterD.entry_id === D} strandedActive=${strandedAny[0].n}`,
    );
    await c.end();
  }

  // ── L3: register-photo vs LEGACY supersede concurrency ──────────────────
  {
    const f = await makeFixture(a, `${tag}-l3`);
    const A = await makeEntry(a, f, "legacy lenktynes");
    const c1 = await asUser(f.profileId);
    const c2 = await asUser(f.profileId);
    const regSql = `select public.register_journal_entry_photo(
      gen_random_uuid(), $1::uuid, 'lrace.jpg', 'image/jpeg', 111,
      $2 || '/' || $1 || '/' || gen_random_uuid() || '/lrace.jpg') as id`;
    const ls = legacySql(A, f, "legacy lenktyniu keitimas");
    const [regRes, supRes] = await Promise.allSettled([
      c1.query(regSql, [A, f.profileId]),
      c2.query(ls.sql, ls.params),
    ]);
    const regOk = regRes.status === "fulfilled";
    const supOk = supRes.status === "fulfilled";
    const regErr = regRes.status === "rejected" ? String(regRes.reason?.message) : "";
    const liveId = supOk
      ? ((supRes as PromiseFulfilledResult<{ rows: Array<{ id: string }> }>).value.rows[0].id)
      : A;
    const { rows: strandedOnA } = await a.query(
      `select count(*)::int as n from public.journal_entry_photos
        where entry_id = $1 and upload_status in ('uploading','uploaded')`, [A]);
    const { rows: onLive } = await a.query(
      `select count(*)::int as n from public.journal_entry_photos
        where entry_id = $1 and upload_status in ('uploading','uploaded')`, [liveId]);
    const legal = supOk && (
      (regOk && strandedOnA[0].n === 0 && onLive[0].n === 1) ||
      (!regOk && regErr.includes("entry_superseded") && strandedOnA[0].n === 0 && onLive[0].n === 0)
    );
    record(
      "L3 register vs LEGACY supersede: serialized, no stranding",
      legal,
      `register=${regOk ? "won" : "refused"} strandedOnHidden=${strandedOnA[0].n} onLive=${onLive[0].n}`,
    );
    await c1.end();
    await c2.end();
  }

  // ── L4: old-deployed-caller simulation during migration-first rollout ───
  // An old build calls ONLY the legacy RPC with the exact production
  // argument shape; behavior must match v2 for continuity: entry chain
  // advances, photo follows, stale second call refused.
  {
    const f = await makeFixture(a, `${tag}-l4`);
    const A = await makeEntry(a, f, "senas klientas");
    const c = await asUser(f.profileId);
    const { photoId } = await addPhoto(c, f, A);
    const l = legacySql(A, f, "seno kliento keitimas");
    const B = (await c.query(l.sql, l.params)).rows[0].id as string;
    let staleErr = "";
    try {
      const l2 = legacySql(A, f, "pavelaves senas klientas");
      await c.query(l2.sql, l2.params);
    } catch (e) {
      staleErr = String((e as Error).message);
    }
    const { rows: photo } = await a.query(
      `select entry_id from public.journal_entry_photos where id = $1`, [photoId]);
    record(
      "L4 old-deployed caller (legacy shape): chain + photo continuity + stale refusal",
      photo[0].entry_id === B && staleErr.includes("entry_superseded"),
      `photoOnLive=${photo[0].entry_id === B} stale=${staleErr.slice(0, 25)}`,
    );
    await c.end();
  }

  // ── L6: cross-context authorization after a LEGACY supersede ────────────
  {
    const f = await makeFixture(a, `${tag}-l6`);
    const orgA = await makeOrgManager(a, `${tag}-lo1`);
    const orgB = await makeOrgManager(a, `${tag}-lo2`);
    const { rows: ecA } = await a.query(
      `insert into public.engagement_contexts (profile_id, organization_id, relationship_slug, title, hash_self)
       values ($1::uuid, $2, 'employee', 'W1 l6 ecA', md5($1 || 'a' || clock_timestamp()::text)) returning id`,
      [f.profileId, orgA.orgId],
    );
    const { rows: ecB } = await a.query(
      `insert into public.engagement_contexts (profile_id, organization_id, relationship_slug, title, hash_self)
       values ($1::uuid, $2, 'employee', 'W1 l6 ecB', md5($1 || 'b' || clock_timestamp()::text)) returning id`,
      [f.profileId, orgB.orgId],
    );
    const { rows: er } = await a.query(
      `insert into public.journal_entries (worker_id, engagement_context_id, entry_type_slug, original_text, original_language, hash_self, visibility_scope)
       values ($1, $2, 'freeform', 'l6 su nuotrauka', 'lt', md5('l6' || clock_timestamp()::text), 'closed') returning id`,
      [f.workerId, ecA[0].id],
    );
    const A = er[0].id as string;
    const c = await asUser(f.profileId);
    const { path } = await addPhoto(c, f, A);
    await a.query(
      `insert into storage.objects (bucket_id, name, owner) values ('journal-entry-photos', $1, $2::uuid)`,
      [path, f.profileId],
    );
    // Legacy cross-context supersede (old builds pass whatever context the
    // composer selected).
    await c.query(
      `select public.journal_entry_supersede(
        $1::uuid, $2::uuid, 'freeform', null, 'l6 perkelta', 'lt',
        md5('l6b' || clock_timestamp()::text), 'closed', '[]'::jsonb)`,
      [A, ecB[0].id],
    );
    const mA = await rlsQuery(orgA.managerId,
      `select (select count(*)::int from public.journal_entry_photos where storage_path = $1) as meta,
              (select count(*)::int from storage.objects where bucket_id = 'journal-entry-photos' and name = $1) as obj`, [path]);
    const mB = await rlsQuery(orgB.managerId,
      `select (select count(*)::int from public.journal_entry_photos where storage_path = $1) as meta,
              (select count(*)::int from storage.objects where bucket_id = 'journal-entry-photos' and name = $1) as obj`, [path]);
    record(
      "L6 cross-context LEGACY supersede: authorization moves coherently",
      mA.rows[0].meta === 0 && mA.rows[0].obj === 0 && mB.rows[0].meta === 1 && mB.rows[0].obj === 1,
      `oldOrg=${mA.rows[0].meta}/${mA.rows[0].obj} newOrg=${mB.rows[0].meta}/${mB.rows[0].obj}`,
    );
    await c.end();
  }

  // ── L8: GLOBAL invariant — zero active photos on hidden entries across
  //    EVERY fixture this run created, through BOTH RPCs and the backfill.
  {
    const { rows: globalStranded } = await a.query(
      `select count(*)::int as n
         from public.journal_entry_photos p
         join public.journal_entries je on je.id = p.entry_id
         join public.workers w on w.id = je.worker_id
         join public.profiles pr on pr.id = w.profile_id
        where pr.full_name like 'W1 Proof %'
          and p.upload_status in ('uploading','uploaded')
          and je.superseded_by is not null
          -- The deliberate exceptions: collision/deleted-tip/cycle chains the
          -- backfill must NOT touch (D7b/D7c/D7f fixtures).
          and p.file_name not in ('antra.jpg')
          and not exists (
            select 1 from public.journal_entry_photos q
             where q.entry_id in (
               select c2.id from public.journal_entries c2
                where c2.id = je.superseded_by
             )
             and q.upload_status in ('uploading','uploaded'))
          and exists (
            select 1 from public.journal_entries tip
             where tip.id = je.superseded_by and tip.deleted_at is null
          )`,
    );
    record(
      "L8 global: no unexplained active photo on any hidden entry (both RPCs + backfill)",
      globalStranded[0].n === 0,
      `unexplainedStranded=${globalStranded[0].n}`,
    );
  }

  // ═══ Owner-hold v4 C-matrix: confirmation serialization + cutover ═══

  // ── C1: confirmation commits FIRST → racing supersede takes the correction
  //    lane and the photo STAYS on the confirmed source (item 1).
  {
    const f = await makeFixture(a, `${tag}-c1`);
    const org = await makeOrgManager(a, `${tag}-c1o`);
    const { rows: ec } = await a.query(
      `insert into public.engagement_contexts (profile_id, organization_id, relationship_slug, title, hash_self, journal_review_enabled)
       values ($1::uuid, $2, 'employee', 'W1 c1 ec', md5($1 || clock_timestamp()::text), true) returning id`,
      [f.profileId, org.orgId],
    );
    const { rows: er } = await a.query(
      `insert into public.journal_entries (worker_id, engagement_context_id, entry_type_slug, original_text, original_language, hash_self, visibility_scope)
       values ($1, $2, 'freeform', 'c1 su nuotrauka', 'lt', md5('c1' || clock_timestamp()::text), 'closed') returning id`,
      [f.workerId, ec[0].id],
    );
    const A = er[0].id as string;
    const cu = await asUser(f.profileId);
    const { photoId } = await addPhoto(cu, f, A);
    const { rows: mgrCtx } = await a.query(
      `select id, relationship_slug from public.engagement_contexts where profile_id = $1 limit 1`,
      [org.managerId],
    );
    // c1 txn: confirmation INSERT held open (KEY SHARE on A) …
    const cConf = new Client({ connectionString: DB_URL });
    await cConf.connect();
    await cConf.query("begin");
    await cConf.query(
      `insert into public.journal_entry_confirmations
         (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope)
       values ($1, $2, $3, 'manager', '{"action":"confirm","decision":"approved"}'::jsonb)`,
      [A, org.managerId, mgrCtx[0].id],
    );
    // … while the supersede races (must BLOCK on FOR UPDATE vs KEY SHARE).
    const s = supersedeSql(A, f, "c1 keitimas per lenktynes");
    const supPromise = cu.query(s.sql, s.params);
    let supersedeFinishedEarly = false;
    await new Promise((r) => setTimeout(r, 1200));
    void supPromise.then(() => { supersedeFinishedEarly = true; }).catch(() => { supersedeFinishedEarly = true; });
    await new Promise((r) => setTimeout(r, 100));
    const blockedWhileHeld = !supersedeFinishedEarly;
    await cConf.query("commit");
    await cConf.end();
    const supRows = await supPromise; // now unblocks
    const B = supRows.rows[0].id as string;
    const { rows: oldRow } = await a.query(
      `select superseded_by from public.journal_entries where id = $1`, [A]);
    const { rows: newRow } = await a.query(
      `select correction_of from public.journal_entries where id = $1`, [B]);
    const { rows: photo } = await a.query(
      `select entry_id from public.journal_entry_photos where id = $1`, [photoId]);
    record(
      "C1 confirm-first race: supersede blocked, correction lane taken, photo STAYS on confirmed source",
      blockedWhileHeld && oldRow[0].superseded_by === null &&
        newRow[0].correction_of === A && photo[0].entry_id === A,
      `blocked=${blockedWhileHeld} correctionLane=${newRow[0].correction_of === A} photoOnSource=${photo[0].entry_id === A}`,
    );

    // ── C2 (same fixtures): supersede-first → stale confirmations REFUSED.
    // The correction B is unconfirmed → supersede B → B hidden; confirming B
    // must now fail on every path.
    const s2 = supersedeSql(B, f, "c2 antras keitimas");
    await cu.query(s2.sql, s2.params);
    let directErr = "";
    try {
      await a.query(
        `insert into public.journal_entry_confirmations
           (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope)
         values ($1, $2, $3, 'manager', '{"action":"confirm"}'::jsonb)`,
        [B, org.managerId, mgrCtx[0].id],
      );
    } catch (e) {
      directErr = String((e as Error).message);
    }
    const cMgr = await asUser(org.managerId);
    const { rows: rpcStatus } = await cMgr.query(
      `select public.review_journal_entry($1::uuid, 'approved') as status`, [B]);
    record(
      "C2 supersede-first: stale confirmation refused on BOTH paths (trigger + RPC status)",
      directErr.includes("entry_superseded") && rpcStatus[0].status === "entry_superseded",
      `direct=${directErr.slice(0, 22)} rpc=${rpcStatus[0].status}`,
    );

    // ── C3: deleted entry → entry_deleted on both paths.
    const { rows: dRows } = await a.query(
      `insert into public.journal_entries (worker_id, engagement_context_id, entry_type_slug, original_text, original_language, hash_self, visibility_scope, deleted_at)
       values ($1, $2, 'freeform', 'c3 istrintas', 'lt', md5('c3' || clock_timestamp()::text), 'closed', now()) returning id`,
      [f.workerId, ec[0].id],
    );
    const D = dRows[0].id as string;
    let delErr = "";
    try {
      await a.query(
        `insert into public.journal_entry_confirmations
           (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope)
         values ($1, $2, $3, 'manager', '{"action":"confirm"}'::jsonb)`,
        [D, org.managerId, mgrCtx[0].id],
      );
    } catch (e) {
      delErr = String((e as Error).message);
    }
    const { rows: delStatus } = await cMgr.query(
      `select public.review_journal_entry($1::uuid, 'approved') as status`, [D]);
    record(
      "C3 deleted entry: confirmation refused with entry_deleted (trigger + RPC status)",
      delErr.includes("entry_deleted") && delStatus[0].status === "entry_deleted",
      `direct=${delErr.slice(0, 18)} rpc=${delStatus[0].status}`,
    );
    await cMgr.end();
    await cu.end();
  }

  // ── C4: cutover quiesce — an in-flight pre-migration writer transaction
  //    blocks the migration apply; the backfill then sees its supersede.
  {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const migrationSql = readFileSync(
      join(here, "..", "supabase", "migrations", "20260720150000_journal_photo_continuity_v1.sql"),
      "utf-8",
    );
    const f = await makeFixture(a, `${tag}-c4`);
    const A = await makeEntry(a, f, "c4 senas rasytojas");
    const B = await makeEntry(a, f, "c4 naujas galas");
    const cu = await asUser(f.profileId);
    const { photoId } = await addPhoto(cu, f, A);
    // In-flight OLD-function-shaped writer: supersedes A→B WITHOUT a photo
    // move, transaction held open.
    const writer = new Client({ connectionString: DB_URL });
    await writer.connect();
    await writer.query("begin");
    await writer.query(
      `update public.journal_entries set superseded_by = $2 where id = $1`, [A, B]);
    // Migration apply must BLOCK on `lock table … in exclusive mode`.
    const applier = new Client({ connectionString: DB_URL });
    await applier.connect();
    const applyPromise = applier.query(migrationSql);
    let applyFinishedEarly = false;
    void applyPromise.then(() => { applyFinishedEarly = true; }).catch(() => { applyFinishedEarly = true; });
    await new Promise((r) => setTimeout(r, 1500));
    const blocked = !applyFinishedEarly;
    await writer.query("commit");
    await writer.end();
    await applyPromise;
    await applier.end();
    const { rows: photo } = await a.query(
      `select entry_id from public.journal_entry_photos where id = $1`, [photoId]);
    record(
      "C4 cutover quiesce: apply blocked behind in-flight writer, backfill then repaired it",
      blocked && photo[0].entry_id === B,
      `applyBlocked=${blocked} photoRepairedToLive=${photo[0].entry_id === B}`,
    );
    await cu.end();
  }

  // ── L7: rollback round-trip — behavioral revert, retained authorization ─
  {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const rollbackSql = readFileSync(
      join(here, "..", "supabase", "rollbacks", "20260720150000_journal_photo_continuity_v1.down.sql"),
      "utf-8",
    );
    const migrationSql = readFileSync(
      join(here, "..", "supabase", "migrations", "20260720150000_journal_photo_continuity_v1.sql"),
      "utf-8",
    );
    await a.query(rollbackSql);
    const { rows: fns } = await a.query(
      `select p.proname, (p.prosrc like '%journal_entry_photos%') as has_photo_move,
              (p.prosrc like '%for update%') as has_lock
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('journal_entry_supersede', 'journal_entry_supersede_v2')
        order by p.proname`,
    );
    const { rows: pol } = await a.query(
      `select (select count(*) from pg_policies
          where schemaname='storage' and tablename='objects'
            and policyname='journal-entry-photos org manager select'
            and qual like '%storage_path%') as metadata_policy_retained,
        (select count(*) from pg_policies
          where schemaname='storage' and tablename='objects'
            and policyname='journal-entry-photos org manager select'
            and qual like '%foldername%') as path_policy_back`,
    );
    const reverted =
      fns.every((f2) => f2.has_photo_move === false && f2.has_lock === true) &&
      pol[0].metadata_policy_retained === "1" &&
      pol[0].path_policy_back === "0";
    // Restore the migrated state for any later run.
    await a.query(migrationSql);
    const { rows: fns2 } = await a.query(
      `select bool_and(p.prosrc like '%journal_entry_photos%') as all_moved
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('journal_entry_supersede', 'journal_entry_supersede_v2')`,
    );
    record(
      "L7 rollback: photo move removed from BOTH RPCs, W0 locks kept, metadata policy retained; re-apply restores",
      reverted && fns2[0].all_moved === true,
      `reverted=${reverted} reapplied=${fns2[0].all_moved}`,
    );
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
