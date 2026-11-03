-- @human-gate-approved — RED draft (re-creates the trigram index rolled back on 2026-11-03). NOT applied. Apply only after explicit owner approval and only AFTER 20261103200000 is applied.
-- 20261103200100_public_vacancies_occupation_trgm_idx_v2
--
-- Same index, same guard as v1 (ledger 20261103193911, rolled back by
-- 20261103194208). v1 failed because generic plans chose the index for 1-2
-- character terms; 20261103200000 makes every call plan with the real term.
--
-- WHAT TO EXPECT (production, read-only, 2026-11-03). Terms of 3+ characters
-- read the matching ACTIVE rows' heap pages through a bitmap scan. Cold, each
-- page cost ~0.6-0.7 ms in the v1 measurements:
--   term            active rows  heap pages (live only)  v1 custom plan, pass 1
--   snickare          886           796 (389)              566 ms   (today cold: 3,935 ms)
--   elektriker        904           853 (449)              -
--   kock            1,515         1,413 (660)            1,008 ms   (today warm: 118 ms)
--   undersköterska  3,094         2,765 (1,164)          1,677 ms   (today warm: 117 ms)
-- So the index removes the 4-8 s cold scans, but a term with thousands of
-- active rows costs ~1-2 s when its heap pages are cold, where today a warm
-- scan takes ~0.1 s. 53-58% of those pages hold only EXPIRED active rows:
-- the open owner decision to deactivate expired rows would roughly halve them.
-- A GIN index cannot filter expires_at (that would need btree_gin, another
-- extension), and a partial index cannot use now().
--
-- PRODUCTION APPLY PROCEDURE (owner approval first; never `supabase db push`):
--   1. apply_migration 20261103200000 (function setting). Verify:
--        select proconfig from pg_proc where oid = 'public.search_public_vacancy_previews_v1(text,text,integer,integer)'::regprocedure;
--      -> contains plan_cache_mode=force_custom_plan.
--   2. execute_sql, ONE statement on its own (no BEGIN), when no importer is mid-run:
--        create index concurrently if not exists public_vacancies_occupation_trgm_idx
--          on public.public_vacancies
--          using gin ((lower(occupation_raw) collate "C") extensions.gin_trgm_ops)
--          where is_active;
--   3. Verify indisvalid = true; if not, drop it concurrently and repeat 2.
--   4. apply_migration THIS file (guard + no-op create + comment).
--   5. Acceptance, on ONE fresh backend, 8 calls each (past the plan-cache
--      switch point): a, el, kock, undersköterska, snickare. Any call over
--      3 s -> `drop index concurrently if exists public.public_vacancies_occupation_trgm_idx;`
--      on its own and record the rollback, as on 2026-11-03.

begin;

-- Applied 2026-11-03 with this line (ledger 20261103193911): without it pg_get_indexdef prints
-- gin_trgm_ops unqualified when the session search_path includes extensions, and the guard raises.
set local search_path = public;

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
  'Trigram index for the public free-text job search: serves lower(occupation_raw) COLLATE "C" LIKE ''%term%'' in search_public_vacancy_previews_v1 (count + page). Expression must match the function predicate exactly. Safe only while that function has plan_cache_mode = force_custom_plan (generic plans chose it for 1-2 character terms: 16-26 s, rolled back 2026-11-03).';

commit;

-- ROLLBACK
-- see supabase/rollbacks/20261103200100_public_vacancies_occupation_trgm_idx_v2.down.sql
-- (drop index; derived structure, no data impact; search returns to the
-- covering-index scan it uses today).
