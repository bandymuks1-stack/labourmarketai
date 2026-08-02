-- Rollback for 20260802120000_experience_records_v1.
-- Drops the experience domain functions + tables. public.audit_logs rows are
-- append-only history and deliberately stay.

drop function if exists public.get_experience_counts(text, uuid);
drop function if exists public.resolve_experience_dispute(uuid, text, text);
drop function if exists public.review_experience_dispute(uuid);
drop function if exists public.open_experience_dispute(uuid, text);
drop function if exists public.moderate_experience_response(uuid, text, text);
drop function if exists public.submit_experience_response(uuid, text);
drop function if exists public.decide_experience_moderation(uuid, text, text);
drop function if exists public.start_experience_moderation(uuid);
drop function if exists public.submit_experience_record(text, uuid, text, uuid, text, text, jsonb);
drop function if exists public.experience_audit(text, uuid, text, text, text, text);

drop table if exists public.experience_responses;
drop table if exists public.experience_records;
