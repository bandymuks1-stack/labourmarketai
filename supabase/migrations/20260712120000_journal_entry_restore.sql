-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260712120000 — journal entry restore RPC (user-journey root-cause
-- repair v1, finding #1: destructive-action honesty).
--
-- PROBLEM: the journal delete confirmation promised "the row stays in
-- history" while the product offered NO way to bring an entry back — the
-- worker-facing wording (which also leaked the implementation term
-- "soft-delete") described a recoverable action, but recovery did not exist.
-- The copy is repaired in the same PR; this migration adds the missing
-- recovery half so the promised behaviour is real.
--
-- SOLUTION: one RPC, the exact mirror of 0018's journal_entry_soft_delete:
--   public.journal_entry_restore(p_entry_id uuid)
--     - security definer with pinned search_path (same pattern as 0018);
--     - ownership re-checked via public.owns_worker (the only gate, since
--       definer bypasses RLS);
--     - idempotent: restoring a non-deleted entry is a no-op;
--     - refuses to restore an entry that was SUPERSEDED by a newer version
--       (restoring it would show two competing versions of the same work);
--     - clears deleted_at only — never fabricates or mutates content.
--
-- Additive only: no table/column changes, no RLS changes, no data backfill.
-- Rollback: supabase/rollbacks/20260712120000_journal_entry_restore.down.sql
-- ============================================================================

create or replace function public.journal_entry_restore(
  p_entry_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id      uuid;
  v_deleted_at     timestamptz;
  v_superseded_by  uuid;
begin
  select worker_id, deleted_at, superseded_by
    into v_worker_id, v_deleted_at, v_superseded_by
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

  if v_deleted_at is null then
    return; -- Idempotent.
  end if;

  if v_superseded_by is not null then
    raise exception 'entry_superseded_cannot_restore' using errcode = '42P10';
  end if;

  update public.journal_entries
     set deleted_at = null,
         updated_at = now()
   where id = p_entry_id;
end;
$$;

revoke all on function public.journal_entry_restore(uuid) from public;
grant execute on function public.journal_entry_restore(uuid) to authenticated;
