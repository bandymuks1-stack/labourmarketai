-- ============================================================================
-- RED-class by classification (replaces the body of an existing function and
-- adds an overload of a granted one). Owner approval for THIS migration and
-- scope: 2026-10-02 handoff §7 (JOURNAL_PROJECT_ATTRIBUTION_AMBIGUOUS).
-- Apply ONLY via Supabase MCP apply_migration. Never `db push`.
--
-- @human-gate-approved
--
-- THE DEFECT. create_journal_entry_full (20260610213000) set journal_entries.
-- project_id only when the worker had EXACTLY ONE active assignment in the
-- entry's organization. With 2+ it wrote NULL and the UI had no way to say
-- which — real hours were recorded and silently claimed by no project.
--
-- THE FIX (additive, no destructive schema change, no backfill):
--   * NEW 12-arg overload: adds p_project_id + p_project_explicit.
--       explicit=false → the previous auto-link rule, unchanged
--                        (exactly one active assignment → that project, else NULL).
--       explicit=true, project NULL → a deliberate non-project entry; no auto-link.
--       explicit=true, project set  → validated server-side: the worker has an
--                        ACTIVE assignment to that project AND the project belongs
--                        to the entry's own organization. Otherwise the save is
--                        refused (errcode 42501) — never silently re-pointed.
--   * The 10-arg function keeps its signature and becomes a thin wrapper that
--     calls the 12-arg one with (null,false) => byte-identical behaviour for
--     every existing caller. No DROP: the two arities cannot be ambiguous for
--     named-argument calls because the 12-arg overload has no defaults.
--   * SECURITY INVOKER throughout — the insert still runs under the caller's RLS.
--   * Old entries are NOT backfilled: no invented history.
--
-- ROLLBACK: supabase/rollbacks/20261002120000_journal_explicit_project_attribution_v1.down.sql
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
  p_metrics               jsonb,
  p_project_id            uuid,
  p_project_explicit      boolean
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
  if coalesce(p_project_explicit, false) then
    if p_project_id is not null then
      -- Explicit choice: the worker must be ACTIVELY assigned to this project
      -- and the project must sit in this entry's own organization.
      if not exists (
        select 1
          from public.project_worker_assignments pwa
          join public.projects p on p.id = pwa.project_id
          join public.engagement_contexts ec on ec.id = p_engagement_context_id
         where pwa.worker_id = p_worker_id
           and pwa.project_id = p_project_id
           and pwa.status = 'active'
           and p.organization_id = ec.organization_id
      ) then
        raise exception 'project_not_assignable' using errcode = '42501';
      end if;
    end if;
    v_project_id := p_project_id;
  else
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
  end if;

  insert into public.journal_entries (
    worker_id, engagement_context_id, entry_type_slug, profession_id,
    original_text, original_language, hash_prev, hash_self,
    visibility_scope, project_id
  )
  values (
    p_worker_id, p_engagement_context_id, p_entry_type_slug, p_profession_id,
    p_original_text, p_original_language, p_hash_prev, p_hash_self,
    p_visibility_scope, v_project_id
  )
  returning id into v_entry_id;

  if jsonb_typeof(p_metrics) = 'array' then
    for v_row in select * from jsonb_array_elements(coalesce(p_metrics, '[]'::jsonb))
    loop
      insert into public.journal_entry_metrics (
        entry_id, metric_slug, value_text, value_numeric, unit_slug, source
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

revoke all on function public.create_journal_entry_full(
  uuid, uuid, text, uuid, text, char(2), text, text, text, jsonb, uuid, boolean
) from public;
grant execute on function public.create_journal_entry_full(
  uuid, uuid, text, uuid, text, char(2), text, text, text, jsonb, uuid, boolean
) to authenticated;

-- The 10-arg entry point: same signature, same grants, same behaviour — now a
-- wrapper so the rule lives in exactly one place.
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
language sql
security invoker
set search_path = public
as $$
  select public.create_journal_entry_full(
    p_worker_id, p_engagement_context_id, p_entry_type_slug, p_profession_id,
    p_original_text, p_original_language, p_hash_prev, p_hash_self,
    p_visibility_scope, p_metrics, null::uuid, false
  )
$$;

commit;
