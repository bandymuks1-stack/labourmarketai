-- ════════════════════════════════════════════════════════════════════════
-- 0018 — Journal correction / edit / delete lifecycle.
--
-- v3 contract (journal-evidence-loop sprint):
--   - Before any external confirmation: the worker may edit / delete /
--     append to their own entries normally. Edits transparently supersede
--     the previous row (basic version history via `superseded_by`).
--   - After at least one external confirmation: the worker may submit a
--     "correction request" — a new entry whose `correction_of` points at
--     the confirmed original. The original stays untouched and visible;
--     direct delete is rejected.
--
-- This migration is additive — no schema removals, no policy weakening,
-- no broadened grants. The two new RPCs ship as `security definer` so
-- they can flip the lifecycle columns (which the existing default-deny
-- UPDATE policy on journal_entries otherwise blocks), but they enforce
-- ownership internally via `public.owns_worker(...)` so a caller can
-- never mutate someone else's entry. Service_role is NOT used.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. New columns on journal_entries ───────────────────────────────────
-- `deleted_at`   — soft-delete marker for pre-confirmation deletions.
-- `correction_of` — points an entry at the original it is meant to
--                   correct when the original was already confirmed.
--                   Free pre-confirmation edits use the existing
--                   `superseded_by` column on the OLD entry instead.
alter table public.journal_entries
  add column if not exists deleted_at    timestamptz,
  add column if not exists correction_of uuid references public.journal_entries(id);

create index if not exists idx_journal_entries_deleted_at
  on public.journal_entries(deleted_at)
  where deleted_at is not null;
create index if not exists idx_journal_entries_correction_of
  on public.journal_entries(correction_of)
  where correction_of is not null;

-- ── 2. RPC: soft-delete an entry the caller owns AND no external party
--           has confirmed yet. Otherwise raises a tagged exception. ────
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

-- ── 3. RPC: create a NEW entry that supersedes an existing one. ────────
-- Pre-confirmation: new entry replaces old transparently; old gets
--   `superseded_by` → new.id (so the list filter can hide superseded
--   rows by default).
-- Post-confirmation: new entry is recorded as a correction request via
--   `correction_of` → old.id. The OLD entry is never modified and
--   never deleted. The UI surfaces both.
create or replace function public.journal_entry_supersede(
  p_old_entry_id          uuid,
  p_engagement_context_id uuid,
  p_entry_type_slug       text,
  p_profession_id         uuid,
  p_original_text         text,
  p_original_language     char(2),
  p_hash_self             text,
  p_visibility_scope      text,
  p_metrics               jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id        uuid;
  v_old_confirmed    int;
  v_new_entry_id     uuid;
  v_row              jsonb;
  v_old_deleted_at   timestamptz;
begin
  select worker_id, deleted_at into v_worker_id, v_old_deleted_at
    from public.journal_entries
    where id = p_old_entry_id;

  if v_worker_id is null then
    raise exception 'entry_not_found' using errcode = 'P0002';
  end if;
  if v_old_deleted_at is not null then
    raise exception 'cannot_supersede_deleted' using errcode = '42P10';
  end if;
  if not public.owns_worker(v_worker_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  select count(*) into v_old_confirmed
    from public.journal_entry_confirmations
    where entry_id = p_old_entry_id;

  insert into public.journal_entries (
    worker_id,
    engagement_context_id,
    entry_type_slug,
    profession_id,
    original_text,
    original_language,
    hash_prev,
    hash_self,
    visibility_scope,
    correction_of
  )
  values (
    v_worker_id,
    p_engagement_context_id,
    p_entry_type_slug,
    p_profession_id,
    p_original_text,
    p_original_language,
    (select hash_self
       from public.journal_entries
      where worker_id = v_worker_id
        and deleted_at is null
      order by created_at desc
      limit 1),
    p_hash_self,
    p_visibility_scope,
    case when v_old_confirmed > 0 then p_old_entry_id else null end
  )
  returning id into v_new_entry_id;

  if jsonb_typeof(p_metrics) = 'array' then
    for v_row in select * from jsonb_array_elements(coalesce(p_metrics, '[]'::jsonb))
    loop
      insert into public.journal_entry_metrics (
        entry_id, metric_slug, value_text, value_numeric, unit_slug, source
      )
      values (
        v_new_entry_id,
        v_row->>'metric_slug',
        nullif(v_row->>'value_text', ''),
        case
          when v_row ? 'value_numeric' and v_row->>'value_numeric' is not null
            then (v_row->>'value_numeric')::numeric
          else null
        end,
        nullif(v_row->>'unit_slug', ''),
        coalesce(v_row->>'source', 'worker_input')
      );
    end loop;
  end if;

  if v_old_confirmed = 0 then
    update public.journal_entries
       set superseded_by = v_new_entry_id,
           updated_at = now()
     where id = p_old_entry_id;
  end if;

  return v_new_entry_id;
end;
$$;

-- ── 4. Grants ───────────────────────────────────────────────────────────
revoke all on function public.journal_entry_soft_delete(uuid) from public;
grant execute on function public.journal_entry_soft_delete(uuid) to authenticated;

revoke all on function public.journal_entry_supersede(
  uuid, uuid, text, uuid, text, char(2), text, text, jsonb
) from public;
grant execute on function public.journal_entry_supersede(
  uuid, uuid, text, uuid, text, char(2), text, text, jsonb
) to authenticated;
