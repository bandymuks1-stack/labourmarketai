-- ROLLBACK for 20261020015000_demand_company_one_rule_v2.sql
-- Restores the 20261020010000 helper body (org-less rows fall back to the
-- poster's oldest company). No data is touched.

begin;

create or replace function public.demand_company_id_v1(p_organization_id uuid, p_profile_id uuid)
returns uuid
language sql
stable
set search_path to 'public'
as $function$
  select case
    when p_organization_id is not null then
      (select o.legacy_company_id from public.organizations o where o.id = p_organization_id)
    else
      (select c.id from public.companies c
        where c.profile_id = p_profile_id
        order by c.created_at, c.id
        limit 1)
  end
$function$;

revoke all on function public.demand_company_id_v1(uuid, uuid) from public, anon, authenticated;

commit;
