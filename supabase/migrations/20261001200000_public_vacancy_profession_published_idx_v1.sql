-- 20261001200000_public_vacancy_profession_published_idx_v1
--
-- ONE additive index; no function, grant, RLS, row or column is touched. GREEN.
--
-- WHY (measured 2026-10-01 on production, anon role, parallel workers off):
--   search_public_vacancy_previews_v1(null, <rare profession>, 20, 0)
--     handyman (2 live ads) 910 ms, baker first call 1,277 ms, cleaner 61 ms.
--   The function is planned generic with `(p_slug is null or profession_slug =
--   p_slug)`, so the only usable path is the whole-board covering index walked
--   in published_at order: a rare profession walks ~111k entries to find a few
--   rows. A profession-first index lets a profession-only read stop after 20
--   rows (or read the 2 that exist) — but only once the function states the
--   profession as a plain equality (next migration, RED, owner-gated).
--   This index is harmless on its own and is the prerequisite for that change.
--
-- Same column list as public_vacancies_active_board_cover_idx so every read
-- stays index-only; ordered profession_slug, published_at DESC NULLS LAST, id.
-- ~2-3 MB (profession_slug is not null only).

begin;

create index if not exists public_vacancies_active_profession_board_idx
  on public.public_vacancies (profession_slug, published_at desc nulls last, id)
  include (
    expires_at, occupation_raw, employment_form, working_time,
    positions, compensation_currency, compensation_min, compensation_max,
    source_language)
  where is_active and profession_slug is not null;

commit;

-- ROLLBACK
-- see supabase/rollbacks/20261001200000_public_vacancy_profession_published_idx_v1.down.sql
