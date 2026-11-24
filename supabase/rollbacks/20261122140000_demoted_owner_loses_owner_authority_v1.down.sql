-- Rollback for 20261122140000_demoted_owner_loses_owner_authority_v1.
-- Restores the previous bodies verbatim (membership_change_role_v1 from
-- 20260806120000; creator_governance_ended_v1 and owns_company from
-- 20261021093000), the four policies as in 0001_initial_schema, and drops the
-- internal helper. Data written by demotions while the forward migration was
-- live (moved owner pointers, ended governance engagements, audit rows) is
-- KEPT: it is the record of what happened. Re-grant a role if needed.

create or replace function public.membership_change_role_v1(
  p_membership_id uuid, p_new_role text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m record;
  actor_role text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;

  if p_new_role is null or p_new_role not in ('owner','admin','manager','external_manager','member') then
    return 'invalid_role';
  end if;

  select id, organization_id, role, status into m
    from public.company_memberships where id = p_membership_id;
  if m.id is null then return 'not_found'; end if;

  actor_role := public.membership_actor_role_v1(uid, m.organization_id);
  if actor_role is null or actor_role not in ('owner','admin') then
    return 'not_found';  -- merged with missing — no oracle
  end if;
  -- Admin may not touch owner rows and may not grant owner.
  if actor_role = 'admin' and (m.role = 'owner' or p_new_role = 'owner') then
    return 'not_authorized';
  end if;
  if m.status <> 'active' then return 'not_active'; end if;
  if m.role = p_new_role then return 'unchanged'; end if;

  begin
    -- `"role"` quoted deliberately: the migration-safety scanner's SET ROLE
    -- detector would otherwise false-positive on this COLUMN assignment.
    update public.company_memberships set "role" = p_new_role
     where id = p_membership_id and status = 'active';
  exception when check_violation then
    if sqlerrm = 'last_owner_membership' then return 'last_owner'; end if;
    raise;
  end;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'membership_change_role', 'company_memberships', p_membership_id,
    jsonb_build_object('organization_id', m.organization_id,
      'from_role', m.role, 'to_role', p_new_role, 'result', 'role_changed'));
  return 'role_changed';
end $$;

revoke all on function public.membership_change_role_v1(uuid, text) from public;
revoke all on function public.membership_change_role_v1(uuid, text) from anon;
grant execute on function public.membership_change_role_v1(uuid, text) to authenticated;

create or replace function public.creator_governance_ended_v1(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_organization_id is not null
     and exists (
       select 1 from public.company_memberships r
        where r.organization_id = p_organization_id
          and r.profile_id = auth.uid()
          and r.status = 'revoked'
          and r.accepted_at is not null)
     and not exists (
       select 1 from public.company_memberships l
        where l.organization_id = p_organization_id
          and l.profile_id = auth.uid()
          and l.status = 'active')
$$;
revoke all on function public.creator_governance_ended_v1(uuid) from public, anon;
grant execute on function public.creator_governance_ended_v1(uuid) to authenticated;

create or replace function public.owns_company(c uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.companies x
     where x.id = c and x.profile_id = auth.uid()
       -- the creator arm is compatibility for creators who never had their
       -- governance ENDED; a creator whose accepted membership in the bound
       -- organization was revoked (and who holds no active one) is not one
       and not exists (
         select 1
           from public.organizations o
           join public.company_memberships r on r.organization_id = o.id
          where o.legacy_company_id = c
            and r.profile_id = auth.uid()
            and r.status = 'revoked'
            and r.accepted_at is not null
            and not exists (
              select 1 from public.company_memberships l
               where l.organization_id = o.id
                 and l.profile_id = auth.uid()
                 and l.status = 'active'
            )
       )
  )
  or exists (
    select 1
      from public.organizations o
      join public.company_memberships m on m.organization_id = o.id
     where o.legacy_company_id = c
       and m.profile_id = auth.uid()
       and m.status = 'active'
       and m.role in ('owner', 'admin')
  )
$$;
revoke all on function public.owns_company(uuid) from public;
revoke all on function public.owns_company(uuid) from anon;
grant execute on function public.owns_company(uuid) to authenticated;

alter policy companies_update on public.companies
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
alter policy companies_delete on public.companies
  using (profile_id = auth.uid() or public.is_admin());
alter policy agencies_update on public.agencies
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
alter policy agencies_delete on public.agencies
  using (profile_id = auth.uid() or public.is_admin());

drop function if exists public.membership_demote_governance_v1(uuid, uuid, uuid, text, text);
