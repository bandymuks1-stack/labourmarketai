-- 20261104160000_public_vacancies_live_scan_idx_v1
--
-- ONE narrow index for the free-text job search, ordered by when an ad stops being
-- live, so a scan starts at the live rows and never reads an expired one
-- (20261104160100). No function, grant, policy, column or row is touched here.
--
-- WHY: more than half of the entries in every `where is_active` index are ads whose
-- `expires_at` has passed, and the search reads them all to reject them. `is_active`
-- stays what it means (did the publisher withdraw it?), no row is written, and an ad
-- falls out of the scan by itself as the clock moves: there is no job to run or miss.
-- `expires_at` is included because the planner only allows an index-only scan when the
-- plain column is available.
--
-- @plan-cache-proof: scripts/db-proof/plan-cache-probe.sql, auto + force_generic_plan, scratch PG16, 9 terms of 1, 2, 3 characters and whole words, numbers in the PR description
--
-- PRODUCTION APPLY PROCEDURE (owner approval first; never `supabase db push`).
-- apply_migration wraps its SQL in a transaction and CREATE INDEX CONCURRENTLY
-- cannot run in one, so the index is pre-built and this file then records it:
--   1. execute_sql, ONE statement on its own, with no importer mid-run:
--        create index concurrently if not exists public_vacancies_active_live_scan_idx
--          on public.public_vacancies ((coalesce(expires_at, 'infinity'::timestamptz)))
--          include (expires_at, occupation_raw, published_at, id)
--          where is_active;
--      If it reports "cannot run inside a transaction block", stop: the owner
--      runs the same statement from psql on a direct connection.
--   2. Verify indisvalid = true. If invalid: `drop index concurrently if exists
--      public.public_vacancies_active_live_scan_idx;` (alone), repeat 1.
--   3. apply_migration THIS file: the guard passes, `if not exists` skips the
--      build, the comment is set, the ledger records the version.
-- On a fresh database this file builds the index directly in the transaction.

begin;

set local search_path = public;

-- Refuse to record a half-built index, or one with a different predicate or key.
do $$
declare
  v_valid boolean;
  v_def text;
begin
  select i.indisvalid, pg_get_indexdef(i.indexrelid)
    into v_valid, v_def
  from pg_index i
  where i.indexrelid = to_regclass('public.public_vacancies_active_live_scan_idx');

  if found and not v_valid then
    raise exception 'public_vacancies_active_live_scan_idx is INVALID (failed concurrent build): drop it concurrently and rebuild before applying';
  end if;
  if found and (v_def not like '%(COALESCE(expires_at, ''infinity''::timestamp with time zone)) INCLUDE (expires_at, occupation_raw, published_at, id) WHERE is_active') then
    raise exception 'public_vacancies_active_live_scan_idx exists with an unexpected definition: %', v_def;
  end if;
end
$$;

create index if not exists public_vacancies_active_live_scan_idx
  on public.public_vacancies ((coalesce(expires_at, 'infinity'::timestamptz)))
  include (expires_at, occupation_raw, published_at, id)
  where is_active;

comment on index public.public_vacancies_active_live_scan_idx is
  'Free-text job search: one index-only scan over live rows answers the exact total and the page in search_public_vacancy_previews_v1. Derived structure.';

commit;

-- ROLLBACK
-- see supabase/rollbacks/20261104160000_public_vacancies_live_scan_idx_v1.down.sql
-- (drops exactly this index; a derived structure, no data impact)
