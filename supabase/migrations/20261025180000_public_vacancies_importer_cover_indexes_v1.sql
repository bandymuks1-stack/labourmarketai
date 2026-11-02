-- 20261025180000_public_vacancies_importer_cover_indexes_v1
--
-- TWO additive indexes on public.public_vacancies. No function, grant, RLS,
-- row or column is touched. GREEN tier.
--
-- WHY (measured on production 2026-10-25, read-only EXPLAIN (ANALYZE, BUFFERS)):
--   The walk health brake refused two walks because /api/health db.ms (a
--   constant-cost primary-key read) went over 1,500 ms. The app host was idle.
--   Inside the database, cold page reads are the bottleneck: a cache miss
--   costs about 2-3 ms (a 5,583-block read took ~15 s), so any statement
--   that pulls the table heap from disk slows every other statement on the
--   instance. Two importer/admin reads still walk the heap of the largest
--   provider:
--
--   1. Source-health count on the admin home (vacancy-ingestion.ts
--      readVacancySourceHealth):
--        select count(*) where provider_key = $1 and is_active
--      No index matches both columns, so it is a Seq Scan of the whole
--      172 MB heap: 14,996 ms (16,438 hit + 5,583 read), at the 8 s
--      statement timeout in production (edge p50 8.2 s).
--      -> public_vacancies_provider_active_idx (provider_key) WHERE is_active
--         turns it into an Index Only Scan over a ~1 MB deduplicated b-tree.
--
--   2. Importer dedup-state keyset read (vacancy-ingestion.ts loadDedupState)
--      and the persist existence read (vacancy-repository.ts):
--        select external_id, content_hash [, lifecycle]
--         where provider_key = $1 and external_id > $2
--         order by external_id limit 1000
--      Index Scan on the unique (provider_key, external_id) key plus one heap
--      fetch per row: 369 ms for the first page (188 blocks read), edge p50
--      582 ms over 531 pages a day. A full sweep reads every heap page of the
--      provider (~172 MB) on every import, which evicts the shared buffer
--      cache for everyone else.
--      -> public_vacancies_provider_external_cover_idx
--           (provider_key, external_id) INCLUDE (content_hash, lifecycle)
--         makes both reads Index Only Scans; a full sweep reads the index
--         (~25 MB) instead of the heap.
--
-- The unique constraint public_vacancies_provider_external_key stays the
-- ON CONFLICT arbiter; nothing else changes.
--
-- Build: non-concurrent CREATE INDEX inside a transaction (repo precedent for
-- this table: 20261001090000, 20261001200000). Readers are not blocked;
-- writers wait for the build (no importer runs at apply time).
--
-- Rollback: supabase/rollbacks/20261025180000_public_vacancies_importer_cover_indexes_v1.down.sql
-- (drops exactly these two indexes; derived structures, no data impact).

begin;

create index if not exists public_vacancies_provider_active_idx
  on public.public_vacancies (provider_key)
  where is_active;

comment on index public.public_vacancies_provider_active_idx is
  'Flag-active rows per provider. Serves the admin source-health count (readVacancySourceHealth: provider_key = $1 and is_active) as an Index Only Scan instead of a full heap Seq Scan (measured 14,996 ms, 2026-10-25).';

create index if not exists public_vacancies_provider_external_cover_idx
  on public.public_vacancies (provider_key, external_id)
  include (content_hash, lifecycle);

comment on index public.public_vacancies_provider_external_cover_idx is
  'Covers the importer dedup-state keyset read and the persist existence read (external_id, content_hash, lifecycle by provider_key) so neither reads the heap (measured 369 ms per 1,000-row page, 2026-10-25).';

commit;

-- ROLLBACK
-- see supabase/rollbacks/20261025180000_public_vacancies_importer_cover_indexes_v1.down.sql
