-- 20261001090000_public_vacancy_search_indexes_v1
--
-- ONE additive covering index for the public job board (/jobs). No function,
-- grant, RLS, row or column is touched. GREEN tier.
--
-- PRODUCTION DEFECT (measured 2026-10-01, project gorgitwvdzxbnaxhrsrw):
--   /lt/jobs?profession=baker  -> "board did not answer in time"
--   search_public_vacancy_previews_v1(null,'baker',20,0) under anon: 6,721 ms
--   against the anon role's 3 s statement_timeout. 395 flag-active baker ads,
--   185 live. Free text with no match ('kepejas'): 10,259 ms.
--
-- CAUSE (reproduced with PREPARE + plan_cache_mode=force_generic_plan: 6,104 ms):
--   the function is `language sql`, planned GENERIC, so
--   `(p_slug is null or profession_slug = p_slug)` is an opaque predicate and
--   no profession index applies. The planner walks the whole live set through
--   public_vacancies_active_supply_cover_idx and then reads 12,660 HEAP pages
--   (118 MB table, cold) to evaluate the profession / needle filter: 48,266
--   rows removed by filter. A profession with few live ads can never satisfy
--   LIMIT early, so the cost is "read the table", not "find 20 rows".
--
-- FIX WITHOUT TOUCHING THE SECURITY DEFINER FUNCTION: carry every column the
-- function reads in ONE index ordered exactly like its ORDER BY
-- (published_at DESC NULLS LAST, id) under its own predicate (is_active). The
-- same query then runs as an Index Only Scan: the profession / expiry / needle
-- filters are evaluated on index tuples, the heap is not read, and a common
-- profession still stops after 20 rows. The function body, signature, grants
-- and anon allowlist entry are unchanged, so this stays GREEN.
-- Size: ~111k flag-active rows, roughly 15 MB. Non-concurrent create inside a
-- transaction (repo pattern); the build blocks writers for ~1-2 s.

begin;

create index if not exists public_vacancies_active_board_cover_idx
  on public.public_vacancies (published_at desc nulls last, id)
  include (
    expires_at, profession_slug, occupation_raw, employment_form, working_time,
    positions, compensation_currency, compensation_min, compensation_max,
    source_language)
  where is_active;

commit;

-- ROLLBACK
-- see supabase/rollbacks/20261001090000_public_vacancy_search_indexes_v1.down.sql
-- (drops exactly this index; a derived structure, no data impact)
