-- @human-gate-approved
-- RED classes acknowledged (security definer / grant-revoke / create trigger):
-- owner-directed W1 of the Invite-Ready Closure Train v1 — the STALE LEARNING
-- LIFECYCLE, closing the three exact-head Codex P2 findings on PR #842.
--
-- This migration is ADDITIVE and does NOT touch the already-proven photo
-- continuity architecture (20260720150000). It adds the missing server-side
-- half of the stale story that 20260720150000 only handled inside
-- `apply_learning_auto_confirmation`:
--
--   1. public.close_stale_learning_review_items(uuid) — a race-safe, IDEMPOTENT
--      server-side cleanup that transitions every PENDING queue row whose source
--      journal entry is superseded/deleted to the honest terminal 'superseded'
--      status. Called on READ (the learning page loader) so a stale item is
--      closed even when nobody ever clicks a button, and even when the page is
--      first loaded long after the entry went stale. (P2-1)
--
--   2. public.set_learning_review_item_status(uuid, text, text) — the atomic
--      replacement for the app's direct `update learning_review_queue` write.
--      It LOCKS the queue row and RE-READS the linked journal entry inside the
--      same transaction, so a decision can never be recorded from a stale
--      render-time snapshot. A stale source is closed as terminal 'superseded'
--      and reported as entry_superseded / entry_deleted — never as an approval
--      or a rejection. (P2-2)
--
--   3. public.learning_review_queue_guard_stale() + its BEFORE UPDATE trigger —
--      the race-proof final guard. It takes FOR KEY SHARE on the source entry
--      (the same lock discipline the confirmation guard in 20260720150000 uses
--      against the supersedes' FOR UPDATE), so an approve/reject that races a
--      supersede is refused at the database boundary regardless of which code
--      path issued it. Systemic transitions ('superseded' / 'auto_actioned')
--      are deliberately NOT guarded — those are the honest terminal closes.
--
-- Authority is UNCHANGED: both RPCs re-check `public.is_admin() or
-- public.manages_organization(...)` at fire time, exactly like the existing
-- RLS policies and `apply_learning_auto_confirmation`. Nothing here broadens
-- who may review, and neither RPC can ever write `verified` — the only
-- confirmation path remains the audited spine.
--
-- Human-gated application per the train's RED migration discipline — DRY-RUN
-- ONLY until explicit owner approval; never self-applied.
--
-- ROLLBACK: paired reverse file
--   supabase/rollbacks/20260720170000_learning_stale_lifecycle_v1.down.sql
--   drops the trigger, the guard function and both RPCs, restoring the exact
--   pre-migration behaviour (the app falls back to its `needs-migration`
--   degradation path). It touches NO data and NO policy, so authorization
--   cannot drift across the round trip.
-- ============================================================================
-- 20260720170000_learning_stale_lifecycle_v1.sql
--
-- Invite-Ready Closure Train v1 — Wagon 1: stale learning-review lifecycle.
--
-- DEFECT (Codex P2-1/P2-2): a `learning_review_queue` row whose source journal
-- entry was superseded or deleted stayed `pending` forever. The supersede RPCs
-- do not touch the queue, and the only terminal transition lived inside
-- `apply_learning_auto_confirmation` — reachable ONLY through a button the UI
-- hides precisely when the item is stale. The row therefore kept a pending
-- badge indefinitely, and `setReviewItemStatus` could still stamp it approved
-- or rejected from an outdated client snapshot.
-- ============================================================================

begin;

-- == 1. Idempotent, race-safe stale cleanup (read-path + explicit) ==========
--
-- Returns the number of rows it closed. Running it twice closes nothing the
-- second time (the `status = 'pending'` predicate is the idempotency key), so
-- it is safe to call on every page load and safe to retry.
--
-- Race safety: READ COMMITTED re-evaluates the WHERE clause after taking the
-- row lock, so a row that another transaction just moved out of 'pending' is
-- skipped rather than overwritten. The guard trigger below is the final word.

create or replace function public.close_stale_learning_review_items(
  p_organization_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_n int := 0;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.learning_review_queue q
     set status      = 'superseded',
         reviewed_by = uid,
         reviewed_at = now(),
         review_note = case when je.deleted_at is not null
                            then 'stale: entry_deleted'
                            else 'stale: entry_superseded' end,
         updated_at  = now()
    from public.journal_entries je
   where je.id = q.journal_entry_id
     and q.status = 'pending'
     and (je.superseded_by is not null or je.deleted_at is not null)
     and (p_organization_id is null or q.organization_id = p_organization_id)
     -- Live authority of the CALLER, per row. A worker reading their own
     -- transparency list closes nothing; only an org manager/admin does.
     and (public.is_admin() or public.manages_organization(q.organization_id));
  get diagnostics v_n = row_count;

  -- Audit history is retained on the row itself (status + reviewed_by +
  -- reviewed_at + review_note). One bounded audit_logs row records the sweep;
  -- because the transition is one-way, this cannot flood the log.
  if v_n > 0 then
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'close_stale_learning_review_items', 'learning_review_queue', null,
      jsonb_build_object('organization_id', p_organization_id, 'items_closed', v_n));
  end if;

  return v_n;
end $$;

revoke all on function public.close_stale_learning_review_items(uuid) from public;
grant execute on function public.close_stale_learning_review_items(uuid) to authenticated;


-- == 2. Atomic, staleness-revalidating decision write =======================
--
-- Replaces the app-layer `update learning_review_queue set status = ...`.
-- Tagged returns: 'approved' | 'rejected' (the decision was recorded),
-- 'entry_superseded' | 'entry_deleted' (terminal stale — the item was closed
-- INSTEAD of the decision), 'item_not_found', 'not_pending', 'not_authorized',
-- 'invalid_status'.

create or replace function public.set_learning_review_item_status(
  p_review_item_id uuid,
  p_status         text,
  p_note           text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  v_org        uuid;
  v_entry      uuid;
  v_status     text;
  v_superseded uuid;
  v_deleted    timestamptz;
  v_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_outcome    text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  -- Only a manager decision is settable here. 'superseded' stays systemic and
  -- 'auto_actioned' is produced ONLY by the audited spine RPC.
  if p_status is null or p_status not in ('approved', 'rejected') then
    return 'invalid_status';
  end if;
  if v_note is not null and char_length(v_note) > 2000 then
    v_note := left(v_note, 2000);
  end if;

  -- LOCK the queue row first: serializes this decision against a concurrent
  -- decision, a concurrent read-path cleanup and the spine RPC.
  select organization_id, journal_entry_id, status
    into v_org, v_entry, v_status
  from public.learning_review_queue
  where id = p_review_item_id
  for update;
  if not found then return 'item_not_found'; end if;

  -- Live authority of the CALLER over the item's org (no stored-flag trust,
  -- identical to the check apply_learning_auto_confirmation makes).
  if not (public.is_admin() or public.manages_organization(v_org)) then
    return 'not_authorized';
  end if;
  if v_status <> 'pending' then return 'not_pending'; end if;

  -- THE P2-2 FIX: re-read the SOURCE entry inside this transaction, never the
  -- client's render-time snapshot.
  --
  -- LOCK STRENGTH (rev12, Codex P1): this MUST be FOR UPDATE, not FOR KEY
  -- SHARE. The two ways an entry goes stale take different locks:
  --   * journal_entry_supersede{,_v2} takes an explicit FOR UPDATE;
  --   * journal_entry_soft_delete (0018) is a bare `update ... set deleted_at,
  --     updated_at`, which touches no key column and therefore takes only
  --     FOR NO KEY UPDATE.
  -- FOR KEY SHARE conflicts with FOR UPDATE but NOT with FOR NO KEY UPDATE, so
  -- it would serialize the supersede race while leaving the SOFT-DELETE race
  -- open: the worker could commit a delete between this read and our commit
  -- and the decision would land on a deleted source. FOR UPDATE conflicts with
  -- both, closing the lifecycle against every staleness path.
  --
  -- Lock ORDER is always queue row -> entry row (here and in the guard
  -- trigger), and the supersede/soft-delete paths never take a queue lock, so
  -- no cycle is possible.
  if v_entry is not null then
    select je.superseded_by, je.deleted_at
      into v_superseded, v_deleted
    from public.journal_entries je
    where je.id = v_entry
    for update;

    -- `not found` = the source row is gone entirely (hard delete). The FK is
    -- ON DELETE CASCADE so this is defensive, but it is still terminal stale.
    if not found then
      v_deleted := now();
    end if;

    if v_deleted is not null or v_superseded is not null then
      v_outcome := case when v_deleted is not null
                        then 'entry_deleted' else 'entry_superseded' end;
      update public.learning_review_queue
         set status      = 'superseded',
             reviewed_by = uid,
             reviewed_at = now(),
             review_note = 'stale: ' || v_outcome,
             updated_at  = now()
       where id = p_review_item_id
         and status = 'pending';

      insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
      values (uid, 'close_stale_learning_review_item', 'learning_review_queue',
              p_review_item_id,
              jsonb_build_object('organization_id', v_org, 'journal_entry_id', v_entry,
                'outcome', v_outcome, 'refused_decision', p_status));

      -- The manager's decision is REFUSED, not recorded.
      return v_outcome;
    end if;
  end if;

  update public.learning_review_queue
     set status      = p_status,
         reviewed_by = uid,
         reviewed_at = now(),
         review_note = v_note,
         updated_at  = now()
   where id = p_review_item_id
     and status = 'pending';
  if not found then return 'not_pending'; end if;

  return p_status;
end $$;

revoke all on function public.set_learning_review_item_status(uuid, text, text) from public;
grant execute on function public.set_learning_review_item_status(uuid, text, text) to authenticated;


-- == 2b. Soft delete must LOCK before it decides ============================
--
-- rev14 (Codex P1): strengthening the confirmation guard to FOR UPDATE closed
-- only ONE ordering. journal_entry_soft_delete (0018) reads the entry and
-- counts confirmations while holding NO row lock, then updates. In the
-- opposite interleaving the delete pauses after counting zero confirmations,
-- the confirmation guard acquires FOR UPDATE, inserts and commits — and the
-- paused delete then proceeds on its stale count, leaving a CONFIRMED entry
-- deleted. Serialization needs both sides to take the lock, so the decision
-- and the write happen under it.
--
-- Body is 0018 verbatim except for the `for update` on the initial read, which
-- now covers the confirmation count and the update. No signature, no
-- authorization, no error contract changes: same tagged exceptions
-- (entry_not_found / not_owner / already_confirmed_use_correction_request),
-- same idempotent early return.

create or replace function public.journal_entry_soft_delete(
  p_entry_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id        uuid;
  v_already_deleted  timestamptz;
  v_confirmed_count  int;
begin
  -- THE FIX: take the row lock BEFORE reading, so the confirmation count below
  -- and the update at the end are decided under the same lock the
  -- confirmation guard and the supersedes take.
  select worker_id, deleted_at into v_worker_id, v_already_deleted
    from public.journal_entries
    where id = p_entry_id
    for update;

  if v_worker_id is null then
    raise exception 'entry_not_found' using errcode = 'P0002';
  end if;

  -- Ownership check — security definer bypasses RLS, so this is the only
  -- gate that stops a caller from acting on someone else's entry.
  if not public.owns_worker(v_worker_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  if v_already_deleted is not null then
    return; -- Idempotent.
  end if;

  select count(*) into v_confirmed_count
    from public.journal_entry_confirmations
    where entry_id = p_entry_id;

  if v_confirmed_count > 0 then
    raise exception 'already_confirmed_use_correction_request'
      using errcode = '42P10';
  end if;

  update public.journal_entries
     set deleted_at = now(),
         updated_at = now()
   where id = p_entry_id;
end;
$$;

revoke all on function public.journal_entry_soft_delete(uuid) from public;
grant execute on function public.journal_entry_soft_delete(uuid) to authenticated;


-- == 3. Race-proof final guard trigger ======================================
--
-- Even if some other caller (a legacy deployed build, a direct PostgREST
-- write) tries to stamp approved/rejected on an item whose source went stale,
-- the database refuses it. It takes the SAME FOR UPDATE lock as the decision
-- RPC above (see the lock-strength note there): FOR KEY SHARE would leave the
-- soft-delete race open, because journal_entry_soft_delete only takes
-- FOR NO KEY UPDATE.
--
-- Deliberately NOT guarded: transitions to 'superseded' / 'auto_actioned' —
-- those ARE the honest terminal closes this train introduces.

create or replace function public.learning_review_queue_guard_stale()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_superseded uuid;
  v_deleted    timestamptz;
begin
  if new.status in ('approved', 'rejected')
     and new.status is distinct from old.status
     and new.journal_entry_id is not null then
    select je.superseded_by, je.deleted_at
      into v_superseded, v_deleted
    from public.journal_entries je
    where je.id = new.journal_entry_id
    for update;

    if v_deleted is not null then
      raise exception 'entry_deleted' using errcode = '55000';
    end if;
    if v_superseded is not null then
      raise exception 'entry_superseded' using errcode = '55000';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists learning_review_queue_guard_stale_trg
  on public.learning_review_queue;
create trigger learning_review_queue_guard_stale_trg
  before update on public.learning_review_queue
  for each row
  execute function public.learning_review_queue_guard_stale();

commit;
