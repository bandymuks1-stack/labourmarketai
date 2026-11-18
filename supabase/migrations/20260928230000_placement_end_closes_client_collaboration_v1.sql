-- ============================================================================
-- 20260928230000 — when a placed worker's LAST assignment with the client
-- ends, the placement's client relationship closes truthfully.
--
-- RED by rule (redefines a SECURITY DEFINER function). Owner decision
-- 2026-09-28 "CONTINUE — COMPLETE THE PLACEMENT LIFECYCLE".
-- Apply only via Supabase MCP apply_migration.
-- @human-gate-approved
--
-- SEMANTICS (inspected first, per the owner):
--   * ending ONE project assignment ends that assignment only — unchanged;
--   * the client relationship that an AGENCY PLACEMENT opened
--     (20260928220000, audit 'placement_collaboration_opened') closes only
--     when the worker has NO other active assignment on that organization's
--     projects: the placement's work there is over;
--   * a relationship that existed before the placement (not opened by it) is
--     NEVER closed here — ending it stays the explicit members-panel act;
--   * closing = exactly what end_org_membership_v1 writes (status 'ended',
--     ended_at, review off, not primary) plus the lifecycle stamp
--     end_engagement_lifecycle_v1 writes ('ended', reason 'contract_end'),
--     with an audit row and a lifecycle event. Never a DELETE: the journal
--     entries, their project, their confirmations and the confirmed skills
--     reference the context and stay exactly as they are;
--   * the placement's booking engagement with the client
--     (company_worker_engagements, sourced from the accepted agency offer's
--     booking) is ended the same way end_company_worker_engagement_v1 does,
--     so the agency's bounded lifecycle read shows the placement ended.
--   * the worker's other relationships (the agency's own) are not touched.
-- Everything else in end_worker_project_assignment is byte-identical to
-- production (read back 2026-09-28); grants restated as production has them.
--
-- ROLLBACK: supabase/rollbacks/20260928230000_placement_end_closes_client_collaboration_v1.down.sql
-- ============================================================================

create or replace function public.end_worker_project_assignment(p_project_id text, p_worker_profile_id text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid   uuid := auth.uid();
  pid   uuid := nullif(p_project_id, '')::uuid;
  w_pid uuid := nullif(p_worker_profile_id, '')::uuid;
  w_id  uuid;
  v_org uuid;
  v_company uuid;
  v_ctx uuid;
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

  if not (public.can_manage_project(pid) or public.is_admin()) then
    raise exception 'Not authorized to manage this project' using errcode = '42501';
  end if;

  update public.project_worker_assignments
     set status = 'ended', ended_at = now()
   where project_id = pid and worker_id = w_id and status = 'active';

  -- PLACEMENT END → the relationship the placement opened closes, if this was
  -- the worker's last active assignment on this organization's projects.
  select coalesce(p.organization_id, o2.id),
         coalesce(o1.legacy_company_id, p.company_id)
    into v_org, v_company
    from public.projects p
    left join public.organizations o1 on o1.id = p.organization_id
    left join public.organizations o2 on p.organization_id is null and o2.legacy_company_id = p.company_id
   where p.id = pid;
  if v_org is null then
    return;
  end if;
  if exists (
       select 1
         from public.project_worker_assignments pa
         join public.projects p2 on p2.id = pa.project_id
         left join public.organizations o3 on o3.id = p2.organization_id
        where pa.worker_id = w_id
          and pa.status = 'active'
          and (p2.organization_id = v_org
               or (p2.organization_id is null and p2.company_id = v_company))) then
    return;
  end if;

  select ec.id into v_ctx
    from public.engagement_contexts ec
   where ec.profile_id = w_pid
     and ec.organization_id = v_org
     and ec.relationship_slug = 'collaborator'
     and ec.status = 'active'
     and exists (select 1 from public.audit_logs al
                  where al.action = 'placement_collaboration_opened'
                    and al.entity = 'engagement_contexts'
                    and al.entity_id = ec.id)
   limit 1;
  if v_ctx is null then
    return;
  end if;

  update public.engagement_contexts
     set status                 = 'ended',
         ended_at               = coalesce(ended_at, current_date),
         journal_review_enabled = false,
         is_primary             = false,
         lifecycle_stage        = 'ended',
         ended_reason           = coalesce(ended_reason, 'contract_end'),
         updated_at             = now()
   where id = v_ctx and status <> 'ended';

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'placement_collaboration_ended', 'engagement_contexts', v_ctx,
          jsonb_build_object('organization_id', v_org, 'worker_id', w_id, 'project_id', pid,
                             'from_role', 'collaborator', 'to_role', 'ended',
                             'reason', 'last_assignment_ended'));
  insert into public.engagement_lifecycle_events
    (engagement_context_id, actor_profile_id, action, before_stage, after_stage, note, metadata)
  values (v_ctx, uid, 'engagement_ended', 'active', 'ended', null,
          jsonb_build_object('reason', 'contract_end', 'source', 'placement_last_assignment_ended'));

  -- The placement's booking engagement with this client ends with it.
  update public.company_worker_engagements ce
     set status = 'ended', ended_at = now(), ended_by = uid
   where ce.status = 'active'
     and ce.worker_id = w_id
     and ce.company_id = v_company
     and exists (select 1 from public.agency_candidate_offers ao
                  where ao.booking_id = ce.source_booking_id
                    and ao.status = 'accepted');
end;
$function$;

revoke all on function public.end_worker_project_assignment(text, text) from public, anon;
grant execute on function public.end_worker_project_assignment(text, text) to authenticated;
