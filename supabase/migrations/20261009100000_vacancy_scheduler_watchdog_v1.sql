-- @human-gate-approved (RED: SECURITY DEFINER, grants, CREATE EXTENSION pg_net, row DML in a function body) — held for DI approval; see PR.
-- VACANCY SCHEDULER WATCHDOG v1 (2026-10-09)
--
-- PROBLEM (measured, not assumed): GitHub's cron is best-effort. In the 12 h to
-- 2026-10-09 07:00Z the `*/10` NAV workflow produced 2 schedule events; the
-- 3-hourly Sweden workflow fires every 6-9 h. The importers are healthy; nobody
-- invokes them at the contracted cadence. That is SCHEDULER health, a third
-- concept distinct from provider health and data-pipeline health.
--
-- WHAT THIS ADDS (additive; no workflow, cursor or importer is changed here):
--   1. vacancy_scheduler_policy   per provider/channel: contracted cadence,
--                                 tolerance, dispatch cooldown, workflow file.
--   2. vacancy_scheduler_state    per provider/channel: open scheduler incident,
--                                 last fallback dispatch (independent per provider).
--   3. vacancy_scheduler_events   append-only technical ledger. Evidence is never
--                                 deduplicated; only the OPEN/RECOVERED lifecycle is.
--   4. vacancy_scheduler_watchdog_v1()  run by pg_cron every 5 min (an in-database
--      clock that does not depend on GitHub's scheduler). For each policy row:
--        expected = last_run_at + expected_every
--        delay    = now() - last_run_at   (scheduler delay, from the durable cursor)
--      on time           -> close any open scheduler incident (RECOVERED)
--      late > tolerance  -> open ONE scheduler incident; and, if a dispatch
--                           credential exists in Vault and the cooldown elapsed,
--                           POST workflow_dispatch for the SAME existing workflow
--                           (the canonical idempotent importer, resumed from its
--                           durable cursor). It never ingests anything itself.
--      A late cursor is classified `scheduler_miss` only when no failure was
--      recorded after the last run; otherwise `pipeline_failure` (a provider /
--      pipeline problem handled by the existing incident flow, not a missed run).
--
-- DUPLICATE SAFETY: the dispatch targets workflows whose concurrency group is
-- `cancel-in-progress: false` (one running + one pending, rest collapse), the
-- importers are cursor-idempotent, and the watchdog enforces a per-provider
-- cooldown. A primary cron and a fallback arriving together run one after the
-- other; the second finds nothing new.
--
-- CREDENTIAL: the fallback needs ONE secret to call GitHub's API from outside
-- GitHub: Vault secret `github_workflow_dispatch_token` (fine-grained token,
-- this repository, Actions: read/write only). Until it exists the watchdog still
-- detects and records every miss (action = dispatch_unavailable); nothing fails.
--
-- ROLLBACK: supabase/rollbacks/20261009100000_vacancy_scheduler_watchdog_v1.down.sql

create extension if not exists pg_net;

create table if not exists public.vacancy_scheduler_policy (
  provider_key   text        not null,
  channel        text        not null,
  workflow_file  text        not null,
  dispatch_inputs jsonb      not null default '{}'::jsonb,
  expected_every interval    not null,
  tolerance      interval    not null,
  cooldown       interval    not null,
  enabled        boolean     not null default true,
  primary key (provider_key, channel)
);

create table if not exists public.vacancy_scheduler_state (
  provider_key        text        not null,
  channel             text        not null,
  incident_open       boolean     not null default false,
  incident_opened_at  timestamptz,
  incident_kind       text,
  last_dispatch_at    timestamptz,
  last_dispatch_request_id bigint,
  last_dispatch_status text,
  dispatch_count      integer     not null default 0,
  updated_at          timestamptz not null default now(),
  primary key (provider_key, channel)
);

create table if not exists public.vacancy_scheduler_events (
  id               bigint generated always as identity primary key,
  at               timestamptz not null default now(),
  provider_key     text        not null,
  channel          text        not null,
  kind             text        not null check (kind in
    ('on_time','scheduler_miss','pipeline_failure','incident_opened','incident_recovered',
     'fallback_dispatched','fallback_dispatch_unavailable','fallback_cooldown','fallback_dispatch_result')),
  last_run_at      timestamptz,
  scheduler_delay  interval,
  detail           text
);
create index if not exists vacancy_scheduler_events_provider_at
  on public.vacancy_scheduler_events (provider_key, channel, at desc);

alter table public.vacancy_scheduler_policy enable row level security;
alter table public.vacancy_scheduler_state  enable row level security;
alter table public.vacancy_scheduler_events enable row level security;
revoke all on public.vacancy_scheduler_policy, public.vacancy_scheduler_state, public.vacancy_scheduler_events from public, anon, authenticated;
grant select on public.vacancy_scheduler_policy, public.vacancy_scheduler_state, public.vacancy_scheduler_events to service_role;

comment on table public.vacancy_scheduler_events is
  'Append-only scheduler ledger (expected vs actual invocation). RLS on, no policies: service_role / postgres only.';

insert into public.vacancy_scheduler_policy
  (provider_key, channel, workflow_file, dispatch_inputs, expected_every, tolerance, cooldown)
values
  ('nav', 'stream', 'nav-supply-cadence.yml', '{"mode":"persist"}'::jsonb,
   interval '10 minutes', interval '25 minutes', interval '20 minutes'),
  ('arbetsformedlingen', 'stream', 'sweden-supply-cadence.yml', '{"channel":"stream"}'::jsonb,
   interval '3 hours', interval '90 minutes', interval '60 minutes')
on conflict (provider_key, channel) do nothing;

create or replace function public.vacancy_scheduler_watchdog_v1()
returns table (provider_key text, channel text, classification text, action text, scheduler_delay interval)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  p        record;
  c        record;
  s        record;
  v_delay  interval;
  v_class  text;
  v_action text;
  v_token  text;
  v_req    bigint;
  v_status text;
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  begin
    select decrypted_secret into v_token
      from vault.decrypted_secrets where name = 'github_workflow_dispatch_token' limit 1;
  exception when others then
    v_token := null;
  end;

  for p in select * from public.vacancy_scheduler_policy where enabled loop
    insert into public.vacancy_scheduler_state (provider_key, channel)
      values (p.provider_key, p.channel) on conflict do nothing;
    select * into s from public.vacancy_scheduler_state st
      where st.provider_key = p.provider_key and st.channel = p.channel for update;
    select * into c from public.vacancy_import_cursors vc
      where vc.provider_key = p.provider_key and vc.channel = p.channel;

    -- Record the outcome of the previous fallback request (pg_net is async).
    if s.last_dispatch_request_id is not null and s.last_dispatch_status is null then
      begin
        select 'http_' || r.status_code into v_status
          from net._http_response r where r.id = s.last_dispatch_request_id;
      exception when others then v_status := null;
      end;
      if v_status is not null then
        update public.vacancy_scheduler_state st set last_dispatch_status = v_status, updated_at = now()
          where st.provider_key = p.provider_key and st.channel = p.channel;
        insert into public.vacancy_scheduler_events (provider_key, channel, kind, detail)
          values (p.provider_key, p.channel, 'fallback_dispatch_result', v_status);
      end if;
    end if;

    if c.provider_key is null then
      continue;  -- no cursor row yet: provider never ran; nothing to be late against
    end if;

    v_delay := now() - coalesce(c.last_run_at, c.updated_at);

    if v_delay <= p.expected_every + p.tolerance then
      v_class := 'on_time'; v_action := 'none';
      if s.incident_open then
        update public.vacancy_scheduler_state st
           set incident_open = false, incident_kind = null, updated_at = now()
         where st.provider_key = p.provider_key and st.channel = p.channel;
        insert into public.vacancy_scheduler_events (provider_key, channel, kind, last_run_at, scheduler_delay, detail)
          values (p.provider_key, p.channel, 'incident_recovered', c.last_run_at, v_delay,
                  'opened ' || s.incident_opened_at::text);
        v_action := 'incident_recovered';
      end if;
    else
      -- Late. A failure recorded after the last run means sessions ARE being
      -- attempted and failing: that is the pipeline's incident, not a missed run.
      v_class := case when c.last_failure_at is not null
                       and c.last_failure_at >= coalesce(c.last_success_at, '-infinity'::timestamptz)
                       and c.consecutive_failures > 0
                      then 'pipeline_failure' else 'scheduler_miss' end;
      insert into public.vacancy_scheduler_events (provider_key, channel, kind, last_run_at, scheduler_delay, detail)
        values (p.provider_key, p.channel, v_class::text, c.last_run_at, v_delay,
                'expected within ' || (p.expected_every + p.tolerance)::text);

      if not s.incident_open then
        update public.vacancy_scheduler_state st
           set incident_open = true, incident_opened_at = now(), incident_kind = v_class, updated_at = now()
         where st.provider_key = p.provider_key and st.channel = p.channel;
        insert into public.vacancy_scheduler_events (provider_key, channel, kind, last_run_at, scheduler_delay, detail)
          values (p.provider_key, p.channel, 'incident_opened', c.last_run_at, v_delay, v_class);
      end if;

      if s.last_dispatch_at is not null and now() - s.last_dispatch_at < p.cooldown then
        v_action := 'cooldown';
      elsif v_token is null then
        v_action := 'dispatch_unavailable';
        insert into public.vacancy_scheduler_events (provider_key, channel, kind, last_run_at, scheduler_delay, detail)
          values (p.provider_key, p.channel, 'fallback_dispatch_unavailable', c.last_run_at, v_delay,
                  'vault secret github_workflow_dispatch_token not set');
      else
        select net.http_post(
          url := 'https://api.github.com/repos/bandymuks1-stack/labourmarketai/actions/workflows/'
                 || p.workflow_file || '/dispatches',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_token,
            'Accept', 'application/vnd.github+json',
            'X-GitHub-Api-Version', '2022-11-28',
            'User-Agent', 'labourmarket-scheduler-watchdog'),
          body := jsonb_build_object('ref', 'main', 'inputs', p.dispatch_inputs),
          timeout_milliseconds := 10000) into v_req;
        update public.vacancy_scheduler_state st
           set last_dispatch_at = now(), last_dispatch_request_id = v_req, last_dispatch_status = null,
               dispatch_count = st.dispatch_count + 1, updated_at = now()
         where st.provider_key = p.provider_key and st.channel = p.channel;
        insert into public.vacancy_scheduler_events (provider_key, channel, kind, last_run_at, scheduler_delay, detail)
          values (p.provider_key, p.channel, 'fallback_dispatched', c.last_run_at, v_delay,
                  p.workflow_file || ' request ' || v_req::text);
        v_action := 'dispatched';
      end if;
    end if;

    provider_key := p.provider_key; channel := p.channel;
    classification := v_class; action := v_action; scheduler_delay := v_delay;
    return next;
  end loop;
end;
$$;

revoke execute on function public.vacancy_scheduler_watchdog_v1() from public, anon, authenticated;
grant execute on function public.vacancy_scheduler_watchdog_v1() to service_role;

comment on function public.vacancy_scheduler_watchdog_v1() is
  'Scheduler watchdog: compares each provider cursor''s last_run_at to its contracted cadence, records scheduler incidents, and re-invokes the SAME workflow via workflow_dispatch when a Vault credential exists. Never ingests.';

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'vacancy-scheduler-watchdog-5min') then
      perform cron.unschedule('vacancy-scheduler-watchdog-5min');
    end if;
    perform cron.schedule('vacancy-scheduler-watchdog-5min', '*/5 * * * *',
      $cmd$select public.vacancy_scheduler_watchdog_v1()$cmd$);
  end if;
end;
$$;
