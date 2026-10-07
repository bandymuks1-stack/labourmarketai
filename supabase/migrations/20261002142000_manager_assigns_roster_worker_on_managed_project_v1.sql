-- ============================================================================
-- 20261002142000 — a manager may assign a roster worker to a project they MANAGE.
--
-- RED by rule (redefines a SECURITY DEFINER function — a permission change).
-- OWNER DECISION 2026-10-01 (binding): "a manager with the right may assign a
-- worker to a project they MANAGE; do not extend rights beyond the manager's
-- managed projects; do not widen the shared predicate."
-- @human-gate-approved
-- Apply only via Supabase MCP apply_migration.
--
-- WHY. The app's capability matrix gives managers manage-roster and
-- manage-projects, and `can_manage_project` already admits a manager of the
-- project's organization. But `assign_worker_to_project` also required
-- `caller_manages_worker_by_roster`, which is owner/admin only, so the assign
-- form was offered to managers and then always refused (production walk
-- 2026-10-01).
--
-- WHAT CHANGES — exactly one thing, inside this one function: a third way for
-- the authorization to be true:
--     the caller manages THIS project's organization (manages_organization),
--     the project has an organization, AND the worker is an ACTIVE member of
--     the roster of the company that OWNS THIS project.
-- Evaluated inline. No new function, no change to `caller_manages_worker_by_roster`
-- or `caller_manages_worker`, so NO read exposure changes anywhere: a manager
-- gains no visibility of any roster worker's availability, commitments or
-- profile. Everything else in the function is byte-identical to production
-- (read back 2026-10-01).
--
-- FAIL-CLOSED: the whole authorization is wrapped `not coalesce((...), false)` (same
-- hardening as 20261002141500): authorized only when PROVEN true; NULL denies.
-- Every operand is already a non-NULL boolean (exists()/is_admin()/helpers), so
-- this changes no outcome today; it keeps a future helper edit from opening the gate.
--
-- WHAT DOES NOT CHANGE
--   * owner/admin and the booking-engagement path: untouched.
--   * a manager of org A cannot assign onto a project of org B (the branch is
--     keyed to the project's own organization and company).
--   * a manager cannot assign someone who is not on that project's company
--     roster (engagement-only candidates stay behind the owner gate).
--   * ending an assignment already required only can_manage_project.
--
-- ROLLBACK: supabase/rollbacks/20261002142000_manager_assigns_roster_worker_on_managed_project_v1.down.sql
-- ============================================================================

create or replace function public.assign_worker_to_project(p_project_id text, p_worker_profile_id text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid     uuid := auth.uid();
  pid     uuid := nullif(p_project_id, '')::uuid;
  w_pid   uuid := nullif(p_worker_profile_id, '')::uuid;
  w_id    uuid;
  row_id  uuid;
  v_status text;
  v_org   uuid;
  v_company uuid;
  v_ctx   uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if pid is null or w_pid is null then
    raise exception 'Project and worker are required' using errcode = '22023';
  end if;
  select id into w_id from public.workers where profile_id = w_pid;
  if w_id is null then
    raise exception 'No such worker' using errcode = 'P0002';
  end if;
  if not coalesce((
    (public.can_manage_project(pid)
      and (public.caller_manages_worker_by_roster(w_id)
           or public.caller_has_booking_engagement_for_project(w_id, pid)))
    -- MANAGER OF THIS PROJECT'S ORGANIZATION staffing from THIS company's
    -- roster (owner decision 2026-10-01). Inline and narrow on purpose.
    or exists (
      select 1
        from public.projects mp
        join public.company_workers mcw
          on mcw.company_id = mp.company_id
         and mcw.worker_id = w_id
         and mcw.status = 'active'
       where mp.id = pid
         and mp.organization_id is not null
         and public.manages_organization(mp.organization_id)
    )
    or public.is_admin()
  ), false) then
    raise exception 'Not authorized to assign this worker to this project'
      using errcode = '42501';
  end if;
  select status into v_status from public.projects where id = pid;
  if v_status = 'completed' then
    raise exception 'Project is completed' using errcode = '22023';
  end if;
  insert into public.project_worker_assignments (project_id, worker_id, status, assigned_at, ended_at)
    values (pid, w_id, 'active', now(), null)
  on conflict (project_id, worker_id) do update
    set status = 'active', ended_at = null
  returning id into row_id;

  select coalesce(p.organization_id, o2.id),
         coalesce(o1.legacy_company_id, p.company_id)
    into v_org, v_company
    from public.projects p
    left join public.organizations o1 on o1.id = p.organization_id
    left join public.organizations o2 on p.organization_id is null and o2.legacy_company_id = p.company_id
   where p.id = pid;
  if v_org is not null and v_company is not null and exists (
       select 1
         from public.agency_candidate_offers ao
         join public.booking_requests b on b.id = ao.booking_id
        where ao.worker_id = w_id
          and ao.client_company_id = v_company
          and ao.status = 'accepted'
          and b.status = 'accepted') then
    select id into v_ctx from public.engagement_contexts
     where profile_id = w_pid and organization_id = v_org and status = 'active'
     order by created_at limit 1;
    if v_ctx is null then
      insert into public.engagement_contexts
          (profile_id, organization_id, relationship_slug, status, is_primary, hash_self)
        values (w_pid, v_org, 'collaborator', 'active', false,
                encode(extensions.digest(w_pid::text || ':collaborator:' || v_org::text, 'sha256'), 'hex'))
      returning id into v_ctx;
      insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
        values (uid, 'placement_collaboration_opened', 'engagement_contexts', v_ctx,
                jsonb_build_object('organization_id', v_org, 'worker_id', w_id,
                                   'project_id', pid, 'relationship_slug', 'collaborator'));
    end if;
  end if;

  return row_id;
end;
$function$;

revoke all on function public.assign_worker_to_project(text, text) from public, anon;
grant execute on function public.assign_worker_to_project(text, text) to authenticated;
