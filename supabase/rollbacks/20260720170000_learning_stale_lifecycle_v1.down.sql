-- ============================================================================
-- ROLLBACK for 20260720170000_learning_stale_lifecycle_v1.sql
--
-- Invite-Ready Closure Train v1 — Wagon 1: stale learning-review lifecycle.
--
-- The forward migration is PURELY ADDITIVE: it created two new SECURITY DEFINER
-- functions, one trigger function and one trigger. It altered no table, no
-- column, no policy and no grant on any pre-existing object, and it mutated no
-- data outside the honest terminal transitions its own RPCs perform.
--
-- This reverse file therefore drops exactly what the forward file created, and
-- NOTHING else:
--
--   * the BEFORE UPDATE guard trigger on public.learning_review_queue;
--   * public.learning_review_queue_guard_stale();
--   * public.set_learning_review_item_status(uuid, text, text);
--   * public.close_stale_learning_review_items(uuid).
--
-- AUTHORIZATION DRIFT: none is possible. Every dropped object was created by
-- the forward migration, so no pre-existing privilege, policy or RLS predicate
-- is touched. The `revoke all ... from public` / `grant execute ... to
-- authenticated` pairs disappear together with the functions they applied to.
-- The org-manager/admin authority model on learning_review_queue is defined by
-- the RLS policies from 20260627132759, which this round trip never reads or
-- writes.
--
-- BEHAVIOUR AFTER ROLLBACK: the app's learning actions detect the absent RPCs
-- (PostgREST 42883 / PGRST202) and fall back to their existing
-- `needs-migration` degradation path — a calm "not available yet" state, never
-- an error and never a fabricated row. `apply_learning_auto_confirmation` from
-- 20260720150000 is NOT touched and keeps closing stale items on its own path.
--
-- DATA: rows this migration's RPCs already closed keep their honest terminal
-- 'superseded' status, reviewed_by / reviewed_at / review_note. That history is
-- deliberately RETAINED — re-opening closed items would resurrect permanently
-- unactionable pending badges, which is the very defect this train fixed. No
-- row is deleted or rewritten by this rollback.
-- ============================================================================

begin;

-- rev14: restore the 0018 journal_entry_soft_delete body VERBATIM (the forward
-- migration replaced it only to add `for update` on the initial read). Same
-- signature, same authorization, same tagged exceptions — reverting the lock
-- reinstates the pre-existing race but introduces no authorization drift.
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
  select worker_id, deleted_at into v_worker_id, v_already_deleted
    from public.journal_entries
    where id = p_entry_id;

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

drop trigger if exists learning_review_queue_guard_stale_trg
  on public.learning_review_queue;

drop function if exists public.learning_review_queue_guard_stale();

drop function if exists public.set_learning_review_item_status(uuid, text, text);

drop function if exists public.close_stale_learning_review_items(uuid);

commit;
