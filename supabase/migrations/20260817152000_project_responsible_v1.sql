-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration by the LEAD session. Never
-- `db push`. Independent of the other train-D migrations (no cross-FK).
--
-- @human-gate-approved — pre-approved by owner mandate 2026-08-17 (autonomous
-- functional completion train V2, §4 migration authority). Safety class:
-- ADDITIVE (one nullable column on projects + one new SECURITY DEFINER RPC;
-- nothing existing is recreated). SECURITY DEFINER + GRANT/REVOKE are
-- RED-class by construction; the annotation states the ROUTE, not the
-- decision.
--
-- 20260817152000 — project responsible person v1 (full-reality audit
-- 2026-08-17, WORK section: the project row has no accountable person).
--
-- PROBLEM: a project has a company, an organization, workers and stages —
-- but NO named responsible person. "Who owns this project?" is answered by
-- tribal knowledge.
--
-- SOLUTION (smallest honest slice): ONE nullable pointer +
-- ONE gated write RPC.
--   - projects.responsible_profile_id — nullable, ON DELETE SET NULL (a
--     departed person never blocks reading the project).
--   - set_project_responsible_v1 — managing roles only (the EXISTING
--     can_manage_project authority, the W11 lifecycle precedent), target
--     must be an ACTIVE member of the project's organization
--     (company_memberships) OR a worker the caller manages
--     (caller_manages_worker). One audit row per real change
--     (audit_logs, ids only — the W11 idiom).
--
-- WHAT IS DELIBERATELY NOT ADDED: no approval chain (workflow engine
-- integration is an action-layer decision, PR #1170); no notification
-- fan-out in SQL; no change to set_project_status_v1 or any other existing
-- function.
--
-- RLS DECISION, STATED EXPLICITLY: no policy change — the new column rides
-- the EXISTING projects RLS (owner / manager / assigned worker / admin).
--
-- ROLLBACK: supabase/rollbacks/20260817152000_project_responsible_v1.down.sql
-- (drops the RPC; 0-set assertion before dropping the column).
-- ============================================================================

begin;

alter table public.projects
  add column if not exists responsible_profile_id uuid references public.profiles(id) on delete set null;

create or replace function public.set_project_responsible_v1(
  p_project_id text,
  p_profile_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_project uuid := nullif(trim(coalesce(p_project_id, '')), '')::uuid;
  v_target  uuid := nullif(trim(coalesce(p_profile_id, '')), '')::uuid;
  v_org     uuid;
  v_prev    uuid;
  v_worker  uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_project is null then
    return 'invalid';
  end if;

  select pr.organization_id, pr.responsible_profile_id
    into v_org, v_prev
    from public.projects pr
   where pr.id = v_project
   for update;
  if not found then
    return 'not_found';
  end if;

  -- Authority: the EXISTING managing predicate — no second model. Anti-
  -- oracle: an assigned worker hears the refusal, everyone else 'not_found'
  -- (the W11 lifecycle shape).
  if not (public.can_manage_project(v_project) or public.is_admin()) then
    if public.is_assigned_to_project(v_project) then
      return 'not_allowed';
    end if;
    return 'not_found';
  end if;

  -- The responsible person must have a REAL relationship with this project's
  -- world: an active membership of its organization, or a worker the caller
  -- manages (roster / active engagement). NULL clears the pointer.
  if v_target is not null then
    select w.id into v_worker
      from public.workers w where w.profile_id = v_target;
    if not (
      (v_org is not null and exists (
        select 1 from public.company_memberships m
         where m.organization_id = v_org
           and m.profile_id = v_target
           and m.status = 'active'))
      or (v_worker is not null and public.caller_manages_worker(v_worker))
    ) then
      return 'invalid_target';
    end if;
  end if;

  if v_prev is not distinct from v_target then
    return 'updated';
  end if;

  update public.projects
     set responsible_profile_id = v_target,
         updated_at = now()
   where id = v_project;

  -- One audit row per REAL change — ids and states only (the W11 idiom).
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (
    uid,
    'set_project_responsible',
    'projects',
    v_project,
    jsonb_build_object(
      'from_profile_id', v_prev,
      'to_profile_id',   v_target
    ));

  return 'updated';
exception
  when invalid_text_representation then
    return 'invalid';
end $$;

revoke all on function public.set_project_responsible_v1(text, text) from public;
revoke all on function public.set_project_responsible_v1(text, text) from anon;
grant execute on function public.set_project_responsible_v1(text, text) to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260817152000_project_responsible_v1.down.sql
