-- Rollback for 20261113190000_invitation_delivery_attempts_v1.sql
--
-- Removes the attempt log, the seven functions, the three indexes, the four CHECK constraints and
-- the ten invitation columns. The forward migration never touches delivery_status,
-- delivery_reserved_at, last_sent_at, resend_count, token_hash or any existing function, so every
-- invitation keeps its delivery state and every existing caller keeps working. The recorded
-- reasons, diagnostics, bounce and confirmation facts are lost (export them first if needed:
--   select * from public.invitation_delivery_attempts_v1;).
--
-- ORDER: roll the APP back first (or keep the new app — it treats missing functions as "not
-- applied"), then run this file. Idempotent: safe to run twice.

begin;

drop function if exists public.invitation_delivery_health_v1(integer);
drop function if exists public.external_referral_reprocess_candidates_v4();
drop function if exists public.invitation_delivery_retry_candidates_v1();
drop function if exists public.record_invitation_dsn_v1(text, text, text);
drop function if exists public.dead_letter_invitation_delivery_v1(uuid, text);
drop function if exists public.record_invitation_delivery_attempt_v1(uuid, text, text, text, text, timestamptz, jsonb);
drop table if exists public.invitation_delivery_attempts_v1;
drop index if exists public.invitations_delivery_retry_due_idx;
drop index if exists public.invitations_delivery_message_id_idx;

alter table public.invitations
  drop constraint if exists invitations_delivery_dsn_status_chk,
  drop constraint if exists invitations_delivery_message_id_chk,
  drop constraint if exists invitations_delivery_failure_class_chk,
  drop constraint if exists invitations_delivery_failure_reason_code_chk,
  drop column if exists delivery_confirmed_at,
  drop column if exists delivery_dsn_status,
  drop column if exists delivery_bounced_at,
  drop column if exists delivery_message_id,
  drop column if exists delivery_dead_lettered_at,
  drop column if exists next_delivery_retry_at,
  drop column if exists delivery_failure_class,
  drop column if exists delivery_failure_reason,
  drop column if exists last_delivery_attempt_at,
  drop column if exists delivery_attempts;

commit;
