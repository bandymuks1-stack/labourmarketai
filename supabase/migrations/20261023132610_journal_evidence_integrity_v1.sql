-- @human-gate-approved  (acknowledgement only: RED class — triggers on the
-- legal-proof spine + a storage policy change; draft + needs-human-gate;
-- NOT applied; the owner applies via Supabase MCP after approval.
-- Owner decision N-9, docs/audits/MASTER_AUDIT_2026-10-16.md §6 / §9.)
--
-- 20261023132610_journal_evidence_integrity_v1 — SERVER-AUTHORITATIVE
-- JOURNAL HASH CHAIN + IMMUTABLE EVIDENCE (audit 2026-10-16, SEC-3/5/6/7).
--
-- ── WHAT WAS WRONG ─────────────────────────────────────────────────────────
-- 1. `hash_self` / `hash_prev` were computed in the APP (journal-write-core.ts)
--    over a timestamp that is never stored, and `create_journal_entry_full`
--    inserted whatever the client sent. The direct INSERT policy
--    (20260530130000) also admits a PostgREST insert. A worker could therefore
--    insert an entry with a forged `hash_prev`/`hash_self` (the e2e spec
--    integrated-fixes.spec.ts already does, for a different reason), and no
--    reader could ever recompute the chain. Doctrine §3.3 says the chain is
--    computed server-side on insert. The tamper-evidence claim of the
--    product's legal-proof spine was unsupported.
-- 2. `journal_entries` had no UPDATE/DELETE/TRUNCATE guard — protection was
--    RLS default-deny plus narrow grants (authenticated = select, insert).
--    Ten SECURITY DEFINER RPCs legitimately UPDATE it (soft-delete, restore,
--    supersede), so a definer bug or an owner session could silently rewrite
--    the content columns. 20260530130000 §22-25 recorded this trigger as
--    deferred.
-- 3. The `journal-entry-photos` bucket let the owner hard-delete ANY object
--    under their folder, including the evidence behind a confirmed record
--    (the `document-files` and `evidence-media` buckets already use
--    orphan-only deletes).
-- 4. `audit_logs` was mutable by any definer/owner session (no refuse
--    trigger).
--
-- ── WHAT THIS DOES ─────────────────────────────────────────────────────────
-- A. `journal_entries.hash_version` (smallint, default 1): existing rows stay
--    version 1 (legacy, app-computed, not recomputable — honestly reported as
--    such by the verifier); every new row is version 2.
-- B. BEFORE INSERT trigger `journal_entries_chain_v1`: takes a per-worker
--    transaction advisory lock (two concurrent saves can no longer fork the
--    chain), reads the worker's current head, and OVERWRITES whatever the
--    client supplied: hash_prev := head.hash_self, hash_self := sha256 over
--    the STORED columns (id, worker, engagement, type, profession, text,
--    language, created_at, hash_prev). `created_at` is server-set and strictly
--    monotonic per worker under the lock, so a client-dated row can neither
--    reorder nor fork the chain. `project_id` is NOT hashed: project
--    attribution is a lifecycle fact the attribution guard (20261003151300)
--    already validates and the live RPCs may correct; the evidence is WHAT
--    was recorded, by whom, in which engagement, when. Every existing RPC
--    keeps its signature — `p_hash_prev` / `p_hash_self` are simply ignored.
-- C. BEFORE UPDATE / DELETE guard `journal_entries_evidence_guard_v1` and a
--    statement-level BEFORE TRUNCATE guard: the content and provenance columns
--    (id, worker_id, engagement_context_id, entry_type_slug, profession_id,
--    original_text, original_language, hash_prev, hash_self, hash_version,
--    created_at, correction_of) are immutable; only the lifecycle columns the
--    live RPCs change (deleted_at, superseded_by, updated_at, project_id,
--    visibility_scope) may change. DELETE and TRUNCATE are refused.
--    The first bypass is for a service-role erasure session: `current_user =
--    'service_role'` AND `current_setting('lm.evidence_guard_bypass', true)
--    = 'erasure'` inside one transaction. No API role can set
--    that: `set_config` is not an exposed RPC, and the GUC is transaction-
--    local. The second (and last) door is the erasure executor v3's own
--    transaction — see G.
-- D. `verify_journal_chain_v1(p_worker_id)` — SECURITY INVOKER (the caller's
--    own RLS decides what it may read): recomputes every version-2 hash and
--    checks every link; reports `ok` / `legacy` / `prev_mismatch` /
--    `self_mismatch` per entry, never a summary that could hide a break.
-- E. Storage: `journal-entry-photos owner delete` becomes orphan-only — a
--    worker may remove an object that no `journal_entry_photos` row
--    references (the upload compensation path), never the evidence behind a
--    record.
-- F. `audit_logs`: BEFORE UPDATE / DELETE / TRUNCATE refuse (same bypass).
-- G. Erasure executor v3 compatibility (renumbered 2026-10-23 from
--    20261016190000, after main added 20261019140000_privacy_erasure_executor_v3,
--    which runs in production). `erase_user_account_v3` is SECURITY DEFINER:
--    inside it `current_user` is the function owner, never 'service_role', and
--    it never sets `lm.evidence_guard_bypass`. It DELETEs the person's own
--    journal entries (registry treatment `delete_rows`, owner decision L-1
--    2026-10-19), sets `audit_logs.actor_id` to NULL and pseudonymises
--    mentions inside `audit_logs.payload` — the last one in its value-rule
--    step, which disables no trigger. With only the service_role + GUC
--    bypass, every erasure of a person with a journal entry or an audit
--    mention would fail and roll back (fail closed, but a regression of a
--    working path). The bypass therefore ALSO holds inside the one transaction
--    that consumed a single-use erasure authorization and has not yet recorded
--    an outcome: `journal_evidence_erasure_executing_v1()` (SECURITY DEFINER,
--    read-only) looks for a `privacy_erasure_authorizations_v3` row with
--    `consumed_at = now()` (= this transaction's start, which the executor
--    writes in its step 9.1), `outcome IS NULL` and `receipt_id IS NULL`.
--    Only `erase_user_account_v3` writes `consumed_at`; the table is closed
--    to every API role; every committed consumption carries an outcome (the
--    executor sets it on every path, or the whole transaction rolls back).
--    The window therefore covers exactly the executor's own registry-decided
--    statements and nothing after them. No executor body, registry row, plan
--    digest or issued token changes.
--
-- ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────
-- - It does not rewrite history: no legacy hash is recomputed or replaced.
-- - It does not change any RPC signature or any RLS policy on the tables.
-- - It does not block the app's existing soft-delete / supersede / restore.
-- - It does not decide GDPR treatment of journal rows; it only guarantees that
--   whatever the owner/legal decide runs through the named bypass, in a
--   service-role transaction, and nowhere else.
--
-- ROLLBACK: supabase/rollbacks/20261023132610_journal_evidence_integrity_v1.down.sql
-- (drops the triggers/functions, restores the previous photo delete policy,
-- drops the column; legacy rows are untouched either way).

