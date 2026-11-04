-- 20261104120000_public_vacancies_occupation_scan_idx_v1
--
-- ONE narrow index for the free-text job search: everything its match needs, and
-- nothing else, so one index-only scan answers the count and the page
-- (20261104120100). No function, grant, policy, column or row is touched here.
--
-- WHY: public_vacancies_active_board_cover_idx carries ten more columns than the
-- search reads. On a production-width synthetic copy it takes 2,206 pages, this
-- index 1,240. Production cover index: 3,282 pages. Estimate here ~1.85k (not measured).
--
-- @plan-cache-proof: scripts/db-proof/plan-cache-probe.sql, auto + force_generic_plan, scratch PG16, 11 terms of 1, 2, 3 characters and whole words, worst 165.6 ms (a, auto)
--
-- PRODUCTION APPLY PROCEDURE (owner approval first; never `supabase db push`).
-- apply_migration wraps its SQL in a transaction and CREATE INDEX CONCURRENTLY
-- cannot run in one, so the index is pre-built and this file then records it:
--   1. execute_sql, ONE statement on its own, with no importer mid-run:
--        create index concurrently if not exists public_vacancies_active_occupation_scan_idx
--          on public.public_vacancies (occupation_raw)
--          include (expires_at, published_at, id)
--          where is_active;
--      If it reports "cannot run inside a transaction block", stop: the owner
--      runs the same statement from psql on a direct connection.
--   2. Verify indisvalid = true. If invalid: `drop index concurrently if exists
--      public.public_vacancies_active_occupation_scan_idx;` (alone), repeat 1.
--   3. apply_migration THIS file: the guard passes, `if not exists` skips the
--      build, the comment is set, the ledger records the version.
-- On a fresh database this file builds the index directly in the transaction.

begin;

set local search_path = public;

-- Refuse to record a half-built or differently shaped index.
do $$
declare
  v_valid boolean;
  v_def text;
begin
  select i.indisvalid, pg_get_indexdef(i.indexrelid)
    into v_valid, v_def
  from pg_index i
  where i.indexrelid = to_regclass('public.public_vacancies_active_occupation_scan_idx');

  if found and not v_valid then
    raise exception 'public_vacancies_active_occupation_scan_idx is INVALID (failed concurrent build): drop it concurrently and rebuild before applying';
  end if;
  if found and v_def <> 'CREATE INDEX public_vacancies_active_occupation_scan_idx ON public.public_vacancies USING btree (occupation_raw) INCLUDE (expires_at, published_at, id) WHERE is_active' then
    raise exception 'public_vacancies_active_occupation_scan_idx exists with an unexpected definition: %', v_def;
  end if;
end
$$;

create index if not exists public_vacancies_active_occupation_scan_idx
  on public.public_vacancies (occupation_raw)
  include (expires_at, published_at, id)
  where is_active;

comment on index public.public_vacancies_active_occupation_scan_idx is
  'Free-text job search: one index-only scan answers the exact total and the page in search_public_vacancy_previews_v1. Derived structure.';

commit;

-- ROLLBACK
-- see supabase/rollbacks/20261104120000_public_vacancies_occupation_scan_idx_v1.down.sql
-- (drops exactly this index; a derived structure, no data impact)
