-- Rollback for 20260818160000_public_vacancy_sitemap_v1.sql
--
-- Drops the sitemap projection function. Safe: it creates no table, column,
-- policy, index or row, so dropping it removes exactly what was added. The
-- /jobs-sitemap.xml route degrades to an empty (valid) sitemap via its
-- not_provisioned path — it does not error — and /jobs itself is unaffected.
drop function if exists public.list_public_vacancy_sitemap_v1(p_limit integer, p_offset integer);