-- ── A. hash version ────────────────────────────────────────────────────────
alter table public.journal_entries
  add column if not exists hash_version smallint not null default 1;

comment on column public.journal_entries.hash_version is
  '1 = legacy app-computed hash (not recomputable); 2 = server-computed by journal_entries_chain_v1 over stored columns.';

-- ── G. the erasure executor's own transaction (v3, 20261019140000) ────────
-- SECURITY DEFINER so the check reads the closed authorization table whatever
-- role fires the guard; it returns one boolean and reads nothing else.
create or replace function public.journal_evidence_erasure_executing_v1()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if to_regclass('public.privacy_erasure_authorizations_v3') is null then
    return false;
  end if;
  return exists (
    select 1
      from public.privacy_erasure_authorizations_v3 a
     where a.consumed_at = now()      -- consumed in THIS transaction (now() = transaction start)
       and a.outcome is null          -- the executor has not finished or refused
       and a.receipt_id is null
  );
end;
$$;
revoke all on function public.journal_evidence_erasure_executing_v1() from public, anon, authenticated;
grant execute on function public.journal_evidence_erasure_executing_v1() to service_role;

-- ── bypass predicate (one definition, both guards) ────────────────────────
create or replace function public.journal_evidence_guard_bypassed_v1()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select (current_user = 'service_role'
          and coalesce(current_setting('lm.evidence_guard_bypass', true), '') = 'erasure')
      or public.journal_evidence_erasure_executing_v1();
