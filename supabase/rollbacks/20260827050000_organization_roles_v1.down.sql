-- ============================================================================
-- ROLLBACK for 20260827050000_organization_roles_v1.sql
--
-- SAFE BY CONSTRUCTION. The forward migration changed nothing that already
-- existed: `organizations.organization_type` was not dropped, not narrowed and
-- not rewritten, and no pre-existing row was updated or deleted. Every reader
-- that worked before it still works after it. So reverting is simply removing
-- what was added — there is no prior state to reconstruct.
--
-- WHAT IS LOST. Any capability an organization declared after the apply
-- (`organization_roles` rows beyond the backfill). That is why the drops below
-- are guarded: if an organization has declared a capability the backfill did
-- NOT create, this script REFUSES to run rather than silently discard an
-- identity claim someone made about their own organization. Clear the extra
-- rows deliberately, or keep the tables.
--
-- The TS read layer falls back to `organizations.organization_type` whenever
-- these tables are absent, so dropping them degrades honestly rather than
-- breaking the application.
-- ============================================================================

-- Guard: refuse to drop if any role was declared beyond the exact backfill set
-- (company→employer, agency→workforce_provider).
do $$
declare
  v_extra int;
begin
  select count(*) into v_extra
  from public.organization_roles r
  join public.organizations o on o.id = r.organization_id
  where not (
       (o.organization_type = 'company' and r.role_slug = 'employer')
    or (o.organization_type = 'agency'  and r.role_slug = 'workforce_provider')
  );
  if v_extra > 0 then
    raise exception
      'Refusing rollback: % organization_roles row(s) were declared after apply. Review and remove them deliberately first.',
      v_extra;
  end if;
end $$;

drop function if exists public.add_organization_role_v1(uuid, text);

drop policy if exists organization_roles_select on public.organization_roles;
drop policy if exists organization_roles_write  on public.organization_roles;
drop policy if exists organization_role_types_select on public.organization_role_types;
drop policy if exists organization_role_types_write  on public.organization_role_types;

drop table if exists public.organization_roles;
drop table if exists public.organization_role_types;
