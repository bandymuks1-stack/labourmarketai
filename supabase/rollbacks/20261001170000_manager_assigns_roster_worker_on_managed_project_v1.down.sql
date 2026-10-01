-- Rollback 20261001170000: assign_worker_to_project exactly as production had it
-- (read back 2026-10-01): no manager branch. Assignments a manager already made
-- stay (they record real staffing).
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
  if not (
    (public.can_manage_project(pid)
      and (public.caller_manages_worker_by_roster(w_id)
           or public.caller_has_booking_engagement_for_project(w_id, pid)))
    or public.is_admin()
  ) then
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
