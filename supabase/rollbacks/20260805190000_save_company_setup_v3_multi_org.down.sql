-- ROLLBACK for 20260805190000 — restore singleton save_company_setup v1/v2.
--
-- Drops v3 and restores the PRE-M-P0-2 bodies of save_company_setup (v1,
-- from 20260604140000 lines 64+) and save_company_setup_v2 (from
-- 20260612090000 lines 60+) by re-running those files' definitions verbatim:
--
--   psql -f - <(sed -n '/^create or replace function public.save_company_setup(/,/^grant execute on function public.save_company_setup(/p' \
--        supabase/migrations/20260604140000_company_automatic_first.sql)
--   psql -f - <(sed -n '/^create or replace function public.save_company_setup_v2(/,/^grant execute on function public.save_company_setup_v2(/p' \
--        supabase/migrations/20260612090000_company_type_and_country_safety.sql)
--
-- The definitions are executed from the ORIGINAL migration files rather than
-- duplicated here so the restore can never drift from what those approved
-- files say. Apply the two extracts above (each is a complete
-- CREATE OR REPLACE + REVOKE/GRANT block), then:

drop function if exists public.save_company_setup_v3(
  uuid, text, text, text, text, text, text, text, text, boolean, text);

-- WARNING: rolling back RE-OPENS the singleton behaviour. If any profile
-- owns two companies by then, the restored v1/v2 `where profile_id = uid`
-- UPDATE writes ALL of that profile's company rows at once (v1/v2 predate
-- multi-ownership). Roll back only together with a decision about those
-- rows; the guard prologue this migration added is what protects them.
