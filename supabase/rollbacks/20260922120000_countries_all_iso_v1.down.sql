-- Rollback for 20260922120000_countries_all_iso_v1.sql
-- Removes ONLY the reference rows that migration added: every code with
-- is_target_market = false (the forward file inserts nothing else and the ten
-- pre-existing rows carry is_target_market = true), and only while nothing
-- references the code. A referenced code means a real company registered in
-- that country after the seed — deleting it would break organizations_country_fkey
-- and orphan a real organisation, so such rows are deliberately kept. Reference
-- data only; no worker, company or need row is touched.

delete from public.countries c
 where c.is_target_market = false
   and not exists (select 1 from public.organizations o where o.country = c.code)
   and not exists (select 1 from public.engagement_contexts e where e.country_code = c.code);
