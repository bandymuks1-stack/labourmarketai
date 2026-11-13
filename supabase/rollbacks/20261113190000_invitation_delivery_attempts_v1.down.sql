-- Rollback for 20261113190000_invitation_delivery_attempts_v1.sql
-- Removes the attempt log, the five functions and the six invitation columns. delivery_status,
-- delivery_reserved_at, last_sent_at, resend_count and token_hash are untouched by the forward
-- migration, so every invitation keeps its delivery state. The recorded reasons are lost.

begin;

drop function if exists public.invitation_delivery_health_v1(integer);
drop function if exists public.invitation_delivery_retry_candidates_v1();
drop function if exists public.dead_letter_invitation_delivery_v1(uuid, text);
drop function if exists public.record_invitation_delivery_attempt_v1(uuid, text, text, text, text, timestamptz);
drop table if exists public.invitation_delivery_attempts_v1;
drop index if exists public.invitations_delivery_retry_due_idx;

alter table public.invitations
  drop constraint if exists invitations_delivery_failure_class_chk,
  drop constraint if exists invitations_delivery_failure_reason_code_chk,
  drop column if exists delivery_dead_lettered_at,
  drop column if exists next_delivery_retry_at,
  drop column if exists delivery_failure_class,
  drop column if exists delivery_failure_reason,
  drop column if exists last_delivery_attempt_at,
  drop column if exists delivery_attempts;

commit;
