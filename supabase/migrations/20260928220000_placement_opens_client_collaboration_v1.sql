-- ============================================================================
-- 20260928220000 — an agency placement becomes an operational work
-- relationship with the CLIENT when the client assigns the worker.
--
-- RED by rule (redefines a SECURITY DEFINER function; changes one catalog
-- row). OWNER DECISION 2026-09-28 "OPTION A, WITH RELATIONSHIP SEMANTICS
-- PRESERVED". Apply only via Supabase MCP apply_migration.
-- @human-gate-approved
--
-- WHY. Production walk 2026-09-28: Gama presented a worker → Alfa accepted →
-- the worker accepted → Alfa assigned them to its project. The worker could
-- then record work only as personal or for Gama: the journal writes against
-- engagement_contexts, and nothing in the placement created one with Alfa.
--
-- WHAT CHANGES (the existing relationship model only — no new membership or
-- placement model):
--   1. relationship_types 'collaborator' becomes journal_reviewable. Only
--      set_engagement_journal_review reads the flag; production has 0
--      collaborator contexts, so no existing relationship changes. Review
--      stays OFF per context until the client's manager switches it on.
--   2. assign_worker_to_project: after the (unchanged) authorization and
--      upsert, IF the worker came to this project's company through an
--      ACCEPTED agency candidate offer whose booking the worker ACCEPTED,
--      the client-side relationship is created or reused:
--        * any ACTIVE engagement_context of this person with this
--          organization is REUSED (an existing canonical relationship wins —
--          nothing is re-typed);
--        * otherwise ONE 'collaborator' context is created (the client is
--          not the employer; the agency relationship stays as it is).
--      Idempotent: re-assigning finds the active context and adds nothing.
--      A DIRECT booking is left exactly as before — no relationship type is
--      inferred from the acquisition channel.
--   Everything else in assign_worker_to_project is byte-identical to
--   production (read back 2026-09-28); grants restated as production has them.
--
-- ROLLBACK: supabase/rollbacks/20260928220000_placement_opens_client_collaboration_v1.down.sql
-- ============================================================================

update public.relationship_types set journal_reviewable = true where slug = 'collaborator';

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
  -- BOTH gates: the caller manages THIS project AND the worker is on the
  -- caller's active ROSTER, or holds an active accepted-booking engagement
  -- with the company that canonically owns THIS EXACT project (or admin).
  -- Neither gate alone is sufficient. `by_roster` (not the widened
  -- `caller_manages_worker`) keeps engagement authority bound to the
  -- engaging company's own projects — a sibling company of the same owner
  -- must still be refused.
  if not (
    (public.can_manage_project(pid)
      and (public.caller_manages_worker_by_roster(w_id)
           or public.caller_has_booking_engagement_for_project(w_id, pid)))
    or public.is_admin()
  ) then
    raise exception 'Not authorized to assign this worker to this project'
      using errcode = '42501';
  end if;
  -- W11: a completed project is terminal. Checked AFTER authorization so the
  -- refusal cannot be used to probe the status of a project the caller may not
  -- manage. `22023` is the same invalid-argument class the guards above use, so
  -- the app layer maps it through its existing error path.
  select status into v_status from public.projects where id = pid;
  if v_status = 'completed' then
    raise exception 'Project is completed' using errcode = '22023';
  end if;
  insert into public.project_worker_assignments (project_id, worker_id, status, assigned_at, ended_at)
    values (pid, w_id, 'active', now(), null)
  on conflict (project_id, worker_id) do update
    set status = 'active', ended_at = null
  returning id into row_id;

  -- AGENCY PLACEMENT → CLIENT WORK RELATIONSHIP (owner decision 2026-09-28).
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
