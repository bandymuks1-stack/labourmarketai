-- Rollback of 20261021120000_team_disband_closed_need_offers_v1: restores the
-- 20261021094000 body of disband_team_v1 (an offer counts as open work whatever
-- the state of its need). ZERO rows change.
do $disband$
begin
  if to_regprocedure('public.disband_team_v1(uuid)') is not null then
    execute $ddl$
create or replace function public.disband_team_v1(p_team_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid       uuid := auth.uid();
  v_team    public.organizations%rowtype;
  v_ec      record;
  v_out     text;
  v_members int := 0;
  v_invites int := 0;
  v_member_invites int := 0;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_team
    from public.organizations o
   where o.id = p_team_id
     and o.owner_profile_id = uid
     and o.organization_type = 'team';
  if not found then
    return 'not_found';
  end if;
  if v_team.archived_at is not null then
    return 'already_disbanded';
  end if;

  if exists (select 1 from public.team_assignments a
              where a.team_org_id = p_team_id and a.status = 'active')
     or exists (select 1 from public.team_demand_offers d
                 where d.team_org_id = p_team_id and d.status in ('offered', 'accepted'))
     or exists (select 1 from public.team_enquiries e
                 where e.team_org_id = p_team_id and e.status = 'created') then
    return 'has_open_work';
  end if;

  begin
    for v_ec in
      select ec.id
        from public.engagement_contexts ec
       where ec.organization_id = p_team_id
         and ec.status = 'active'
         -- The owner's own 'owner' engagement stays: end_org_membership_v1
         -- refuses the last owner by design, and an archived organization is
         -- already left out of every workspace read with its memberships kept
         -- as history (lib/company/archived-organizations.ts) — the same
         -- treatment the 2026-09-23 org consolidation gave archived orgs.
         and ec.profile_id is distinct from v_team.owner_profile_id
       order by ec.created_at
    loop
      v_out := public.end_engagement_lifecycle_v1(v_ec.id::text, 'other', 'team_disbanded');
      if v_out not in ('ended', 'already_ended') then
        raise exception 'member_end_failed:%', v_out using errcode = 'P0001';
      end if;
      v_members := v_members + 1;
    end loop;

    -- An invitation into a disbanded brigade is dead: every pending link
    -- (any invitation type addressed to this organization) and every pending
    -- governance invitation is revoked. Rows are kept as history.
    update public.invitations
       set status = 'revoked', revoked_at = now()
     where organization_id = p_team_id
       and status = 'pending';
    get diagnostics v_invites = row_count;

    update public.company_memberships
       set status = 'revoked', revoked_at = now()
     where organization_id = p_team_id
       and status = 'invited';
    get diagnostics v_member_invites = row_count;

    update public.organizations
       set archived_at = now(),
           archived_reason = 'team_disbanded'
     where id = p_team_id
       and archived_at is null;

    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'disband_team_v1', 'organizations', p_team_id,
      jsonb_build_object(
        'organization_type', 'team',
        'members_ended', v_members,
        'invitations_revoked', v_invites,
        'membership_invitations_revoked', v_member_invites,
        'result', 'disbanded'));
  exception when sqlstate 'P0001' then
    -- Subtransaction rolled back: every membership ended above is restored.
    return 'member_end_failed';
  end;

  return 'disbanded';
end $function$;
    $ddl$;
    execute 'revoke all on function public.disband_team_v1(uuid) from public';
    execute 'revoke all on function public.disband_team_v1(uuid) from anon';
    execute 'grant execute on function public.disband_team_v1(uuid) to authenticated';
  end if;
end $disband$;
