-- Rollback for 20261002120000_journal_explicit_project_attribution_v1.
-- Restores the 10-arg auto-link-only body (20260610213000, search_path pinned
-- as 20260612180000 did) and removes the 12-arg overload. Entries already
-- written with an explicit project_id keep it (data is not touched).
begin;
drop function if exists public.create_journal_entry_full(
  uuid, uuid, text, uuid, text, char(2), text, text, text, jsonb, uuid, boolean
);
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
set search_path = public
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

commit;
