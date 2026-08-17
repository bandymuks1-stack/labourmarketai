-- Rollback for 20260817160000_durable_workspace_pointer_v2.sql (run by hand
-- via Supabase MCP after an explicit owner/lead decision — never automatic).
--
-- Order matters: triggers first, then the function they reference, then the
-- index and the column. The 'viewer' slug is removed only if nothing ever
-- started using it (default-closed: an in-use slug is kept).

begin;

drop trigger if exists profiles_active_org_validate_update on public.profiles;
drop trigger if exists profiles_active_org_validate_insert on public.profiles;
drop function if exists public.validate_active_organization();
drop index if exists public.idx_profiles_active_organization;
alter table public.profiles drop column if exists active_organization_id;

delete from public.relationship_types rt
  where rt.slug = 'viewer'
    and not exists (select 1 from public.engagement_contexts ec
                     where ec.relationship_slug = 'viewer');

commit;
