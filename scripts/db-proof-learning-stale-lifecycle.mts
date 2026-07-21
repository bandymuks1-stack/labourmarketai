/**
 * W1 — Invite-Ready Closure Train v1: REAL-DATABASE proof for the stale
 * learning-review lifecycle (migration 20260720170000_learning_stale_lifecycle_v1).
 *
 * LOCAL scratch database ONLY (hard localhost guard below) — never production.
 *
 * Proof matrix (Codex exact-head P2-1 / P2-2, train "Required tests" 1-8, 15):
 *   1. a stale queue item that existed BEFORE any page load is closed by the
 *      server-side read cleanup — no click, no UI button involved;
 *   2. the same cleanup is IDEMPOTENT: a second sweep closes 0 rows and does
 *      not re-stamp reviewed_at;
 *   3. a live item that goes SUPERSEDED between render and Approve is refused
 *      and closed terminally — the approval is NOT persisted;
 *   4. same for Reject on a DELETED source;
 *   5. a genuinely live item still approves (happy path intact);
 *   6. a genuinely live item still rejects (happy path intact);
 *   7. TRUE CONCURRENCY: two sessions race — session B supersedes the entry
 *      while session A holds the queue row and is about to decide. The lock
 *      discipline (queue FOR UPDATE + entry FOR KEY SHARE vs the supersede's
 *      FOR UPDATE) must serialize them, and the loser must not record a
 *      decision;
 *   8. the guard trigger refuses a DIRECT approve/reject write on a stale item
 *      (the race-proof backstop for any legacy/other caller);
 *   9. authority: a non-manager cannot decide and cannot close another org's
 *      items via the cleanup;
 *  10. rollback identity: after applying the .down.sql, all four objects are
 *      gone and no policy/grant on a pre-existing object drifted.
 *
 * Usage: npx tsx scripts/db-proof-learning-stale-lifecycle.mts
 * Env:   DB_URL (default postgresql://postgres:postgres@127.0.0.1:54322/postgres)
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

/** Repo root resolved from THIS file, not the cwd — the harness must produce
 *  identical results whether it is invoked from the repo root or from apps/web. */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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

type World = {
  orgId: string;
  managerProfileId: string;
  workerProfileId: string;
  workerId: string;
  workerEngagementId: string;
  skillId: string;
};

