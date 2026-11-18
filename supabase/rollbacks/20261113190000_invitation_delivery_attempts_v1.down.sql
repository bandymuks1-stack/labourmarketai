-- Rollback for 20261113190000_invitation_delivery_attempts_v1.sql
--
-- REMOVES ONLY WHAT THAT MIGRATION CREATED, AND ONLY WHILE IT HOLDS NO DATA.
--
-- 1. It REFUSES (raises, nothing is dropped) while there is anything to lose:
--      * any row in public.invitation_delivery_attempts_v1 (the per-attempt delivery history), or
--      * any invitation whose new columns carry a value: delivery_attempts other than 0 (its
--        default), or a non-null last_delivery_attempt_at, delivery_failure_reason,
--        delivery_failure_class, next_delivery_retry_at, delivery_dead_lettered_at,
--        delivery_message_id, delivery_bounced_at, delivery_dsn_status or delivery_confirmed_at.
--    Those are the recorded reasons, diagnostics, bounce and confirmation facts; undoing the schema
--    must never silently delete them (owner decision, R2 P2 on #3318).
--
--    UNDOING A USED DATABASE needs a SEPARATE, OWNER-APPROVED export-and-empty step first: export
--    the attempt rows and the ten columns, empty the attempt table, reset delivery_attempts to 0 and
--    null the other nine columns — then run this file. This file never does that itself.
--      select * from public.invitation_delivery_attempts_v1;
--
-- 2. Then it removes the attempt log (with its three indexes), the six functions, the two invitation
--    indexes, the four CHECK constraints and the ten invitation columns. The forward migration
--    never touches delivery_status, delivery_reserved_at, last_sent_at, resend_count, token_hash or any existing
--    function, so every invitation keeps its delivery state and every existing caller keeps working.
--
-- ORDER: roll the APP back first (or keep the new app — it treats missing functions as "not
-- applied"), then run this file. Idempotent: safe to run twice (the checks skip an object that is
-- already gone).

begin;

set local lock_timeout = '5s';

do $$
declare
  c text;
  v_has boolean;
begin
  if to_regclass('public.invitation_delivery_attempts_v1') is not null then
    if exists (select 1 from public.invitation_delivery_attempts_v1) then
      raise exception 'rollback refused: invitation_delivery_attempts_v1 contains delivery attempt records';
    end if;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'invitations'
                and column_name = 'delivery_attempts') then
    if exists (select 1 from public.invitations
                where delivery_attempts is distinct from 0) then
      raise exception 'rollback refused: invitations.delivery_attempts is not 0 on at least one invitation';
    end if;
  end if;

  foreach c in array array[
    'last_delivery_attempt_at', 'delivery_failure_reason', 'delivery_failure_class',
    'next_delivery_retry_at', 'delivery_dead_lettered_at', 'delivery_message_id',
    'delivery_bounced_at', 'delivery_dsn_status', 'delivery_confirmed_at'
  ] loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'invitations'
                  and column_name = c) then
      execute format('select exists (select 1 from public.invitations where %I is not null)', c)
        into v_has;
      if v_has then
        raise exception 'rollback refused: invitations.% holds a value on at least one invitation', c;
      end if;
    end if;
  end loop;
end
$$;

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
