-- ROLLBACK for 20260806120000_company_membership_commands_v1 (M-P0-4 Slice 2)
--
-- Drops the seven command functions + the internal authority helper. The
-- company_memberships table and every row in it are untouched — rolling back
-- the COMMANDS removes the write path, not the governance truth. Rows created
-- through the commands remain valid history.

-- Restore the Slice 1 policy shape verbatim (recursive and therefore
-- fail-closed-broken — documented in 20260806120000 §0b; restoring it is
-- what "undo this migration" honestly means).
drop policy if exists company_memberships_select on public.company_memberships;
create policy company_memberships_select on public.company_memberships
  for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.company_memberships mine
       where mine.organization_id = company_memberships.organization_id
         and mine.profile_id = auth.uid()
         and mine.status = 'active'
    )
    or public.is_admin()
  );
drop function if exists public.is_active_org_member(uuid);

drop function if exists public.membership_invite_v1(uuid, text, text);
drop function if exists public.membership_accept_v1(uuid);
drop function if exists public.membership_decline_v1(uuid);
drop function if exists public.membership_cancel_invite_v1(uuid);
drop function if exists public.membership_change_role_v1(uuid, text);
drop function if exists public.membership_revoke_v1(uuid);
drop function if exists public.membership_leave_v1(uuid);
drop function if exists public.membership_my_invitations_v1();

-- Restore the owner+engagement-only validate_active_organization
-- (pre-§7c shape, 20260714210000) where it exists.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'validate_active_organization'
  ) then
    create or replace function public.validate_active_organization()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    begin
      if new.active_organization_id is not null then
        if not exists (
          select 1 from public.organizations o
           where o.id = new.active_organization_id
             and o.owner_profile_id = new.id
        ) and not exists (
          select 1 from public.engagement_contexts ec
           where ec.profile_id = new.id
             and ec.organization_id = new.active_organization_id
             and ec.status = 'active'
             and ec.relationship_slug in
                 ('owner', 'manager', 'external_manager', 'viewer')
        ) then
          raise exception 'active_organization_not_member'
            using errcode = '42501';
        end if;
      end if;
      return new;
    end $fn$;
  end if;
end $$;

-- Restore the engagement-only belongs_to_organization (pre-§7b shape).
create or replace function public.belongs_to_organization(org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = auth.uid()
       and ec.organization_id = org
       and ec.status = 'active'
  )
$$;
drop function if exists public.membership_actor_role_v1(uuid, uuid);
