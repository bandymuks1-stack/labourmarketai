-- @human-gate-approved
-- The marker above is the human-gate ACKNOWLEDGEMENT, not an approval. NO OWNER APPROVAL OF THIS SQL
-- EXISTS YET (owner 2026-11-13: "NO MERGE / NO MIGRATION / NO DEPLOY YET"). Draft PR #3318 +
-- needs-human-gate. NOT applied. Apply only via Supabase MCP apply_migration.
-- ============================================================================
-- 20261113190000_invitation_delivery_attempts_v1
--
-- Owner P0 2026-11-13 — invitation delivery reliability (+ owner corrections on PR #3318).
--
-- INCIDENT: partner referral invitation 862a91f4 (reference lead_5d5f567d) became
-- `delivery_failed` at 2026-11-13 18:51:52Z. The send-ledger slot was reserved (the SMTP
-- conversation started) and the transport returned a reason code — but nothing stored or logged
-- it. The cause could not be recovered.
--
-- WHAT (ADDITIVE ONLY — no existing row value, policy or function body changes):
--   * invitations: ten nullable / defaulted columns — attempts, last attempt time, last failure's
--     reason CODE and class, next automatic retry, dead-letter time, our last Message-ID, bounce
--     time + DSN status code, positive delivery-report time.
--   * invitation_delivery_attempts_v1: one row per send attempt with codes only (step, reply
--     code, enhanced status code, body-transmitted flag, our Message-ID, duration). Never an
--     address, never reply text. RLS on, no policy: service_role only.
--   * record_invitation_delivery_attempt_v1 — writes the attempt row and the columns. It does NOT
--     change delivery_status (the existing mark functions stay its only writers, unchanged).
--   * dead_letter_invitation_delivery_v1 — stops automatic retries with a reason code.
--   * record_invitation_dsn_v1 — a delivery status notification for OUR Message-ID: 'failed' →
--     bounced (and no further automatic retry), 'delivered' → delivery confirmed. Matched by
--     Message-ID only; no address is passed.
--   * invitation_delivery_retry_candidates_v1 — partner rows whose LAST failure was a CONFIRMED
--     TEMPORARY one, retry due, not dead-lettered, not bounced, not reserved, link NEVER opened,
--     pending, consented, unexpired, no account, address not mailed / reserved elsewhere.
--   * external_referral_reprocess_candidates_v4 — v3 + first_opened_at + the last failure class,
--     so the owner's MANUAL reprocess also leaves out opened links and unknown outcomes. v3 stays.
--   * invitation_delivery_health_v1(hours) — counters for monitoring and alerts.
--   * All functions: SECURITY DEFINER, search_path = public, pg_temp, service_role only.
--
-- @plan-cache-proof: n/a — NOT measured with the probe. The five indexes serve service_role cron functions only: the retry-candidate and health functions take no filter argument (one plan either way), and the DSN and attempt lookups are equality on Message-ID / invitation id. No anon or authenticated RPC filters by them.
--
-- COMPATIBILITY: every new invitations column is nullable or has a constant default (PG 11+
-- metadata-only add, no table rewrite); every new CHECK holds for NULL, so existing rows pass.
-- The currently deployed app references none of these objects; the new app treats a missing
-- function (PGRST202 / 42883) as "not applied yet" and keeps working.
--
-- ROLLBACK: supabase/rollbacks/20261113190000_invitation_delivery_attempts_v1.down.sql

begin;

alter table public.invitations
  add column if not exists delivery_attempts integer not null default 0,
  add column if not exists last_delivery_attempt_at timestamptz,
  add column if not exists delivery_failure_reason text,
  add column if not exists delivery_failure_class text,
  add column if not exists next_delivery_retry_at timestamptz,
  add column if not exists delivery_dead_lettered_at timestamptz,
  add column if not exists delivery_message_id text,
  add column if not exists delivery_bounced_at timestamptz,
  add column if not exists delivery_dsn_status text,
  add column if not exists delivery_confirmed_at timestamptz;

alter table public.invitations
  drop constraint if exists invitations_delivery_failure_reason_code_chk,
  add constraint invitations_delivery_failure_reason_code_chk
    check (delivery_failure_reason is null or delivery_failure_reason ~ '^[a-z0-9_]{1,64}$'),
  drop constraint if exists invitations_delivery_failure_class_chk,
  add constraint invitations_delivery_failure_class_chk
    check (delivery_failure_class is null
           or delivery_failure_class in ('TEMPORARY','PERMANENT','CONFIGURATION','UNKNOWN_OUTCOME')),
  drop constraint if exists invitations_delivery_message_id_chk,
  add constraint invitations_delivery_message_id_chk
    check (delivery_message_id is null or delivery_message_id ~ '^<[A-Za-z0-9._-]{1,80}@[A-Za-z0-9.-]{1,80}>$'),
  drop constraint if exists invitations_delivery_dsn_status_chk,
  add constraint invitations_delivery_dsn_status_chk
    check (delivery_dsn_status is null or delivery_dsn_status ~ '^[245]\.[0-9]{1,3}\.[0-9]{1,3}$');

create index if not exists invitations_delivery_retry_due_idx
  on public.invitations (next_delivery_retry_at)
  where next_delivery_retry_at is not null and delivery_dead_lettered_at is null;
create index if not exists invitations_delivery_message_id_idx
  on public.invitations (delivery_message_id)
  where delivery_message_id is not null;

create table if not exists public.invitation_delivery_attempts_v1 (
  id                  bigint generated always as identity primary key,
  invitation_id       uuid not null references public.invitations(id) on delete cascade,
  attempted_at        timestamptz not null default now(),
  path                text not null check (path in ('intake','create','resend','reprocess','auto_retry')),
  outcome             text not null check (outcome in ('sent','delivery_failed')),
  reason              text check (reason is null or reason ~ '^[a-z0-9_]{1,64}$'),
  failure_class       text check (failure_class is null
                                  or failure_class in ('TEMPORARY','PERMANENT','CONFIGURATION','UNKNOWN_OUTCOME')),
  provider            text check (provider is null or provider in ('smtp','resend','postmark','guard')),
  smtp_step           text check (smtp_step is null
                                  or smtp_step in ('connect','greeting','ehlo','auth','mail_from','rcpt_to','data','data_end','http')),
  reply_code          text check (reply_code is null or reply_code ~ '^[1-5][0-9]{2}$'),
  enhanced_code       text check (enhanced_code is null or enhanced_code ~ '^[245]\.[0-9]{1,3}\.[0-9]{1,3}$'),
  message_transmitted boolean,
  message_id          text check (message_id is null or message_id ~ '^<[A-Za-z0-9._-]{1,80}@[A-Za-z0-9.-]{1,80}>$'),
  duration_ms         integer check (duration_ms is null or duration_ms between 0 and 3600000)
);

create index if not exists invitation_delivery_attempts_v1_time_idx
  on public.invitation_delivery_attempts_v1 (attempted_at);
create index if not exists invitation_delivery_attempts_v1_invitation_idx
  on public.invitation_delivery_attempts_v1 (invitation_id);
create index if not exists invitation_delivery_attempts_v1_message_idx
  on public.invitation_delivery_attempts_v1 (message_id)
  where message_id is not null;

alter table public.invitation_delivery_attempts_v1 enable row level security;
revoke all on table public.invitation_delivery_attempts_v1 from public, anon, authenticated;
grant select, insert on table public.invitation_delivery_attempts_v1 to service_role;

create or replace function public.record_invitation_delivery_attempt_v1(
  p_invitation_id  uuid,
  p_path           text,
  p_outcome        text,
  p_reason         text,
  p_failure_class  text,
  p_next_retry_at  timestamptz,
  p_detail         jsonb
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d jsonb := coalesce(p_detail, '{}'::jsonb);
  v_provider text := d ->> 'provider';
  v_step     text := d ->> 'step';
  v_reply    text := d ->> 'reply_code';
  v_enh      text := d ->> 'enhanced_code';
  v_msgid    text := d ->> 'message_id';
  v_sent_msg boolean := case when jsonb_typeof(d -> 'message_transmitted') = 'boolean'
                             then (d ->> 'message_transmitted')::boolean end;
  v_ms       integer := case when jsonb_typeof(d -> 'duration_ms') = 'number'
                             then least(greatest((d ->> 'duration_ms')::numeric, 0), 3600000)::integer end;
begin
  if p_path is null or p_path not in ('intake','create','resend','reprocess','auto_retry') then
    return 'invalid_path';
  end if;
  if p_outcome is null or p_outcome not in ('sent','delivery_failed') then
    return 'invalid_outcome';
  end if;
  if p_outcome = 'delivery_failed' and (
       p_reason is null or p_reason !~ '^[a-z0-9_]{1,64}$'
       or p_failure_class is null
       or p_failure_class not in ('TEMPORARY','PERMANENT','CONFIGURATION','UNKNOWN_OUTCOME')) then
    return 'invalid_failure';
  end if;
  -- Only a CONFIRMED temporary failure may carry a retry time.
  if p_next_retry_at is not null and (p_outcome <> 'delivery_failed' or p_failure_class <> 'TEMPORARY') then
    return 'invalid_retry';
  end if;
  -- Malformed codes are dropped, never stored (the app sanitises first; this is the backstop).
  if v_provider is not null and v_provider not in ('smtp','resend','postmark','guard') then v_provider := null; end if;
  if v_step is not null and v_step not in ('connect','greeting','ehlo','auth','mail_from','rcpt_to','data','data_end','http') then v_step := null; end if;
  if v_reply is not null and v_reply !~ '^[1-5][0-9]{2}$' then v_reply := null; end if;
  if v_enh is not null and v_enh !~ '^[245]\.[0-9]{1,3}\.[0-9]{1,3}$' then v_enh := null; end if;
  if v_msgid is not null and v_msgid !~ '^<[A-Za-z0-9._-]{1,80}@[A-Za-z0-9.-]{1,80}>$' then v_msgid := null; end if;
  if not exists (select 1 from public.invitations where id = p_invitation_id) then
    return 'not_found';
  end if;

  insert into public.invitation_delivery_attempts_v1
    (invitation_id, path, outcome, reason, failure_class, provider, smtp_step, reply_code,
     enhanced_code, message_transmitted, message_id, duration_ms)
  values (p_invitation_id, p_path, p_outcome,
          case when p_outcome = 'sent' then null else p_reason end,
          case when p_outcome = 'sent' then null else p_failure_class end,
          v_provider, v_step, v_reply, v_enh, v_sent_msg, v_msgid, v_ms);

  update public.invitations
     set delivery_attempts         = coalesce(delivery_attempts, 0) + 1,
         last_delivery_attempt_at  = now(),
         delivery_failure_reason   = case when p_outcome = 'sent' then null else p_reason end,
         delivery_failure_class    = case when p_outcome = 'sent' then null else p_failure_class end,
         next_delivery_retry_at    = case when p_outcome = 'sent' then null else p_next_retry_at end,
         delivery_dead_lettered_at = case
                                       when p_outcome = 'sent' then null
                                       when p_failure_class = 'TEMPORARY' and p_next_retry_at is null then now()
                                       else null
                                     end,
         delivery_message_id       = coalesce(v_msgid, delivery_message_id)
   where id = p_invitation_id;
  return 'ok';
end $$;

revoke all on function public.record_invitation_delivery_attempt_v1(uuid, text, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_invitation_delivery_attempt_v1(uuid, text, text, text, text, timestamptz, jsonb)
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

-- A delivery status notification about OUR message. Idempotent: the same report twice changes
-- nothing the second time. A row whose Message-ID is not ours answers 'unknown_message'.
create or replace function public.record_invitation_dsn_v1(
  p_message_id text,
  p_action     text,
  p_status     text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_message_id is null or p_message_id !~ '^<[A-Za-z0-9._-]{1,80}@[A-Za-z0-9.-]{1,80}>$' then
    return 'invalid_message_id';
  end if;
  if p_action is null or p_action not in ('failed','delivered','delayed') then
    return 'invalid_action';
  end if;
  if p_status is not null and p_status !~ '^[245]\.[0-9]{1,3}\.[0-9]{1,3}$' then
    return 'invalid_status';
  end if;
  select i.id into v_id from public.invitations i where i.delivery_message_id = p_message_id;
  if v_id is null then
    select a.invitation_id into v_id from public.invitation_delivery_attempts_v1 a
     where a.message_id = p_message_id order by a.attempted_at desc limit 1;
  end if;
  if v_id is null then
    return 'unknown_message';
  end if;
  if p_action = 'failed' then
    update public.invitations
       set delivery_bounced_at    = coalesce(delivery_bounced_at, now()),
           delivery_dsn_status    = coalesce(p_status, delivery_dsn_status),
           next_delivery_retry_at = null
     where id = v_id;
    return 'bounced';
  elsif p_action = 'delivered' then
    update public.invitations
       set delivery_confirmed_at = coalesce(delivery_confirmed_at, now())
     where id = v_id;
    return 'confirmed';
  end if;
  return 'delayed';
end $$;

revoke all on function public.record_invitation_dsn_v1(text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_invitation_dsn_v1(text, text, text)
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
     and i.delivery_bounced_at is null
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

create or replace function public.external_referral_reprocess_candidates_v4()
returns table (
  id uuid,
  invited_email text,
  locale text,
  created_at timestamptz,
  expires_at timestamptz,
  status text,
  delivery_status text,
  consent_given boolean,
  external_source_slug text,
  has_account boolean,
  address_already_sent boolean,
  delivery_reserved_at timestamptz,
  address_reserved boolean,
  first_opened_at timestamptz,
  delivery_failure_class text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select v.id, v.invited_email, v.locale, v.created_at, v.expires_at, v.status, v.delivery_status,
         v.consent_given, v.external_source_slug, v.has_account, v.address_already_sent,
         v.delivery_reserved_at, v.address_reserved, i.first_opened_at, i.delivery_failure_class
    from public.external_referral_reprocess_candidates_v3() v
    join public.invitations i on i.id = v.id;
$$;

revoke all on function public.external_referral_reprocess_candidates_v4()
  from public, anon, authenticated;
grant execute on function public.external_referral_reprocess_candidates_v4()
  to service_role;

create or replace function public.invitation_delivery_health_v1(p_hours integer)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with h as (select greatest(1, least(coalesce(p_hours, 24), 24 * 31)) as hours),
  w as (
    select a.* from public.invitation_delivery_attempts_v1 a, h
     where a.attempted_at > now() - make_interval(hours => h.hours)
  )
  select jsonb_build_object(
    'window_hours',          (select hours from h),
    'attempts',              (select count(*) from w),
    'sent',                  (select count(*) from w where outcome = 'sent'),
    'failed_temporary',      (select count(*) from w where failure_class = 'TEMPORARY'),
    'failed_permanent',      (select count(*) from w where failure_class = 'PERMANENT'),
    'failed_configuration',  (select count(*) from w where failure_class = 'CONFIGURATION'),
    'failed_unknown_outcome',(select count(*) from w where failure_class = 'UNKNOWN_OUTCOME'),
    'failed_last_hour',      (select count(*) from w where outcome = 'delivery_failed'
                                                        and attempted_at > now() - interval '1 hour'),
    'reasons',               coalesce((select jsonb_object_agg(reason, n)
                                         from (select reason, count(*) n from w
                                                where reason is not null group by reason) r), '{}'::jsonb),
    'retry_due',             (select count(*) from public.invitations
                               where next_delivery_retry_at <= now() and delivery_dead_lettered_at is null
                                 and delivery_status = 'delivery_failed'),
    'retry_scheduled',       (select count(*) from public.invitations
                               where next_delivery_retry_at > now() and delivery_dead_lettered_at is null
                                 and delivery_status = 'delivery_failed'),
    'dead_letter',           (select count(*) from public.invitations
                               where delivery_dead_lettered_at is not null and delivery_status = 'delivery_failed'
                                 and status = 'pending'),
    'unknown_outcome_open',  (select count(*) from public.invitations
                               where delivery_status = 'delivery_failed' and status = 'pending'
                                 and delivery_bounced_at is null
                                 and (delivery_failure_class = 'UNKNOWN_OUTCOME' or delivery_failure_class is null)),
    'bounced',               (select count(*) from public.invitations i, h
                               where i.delivery_bounced_at > now() - make_interval(hours => h.hours)),
    'stuck_reservations',    (select count(*) from public.invitations
                               where delivery_reserved_at < now() - interval '15 minutes')
  );
$$;

revoke all on function public.invitation_delivery_health_v1(integer)
  from public, anon, authenticated;
grant execute on function public.invitation_delivery_health_v1(integer)
  to service_role;

commit;
