-- ============================================================================
-- APPLIED to prod via Supabase MCP apply_migration after owner + Chat Claude
-- review (2026-06-11, ledger version 20260611064312). Never `db push`.
--
-- journal_entries.project_id write flow (S4 item 1). The column exists since
-- 20260601091000 but NOTHING writes it: the save path is the
-- create_journal_entry_full RPC (0017, security INVOKER — its insert runs
-- under the caller's RLS) and journal_entries has NO update policy
-- (append-only by default-deny), so the link can only be set AT CREATION,
-- inside the RPC. This migration replaces the two save-path function BODIES
-- (same signatures, no schema change, no RLS/grant change):
--
--   * create_journal_entry_full — auto-links project_id when the worker has
--     EXACTLY ONE active F4 assignment (project_worker_assignments,
--     status='active') whose project belongs to the SAME organization as the
--     entry's engagement context. Ambiguous (0 or >1) → NULL, never a guess.
--   * journal_entry_supersede — a superseding/correcting entry CARRIES the
--     old entry's project_id (deterministic copy, not a re-derivation).
--
-- Old entries are deliberately NOT backfilled (handoff rule: no invented
-- history) — they stay project-less.
--
-- ROLLBACK at the bottom restores both 0017/0018 bodies verbatim.
-- ============================================================================

begin;

create or replace function public.create_journal_entry_full(
  p_worker_id             uuid,
  p_engagement_context_id uuid,
  p_entry_type_slug       text,
  p_profession_id         uuid,
  p_original_text         text,
  p_original_language     char(2),
  p_hash_prev             text,
  p_hash_self             text,
  p_visibility_scope      text,
  p_metrics               jsonb
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_entry_id      uuid;
  v_row           jsonb;
  v_project_id    uuid;
  v_project_count int;
begin
  -- S4 auto-link: the worker's active assignments whose project sits in the
  -- SAME organization as this entry's engagement context. Link ONLY when the
  -- match is unambiguous (exactly one) — otherwise NULL, never a guess.
  select count(*), min(pwa.project_id::text)::uuid
    into v_project_count, v_project_id
    from public.project_worker_assignments pwa
    join public.projects p on p.id = pwa.project_id
    join public.engagement_contexts ec on ec.id = p_engagement_context_id
   where pwa.worker_id = p_worker_id
     and pwa.status = 'active'
     and p.organization_id = ec.organization_id;
  if v_project_count is distinct from 1 then
    v_project_id := null;
  end if;

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
    project_id
  )
  values (
    p_worker_id,
    p_engagement_context_id,
    p_entry_type_slug,
    p_profession_id,
    p_original_text,
    p_original_language,
    p_hash_prev,
    p_hash_self,
    p_visibility_scope,
    v_project_id
  )
  returning id into v_entry_id;

  if jsonb_typeof(p_metrics) = 'array' then
    for v_row in select * from jsonb_array_elements(coalesce(p_metrics, '[]'::jsonb))
    loop
      insert into public.journal_entry_metrics (
        entry_id,
        metric_slug,
        value_text,
        value_numeric,
        unit_slug,
        source
      )
      values (
        v_entry_id,
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

  return v_entry_id;
end;
$$;

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

commit;

-- ROLLBACK (reverse SQL — restore the 0017 create_journal_entry_full body and
-- the 0018 journal_entry_supersede body verbatim, i.e. re-run the function
-- definitions from supabase/migrations/0017_seed_platform_productivity_units.sql
-- lines 67–138 and 0018_journal_correction_lifecycle.sql lines 93–194. No
-- schema/grant/RLS change to undo.)
