-- Rollback for 20261103150000_public_vacancy_sitemap_keyset_v1.sql
--
-- Drops the one function the migration added. Exact: nothing else was created
-- or replaced (list_public_vacancy_sitemap_v1 was never touched). The app
-- reads the missing function as "not provisioned" and pages the sitemap with
-- v1 (OFFSET) again, exactly as before the migration.
drop function if exists public.list_public_vacancy_sitemap_after_v1(p_after_published_at timestamp with time zone, p_after_id uuid, p_limit integer);
