-- Rollback for 20260714210000_company_memberships_v1.sql (run by hand after
-- explicit owner approval; forward migrations never run this).
begin;

drop trigger if exists profiles_active_org_validate_update on public.profiles;
drop trigger if exists profiles_active_org_validate_insert on public.profiles;
drop function if exists public.validate_active_organization();
drop index if exists public.idx_profiles_active_organization;
alter table public.profiles drop column if exists active_organization_id;

-- Remove the 'viewer' slug ONLY if nothing references it (default-closed:
-- never orphan an engagement row).
delete from public.relationship_types rt
 where rt.slug = 'viewer'
   and not exists (
     select 1 from public.engagement_contexts ec
      where ec.relationship_slug = 'viewer'
   );

commit;
