-- ROLLBACK for 20261011200000_supply_offer_negotiation_v1
-- Refuses while real negotiation history exists (any terms row, or any
-- 'organization' offer): forward-fix instead. Otherwise restores the five
-- 20261007150000 function bodies verbatim and drops what 20261011200000_supply_offer_negotiation_v1 added.
begin;

do $$
begin
  if exists (select 1 from public.team_demand_offer_terms) then
    raise exception 'team_demand_offer_terms has rows - forward-fix, do not roll back';
  end if;
  if exists (select 1 from public.team_demand_offers where offer_kind <> 'team') then
    raise exception 'organization offers exist - forward-fix, do not roll back';
  end if;
end $$;

create or replace function public.list_open_demand_for_team_offer_v1(
  p_team_org_id uuid
) returns table (
  request_id     uuid,
  role_text      text,
  country        text,
  team_size      integer,
  start_period   text,
  company_name   text,
  created_at     timestamptz,
  open_offer_id  uuid,
  open_offer_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not coalesce((
       exists (select 1 from public.organizations o
                where o.id = p_team_org_id and o.organization_type = 'team')
       and (public.manages_organization(p_team_org_id)
            or exists (select 1 from public.organizations o
                        where o.id = p_team_org_id and o.owner_profile_id = uid))
     ), false) then
    return; -- not this team's manager -> empty, never an error surface
  end if;

  return query
  select cr.id,
         cr.role_or_work_type,
         cr.country,
         cr.team_size,
         cr.start_period,
         coalesce(nullif(trim(c.display_name), ''), nullif(trim(c.legal_name), '')),
         cr.created_at,
         o.id,
         o.status
    from public.customer_requests cr
    join public.companies c
      on c.profile_id = cr.profile_id
     and c.verification_status = 'verified'
    left join public.team_demand_offers o
      on o.request_id = cr.id and o.team_org_id = p_team_org_id
     and o.status in ('offered', 'accepted')
   where cr.status = 'submitted'
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
     and cr.profile_id <> uid
     and not coalesce(public.has_org_demand_access(cr.organization_id), false)
   order by cr.created_at desc
   limit 100;
end;
$$;
revoke all on function public.list_open_demand_for_team_offer_v1(uuid) from public, anon;
grant execute on function public.list_open_demand_for_team_offer_v1(uuid) to authenticated;

create or replace function public.offer_team_to_demand_v1(
  p_team_org_id uuid,
  p_request_id  uuid,
  p_note        text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  v_note    text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_members integer;
  v_id      uuid;
  v_existing uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_team_org_id is null or p_request_id is null then
    raise exception 'team_and_demand_required' using errcode = '22023';
  end if;

  if not coalesce((
       exists (select 1 from public.organizations o
                where o.id = p_team_org_id and o.organization_type = 'team')
       and (public.manages_organization(p_team_org_id)
            or exists (select 1 from public.organizations o
                        where o.id = p_team_org_id and o.owner_profile_id = uid))
     ), false) then
    raise exception 'Not authorized to offer this team' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.customer_requests cr
      join public.companies c
        on c.profile_id = cr.profile_id and c.verification_status = 'verified'
     where cr.id = p_request_id
       and cr.status = 'submitted'
       and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
       and cr.profile_id <> uid
       and not coalesce(public.has_org_demand_access(cr.organization_id), false)
  ) then
    raise exception 'demand_not_offerable' using errcode = '22023';
  end if;

  select count(*)::integer into v_members
    from public.engagement_contexts ec
   where ec.organization_id = p_team_org_id
     and ec.relationship_slug = 'employee'
     and ec.status = 'active';
  if v_members < 2 then
    raise exception 'team_too_small' using errcode = '22023';
  end if;

  -- A declined offer is the receiver's answer; the same team does not ask the
  -- same demand again (no re-offer loop, no pressure).
  if exists (select 1 from public.team_demand_offers o
              where o.team_org_id = p_team_org_id
                and o.request_id = p_request_id
                and o.status = 'declined') then
    raise exception 'previously_declined' using errcode = '22023';
  end if;

  -- Abuse cap: one team holds a bounded number of OPEN offers at once.
  if (select count(*) from public.team_demand_offers o
       where o.team_org_id = p_team_org_id
         and o.status in ('offered', 'accepted')) >= 20 then
    raise exception 'offer_limit_reached' using errcode = '22023';
  end if;

  insert into public.team_demand_offers
      (team_org_id, request_id, note, member_count_at_offer, offered_by)
    values (p_team_org_id, p_request_id, v_note, v_members, uid)
  on conflict (team_org_id, request_id) where status in ('offered', 'accepted')
  do nothing
  returning id into v_id;

  if v_id is null then
    select o.id into v_existing
      from public.team_demand_offers o
     where o.team_org_id = p_team_org_id and o.request_id = p_request_id
       and o.status in ('offered', 'accepted');
    return jsonb_build_object('outcome', 'already_offered', 'offer_id', v_existing);
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'team_demand_offered_v1', 'team_demand_offers', v_id,
    jsonb_build_object('team_org_id', p_team_org_id, 'request_id', p_request_id,
                       'member_count', v_members));
  return jsonb_build_object('outcome', 'created', 'offer_id', v_id);
