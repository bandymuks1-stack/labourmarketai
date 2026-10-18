-- Rollback 20260930110000 — discovered organizations + marketplace company ingest.
--
-- REFUSES while any unclaimed organization, claim, sourced fact or capability
-- grant exists: those are evidenced records (provenance, claims, who may
-- import) and are never dropped silently. Export and resolve them first.
do $$
begin
  if exists (select 1 from public.organizations where claim_state <> 'claimed')
     or exists (select 1 from public.organization_claims)
     or exists (select 1 from public.organization_facts)
     or exists (select 1 from public.platform_capability_grants) then
    raise exception 'discovered-organization records exist — export and resolve them before rolling back';
  end if;
end $$;

drop function if exists public.decide_organization_claim_v1(uuid, text, text, text);
drop function if exists public.request_organization_claim_v1(uuid, text, text);
drop function if exists public.ingest_discovered_organizations_v1(uuid, jsonb);

drop policy if exists organizations_select_unclaimed_for_ingest on public.organizations;
drop table if exists public.organization_claims;
drop trigger if exists organization_facts_append_only on public.organization_facts;
drop table if exists public.organization_facts;
drop function if exists public.organization_facts_append_only();
drop table if exists public.organization_identifiers;
drop function if exists public.has_platform_capability(text);
drop table if exists public.platform_capability_grants;

-- The seed trigger returns to its 20260807090000 body (no unclaimed exception).
create or replace function public.company_memberships_seed_org_owner()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.owner_profile_id is null then
    raise exception
      'org_without_owner: organization % has no owner_profile_id — the canonical owner membership cannot be created, so the organization must not be created',
      new.id
      using errcode = '23514';
  end if;
  insert into public.company_memberships
    (organization_id, profile_id, role, status, accepted_at, source)
  select new.id, new.owner_profile_id, 'owner', 'active', now(), 'org-create'
  where not exists (
    select 1 from public.company_memberships m
     where m.organization_id = new.id
       and m.profile_id = new.owner_profile_id
       and m.status in ('invited','active')
  )
  on conflict do nothing;
  return new;
end $function$;

alter table public.organizations drop constraint if exists organizations_unclaimed_has_no_owner;
alter table public.organizations drop constraint if exists organizations_claim_state_check;
alter table public.organizations drop column if exists claim_state;

-- The three role-type seeds stay (other rows may reference them).
