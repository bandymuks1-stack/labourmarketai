-- ============================================================================
-- 20260902160100 — public_vacancies_unused_indexes_v1
--
-- FINAL COMPLETION Train B2 (2026-09-02). OWNER GATE G-3 — RED by policy
-- (DDL drop). Ships as a DRAFT + needs-human-gate PR; the owner approves the
-- apply. Reversible: the exact CREATE INDEX statements are in the rollback.
--
-- ----------------------------------------------------------------------------
-- WHY (measured on production, 2026-09-02, pg_stat_user_indexes)
-- ----------------------------------------------------------------------------
--   public_vacancies_fulltext_idx     79 MB   idx_scan = 0 since creation (2026-08-09)
--   public_vacancies_skill_slugs_idx  1.5 MB  idx_scan = 0 since creation
--
--   Nothing in the application runs a text search (no textSearch / to_tsquery
--   call site) or a GIN containment query on skill_slugs; the board searches
--   by profession slug and country through btree indexes that ARE used
--   (public_vacancies_active_profession_idx 304 scans,
--   public_vacancies_provider_external_key 120 k scans). The two indexes cost
--   ≈ 80 MB now and ≈ 15 MB more per week of stream growth, for zero reads.
--
-- ----------------------------------------------------------------------------
-- SAFETY
-- ----------------------------------------------------------------------------
--   • Precondition asserted at apply time: both indexes still have zero scans.
--     If a reader appeared since this file was written, the migration REFUSES
--     to drop and the owner re-decides with the new fact.
--   • Plain DROP INDEX (not CONCURRENTLY: apply_migration runs in a
--     transaction). The lock is on public_vacancies for the duration of the
--     catalog change — milliseconds on a 335 MB table; the importer runs
--     hourly and retries.
--   • No data is touched. Rollback recreates both indexes verbatim
--     (supabase/rollbacks/20260902160100_public_vacancies_unused_indexes_v1.down.sql).
-- ============================================================================

do $$
declare
  v_scans bigint;
begin
  select coalesce(sum(idx_scan), 0)
    into v_scans
    from pg_stat_user_indexes
   where relname = 'public_vacancies'
     and indexrelname in ('public_vacancies_fulltext_idx', 'public_vacancies_skill_slugs_idx');
  if v_scans > 0 then
    raise exception 'public_vacancies_unused_indexes_v1: refusing to drop — % index scans recorded since the decision was made; re-measure and re-decide', v_scans;
  end if;
end;
$$;

drop index if exists public.public_vacancies_fulltext_idx;
drop index if exists public.public_vacancies_skill_slugs_idx;

-- ROLLBACK (verbatim from 20260809160000_public_vacancy_persistence_v1.sql)
--   create index if not exists public_vacancies_skill_slugs_idx
--     on public.public_vacancies using gin (skill_slugs) where is_active;
--   create index if not exists public_vacancies_fulltext_idx
--     on public.public_vacancies
--     using gin (to_tsvector('simple', title_raw || ' ' || description_raw))
--     where is_active;
