-- 20261103171100_public_vacancies_occupation_trgm_idx_v1
--
-- ONE derived index on public.public_vacancies so the public free-text job
-- search (search_public_vacancy_previews_v1, both its count and its page)
-- reads a few hundred blocks instead of the whole active board. No function,
-- grant, policy, column or row is touched; results are byte-identical (GIN
-- trigram matches are always rechecked against the original predicate).
--
-- WHY (production, read-only, 2026-11-03):
--   /jobs?q=… answered 7.5-9.2 s against the 3 s anon statement timeout.
--   The nested count inside the function was measured with auto_explain:
--     Index Only Scan on public_vacancies_active_board_cover_idx
--     Rows Removed by Filter 119,057 · 24,165 shared buffers · 6,295 ms
--   The same statement, same plan, same buffers, run again on a warm
--   backend: 89-100 ms. The cost is touching ~24k pages when they are cold
--   (≈180 µs per page on this compute size), so it scales with pages read,
--   not with CPU per row.
--   Scratch PG16, production-shaped synthetic copy (190,205 rows, 119,465
--   active, 5,152 distinct titles, no production rows):
--     count  'snickare'  4,555 → 91 blocks · page 4,561 → 97 blocks
--     every ≥3-character term measured: 80-122 blocks with this index
--   Index size 4.7 MB, build 2.8-4.0 s at maintenance_work_mem 32 MB.
--
-- THE EXPRESSION MUST STAY EXACTLY `lower(occupation_raw) COLLATE "C"`:
-- the deployed predicate is `lower(v.occupation_raw) collate "C" like
-- v_pattern` (v4, 20261011090000). An index on plain lower(occupation_raw)
-- has the database collation and is NOT chosen for that predicate (proven on
-- the scratch copy). Partial on `is_active`, the function's own predicate.
--
-- 1-2 character terms produce no trigrams; the planner keeps them on today's
-- scan (custom plans, verified with the plan cache in auto mode: 8 custom, 0
-- generic), so they are no slower than now — and no faster.
--
-- PRODUCTION APPLY PROCEDURE (owner approval first; never `supabase db push`).
-- apply_migration wraps its SQL in a transaction and CREATE INDEX
-- CONCURRENTLY cannot run in one, so the index is pre-built concurrently and
-- this file is then applied as a recorded no-op:
--   1. apply_migration 20261103171000_pg_trgm_extension_v1.
--   2. execute_sql, ONE statement on its own (no BEGIN, nothing else):
--        create index concurrently if not exists public_vacancies_occupation_trgm_idx
--          on public.public_vacancies
--          using gin ((lower(occupation_raw) collate "C") extensions.gin_trgm_ops)
--          where is_active;
--      Readers AND writers keep running (SHARE UPDATE EXCLUSIVE). Run it when
--      no importer is mid-run; it waits for open transactions to finish.
--      If the call reports "cannot run inside a transaction block", stop:
--      the owner runs the same statement from psql on a direct connection.
--   3. Verify: indisvalid = true and pg_get_indexdef equals EXPECTED below.
--      If invalid: `drop index concurrently if exists
--      public.public_vacancies_occupation_trgm_idx;` (alone) and repeat 2.
--   4. apply_migration THIS file: the guard below passes, `if not exists`
--      skips the build, the comment is set, the ledger records the version.
--   5. Read-only proof: auto_explain the function for snickare / elektriker
--      / undersköterska and confirm the nested count uses this index.
-- On a fresh database (local, preview) this file builds the index directly
-- inside the transaction; that is a few seconds on an empty or small table.

begin;

-- Refuse to record a half-built or differently shaped index: `if not exists`
-- alone would silently accept an INVALID leftover from a failed concurrent
-- build, or a same-named index with another expression.
do $$
declare
  v_valid boolean;
  v_def text;
begin
  select i.indisvalid, pg_get_indexdef(i.indexrelid)
    into v_valid, v_def
  from pg_index i
  where i.indexrelid = to_regclass('public.public_vacancies_occupation_trgm_idx');

  if found and not v_valid then
    raise exception 'public_vacancies_occupation_trgm_idx is INVALID (failed concurrent build): drop it concurrently and rebuild before applying';
  end if;
  if found and v_def <> 'CREATE INDEX public_vacancies_occupation_trgm_idx ON public.public_vacancies USING gin (lower(occupation_raw) COLLATE "C" extensions.gin_trgm_ops) WHERE is_active' then
    raise exception 'public_vacancies_occupation_trgm_idx exists with an unexpected definition: %', v_def;
  end if;
end
$$;

create index if not exists public_vacancies_occupation_trgm_idx
  on public.public_vacancies
  using gin ((lower(occupation_raw) collate "C") extensions.gin_trgm_ops)
  where is_active;

comment on index public.public_vacancies_occupation_trgm_idx is
  'Trigram index for the public free-text job search: serves lower(occupation_raw) COLLATE "C" LIKE ''%term%'' in search_public_vacancy_previews_v1 (count + page). Expression must match the function predicate exactly. Measured 24,165 -> ~100 blocks per count (2026-11-03).';

commit;

-- ROLLBACK
-- see supabase/rollbacks/20261103171100_public_vacancies_occupation_trgm_idx_v1.down.sql
-- (drop index; derived structure, no data impact; search returns to the
-- covering-index scan it uses today).
