-- DOWN / rollback for 20260717130000_open_markets_countries_draft_v1.sql
--
-- Removes the six open-market countries rows (GE/BE/FR/ES/AT/CH) IF nothing
-- references them yet. Guarded: refuses to delete when any organizations /
-- engagement_contexts row already stores one of the codes (FI precedent left
-- reference data in place; this guard makes the same call explicit). Apply
-- via Supabase MCP apply_migration, never `db push`.

begin;

do $$
begin
  if exists (
    select 1 from public.organizations
    where country in ('GE','BE','FR','ES','AT','CH')
  ) then
    raise exception 'organizations rows reference the new market codes — do not delete the countries rows';
  end if;
  if exists (
    select 1 from public.engagement_contexts
    where country_code in ('GE','BE','FR','ES','AT','CH')
  ) then
    raise exception 'engagement_contexts rows reference the new market codes — do not delete the countries rows';
  end if;
end $$;

delete from public.countries
where code in ('GE','BE','FR','ES','AT','CH');

commit;