$$;
revoke all on function public.journal_evidence_guard_bypassed_v1() from public, anon, authenticated;
-- The guard trigger functions are SECURITY INVOKER, so this nested call is
-- checked against the CALLER's role: service_role must be able to evaluate
-- it or the sanctioned erasure bypass itself fails 42501 (proof F1).
grant execute on function public.journal_evidence_guard_bypassed_v1() to service_role;

-- ── B. server-authoritative chain ─────────────────────────────────────────
create or replace function public.journal_entries_chain_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_head      text;
  v_head_at   timestamptz;
begin
  -- One writer per worker chain at a time: without this, two concurrent
  -- inserts read the same head and the chain forks (two rows, one prev).
  perform pg_advisory_xact_lock(hashtext('journal_chain:' || new.worker_id::text));

  select je.hash_self, je.created_at
    into v_head, v_head_at
    from public.journal_entries je
   where je.worker_id = new.worker_id
   order by je.created_at desc, je.id desc
   limit 1;

  -- Client-supplied values are IGNORED, never trusted. `created_at` is part
  -- of the chain ORDER, so it is server-authoritative and strictly monotonic
  -- per worker under the lock (proof F2, 2026-10-16): a client-dated row can
  -- neither reorder nor fork the chain. No live insert path supplies it.
  new.created_at   := greatest(now(), coalesce(v_head_at, now()) + interval '1 microsecond');
  new.hash_prev    := v_head;
  new.hash_version := 2;
  new.hash_self    := encode(extensions.digest(
      'v2' || '|' ||
      new.id::text || '|' ||
      new.worker_id::text || '|' ||
      new.engagement_context_id::text || '|' ||
      new.entry_type_slug || '|' ||
      coalesce(new.profession_id::text, '') || '|' ||
      new.original_text || '|' ||
      new.original_language || '|' ||
      to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
      coalesce(v_head, ''),
      'sha256'), 'hex');
  return new;
end;
$$;
revoke all on function public.journal_entries_chain_v1() from public, anon, authenticated;

drop trigger if exists journal_entries_chain_v1 on public.journal_entries;
-- Name sorts AFTER journal_entries_attribution_guard_v1 (20261003151300), so
-- the attribution guard runs first and the hash is computed over the row that
-- will actually be stored.
create trigger journal_entries_chain_v1
  before insert on public.journal_entries
  for each row execute function public.journal_entries_chain_v1();

-- ── C. immutable evidence ─────────────────────────────────────────────────
create or replace function public.journal_entries_evidence_guard_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.journal_evidence_guard_bypassed_v1() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'journal_entry_immutable: delete is never permitted (append-only evidence; soft-delete via deleted_at)'
      using errcode = '42501';
  end if;

  -- UPDATE: only the lifecycle columns may change.
  if new.id                    is distinct from old.id
  or new.worker_id             is distinct from old.worker_id
  or new.engagement_context_id is distinct from old.engagement_context_id
  or new.entry_type_slug       is distinct from old.entry_type_slug
  or new.profession_id         is distinct from old.profession_id
  or new.original_text         is distinct from old.original_text
  or new.original_language     is distinct from old.original_language
  or new.hash_prev             is distinct from old.hash_prev
  or new.hash_self             is distinct from old.hash_self
  or new.hash_version          is distinct from old.hash_version
  or new.created_at            is distinct from old.created_at
  or new.correction_of         is distinct from old.correction_of
  then
    raise exception 'journal_entry_immutable: content and provenance columns cannot change; record a correction (supersede) instead'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.journal_entries_evidence_guard_v1() from public, anon, authenticated;

create or replace function public.journal_entries_truncate_guard_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.journal_evidence_guard_bypassed_v1() then
    return null;
  end if;
  raise exception 'journal_entry_immutable: truncate is never permitted' using errcode = '42501';
end;
$$;
revoke all on function public.journal_entries_truncate_guard_v1() from public, anon, authenticated;

drop trigger if exists journal_entries_evidence_guard_v1 on public.journal_entries;
create trigger journal_entries_evidence_guard_v1
  before update or delete on public.journal_entries
  for each row execute function public.journal_entries_evidence_guard_v1();

drop trigger if exists journal_entries_truncate_guard_v1 on public.journal_entries;
create trigger journal_entries_truncate_guard_v1
  before truncate on public.journal_entries
  for each statement execute function public.journal_entries_truncate_guard_v1();

