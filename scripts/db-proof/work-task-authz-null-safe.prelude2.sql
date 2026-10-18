-- Extension prelude: externals needed by workflow + invitation migrations (copied from the migrations named).
alter table public.organizations add column if not exists owner_profile_id uuid references public.profiles(id);
alter table public.organizations add column if not exists legacy_company_id uuid;
alter table public.company_memberships add column if not exists manages_invitations boolean not null default false;
-- from 20260806120000_company_membership_commands_v1.sql
create or replace function public.membership_actor_role_v1(
  p_actor uuid, p_organization_id uuid
) returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.company_memberships
   where organization_id = p_organization_id
     and profile_id = p_actor
     and status = 'active'
   limit 1
$$;
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
  or exists (
    select 1 from public.company_memberships m
     where m.profile_id = auth.uid()
       and m.organization_id = org
       and m.status = 'active'
  )
$$;
-- Redefinition post-dates the 20260722160000 closure — the privilege state
-- must be explicit in THIS file (secdef guard): RLS policies evaluate the
-- helper as the querying role, so authenticated keeps EXECUTE; anon/public
-- do not.
