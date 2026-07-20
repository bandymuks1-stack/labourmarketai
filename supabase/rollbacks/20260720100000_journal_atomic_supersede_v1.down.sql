-- ============================================================================
-- Rollback for 20260720100000_journal_atomic_supersede_v1.sql
--
-- 1. Drops journal_entry_supersede_v2 (new in that migration).
-- 2. Restores the PRIOR journal_entry_supersede body verbatim from
--    supabase/migrations/20260610213000_journal_entry_project_autolink.sql
--    (no lock, unconditional pointer update) — i.e. re-introduces the known
--    race; use only for a deliberate rollback.
-- 3. Restores the PRIOR journal_entry_restore body verbatim from
--    supabase/migrations/20260712120000_journal_entry_restore.sql.
-- ============================================================================

begin;

drop function if exists public.journal_entry_supersede_v2(
  uuid, uuid, text, uuid, text, char(2), text, text, jsonb, text[], text[]
);

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
  v_old_project_id   uuid;
begin
  select worker_id, deleted_at, project_id
    into v_worker_id, v_old_deleted_at, v_old_project_id
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
    correction_of,
    project_id
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
    case when v_old_confirmed > 0 then p_old_entry_id else null end,
    v_old_project_id
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

revoke all on function public.journal_entry_supersede(
  uuid, uuid, text, uuid, text, char(2), text, text, jsonb
) from public;
grant execute on function public.journal_entry_supersede(
  uuid, uuid, text, uuid, text, char(2), text, text, jsonb
) to authenticated;

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

commit;
