-- ============================================================================
-- ROLLBACK for 20260902160100_public_vacancies_unused_indexes_v1
--
-- Recreates both indexes exactly as 20260809160000_public_vacancy_persistence_v1
-- defined them. Building the GIN full-text index over ≈ 70 k ads takes a few
-- seconds to a minute; no data is involved either way.
-- ============================================================================

create index if not exists public_vacancies_skill_slugs_idx
  on public.public_vacancies using gin (skill_slugs)
  where is_active;

create index if not exists public_vacancies_fulltext_idx
  on public.public_vacancies
  using gin (to_tsvector('simple', title_raw || ' ' || description_raw))
  where is_active;
