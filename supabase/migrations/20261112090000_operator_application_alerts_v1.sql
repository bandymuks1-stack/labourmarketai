-- @human-gate-approved
-- The marker above is the human-gate ACKNOWLEDGEMENT, not an approval. NO OWNER APPROVAL OF THIS SQL
-- EXISTS YET. Draft PR + needs-human-gate. NOT applied. Apply only via Supabase MCP apply_migration.
-- ============================================================================
-- 20261112090000_operator_application_alerts_v1
--
-- Operator e-mail alerts for applications that wait on a human (owner decision 2026-11-11, P1):
-- an alert on arrival, a reminder at 24 h, an escalation to admins at 48 h. Internal deadlines only.
--
-- Three service-only SECURITY DEFINER functions. No table, no column, no policy, no row change at
-- apply time. The ledger is the existing append-only public.audit_logs.
--
--   operator_alerts_due_v1()               what waits, at which stage (no name, no contact)
--   operator_alert_recipients_v1(stage)    who may receive it, from the rights valid NOW
--   record_operator_alert_v1(...)          reserve / sent / failed / skipped_no_recipient
--
-- WHAT WAITS ON A HUMAN (and nothing else):
--   company_need_public_intakes  status = 'new'. Any other status is an operator decision
--                                (contacted / qualified / rejected / converted). Age = created_at.
--   organization_claims          state = 'requested'. 'invited' waits on the representative;
--                                'representative_verified' means an operator already verified.
--                                Age = created_at (an invited claim is created when it is accepted).
--   companies                    verification_status = 'pending_verification' AND requested_at set
--                                (the company itself asked for manual review) AND no admin decision
--                                recorded since (audit action 'admin_set_company_verification').
--                                'needs_checks' is NOT included: it means an automated check failed
--                                and waits on the company to fix its data. Age = requested_at, never
--                                updated_at (an unrelated edit must not reset the clock).
-- Only applications younger than 7 days are considered, so switching this on never mails a backlog.
--
-- STAGES: immediate (< 24 h), reminder_24h (24-48 h), escalation_48h (48 h - 7 days).
-- An intake from a landing request door (source_path contains '/request/') already mails the team
-- inbox on arrival (request-door-actions.ts), so it gets no `immediate` alert here: only the
-- reminder and the escalation, which nothing else sends.
--
-- LEDGER STATES per (application, stage, recipient), as append-only audit rows:
--   operator_alert.reserved   a sender holds it; expires after 15 minutes without an outcome
--   operator_alert.sent       final; never sent again
--   operator_alert.failed     retried on a later run, at most 5 failures, then it stops
--   operator_alert.skipped_no_recipient   once per (application, stage); the stage stays open, so a
--                             recipient configured later still receives it
-- Concurrent runs serialise on a transaction advisory lock per key. LIMIT: if a sender dies after
-- the SMTP server accepted a mail but before `sent` was recorded, the reservation expires and the
-- mail is sent once more. At most one extra mail per such crash; never a silent loss.
--
-- SAFETY CLASS: RED (SECURITY DEFINER + GRANT/REVOKE; execute for service_role only).
-- @plan-cache-proof: n/a — no index or extension is created
-- ROLLBACK: supabase/rollbacks/20261112090000_operator_application_alerts_v1.down.sql
-- ============================================================================

begin;

