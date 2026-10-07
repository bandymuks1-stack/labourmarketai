-- @human-gate-approved
-- 20261001180100_drop_unused_vacancy_fulltext_gin_v1
--
-- RED (owner-gated since #1421): drops an index. A derived structure, fully
-- recreatable (rollback file), no row or column touched.
--
-- MEASURED 2026-10-01 on production:
--   public_vacancies_fulltext_idx  129 MB  idx_scan = 0 (never used since stats
--   reset 2026-05-19). It indexes title_raw || description_raw, which the
--   anonymous search is forbidden to match, so it cannot serve the public board.
--   Cost it imposes: every ingest INSERT/UPDATE of those columns writes a GIN
--   entry; GIN fastupdate buffers them in a pending list that is flushed
--   inside an unlucky writer (gin_pending_list_limit 4 MB) -> the 7-8 s ingest
--   outliers (max 7,960 ms inserts, 7,644 ms updates) behind the SE persist
--   57014 retries. It is also 129 MB of an instance with shared_buffers 224 MB:
--   it is the largest single competitor for cache with the hot board indexes.
--
-- The guard asserts idx_scan = 0 at apply time: nothing is dropped if the
-- index has been used.

do $$
declare v_scans bigint;
begin
  select s.idx_scan into v_scans
    from pg_stat_user_indexes s
   where s.schemaname = 'public' and s.indexrelname = 'public_vacancies_fulltext_idx';
  if coalesce(v_scans, 0) > 0 then
    raise exception 'public_vacancies_fulltext_idx has % scans; refusing to drop', v_scans;
  end if;
end $$;

drop index if exists public.public_vacancies_fulltext_idx;

-- ROLLBACK
-- see supabase/rollbacks/20261001180100_drop_unused_vacancy_fulltext_gin_v1.down.sql
