-- Rollback for 20261103200000_search_public_vacancy_previews_force_custom_plan_v1
-- Drop the trigram index FIRST (20261103200100 rollback): without this setting,
-- generic plans pick it for 1-2 character terms (16-26 s in production).

begin;

alter function public.search_public_vacancy_previews_v1(text, text, integer, integer)
  reset plan_cache_mode;

commit;
