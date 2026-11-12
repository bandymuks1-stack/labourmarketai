-- Rollback of 20261104160000. Apply the function rollback first if v5 is live; v4 does not need this index.
-- On production run it CONCURRENTLY on its own: drop index concurrently if exists public.public_vacancies_active_live_scan_idx;
drop index if exists public.public_vacancies_active_live_scan_idx;
