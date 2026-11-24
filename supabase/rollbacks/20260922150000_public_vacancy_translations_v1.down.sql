-- DOWN for 20260922150000_public_vacancy_translations_v1
-- The migration added ONE jsonb column (derived, regenerable renderings) and
-- its object-shape check. Dropping them restores the prior state; the
-- originals (title_raw / description_raw / source_language) are untouched
-- either way. Renderings lost here are regenerated on the next signed-in read.

begin;

alter table public.public_vacancies
  drop constraint if exists public_vacancies_translations_is_object;
alter table public.public_vacancies
  drop column if exists translations;

commit;
