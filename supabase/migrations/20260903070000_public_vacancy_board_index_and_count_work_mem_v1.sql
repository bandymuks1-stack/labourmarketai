-- 20260903070000_public_vacancy_board_index_and_count_work_mem_v1
--
-- P0-1 / P0-1b (FULL_PRODUCT_VISION_AUDIT_2026-09-03 §0.1): the anonymous
-- read path over public.public_vacancies sits ON the `anon` role's 3 s
-- statement_timeout when the buffer pool is cold.
--
--   * search_public_vacancy_previews_v1 — the public job board's default
--     listing (`where is_active and not expired order by published_at desc
--     nulls last, id limit 20`) measured 2,747 ms cold. No index orders the
--     active rows by published_at, so the planner sorts the whole active set.
--   * count_public_vacancies_v1 — `count(distinct employer_name)` over ~45k
--     active rows with work_mem = 2184 kB spills to temp (temp read=243
--     written=244 in the recorded EXPLAIN) and measured 3,758 ms cold.
--
-- This migration is the GREEN half of the fix (additive, no privilege change,
-- no function body change):
--   1. a partial index that lets the board listing and the sitemap projection
--      walk active rows in published order and stop at the LIMIT;
--   2. a function-scoped work_mem so the count's distinct aggregate stays in
--      memory instead of spilling.
--
-- The constant-cost half (an importer/cron-maintained supply-counts row read
-- by count_public_vacancies_v1) replaces a SECURITY DEFINER body and is
-- therefore RED under migration-safety (g); it ships as its own human-gated
-- draft. Until it lands, /api/health probes a constant-cost read instead of
-- this count (see apps/web/app/api/health/route.ts), and /jobs-sitemap.xml
-- answers 503 + Retry-After on a transient failure instead of 500.
--
-- Additive: no row changes, no grants, no RLS change. Reversible: see the
-- ROLLBACK block and supabase/rollbacks/<same name>.down.sql.

create index if not exists public_vacancies_active_published_idx
  on public.public_vacancies (published_at desc nulls last, id)
  where is_active;

comment on index public.public_vacancies_active_published_idx is
  'Active rows in board order (published_at desc nulls last, id). Serves the public job board default listing and the sitemap projection so both stop at their LIMIT instead of sorting the whole active set (P0-1, 2026-09-03).';

alter function public.count_public_vacancies_v1() set work_mem = '64MB';

comment on function public.count_public_vacancies_v1() is
  'Public supply counts (active vacancies, distinct employers, last refresh). work_mem raised to 64MB at function scope so count(distinct employer_name) over the active set does not spill to temp under the anon 3 s statement_timeout (P0-1, 2026-09-03).';

-- ROLLBACK
-- drop index if exists public.public_vacancies_active_published_idx;
-- alter function public.count_public_vacancies_v1() reset work_mem;
