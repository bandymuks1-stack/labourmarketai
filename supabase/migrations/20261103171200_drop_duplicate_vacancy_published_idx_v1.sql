-- @human-gate-approved — RED draft (index removal on the public board table). NOT applied. Apply only after explicit owner approval, via the procedure below.
-- 20261103171200_drop_duplicate_vacancy_published_idx_v1
--
-- Drops ONE index that duplicates another exactly in keys, order and
-- predicate:
--   public_vacancies_active_published_idx   (published_at desc nulls last, id) WHERE is_active   10 MB
--   public_vacancies_active_board_cover_idx (published_at desc nulls last, id) INCLUDE (…) WHERE is_active   25 MB
-- No function, grant, policy, column or row is touched; no query loses its
-- index — every plan that used the duplicate has the same order available on
-- the cover index.
--
-- WHY (production, read-only, 2026-11-03): every insert and non-HOT update of
-- an active row writes both b-trees (importers: ~2.5k inserts + 4-6.7k
-- updates per weekday, 8% HOT). Removing one saves 10 MB of cacheable pages on
-- a page-bound instance and one index write per row version.
--
-- WHAT MOVES: EXPLAIN shows the sitemap projection already uses the cover
-- index (Index Only Scan, it needs expires_at). The full-row board read
-- (`select * … order by published_at desc nulls last, id limit 24 offset N`)
-- uses the duplicate today and would walk the cover index instead: ~2.5x the
-- leaf pages for the same entries, a few pages per request against the
-- heap fetch per returned row that both plans pay. Modest gain, small risk —
-- the owner may decline it without affecting the trigram index (#3020).
--
-- PRODUCTION APPLY PROCEDURE (owner approval first; never `supabase db push`):
--   1. execute_sql, ONE statement on its own (no BEGIN):
--        drop index concurrently if exists public.public_vacancies_active_published_idx;
--      Readers and writers keep running.
--   2. apply_migration THIS file: `if exists` makes it a recorded no-op.
--   3. Read-only proof: EXPLAIN the board read above → Index Scan using
--      public_vacancies_active_board_cover_idx.
-- On a fresh database this file drops it inside the transaction.

begin;

drop index if exists public.public_vacancies_active_published_idx;

commit;

-- ROLLBACK
-- see supabase/rollbacks/20261103171200_drop_duplicate_vacancy_published_idx_v1.down.sql
-- (recreates the index exactly as 20260903070000 defined it).
