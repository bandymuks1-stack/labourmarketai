-- 20260903090000_public_vacancy_supply_cover_index_v1
--
-- P0-1, second GREEN step (measured on production 2026-09-03 after
-- 20260903070000 was applied):
--
--   EXPLAIN (ANALYZE, BUFFERS) of the count_public_vacancies_v1 body, fully
--   WARM (shared hit=9,363, zero reads): Seq Scan 2,742 ms → total 2,821 ms.
--   The cost is CPU over 9,363 heap pages, not I/O — so neither the board
--   index nor work_mem could bring it under the anon 3 s statement_timeout.
--
--   The same query with a covering partial index, tested inside a rolled-back
--   transaction on production: Index Only Scan, 640 ms total (26,098 heap
--   fetches because the importer had just touched the visibility map — the
--   worst case, and still 4.4× faster).
--
-- The index carries exactly the three columns the count reads
-- (expires_at as the key it filters on; employer_name + last_seen_at as
-- INCLUDE payload) over active rows only, so the aggregate never visits the
-- 73 MB heap. It also serves any future "active and not expired" predicate.
--
-- Additive, no privilege change, no function change. The constant-cost
-- alternative (an importer-maintained counts row read by the SECURITY
-- DEFINER function) stays a separate human-gated draft; this index is what
-- makes the anonymous path safe until that lands.
--
-- Reversible: see the ROLLBACK block and supabase/rollbacks/<same name>.down.sql.

create index if not exists public_vacancies_active_supply_cover_idx
  on public.public_vacancies (expires_at)
  include (employer_name, last_seen_at)
  where is_active;

comment on index public.public_vacancies_active_supply_cover_idx is
  'Covering partial index for count_public_vacancies_v1: active rows keyed by expires_at with employer_name + last_seen_at as INCLUDE payload, so the public supply count is an index-only scan (2,821 ms warm seq scan → 640 ms, measured 2026-09-03) and stays under the anon 3 s statement_timeout.';

-- ROLLBACK
-- drop index if exists public.public_vacancies_active_supply_cover_idx;
