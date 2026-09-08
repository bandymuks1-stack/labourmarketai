-- Rollback for 20260712100000_voice_journal_jobs_v1.sql
-- Drops ONLY the four NEW functions and the one NEW table. Voice job rows
-- live only in that table; no existing object was recreated.

begin;

drop function if exists public.delete_voice_journal_job_v1(uuid);
drop function if exists public.confirm_voice_journal_job_v1(uuid, text, uuid);
drop function if exists public.set_voice_journal_job_result_v1(uuid, text, text);
drop function if exists public.create_voice_journal_job_v1(text, text, text, text);
drop table if exists public.voice_journal_jobs;

commit;
