-- @human-gate-approved
-- 20261011090000_public_vacancy_occupation_trgm_idx_v1
--
-- ONE additive trigram index (+ the pg_trgm extension it needs, installed into
-- the `extensions` schema like btree_gist/pgcrypto). No function, grant, RLS,
-- row or column is touched. RED only because CREATE EXTENSION installs server-side code (pg_trgm is a stock contrib module).
--
-- WHY (measured 2026-10-11 on production):
--   /en/jobs?q=sveiser (a Norwegian welder searching in their own word) answers
--   "The job board did not answer in time" on every try. The free-text branch
--   of search_public_vacancy_previews_v1 counts with
--   `occupation_raw ilike '%sveiser%'` over public_vacancies_active_board_cover_idx:
--     Index Only Scan, Rows Removed by Filter: 117,415, 5,748 ms
--   against the 3 s anon statement_timeout. 20261001200100 measured free text at
--   185-352 ms; since then NAV Norway added ~3.8k rows and the is_active set is
--   117k (65k of them past expires_at — kept active by design, see
--   lib/vacancy-store/vacancy-read.ts), so a needle with few hits has to read
--   the whole active set and can never stop early.
--
-- FIX: a GIN trigram index on occupation_raw over the same `where is_active`
--   set. `ilike '%needle%'` with a >=3-character needle becomes a bitmap index
--   scan over the matching rows only. The function body is unchanged.
--
-- Rollback: supabase/rollbacks/20261011090000_public_vacancy_occupation_trgm_idx_v1.down.sql

begin;

create extension if not exists pg_trgm with schema extensions;

create index if not exists public_vacancies_active_occupation_trgm_idx
  on public.public_vacancies
  using gin (occupation_raw extensions.gin_trgm_ops)
  where is_active;

commit;

-- ROLLBACK
-- see supabase/rollbacks/20261011090000_public_vacancy_occupation_trgm_idx_v1.down.sql
