-- Rollback for 20260711250000_worker_languages_v1.sql — drops ONLY the
-- objects that migration created (two functions + the table). No existing
-- object is recreated or altered. Apply manually via Supabase MCP after
-- owner approval, never `db push`.

begin;

drop function if exists public.save_worker_language_v1(text, text);
drop function if exists public.remove_worker_language_v1(text);
drop table if exists public.worker_languages;

commit;
