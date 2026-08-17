-- Rollback for 20260817120000_catalog_least_privilege_v1.sql
-- Restores the exact pre-migration SELECT policies (0013_work_journal_m1.sql:
-- bare using(true), addressed to public — no role clause).
-- Manual apply via Supabase MCP only.

begin;

drop policy if exists productivity_units_select on public.productivity_units;
create policy productivity_units_select on public.productivity_units
  for select using (true);

drop policy if exists profession_templates_select on public.profession_templates;
create policy profession_templates_select on public.profession_templates
  for select using (true);

drop policy if exists skill_icons_select on public.skill_icons;
create policy skill_icons_select on public.skill_icons
  for select using (true);

commit;