async function makeProfile(a: Client, tag: string, role: string): Promise<string> {
  const { rows } = await a.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
             'authenticated', 'w1-stale-' || $1 || '@fixture.local', 'x', now(),
             '{"provider":"email"}', '{}', now(), now())
     returning id`,
    [tag],
  );
  const id = rows[0].id as string;
  await a.query(
    `insert into public.profiles (id, active_role, full_name)
     values ($1, $2, 'W1 Stale ' || $3)
     on conflict (id) do update set active_role = excluded.active_role`,
    [id, role, tag],
  );
  return id;
}

/** One organization with a real manager engagement, one worker with an active
 *  worker engagement in that org, and one skill the worker declares. */
async function makeWorld(a: Client, tag: string): Promise<World> {
  // NB: `active_role` is the profile's own dashboard role ('company' for a
  // business user). Manager AUTHORITY is not a profile flag at all — it comes
  // from the engagement_context below, which is exactly what
  // public.manages_organization() reads.
  const managerProfileId = await makeProfile(a, `${tag}-mgr`, "company");
  const workerProfileId = await makeProfile(a, `${tag}-wrk`, "worker");

  const { rows: o } = await a.query(
    `insert into public.organizations (owner_profile_id, organization_type, display_name)
     values ($1, 'company', 'W1 Stale Org ' || $2) returning id`,
    [managerProfileId, tag],
  );
  const orgId = o[0].id as string;

  const { rows: w } = await a.query(
    `insert into public.workers (profile_id) values ($1)
     on conflict (profile_id) do update set profile_id = excluded.profile_id
     returning id`,
    [workerProfileId],
  );
  const workerId = w[0].id as string;

  // Manager engagement — this is what makes manages_organization() true.
  await a.query(
    `insert into public.engagement_contexts
       (profile_id, organization_id, relationship_slug, status, title, hash_self,
        journal_review_enabled)
     values ($1::uuid, $2, 'manager', 'active', 'W1 stale manager',
             md5($1 || clock_timestamp()::text), true)`,
    [managerProfileId, orgId],
  );
  // Worker engagement — the entries hang off this one. 'employee' is a real
  // relationship_types slug; 'worker' is a profile role, not a relationship.
  const { rows: we } = await a.query(
    `insert into public.engagement_contexts
       (profile_id, organization_id, relationship_slug, status, title, hash_self,
        journal_review_enabled)
     values ($1::uuid, $2, 'employee', 'active', 'W1 stale worker',
             md5($1 || clock_timestamp()::text), true)
     returning id`,
    [workerProfileId, orgId],
  );

  const { rows: s } = await a.query(
    `insert into public.skills (slug, category)
     values ('w1-stale-' || $1, 'proof')
     on conflict (slug) do update set category = excluded.category
     returning id`,
    [tag],
  );
  const skillId = s[0].id as string;
  await a.query(
    `insert into public.worker_skills (worker_id, skill_id)
     values ($1, $2) on conflict do nothing`,
    [workerId, skillId],
  );

  return {
    orgId,
    managerProfileId,
    workerProfileId,
    workerId,
    workerEngagementId: we[0].id as string,
    skillId,
  };
}

async function makeEntry(a: Client, w: World, text: string): Promise<string> {
  const { rows } = await a.query(
    `insert into public.journal_entries
       (worker_id, engagement_context_id, entry_type_slug, original_text,
        original_language, hash_self, visibility_scope)
     values ($1, $2, 'freeform', $3, 'lt', md5($3 || clock_timestamp()::text), 'closed')
     returning id`,
    [w.workerId, w.workerEngagementId, text],
  );
  return rows[0].id as string;
}

async function makeQueueItem(a: Client, w: World, entryId: string): Promise<string> {
  const { rows: sig } = await a.query(
    `insert into public.learning_signals
       (subject_worker_id, subject_skill_id, organization_id, source,
        source_object_type, source_object_id, signal_kind, confidence_score, confidence_bin)
     values ($1, $2, $3, 'journal_entry', 'journal_entries', $4, 'skill_evidence', 90, 'green')
     returning id`,
    [w.workerId, w.skillId, w.orgId, entryId],
  );
  const { rows } = await a.query(
    `insert into public.learning_review_queue
       (signal_id, subject_worker_id, subject_skill_id, organization_id,
        journal_entry_id, suggestion_kind, status)
     values ($1, $2, $3, $4, $5, 'confirm_skill', 'pending')
     returning id`,
    [sig[0].id, w.workerId, w.skillId, w.orgId, entryId],
  );
  return rows[0].id as string;
}

type QueueRow = {
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};
async function queueRow(a: Client, id: string): Promise<QueueRow> {
  const { rows } = await a.query(
    `select status, reviewed_by, reviewed_at::text, review_note
       from public.learning_review_queue where id = $1`,
    [id],
  );
  return rows[0] as QueueRow;
}

/** Mark the entry stale exactly the way production does. */
async function supersede(a: Client, w: World, entryId: string): Promise<string> {
  const newId = await makeEntry(a, w, "naujesnė versija");
  await a.query(
    `update public.journal_entries set superseded_by = $2, updated_at = now() where id = $1`,
    [entryId, newId],
  );
  return newId;
}
async function softDelete(a: Client, entryId: string): Promise<void> {
  await a.query(
    `update public.journal_entries set deleted_at = now(), updated_at = now() where id = $1`,
    [entryId],
  );
}

async function main(): Promise<void> {
  const a = await admin();
  const tag = `run-${Date.now()}`;
  console.log("— W1 stale learning-lifecycle DB proof —\n");

  // ── 1 + 2: read cleanup closes a pre-existing stale item, idempotently ───
  {
    const w = await makeWorld(a, `${tag}-c1`);
    const entry = await makeEntry(a, w, "įrašas prieš pasenimą");
    const item = await makeQueueItem(a, w, entry);
    await supersede(a, w, entry);

    const mgr = await asUser(w.managerProfileId);
    const before = await queueRow(a, item);
    const { rows: r1 } = await mgr.query(
      `select public.close_stale_learning_review_items(null) as n`,
    );
    const after = await queueRow(a, item);
    record(
      "1. stale item existing BEFORE page load is closed by the read cleanup",
      before.status === "pending" &&
        r1[0].n === 1 &&
        after.status === "superseded" &&
        after.reviewed_by === w.managerProfileId &&
        after.review_note === "stale: entry_superseded",
      `before=${before.status} closed=${r1[0].n} after=${after.status} note="${after.review_note}"`,
    );

    const { rows: r2 } = await mgr.query(
      `select public.close_stale_learning_review_items(null) as n`,
    );
    const after2 = await queueRow(a, item);
    record(
      "2. repeated cleanup is idempotent (0 rows, audit fields unchanged)",
      r2[0].n === 0 &&
        after2.status === "superseded" &&
        after2.reviewed_at === after.reviewed_at,
      `secondSweep=${r2[0].n} reviewedAtStable=${after2.reviewed_at === after.reviewed_at}`,
    );
    await mgr.end();
  }

  // ── 3: superseded between render and Approve → refused, closed ──────────
  {
    const w = await makeWorld(a, `${tag}-c3`);
    const entry = await makeEntry(a, w, "įrašas patvirtinimui");
    const item = await makeQueueItem(a, w, entry);
    const mgr = await asUser(w.managerProfileId);

    // "Render" happened here: the item is live and the UI shows Approve.
    const rendered = await queueRow(a, item);
    // The worker edits the entry AFTER the render.
    await supersede(a, w, entry);
    // The manager now clicks Approve.
    const { rows } = await mgr.query(
      `select public.set_learning_review_item_status($1, 'approved', null) as outcome`,
      [item],
    );
    const after = await queueRow(a, item);
    record(
      "3. superseded between render and Approve → refused + terminal close",
      rendered.status === "pending" &&
        rows[0].outcome === "entry_superseded" &&
        after.status === "superseded" &&
        after.status !== "approved",
      `outcome=${rows[0].outcome} status=${after.status} note="${after.review_note}"`,
    );
    await mgr.end();
  }

  // ── 4: deleted between render and Reject → refused, closed ─────────────
  {
    const w = await makeWorld(a, `${tag}-c4`);
    const entry = await makeEntry(a, w, "įrašas atmetimui");
    const item = await makeQueueItem(a, w, entry);
    const mgr = await asUser(w.managerProfileId);
    await softDelete(a, entry);

    const { rows } = await mgr.query(
      `select public.set_learning_review_item_status($1, 'rejected', 'per mažai įrodymų') as outcome`,
      [item],
    );
    const after = await queueRow(a, item);
    record(
      "4. deleted between render and Reject → refused + terminal close",
      rows[0].outcome === "entry_deleted" &&
        after.status === "superseded" &&
        after.status !== "rejected" &&
        after.review_note === "stale: entry_deleted",
      `outcome=${rows[0].outcome} status=${after.status} note="${after.review_note}"`,
    );

    // The refused decision must be visible in the audit log, with the decision
    // that was refused — history retained, nothing silently dropped.
    const { rows: audit } = await a.query(
      `select payload->>'refused_decision' as refused, payload->>'outcome' as outcome
         from public.audit_logs
        where action = 'close_stale_learning_review_item' and entity_id = $1`,
      [item],
    );
    record(
      "4b. the refused decision is audited (history retained)",
      audit.length === 1 &&
        audit[0].refused === "rejected" &&
        audit[0].outcome === "entry_deleted",
      `rows=${audit.length} refused=${audit[0]?.refused} outcome=${audit[0]?.outcome}`,
    );
    await mgr.end();
  }

  // ── 5 + 6: the happy paths are unchanged ───────────────────────────────
  {
    const w = await makeWorld(a, `${tag}-c5`);
    const liveA = await makeEntry(a, w, "gyvas įrašas A");
    const itemA = await makeQueueItem(a, w, liveA);
    const liveB = await makeEntry(a, w, "gyvas įrašas B");
    const itemB = await makeQueueItem(a, w, liveB);
    const mgr = await asUser(w.managerProfileId);

    const { rows: ap } = await mgr.query(
      `select public.set_learning_review_item_status($1, 'approved', null) as outcome`,
      [itemA],
    );
    const rowA = await queueRow(a, itemA);
    record(
      "5. valid learning APPROVAL still works",
      ap[0].outcome === "approved" &&
        rowA.status === "approved" &&
        rowA.reviewed_by === w.managerProfileId &&
        rowA.reviewed_at !== null,
      `outcome=${ap[0].outcome} status=${rowA.status} reviewedBy=${rowA.reviewed_by === w.managerProfileId}`,
    );

    const { rows: rj } = await mgr.query(
      `select public.set_learning_review_item_status($1, 'rejected', 'nepakanka') as outcome`,
      [itemB],
    );
    const rowB = await queueRow(a, itemB);
    record(
      "6. valid learning REJECTION still works (note preserved)",
      rj[0].outcome === "rejected" &&
        rowB.status === "rejected" &&
        rowB.review_note === "nepakanka",
      `outcome=${rj[0].outcome} status=${rowB.status} note="${rowB.review_note}"`,
    );

    // A live item must survive the cleanup sweep untouched.
    const liveC = await makeEntry(a, w, "gyvas įrašas C");
    const itemC = await makeQueueItem(a, w, liveC);
    await mgr.query(`select public.close_stale_learning_review_items(null)`);
    const rowC = await queueRow(a, itemC);
    record(
      "6b. the cleanup never touches a LIVE pending item",
      rowC.status === "pending" && rowC.reviewed_by === null,
      `status=${rowC.status} reviewedBy=${rowC.reviewed_by}`,
    );
    await mgr.end();
  }

  // ── 7: TRUE CONCURRENCY — supersede races the decision ─────────────────
  {
    const w = await makeWorld(a, `${tag}-c7`);
    const entry = await makeEntry(a, w, "lenktynių įrašas");
    const item = await makeQueueItem(a, w, entry);
    const newId = await makeEntry(a, w, "lenktynių nauja versija");

    const mgr = await asUser(w.managerProfileId);
    const worker = await asUser(w.workerProfileId);

    // Session A (worker): open a transaction and take FOR UPDATE on the entry,
    // exactly as journal_entry_supersede_v2 does, but do NOT commit yet.
    await worker.query("begin");
    await worker.query(
      `select id from public.journal_entries where id = $1 for update`,
      [entry],
    );

    // Session B (manager): the decision. It must BLOCK on the entry's FOR KEY
    // SHARE re-read rather than sail past with the stale snapshot.
    const decision = mgr
      .query(
        `select public.set_learning_review_item_status($1, 'approved', null) as outcome`,
        [item],
      )
      .then((r) => r.rows[0].outcome as string);

    // Give the decision a moment to reach the lock, then complete the supersede.
    await new Promise((r) => setTimeout(r, 400));
    const { rows: waiting } = await a.query(
      `select count(*)::int as n from pg_stat_activity
        where wait_event_type = 'Lock' and query like '%set_learning_review_item_status%'`,
    );
    await worker.query(
      `update public.journal_entries set superseded_by = $2, updated_at = now() where id = $1`,
      [entry, newId],
    );
    await worker.query("commit");

    const outcome = await decision;
    const after = await queueRow(a, item);
    record(
      "7. CONCURRENCY: supersede racing Approve is serialized, decision refused",
      waiting[0].n === 1 &&
        outcome === "entry_superseded" &&
        after.status === "superseded" &&
        after.status !== "approved",
      `blockedOnLock=${waiting[0].n === 1} outcome=${outcome} status=${after.status}`,
    );
    await worker.end();
    await mgr.end();
  }

  // ── 7b: TRUE CONCURRENCY vs SOFT DELETE (Codex rev12 P1) ───────────────
  //
  // The regression this proves: journal_entry_soft_delete is a bare
  // `update ... set deleted_at, updated_at`, which takes only FOR NO KEY
  // UPDATE. A FOR KEY SHARE re-read does NOT conflict with that, so the
  // decision could commit against a source the worker deleted concurrently.
  // With FOR UPDATE the decision must block and then observe the delete.
  {
    const w = await makeWorld(a, `${tag}-c7b`);
    const entry = await makeEntry(a, w, "trynimo lenktynių įrašas");
    const item = await makeQueueItem(a, w, entry);

    const mgr = await asUser(w.managerProfileId);
    const worker = await asUser(w.workerProfileId);

    // Session A (worker): the SOFT-DELETE shape — a plain UPDATE on non-key
    // columns, uncommitted. This is the exact lock the real RPC takes.
    await worker.query("begin");
    await worker.query(
      `update public.journal_entries set deleted_at = now(), updated_at = now()
        where id = $1`,
      [entry],
    );

    // Session B (manager): Approve. Must BLOCK on the entry lock.
    const decision = mgr
      .query(
        `select public.set_learning_review_item_status($1, 'approved', null) as outcome`,
        [item],
      )
      .then((r) => r.rows[0].outcome as string);

    await new Promise((r) => setTimeout(r, 400));
    const { rows: waiting } = await a.query(
      `select count(*)::int as n from pg_stat_activity
        where wait_event_type = 'Lock' and query like '%set_learning_review_item_status%'`,
    );
    await worker.query("commit");

    const outcome = await decision;
    const after = await queueRow(a, item);
    record(
      "7b. CONCURRENCY: SOFT DELETE racing Approve is serialized, decision refused",
      waiting[0].n === 1 &&
        outcome === "entry_deleted" &&
        after.status === "superseded" &&
        after.status !== "approved",
      `blockedOnLock=${waiting[0].n === 1} outcome=${outcome} status=${after.status}`,
    );
    await worker.end();
    await mgr.end();
  }

  // ── 7c: the guard trigger blocks the same soft-delete race ─────────────
  {
    const w = await makeWorld(a, `${tag}-c7c`);
    const entry = await makeEntry(a, w, "trigerio trynimo lenktynės");
    const item = await makeQueueItem(a, w, entry);
    const worker = await asUser(w.workerProfileId);

    await worker.query("begin");
    await worker.query(
      `update public.journal_entries set deleted_at = now(), updated_at = now()
        where id = $1`,
      [entry],
    );

    // A DIRECT write (the legacy path) must also be serialized by the trigger's
    // own FOR UPDATE re-read, then refused once the delete is visible.
    const direct = a
      .query(
        `update public.learning_review_queue set status = 'approved', updated_at = now()
          where id = $1`,
        [item],
      )
      .then(() => "committed")
      .catch((e) => (e as Error).message);

    await new Promise((r) => setTimeout(r, 400));
    await worker.query("commit");
    const outcome = await direct;
    const after = await queueRow(a, item);
    record(
      "7c. guard trigger serializes + refuses a DIRECT approve racing a soft delete",
      outcome.includes("entry_deleted") && after.status === "pending",
      `outcome="${outcome}" status=${after.status}`,
    );
    await worker.end();
  }

  // ── 7d: SOFT DELETE decides under the lock too (rev14, Codex P1) ───────
  //
  // The OPPOSITE ordering from 7b/C3b: the delete reads + counts confirmations
  // FIRST (seeing zero), then a confirmation commits, then the delete proceeds.
  // Without a lock on its initial read, journal_entry_soft_delete would act on
  // its stale count and leave a CONFIRMED entry deleted.
  {
    const w = await makeWorld(a, `${tag}-c7d`);
    const entry = await makeEntry(a, w, "istrynimo pirmumo lenktynes");

    const { rows: mgrCtx } = await a.query(
      `select id from public.engagement_contexts
        where profile_id = $1 and organization_id = $2 limit 1`,
      [w.managerProfileId, w.orgId],
    );

    const holder = await admin();
    const worker = await asUser(w.workerProfileId);

    // Session A: hold the entry lock WITHOUT having confirmed anything yet.
    await holder.query("begin");
    await holder.query(`select id from public.journal_entries where id = $1 for update`, [
      entry,
    ]);

    // Session B (worker): soft-delete. This is the discriminating step.
    //   * FIXED  — the very FIRST read takes FOR UPDATE, so B blocks HERE,
    //     before counting confirmations. When A commits, B's read (and its
    //     count) happen AFTER the confirmation exists -> already_confirmed.
    //   * BROKEN — B's unlocked read + count run immediately, observing ZERO
    //     confirmations, and B blocks only at the final UPDATE. When A commits,
    //     B proceeds on that stale count and deletes a CONFIRMED entry.
    const deleting = worker
      .query(`select public.journal_entry_soft_delete($1::uuid)`, [entry])
      .then(() => "deleted")
      .catch((e) => (e as Error).message);

    await new Promise((r) => setTimeout(r, 400));
    // Session A now confirms the entry and commits — strictly after B started.
    await holder.query(
      `insert into public.journal_entry_confirmations
         (entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope)
       values ($1, $2, $3, 'manager', '{"action":"confirm"}'::jsonb)`,
      [entry, w.managerProfileId, mgrCtx[0].id],
    );
    await holder.query("commit");
    const delOutcome = String(await deleting);

    const { rows: final } = await a.query(
      `select je.deleted_at is not null as deleted,
              (select count(*)::int from public.journal_entry_confirmations c
                where c.entry_id = je.id) as confs
         from public.journal_entries je where je.id = $1`,
      [entry],
    );
    // The invariant: an entry may be deleted OR confirmed, never both.
    const corrupt = final[0].deleted && final[0].confs > 0;
    record(
      "7d. soft delete decides under the lock (no deleted+confirmed entry)",
      !corrupt && delOutcome.includes("already_confirmed"),
      `deleteOutcome="${delOutcome.slice(0, 34)}" deleted=${final[0].deleted} confirmations=${final[0].confs}`,
    );
    await holder.end();
    await worker.end();
  }

  // ── 7e: auto-confirmation cannot overwrite a committed decision ────────
  //
  // rev14 (Codex P1): apply_learning_auto_confirmation used to read the queue
  // row UNLOCKED, so it could observe 'pending', have a manager rejection
  // commit underneath it, and then overwrite that human decision with
  // 'auto_actioned'. Both writers must take the same row lock.
  {
    const w = await makeWorld(a, `${tag}-c7e`);
    const entry = await makeEntry(a, w, "auto vs rankinis sprendimas");
    const item = await makeQueueItem(a, w, entry);
    await a.query(
      `insert into public.learning_policy_settings
         (organization_id, policy_kind, enabled, scope, rule, enabled_by, enabled_at)
       values ($1, 'auto_confirm_journal_skill', true,
               '{"all_org_workers":true}'::jsonb, '{"min_confidence":10}'::jsonb, $2, now())`,
      [w.orgId, w.managerProfileId],
    );

    const mgrA = await asUser(w.managerProfileId);
    const mgrB = await asUser(w.managerProfileId);

    // Session A: record a REJECTION and hold the transaction open.
    await mgrA.query("begin");
    const { rows: rej } = await mgrA.query(
      `select public.set_learning_review_item_status($1, 'rejected', 'ne') as outcome`,
      [item],
    );

    // Session B: auto-confirm the SAME item. It must block on the queue row.
    const auto = mgrB
      .query(`select public.apply_learning_auto_confirmation($1) as outcome`, [item])
      .then((r) => r.rows[0].outcome as string)
      .catch((e) => (e as Error).message);

    await new Promise((r) => setTimeout(r, 400));
    const { rows: blocked } = await a.query(
      `select count(*)::int as n from pg_stat_activity
        where wait_event_type = 'Lock' and query like '%apply_learning_auto_confirmation%'`,
    );
    await mgrA.query("commit");
    const autoOutcome = await auto;
    const after = await queueRow(a, item);
    record(
      "7e. auto-confirmation cannot overwrite a committed manager rejection",
      rej[0].outcome === "rejected" &&
        blocked[0].n >= 1 &&
        after.status === "rejected" &&
        !String(autoOutcome).startsWith("auto_confirmed"),
      `blockedOnLock=${blocked[0].n >= 1} autoOutcome=${autoOutcome} finalStatus=${after.status}`,
    );
    await mgrA.end();
    await mgrB.end();
  }

  // ── 8: the guard trigger backstops any DIRECT write ────────────────────
  {
    const w = await makeWorld(a, `${tag}-c8`);
    const entry = await makeEntry(a, w, "tiesioginio rašymo įrašas");
    const item = await makeQueueItem(a, w, entry);
    await supersede(a, w, entry);

    let raised = "";
    try {
      // Bypass the RPC entirely — the legacy direct-update path.
      await a.query(
        `update public.learning_review_queue set status = 'approved', updated_at = now()
          where id = $1`,
        [item],
      );
    } catch (e) {
      raised = (e as Error).message;
    }
    const after = await queueRow(a, item);
    record(
      "8. guard trigger refuses a DIRECT approve on a stale item",
      raised.includes("entry_superseded") && after.status === "pending",
      `raised="${raised}" status=${after.status}`,
    );

    // ...but the systemic terminal close must still be allowed through.
    await a.query(
      `update public.learning_review_queue set status = 'superseded', updated_at = now()
        where id = $1`,
      [item],
    );
    const closed = await queueRow(a, item);
    record(
      "8b. guard trigger ALLOWS the systemic terminal close",
      closed.status === "superseded",
      `status=${closed.status}`,
    );
  }

  // ── 9: authority is preserved ──────────────────────────────────────────
  {
    const w = await makeWorld(a, `${tag}-c9a`);
    const other = await makeWorld(a, `${tag}-c9b`);
    const entry = await makeEntry(a, w, "svetimos org įrašas");
    const item = await makeQueueItem(a, w, entry);
    await supersede(a, w, entry);

    // A manager of a DIFFERENT org.
    const outsider = await asUser(other.managerProfileId);
    const { rows: dec } = await outsider.query(
      `select public.set_learning_review_item_status($1, 'approved', null) as outcome`,
      [item],
    );
    const { rows: swept } = await outsider.query(
      `select public.close_stale_learning_review_items(null) as n`,
    );
    const after = await queueRow(a, item);
    record(
      "9. a foreign manager can neither decide nor sweep another org's item",
      dec[0].outcome === "not_authorized" &&
        swept[0].n === 0 &&
        after.status === "pending",
      `decision=${dec[0].outcome} swept=${swept[0].n} status=${after.status}`,
    );

    // The subject worker is not a reviewer either.
    const workerConn = await asUser(w.workerProfileId);
    const { rows: wdec } = await workerConn.query(
      `select public.set_learning_review_item_status($1, 'approved', null) as outcome`,
      [item],
    );
    record(
      "9b. the subject worker cannot decide about themselves",
      wdec[0].outcome === "not_authorized",
      `outcome=${wdec[0].outcome}`,
    );
    await outsider.end();
    await workerConn.end();
  }

  // ── 10: rollback identity ──────────────────────────────────────────────
  {
    const objects = [
      "close_stale_learning_review_items",
      "set_learning_review_item_status",
      "learning_review_queue_guard_stale",
    ];
    const countObjects = async () => {
      const { rows } = await a.query(
        `select count(*)::int as n from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = any($1)`,
        [objects],
      );
      const { rows: t } = await a.query(
        `select count(*)::int as n from pg_trigger
          where tgname = 'learning_review_queue_guard_stale_trg' and not tgisinternal`,
      );
      return { fns: rows[0].n as number, trg: t[0].n as number };
    };
    // Policy/grant fingerprint on the PRE-EXISTING table — must not drift.
    const fingerprint = async () => {
      const { rows } = await a.query(
        `select coalesce(string_agg(polname || '|' || pg_get_expr(polqual, polrelid, true), ',' order by polname), '') as f
           from pg_policy where polrelid = 'public.learning_review_queue'::regclass`,
      );
      const { rows: g } = await a.query(
        `select coalesce(string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type), '') as g
           from information_schema.role_table_grants
          where table_schema = 'public' and table_name = 'learning_review_queue'`,
      );
      return `${rows[0].f}||${g[0].g}`;
    };

    const beforeObjs = await countObjects();
    const beforeFp = await fingerprint();

    const downSql = readFileSync(
      join(REPO_ROOT, "supabase/rollbacks/20260720170000_learning_stale_lifecycle_v1.down.sql"),
      "utf-8",
    );
    await a.query(downSql);

    const afterObjs = await countObjects();
    const afterFp = await fingerprint();
    record(
      "10. rollback drops all 4 objects and leaves authorization unchanged",
      beforeObjs.fns === 3 &&
        beforeObjs.trg === 1 &&
        afterObjs.fns === 0 &&
        afterObjs.trg === 0 &&
        beforeFp === afterFp &&
        beforeFp.length > 0,
      `fns ${beforeObjs.fns}->${afterObjs.fns} trg ${beforeObjs.trg}->${afterObjs.trg} policyGrantFingerprintStable=${beforeFp === afterFp}`,
    );

    // Re-apply so the scratch DB is left on the full current chain.
    const upSql = readFileSync(
      join(REPO_ROOT, "supabase/migrations/20260720170000_learning_stale_lifecycle_v1.sql"),
      "utf-8",
    );
    await a.query(upSql);
    const reapplied = await countObjects();
    record(
      "10b. re-apply after rollback restores all 4 objects (round trip is clean)",
      reapplied.fns === 3 && reapplied.trg === 1,
      `fns=${reapplied.fns} trg=${reapplied.trg}`,
    );
  }

  await a.end();

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} proofs passed.`);
  if (passed !== results.length) {
    console.error("FAILURES:");
    for (const r of results.filter((x) => !x.pass)) {
      console.error(`  - ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