-- ── D. verifier ───────────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose: the caller sees exactly the rows RLS lets them
-- see (own journal, managed organizations, admin). A manager verifying a
-- worker's chain across engagements they cannot read gets `partial_view` on
-- the first link whose predecessor is invisible, never a false `ok`.
create or replace function public.verify_journal_chain_v1(p_worker_id uuid)
returns table (
  entry_id    uuid,
  "position"  integer,
  created_at  timestamptz,
  status      text
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  r          record;
  v_prev     text := null;
  v_prev_ver smallint := null;
  v_pos      integer := 0;
  v_expect   text;
  v_status   text;
begin
  for r in
    select je.*
      from public.journal_entries je
     where je.worker_id = p_worker_id
     order by je.created_at asc, je.id asc
  loop
    v_pos := v_pos + 1;
    if r.hash_version < 2 then
      v_status := 'legacy';
    else
      v_expect := encode(extensions.digest(
        'v2' || '|' || r.id::text || '|' || r.worker_id::text || '|' ||
        r.engagement_context_id::text || '|' || r.entry_type_slug || '|' ||
        coalesce(r.profession_id::text, '') || '|' || r.original_text || '|' ||
        r.original_language || '|' ||
        to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
        coalesce(r.hash_prev, ''), 'sha256'), 'hex');
      if v_expect <> r.hash_self then
        v_status := 'self_mismatch';
      elsif v_pos > 1 and r.hash_prev is distinct from v_prev then
        -- A version-2 row must point at the row before it. A legacy
        -- predecessor is allowed (the chain starts being verifiable here).
        v_status := case when v_prev_ver is not null and v_prev_ver < 2 and r.hash_prev is not null then 'ok' else 'prev_mismatch' end;
      elsif v_pos = 1 and r.hash_prev is not null then
        -- The first VISIBLE row has a predecessor the caller cannot see.
        v_status := 'partial_view';
      else
        v_status := 'ok';
      end if;
    end if;
    entry_id := r.id; position := v_pos; created_at := r.created_at; status := v_status;
    return next;
    v_prev := r.hash_self;
    v_prev_ver := r.hash_version;
  end loop;
  return;
end;
$$;
revoke all on function public.verify_journal_chain_v1(uuid) from public, anon;
grant execute on function public.verify_journal_chain_v1(uuid) to authenticated, service_role;

-- ── E. evidence photos: orphan-only delete ────────────────────────────────
drop policy if exists "journal-entry-photos owner delete" on storage.objects;
create policy "journal-entry-photos owner delete" on storage.objects
  for delete
  using (
    bucket_id = 'journal-entry-photos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
    -- orphan only: no journal record references this object
    and not exists (
      select 1 from public.journal_entry_photos p where p.storage_path = storage.objects.name
    )
  );

-- ── F. audit_logs immutability ────────────────────────────────────────────
create or replace function public.audit_logs_immutable_guard_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.journal_evidence_guard_bypassed_v1() then
    return case when tg_op = 'DELETE' then old when tg_op = 'TRUNCATE' then null else new end;
  end if;
  raise exception 'audit_log_immutable: % is never permitted', tg_op using errcode = '42501';
end;
$$;
revoke all on function public.audit_logs_immutable_guard_v1() from public, anon, authenticated;

drop trigger if exists audit_logs_immutable_guard_v1 on public.audit_logs;
create trigger audit_logs_immutable_guard_v1
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable_guard_v1();

drop trigger if exists audit_logs_truncate_guard_v1 on public.audit_logs;
create trigger audit_logs_truncate_guard_v1
  before truncate on public.audit_logs
  for each statement execute function public.audit_logs_immutable_guard_v1();

-- ── POST-APPLY CHECKLIST (owner channel, read-only) ───────────────────────
--   select count(*) filter (where hash_version = 2) from public.journal_entries;  -- 0 right after apply
--   -- after the first real entry: as that worker,
--   select * from public.verify_journal_chain_v1('<worker_id>');  -- last row status = 'ok'
--   -- as a worker, via PostgREST: update original_text → 42501; delete → 42501.
--   -- storage: remove a referenced photo object → 0 rows (policy), orphan → removed.
