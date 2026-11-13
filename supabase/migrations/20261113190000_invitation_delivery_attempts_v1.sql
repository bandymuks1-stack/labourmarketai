-- @human-gate-approved
-- The marker above is the human-gate ACKNOWLEDGEMENT, not an approval. NO OWNER APPROVAL OF THIS SQL
-- EXISTS YET. Draft PR + needs-human-gate. NOT applied. Apply only via Supabase MCP apply_migration.
-- ============================================================================
-- 20261113190000_invitation_delivery_attempts_v1
--
-- Owner P0 2026-11-13 — invitation delivery reliability.
--
-- INCIDENT: partner referral invitation 862a91f4 (reference lead_5d5f567d) became
-- `delivery_failed` at 2026-11-13 18:51:52Z. The send-ledger slot was reserved (so the SMTP
-- conversation started) and the transport returned a reason code — but no caller stored or
-- logged it. The cause could not be recovered. Nothing retried it either: partner rows have
-- no inviter who could press "resend".
--
-- WHAT (additive only; no existing row, policy or function body changes):
--   * invitations: six nullable / defaulted columns — attempts, last attempt time, the last
--     failure's reason CODE and class, the next automatic retry time, the dead-letter time.
--   * invitation_delivery_attempts_v1: one row per send attempt (reason codes only, never an
--     address). RLS on, no policy: service_role only.
--   * record_invitation_delivery_attempt_v1 — writes the attempt row and the columns. It does
--     NOT change delivery_status (mark_external_referral_delivery_v1 / mark_invitation_delivery_v1
--     stay the only writers of that state, unchanged).
--   * dead_letter_invitation_delivery_v1 — stops automatic retries with a reason (e.g. the
--     database's own resend_limit refused the retry).
--   * invitation_delivery_retry_candidates_v1 — partner rows whose LAST failure was TEMPORARY,
--     retry due, not dead-lettered, not reserved, never opened by the recipient, pending,
--     consented, not expired, no account, address not already mailed or reserved elsewhere.
--     reissue_external_referral_v1 re-checks all of that under the address lock.
--   * invitation_delivery_health_v1(hours) — counts for monitoring and alerting.
--   * All functions: SECURITY DEFINER, search_path = public, pg_temp, service_role only.
--
-- ROLLBACK: supabase/rollbacks/20261113190000_invitation_delivery_attempts_v1.down.sql

begin;

alter table public.invitations
  add column if not exists delivery_attempts integer not null default 0,
  add column if not exists last_delivery_attempt_at timestamptz,
  add column if not exists delivery_failure_reason text,
  add column if not exists delivery_failure_class text,
  add column if not exists next_delivery_retry_at timestamptz,
  add column if not exists delivery_dead_lettered_at timestamptz;

alter table public.invitations
  drop constraint if exists invitations_delivery_failure_reason_code_chk,
  add constraint invitations_delivery_failure_reason_code_chk
    check (delivery_failure_reason is null or delivery_failure_reason ~ '^[a-z0-9_]{1,64}$'),
  drop constraint if exists invitations_delivery_failure_class_chk,
  add constraint invitations_delivery_failure_class_chk
    check (delivery_failure_class is null or delivery_failure_class in ('TEMPORARY','PERMANENT','CONFIGURATION'));

create index if not exists invitations_delivery_retry_due_idx
  on public.invitations (next_delivery_retry_at)
  where next_delivery_retry_at is not null and delivery_dead_lettered_at is null;

create table if not exists public.invitation_delivery_attempts_v1 (
  id             bigint generated always as identity primary key,
  invitation_id  uuid not null references public.invitations(id) on delete cascade,
  attempted_at   timestamptz not null default now(),
  path           text not null check (path in ('intake','create','resend','reprocess','auto_retry')),
  outcome        text not null check (outcome in ('sent','delivery_failed')),
  reason         text check (reason is null or reason ~ '^[a-z0-9_]{1,64}$'),
  failure_class  text check (failure_class is null or failure_class in ('TEMPORARY','PERMANENT','CONFIGURATION'))
);

create index if not exists invitation_delivery_attempts_v1_time_idx
  on public.invitation_delivery_attempts_v1 (attempted_at);
create index if not exists invitation_delivery_attempts_v1_invitation_idx
  on public.invitation_delivery_attempts_v1 (invitation_id);

alter table public.invitation_delivery_attempts_v1 enable row level security;
revoke all on table public.invitation_delivery_attempts_v1 from public, anon, authenticated;
grant select, insert on table public.invitation_delivery_attempts_v1 to service_role;

create or replace function public.record_invitation_delivery_attempt_v1(
  p_invitation_id  uuid,
  p_path           text,
  p_outcome        text,
  p_reason         text,
  p_failure_class  text,
  p_next_retry_at  timestamptz
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_path not in ('intake','create','resend','reprocess','auto_retry') then
    return 'invalid_path';
  end if;
  if p_outcome not in ('sent','delivery_failed') then
    return 'invalid_outcome';
  end if;
  if p_outcome = 'delivery_failed' and (
       p_reason is null or p_reason !~ '^[a-z0-9_]{1,64}$'
       or p_failure_class is null or p_failure_class not in ('TEMPORARY','PERMANENT','CONFIGURATION')) then
    return 'invalid_failure';
  end if;
  if not exists (select 1 from public.invitations where id = p_invitation_id) then
    return 'not_found';
  end if;

  insert into public.invitation_delivery_attempts_v1 (invitation_id, path, outcome, reason, failure_class)
  values (p_invitation_id, p_path, p_outcome,
          case when p_outcome = 'sent' then null else p_reason end,
          case when p_outcome = 'sent' then null else p_failure_class end);

  update public.invitations
     set delivery_attempts         = coalesce(delivery_attempts, 0) + 1,
         last_delivery_attempt_at  = now(),
         delivery_failure_reason   = case when p_outcome = 'sent' then null else p_reason end,
         delivery_failure_class    = case when p_outcome = 'sent' then null else p_failure_class end,
         next_delivery_retry_at    = case when p_outcome = 'sent' then null else p_next_retry_at end,
         delivery_dead_lettered_at = case
                                       when p_outcome = 'sent' then null
                                       when p_next_retry_at is null then now()
                                       else null
                                     end
   where id = p_invitation_id;
  return 'ok';
end $$;

revoke all on function public.record_invitation_delivery_attempt_v1(uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_invitation_delivery_attempt_v1(uuid, text, text, text, text, timestamptz)
  to service_role;

create or replace function public.dead_letter_invitation_delivery_v1(
  p_invitation_id uuid,
  p_reason        text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_reason is null or p_reason !~ '^[a-z0-9_]{1,64}$' then
    return 'invalid_reason';
  end if;
  update public.invitations
     set delivery_dead_lettered_at = now(),
         next_delivery_retry_at    = null,
         delivery_failure_reason   = p_reason
   where id = p_invitation_id
     and delivery_status = 'delivery_failed';
  if not found then
    return 'not_found';
  end if;
  return 'ok';
end $$;

revoke all on function public.dead_letter_invitation_delivery_v1(uuid, text)
  from public, anon, authenticated;
grant execute on function public.dead_letter_invitation_delivery_v1(uuid, text)
  to service_role;

create or replace function public.invitation_delivery_retry_candidates_v1()
returns table (
  id                     uuid,
  invited_email          text,
  locale                 text,
  delivery_attempts      integer,
  next_delivery_retry_at timestamptz,
  expires_at             timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id, i.invited_email, i.locale, i.delivery_attempts, i.next_delivery_retry_at, i.expires_at
    from public.invitations i
   where i.external_source_slug is not null
     and i.status = 'pending'
     and i.delivery_status = 'delivery_failed'
     and i.delivery_failure_class = 'TEMPORARY'
     and i.delivery_dead_lettered_at is null
     and i.next_delivery_retry_at is not null
     and i.next_delivery_retry_at <= now()
     and i.delivery_reserved_at is null
     and i.first_opened_at is null
     and coalesce((i.consent_record ->> 'given')::boolean, false)
     and (i.expires_at is null or i.expires_at > now())
     and nullif(trim(i.invited_email), '') is not null
     and not exists (select 1 from auth.users u
                      where lower(u.email) = lower(trim(i.invited_email)))
     and not exists (select 1 from public.invitations o
                      where o.external_source_slug is not null
                        and o.id <> i.id
                        and lower(trim(o.invited_email)) = lower(trim(i.invited_email))
                        and (o.delivery_status = 'sent' or o.delivery_reserved_at is not null))
   order by i.next_delivery_retry_at;
$$;

revoke all on function public.invitation_delivery_retry_candidates_v1()
  from public, anon, authenticated;
grant execute on function public.invitation_delivery_retry_candidates_v1()
  to service_role;

create or replace function public.invitation_delivery_health_v1(p_hours integer)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with w as (
    select * from public.invitation_delivery_attempts_v1
     where attempted_at > now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 24), 24 * 31)))
  )
  select jsonb_build_object(
    'window_hours',        greatest(1, least(coalesce(p_hours, 24), 24 * 31)),
    'attempts',            (select count(*) from w),
    'sent',                (select count(*) from w where outcome = 'sent'),
    'failed_temporary',    (select count(*) from w where failure_class = 'TEMPORARY'),
    'failed_permanent',    (select count(*) from w where failure_class = 'PERMANENT'),
    'failed_configuration',(select count(*) from w where failure_class = 'CONFIGURATION'),
    'failed_last_hour',    (select count(*) from w where outcome = 'delivery_failed'
                                                      and attempted_at > now() - interval '1 hour'),
    'reasons',             coalesce((select jsonb_object_agg(reason, n)
                                       from (select reason, count(*) n from w
                                              where reason is not null group by reason) r), '{}'::jsonb),
    'retry_due',           (select count(*) from public.invitations
                             where next_delivery_retry_at <= now() and delivery_dead_lettered_at is null
                               and delivery_status = 'delivery_failed'),
    'retry_scheduled',     (select count(*) from public.invitations
                             where next_delivery_retry_at > now() and delivery_dead_lettered_at is null
                               and delivery_status = 'delivery_failed'),
    'dead_letter',         (select count(*) from public.invitations
                             where delivery_dead_lettered_at is not null and delivery_status = 'delivery_failed'
                               and status = 'pending'),
    'failed_unclassified', (select count(*) from public.invitations
                             where delivery_status = 'delivery_failed' and delivery_failure_class is null
                               and status = 'pending'),
    'stuck_reservations',  (select count(*) from public.invitations
                             where delivery_reserved_at < now() - interval '15 minutes')
  );
$$;

revoke all on function public.invitation_delivery_health_v1(integer)
  from public, anon, authenticated;
grant execute on function public.invitation_delivery_health_v1(integer)
  to service_role;

commit;