end;
$$;
revoke all on function public.offer_team_to_demand_v1(uuid, uuid, text) from public, anon;
grant execute on function public.offer_team_to_demand_v1(uuid, uuid, text) to authenticated;

create or replace function public.list_team_demand_offers_for_team_v1(
  p_team_org_id uuid
) returns table (
  offer_id       uuid,
  request_id     uuid,
  role_text      text,
  country        text,
  company_name   text,
  status         text,
  offered_at     timestamptz,
  responded_at   timestamptz,
  assignment_id  uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not coalesce(
       public.manages_organization(p_team_org_id)
       or exists (select 1 from public.organizations g
                   where g.id = p_team_org_id and g.owner_profile_id = uid),
       false) then
    return;
  end if;
  return query
  select o.id, o.request_id, cr.role_or_work_type, cr.country,
         coalesce(nullif(trim(c.display_name), ''), nullif(trim(c.legal_name), '')),
         o.status, o.offered_at, o.responded_at, o.assignment_id
    from public.team_demand_offers o
    join public.customer_requests cr on cr.id = o.request_id
    left join public.companies c on c.profile_id = cr.profile_id
   where o.team_org_id = p_team_org_id
   order by o.offered_at desc
   limit 100;
end;
$$;
revoke all on function public.list_team_demand_offers_for_team_v1(uuid) from public, anon;
grant execute on function public.list_team_demand_offers_for_team_v1(uuid) to authenticated;

create or replace function public.respond_team_demand_offer_v1(
  p_offer_id uuid,
  p_decision text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  o   record;
  v_open boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('accept', 'decline') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  select t.id, t.team_org_id, t.request_id, t.status into o
    from public.team_demand_offers t where t.id = p_offer_id for update;
  if not found or not public.team_offer_receiver_v1(o.request_id) then
    raise exception 'Not authorized to answer this offer' using errcode = '42501';
  end if;

  if o.status = 'accepted' and p_decision = 'accept' then return 'already_accepted'; end if;
  if o.status = 'declined' and p_decision = 'decline' then return 'already_declined'; end if;
  if o.status not in ('offered') and not (o.status = 'accepted' and p_decision = 'decline') then
    raise exception 'offer_not_open' using errcode = '22023';
  end if;

  if p_decision = 'accept' then
    select (cr.status = 'submitted') into v_open
      from public.customer_requests cr where cr.id = o.request_id;
    if not coalesce(v_open, false) then
      raise exception 'demand_closed' using errcode = '22023';
    end if;
    -- The unit must still be a team: members may have left since the offer.
    if (select count(*) from public.engagement_contexts ec
         where ec.organization_id = o.team_org_id
           and ec.relationship_slug = 'employee' and ec.status = 'active') < 2 then
      raise exception 'team_too_small' using errcode = '22023';
    end if;
  end if;

  update public.team_demand_offers
     set status = case p_decision when 'accept' then 'accepted' else 'declined' end,
         responded_by = uid, responded_at = now()
   where id = o.id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid,
          case p_decision when 'accept' then 'team_demand_offer_accepted_v1'
                          else 'team_demand_offer_declined_v1' end,
          'team_demand_offers', o.id,
          jsonb_build_object('team_org_id', o.team_org_id, 'request_id', o.request_id));
  return case p_decision when 'accept' then 'accepted' else 'declined' end;
end;
$$;
revoke all on function public.respond_team_demand_offer_v1(uuid, text) from public, anon;
grant execute on function public.respond_team_demand_offer_v1(uuid, text) to authenticated;

create or replace function public.hand_off_team_demand_offer_v1(
  p_offer_id       uuid,
  p_project_id     uuid,
  p_work_object_id uuid default null,
  p_task_id        uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  o          record;
  v_req      record;
  v_project  record;
  v_id       uuid;
  v_outcome  text := 'created';
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_project_id is null then
    raise exception 'project_required' using errcode = '22023';
  end if;

  select t.id, t.team_org_id, t.request_id, t.status, t.assignment_id into o
    from public.team_demand_offers t where t.id = p_offer_id for update;
  if not found
     or not public.team_offer_receiver_v1(o.request_id)
     or not coalesce(public.can_manage_project(p_project_id), false) then
    raise exception 'Not authorized to assign this team' using errcode = '42501';
  end if;

  if o.status = 'assigned' then
    return jsonb_build_object('outcome', 'already_assigned', 'assignment_id', o.assignment_id);
  end if;
  if o.status <> 'accepted' then
    raise exception 'offer_not_accepted' using errcode = '22023';
  end if;

  select cr.organization_id, cr.profile_id into v_req
    from public.customer_requests cr where cr.id = o.request_id;
  select p.id, p.status, p.organization_id, p.company_id into v_project
    from public.projects p where p.id = p_project_id;
  if not found then
    raise exception 'Not authorized to assign this team' using errcode = '42501';
  end if;
  -- The project must be the DEMAND OWNER's own: the offer was made against
  -- that organisation's demand, not against anyone else's project.
  if not coalesce(
       (v_req.organization_id is not null
          and v_project.organization_id is not distinct from v_req.organization_id)
       or exists (select 1 from public.companies c
                   where c.id = v_project.company_id and c.profile_id = v_req.profile_id),
       false) then
    raise exception 'project_not_of_demand_owner' using errcode = '22023';
  end if;
  if v_project.status = 'completed' then
    raise exception 'project_completed' using errcode = '22023';
  end if;

  if p_work_object_id is not null and p_task_id is not null then
    raise exception 'one_scope_only' using errcode = '22023';
  end if;
  if p_task_id is not null and not exists (
       select 1 from public.work_tasks t
        where t.id = p_task_id and t.project_id = p_project_id
          and t.status in ('todo', 'in_progress', 'blocked')) then
    raise exception 'task_not_assignable' using errcode = '22023';
  end if;
  if p_work_object_id is not null and not exists (
       select 1 from public.work_objects w
        where w.id = p_work_object_id and w.status = 'active'
          and (w.project_id = p_project_id
               or (w.project_id is null
                   and w.organization_id is not distinct from v_project.organization_id))) then
    raise exception 'object_not_assignable' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.engagement_contexts ec
     where ec.organization_id = o.team_org_id
       and ec.relationship_slug = 'employee'
       and ec.status = 'active'
  ) then
    raise exception 'team_has_no_members' using errcode = '22023';
  end if;

  insert into public.team_assignments
      (team_org_id, project_id, work_object_id, task_id, assigned_by)
    values (o.team_org_id, p_project_id, p_work_object_id, p_task_id, uid)
  on conflict (
      team_org_id, project_id,
      coalesce(work_object_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(task_id,        '00000000-0000-0000-0000-000000000000'::uuid)
    ) where ended_at is null
  do nothing
  returning id into v_id;

  if v_id is null then
    select ta.id into v_id
      from public.team_assignments ta
     where ta.team_org_id = o.team_org_id
       and ta.project_id = p_project_id
       and ta.work_object_id is not distinct from p_work_object_id
       and ta.task_id is not distinct from p_task_id
       and ta.ended_at is null;
    v_outcome := 'already_assigned';
  else
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'team_assigned_v1', 'team_assignments', v_id,
      jsonb_build_object('team_org_id', o.team_org_id, 'project_id', p_project_id,
                         'work_object_id', p_work_object_id, 'task_id', p_task_id,
                         'via_offer_id', o.id));
  end if;

  update public.team_demand_offers
     set status = 'assigned', assignment_id = v_id, handed_off_at = now()
   where id = o.id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'team_demand_offer_handed_off_v1', 'team_demand_offers', o.id,
    jsonb_build_object('assignment_id', v_id, 'project_id', p_project_id));

  return jsonb_build_object('outcome', v_outcome, 'assignment_id', v_id);
end;
$$;
revoke all on function public.hand_off_team_demand_offer_v1(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.hand_off_team_demand_offer_v1(uuid, uuid, uuid, uuid) to authenticated;

drop function if exists public.list_team_offers_for_request_v2(uuid);
drop function if exists public.list_team_demand_offer_terms_v1(uuid);
drop function if exists public.propose_team_demand_offer_terms_v1(uuid, integer, text, date, date, text, text);
drop function if exists public.team_offer_party_side_v1(uuid);
drop table if exists public.team_demand_offer_terms;

alter table public.team_demand_offers drop constraint if exists team_demand_offers_kind_members_chk;
alter table public.team_demand_offers drop constraint if exists team_demand_offers_member_count_at_offer_check;
alter table public.team_demand_offers
  add constraint team_demand_offers_member_count_at_offer_check check (member_count_at_offer >= 2);
alter table public.team_demand_offers drop constraint if exists team_demand_offers_offer_kind_chk;
alter table public.team_demand_offers drop column if exists offer_kind;

commit;