-- 1. What waits ------------------------------------------------------------------------------------
create or replace function public.operator_alerts_due_v1()
returns table (
  entity      text,
  entity_id   uuid,
  stage       text,
  age_hours   integer,
  country     text,
  from_door   boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with waiting as (
    select 'company_need_public_intakes'::text as entity, i.id as entity_id, i.created_at as since,
           i.country, coalesce(i.source_path, '') like '%/request/%' as from_door
      from public.company_need_public_intakes i
     where i.status = 'new'
       and i.created_at > now() - interval '7 days'
    union all
    select 'organization_claims', c.id, c.created_at, o.country, false
      from public.organization_claims c
      join public.organizations o on o.id = c.organization_id
     where c.state = 'requested'
       and c.created_at > now() - interval '7 days'
    union all
    select 'companies', co.id, co.requested_at, co.country, false
      from public.companies co
     where co.verification_status = 'pending_verification'
       and co.requested_at is not null
       and co.requested_at > now() - interval '7 days'
       and not exists (
             select 1 from public.audit_logs a
              where a.entity = 'companies' and a.entity_id = co.id
                and a.action = 'admin_set_company_verification'
                and a.occurred_at >= co.requested_at)
  ), staged as (
    select w.*, floor(extract(epoch from (now() - w.since)) / 3600)::integer as age_hours
      from waiting w
  )
  select s.entity, s.entity_id,
         case when s.age_hours < 24 then 'immediate'
              when s.age_hours < 48 then 'reminder_24h'
              else 'escalation_48h' end as stage,
         s.age_hours, nullif(btrim(s.country), '') as country, s.from_door
    from staged s
   where not (s.from_door and s.age_hours < 24)
   order by s.since
   limit 200;
$$;

-- 2. Who may receive it, from the rights valid now ------------------------------------------------
create or replace function public.operator_alert_recipients_v1(p_stage text)
returns table (profile_id uuid, email text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, btrim(p.email)
    from public.profiles p
   where nullif(btrim(p.email), '') is not null
     and position('@' in p.email) > 1
     and case
           -- immediate and reminder: operators holding the import / claim authority right now
           when p_stage in ('immediate', 'reminder_24h') then exists (
                  select 1 from public.platform_capability_grants g
                   where g.profile_id = p.id
                     and g.capability = 'marketplace_company_ingest'
                     and g.revoked_at is null)
           -- escalation: admins, by the same two signals as public.is_admin()
           when p_stage = 'escalation_48h' then (
                  p.active_role = 'admin'
                  or exists (select 1 from public.profile_roles r
                              where r.profile_id = p.id and r.role = 'admin'))
           else false
         end
   order by p.id;
$$;

-- 3. The ledger -----------------------------------------------------------------------------------
create or replace function public.record_operator_alert_v1(
  p_event      text,   -- 'reserve' | 'sent' | 'failed' | 'skipped_no_recipient'
  p_entity     text,
  p_entity_id  uuid,
  p_stage      text,
  p_recipient  uuid default null,
  p_token      uuid default null,
  p_reason     text default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_key       text;
  v_reserved  public.audit_logs%rowtype;
  v_failures  integer;
  v_token     uuid;
begin
  if p_entity is null or p_entity not in ('company_need_public_intakes', 'organization_claims', 'companies') then
    raise exception 'unknown entity' using errcode = '22023';
  end if;
  if p_stage is null or p_stage not in ('immediate', 'reminder_24h', 'escalation_48h') then
    raise exception 'unknown stage' using errcode = '22023';
  end if;
  if p_entity_id is null then
    raise exception 'entity id required' using errcode = '22023';
  end if;

  v_key := p_entity || ':' || p_entity_id::text || ':' || p_stage || ':' || coalesce(p_recipient::text, '-');
  perform pg_advisory_xact_lock(hashtextextended('operator_alert:' || v_key, 0));

  if p_event = 'skipped_no_recipient' then
    if exists (select 1 from public.audit_logs a
                where a.action = 'operator_alert.skipped_no_recipient'
                  and a.entity = p_entity and a.entity_id = p_entity_id
                  and a.payload ->> 'stage' = p_stage) then
      return jsonb_build_object('outcome', 'already_logged');
    end if;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
    values (null, 'operator_alert.skipped_no_recipient', p_entity, p_entity_id,
            jsonb_build_object('stage', p_stage), now());
    return jsonb_build_object('outcome', 'logged');
  end if;

  if p_recipient is null then
    raise exception 'recipient required' using errcode = '22023';
  end if;

  if p_event = 'reserve' then
    if exists (select 1 from public.audit_logs a
                where a.action = 'operator_alert.sent'
                  and a.entity = p_entity and a.entity_id = p_entity_id
                  and a.payload ->> 'stage' = p_stage
                  and a.payload ->> 'recipient' = p_recipient::text) then
      return jsonb_build_object('outcome', 'already_sent');
    end if;
    -- A live reservation (no outcome yet, younger than 15 minutes) belongs to another run.
    if exists (select 1 from public.audit_logs a
                where a.action = 'operator_alert.reserved'
                  and a.entity = p_entity and a.entity_id = p_entity_id
                  and a.payload ->> 'stage' = p_stage
                  and a.payload ->> 'recipient' = p_recipient::text
                  and a.occurred_at > now() - interval '15 minutes'
                  and not exists (select 1 from public.audit_logs o
                                   where o.action in ('operator_alert.sent', 'operator_alert.failed')
                                     and o.entity = p_entity and o.entity_id = p_entity_id
                                     and o.payload ->> 'token' = a.payload ->> 'token')) then
      return jsonb_build_object('outcome', 'in_flight');
    end if;
    select count(*) into v_failures from public.audit_logs a
     where a.action = 'operator_alert.failed'
       and a.entity = p_entity and a.entity_id = p_entity_id
       and a.payload ->> 'stage' = p_stage
       and a.payload ->> 'recipient' = p_recipient::text;
    if v_failures >= 5 then
      return jsonb_build_object('outcome', 'gave_up');
    end if;
    v_token := gen_random_uuid();
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
    values (null, 'operator_alert.reserved', p_entity, p_entity_id,
            jsonb_build_object('stage', p_stage, 'recipient', p_recipient::text,
                               'token', v_token::text, 'attempt', v_failures + 1), now());
    return jsonb_build_object('outcome', 'reserved', 'token', v_token);
  end if;

  if p_event in ('sent', 'failed') then
    if p_token is null then
      raise exception 'token required' using errcode = '22023';
    end if;
    select * into v_reserved from public.audit_logs a
     where a.action = 'operator_alert.reserved'
       and a.entity = p_entity and a.entity_id = p_entity_id
       and a.payload ->> 'token' = p_token::text
       and a.payload ->> 'stage' = p_stage
       and a.payload ->> 'recipient' = p_recipient::text;
    if not found then
      return jsonb_build_object('outcome', 'unknown_token');
    end if;
    if exists (select 1 from public.audit_logs o
                where o.action in ('operator_alert.sent', 'operator_alert.failed')
                  and o.entity = p_entity and o.entity_id = p_entity_id
                  and o.payload ->> 'token' = p_token::text) then
      return jsonb_build_object('outcome', 'already_recorded');
    end if;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
    values (null, 'operator_alert.' || p_event, p_entity, p_entity_id,
            jsonb_build_object('stage', p_stage, 'recipient', p_recipient::text, 'token', p_token::text,
                               'reason', left(coalesce(p_reason, ''), 120)), now());
    return jsonb_build_object('outcome', 'recorded');
  end if;

  raise exception 'unknown event' using errcode = '22023';
end;
$$;

-- Service only. No client role may list what waits, read operators' addresses or write the ledger.
revoke all on function public.operator_alerts_due_v1() from public, anon, authenticated;
revoke all on function public.operator_alert_recipients_v1(text) from public, anon, authenticated;
revoke all on function public.record_operator_alert_v1(text, text, uuid, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.operator_alerts_due_v1() to service_role;
grant execute on function public.operator_alert_recipients_v1(text) to service_role;
grant execute on function public.record_operator_alert_v1(text, text, uuid, text, uuid, uuid, text) to service_role;

commit;
